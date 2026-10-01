#!/usr/bin/env bash
# Compile Syncthing pour Android (libsyncthingnative.so) depuis le tarball source SIGNÉ de la release.
#
#   build-syncthing.sh [arm64-v8a] [x86_64]      (sans argument : les deux)
#
# Chaîne de confiance : SHA-256 du tarball épinglé (version.env) ET signature GPG vérifiée avec la clé de
# release épinglée (release-key.asc, empreinte dans version.env). Compilation sans réseau (`-mod=vendor` : le
# tarball contient ses dépendances), reproductible (SOURCE_DATE_EPOCH épinglé, -trimpath), binaire dépouillé (-s -w).
# Pourquoi cgo + clang du NDK : le binaire Linux publié résout les noms par /etc/resolv.conf, absent d'Android.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version.env
source "$here/version.env"
work="${SYNCTHING_WORK:-$here/.work}"
out="${SYNCTHING_OUT:-$here/../app/src/main/jniLibs}"
abis=("$@")
[ ${#abis[@]} -gt 0 ] || abis=(arm64-v8a x86_64)

die() { echo "ERREUR : $*" >&2; exit 1; }

case "$(uname -s)" in
  Linux*) host=linux-x86_64; cc_ext="" ;;
  Darwin*) host=darwin-x86_64; cc_ext="" ;;
  MINGW*|MSYS*|CYGWIN*) host=windows-x86_64; cc_ext=".cmd" ;;
  *) die "système non pris en charge : $(uname -s)" ;;
esac

mkdir -p "$work/dl"

# --- 1. Go -----------------------------------------------------------------------------------------
if command -v go >/dev/null 2>&1 && [ "$(go env GOVERSION)" = "go$GO_VERSION" ]; then
  GO_BIN="$(command -v go)"
elif [ "$host" = linux-x86_64 ]; then
  tgz="$work/dl/go$GO_VERSION.linux-amd64.tar.gz"
  [ -f "$tgz" ] || curl -fsSL "https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz" -o "$tgz"
  echo "$GO_LINUX_AMD64_SHA256  $tgz" | sha256sum -c - >/dev/null || die "SHA-256 de Go incorrect"
  rm -rf "$work/go" && tar -xzf "$tgz" -C "$work"
  GO_BIN="$work/go/bin/go"
else
  die "Go $GO_VERSION introuvable : l'installer (go.dev/dl) et le mettre dans le PATH"
fi
echo "Go : $("$GO_BIN" version)"

# --- 2. NDK ----------------------------------------------------------------------------------------
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$sdk" ] && [ -n "${LOCALAPPDATA:-}" ]; then sdk="$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"; fi
ndk="${ANDROID_NDK_HOME:-$sdk/ndk/$NDK_VERSION}"
[ -d "$ndk/toolchains/llvm/prebuilt/$host/bin" ] || die "NDK $NDK_VERSION introuvable ($ndk) : sdkmanager \"ndk;$NDK_VERSION\""

# --- 3. Tarball : SHA-256 + signature -------------------------------------------------------------
src_tgz="$work/dl/syncthing-source-$SYNCTHING_VERSION.tar.gz"
base="https://github.com/syncthing/syncthing/releases/download/$SYNCTHING_VERSION"
[ -f "$src_tgz" ] || curl -fsSL "$base/syncthing-source-$SYNCTHING_VERSION.tar.gz" -o "$src_tgz"
[ -f "$src_tgz.asc" ] || curl -fsSL "$base/syncthing-source-$SYNCTHING_VERSION.tar.gz.asc" -o "$src_tgz.asc"
echo "$SYNCTHING_SOURCE_SHA256  $src_tgz" | sha256sum -c - >/dev/null || die "SHA-256 du tarball incorrect (fichier supprimé, refaire)"

gnupg="$(mktemp -d)"; chmod 700 "$gnupg"
trap 'rm -rf "$gnupg"' EXIT
export GNUPGHOME="$gnupg"
gpg --batch --quiet --import "$here/release-key.asc" 2>/dev/null
imported="$(gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr" {print $10}')"
echo "$imported" | grep -qx "$SYNCTHING_KEY_FINGERPRINT" || die "la clé de release.asc n'a pas l'empreinte épinglée ($SYNCTHING_KEY_FINGERPRINT)"
# Le code de sortie de gpg est trompeur quand la signature en porte une seconde d'une clé inconnue (l'ancienne
# clé de release) : on lit le statut machine, et on exige une signature VALIDE dont la clé PRIMAIRE est la nôtre.
status="$(gpg --batch --status-fd 1 --verify "$src_tgz.asc" "$src_tgz" 2>/dev/null || true)"
echo "$status" | grep -q '^\[GNUPG:\] BADSIG' && die "signature GPG du tarball INVALIDE"
echo "$status" | awk '$2=="VALIDSIG" {print $NF}' | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "aucune signature valide de la clé de release épinglée"
echo "Tarball : SHA-256 et signature GPG vérifiés ($SYNCTHING_VERSION)"

# --- 4. Compilation, une fois par ABI --------------------------------------------------------------
rm -rf "$work/src" && mkdir -p "$work/src" && tar -xzf "$src_tgz" -C "$work/src"
cd "$work/src/syncthing"

export CGO_ENABLED=1 GO111MODULE=on GOTOOLCHAIN=local GOPROXY=off
export GOFLAGS="-buildvcs=false -mod=vendor -trimpath"
export EXTRA_LDFLAGS="-checklinkname=0 -s -w"
export SOURCE_DATE_EPOCH BUILD_USER=reproducible-build BUILD_HOST=neo-calendar
export GOCACHE="${GOCACHE:-$work/gocache}"
PATH="$(dirname "$GO_BIN"):$PATH"

for abi in "${abis[@]}"; do
  case "$abi" in
    arm64-v8a) goarch=arm64; triple=aarch64-linux-android ;;
    x86_64) goarch=amd64; triple=x86_64-linux-android ;;
    *) die "ABI inconnue : $abi (arm64-v8a ou x86_64)" ;;
  esac
  cc="$ndk/toolchains/llvm/prebuilt/$host/bin/${triple}${ANDROID_API}-clang${cc_ext}"
  [ -f "$cc" ] || die "compilateur introuvable : $cc"
  echo "== $abi (GOARCH=$goarch)"
  rm -f syncthing
  "$GO_BIN" run build.go -goos android -goarch "$goarch" -cc "$cc" -version "$SYNCTHING_VERSION" -no-upgrade build
  mkdir -p "$out/$abi"
  cp syncthing "$out/$abi/libsyncthingnative.so"
  echo "   $(wc -c < "$out/$abi/libsyncthingnative.so") octets, sha256 $(sha256sum "$out/$abi/libsyncthingnative.so" | cut -d' ' -f1)"
done
echo "Terminé : $out"
