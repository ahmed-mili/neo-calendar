#!/usr/bin/env bash
# Télécharge le Syncthing de la version épinglée pour CETTE machine (Linux amd64, ou Windows amd64 sous Git Bash) et le
# vérifie. Sert au test d'intégration à deux moteurs ; ce n'est PAS le binaire de l'APK (celui-là se compile :
# build-syncthing.sh).
#
#   fetch-test-binary.sh [dossier]      affiche le chemin du binaire sur la dernière ligne
#
# Vérification : sha256sum.txt.asc (signé par la clé de release épinglée) donne le SHA-256 de l'archive ; l'archive doit y
# correspondre. Même règle que build-syncthing.sh pour le code de sortie de gpg : on lit le statut machine.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=version.env
source "$here/version.env"
die() { echo "ERREUR : $*" >&2; exit 1; }

case "$(uname -s)" in
  Linux*) platform=linux; ext=tar.gz; exe=syncthing ;;
  MINGW*|MSYS*|CYGWIN*) platform=windows; ext=zip; exe=syncthing.exe ;;
  *) die "système non pris en charge : $(uname -s)" ;;
esac
dest="${1:-$here/.work/$platform}"
mkdir -p "$dest"
cd "$dest"
base="https://github.com/syncthing/syncthing/releases/download/$SYNCTHING_VERSION"
name="syncthing-$platform-amd64-$SYNCTHING_VERSION"
archive="$name.$ext"
curl -fsSL -o "$archive" "$base/$archive"
curl -fsSL -o sha256sum.txt.asc "$base/sha256sum.txt.asc"

gnupg="$(mktemp -d)"; chmod 700 "$gnupg"
trap 'rm -rf "$gnupg"' EXIT
export GNUPGHOME="$gnupg"
gpg --batch --quiet --import "$here/release-key.asc" 2>/dev/null
gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr" {print $10}' | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "la clé de release.asc n'a pas l'empreinte épinglée"
gpg --batch --status-fd 3 --output sha256sum.txt --decrypt sha256sum.txt.asc 3>status.txt 2>/dev/null || true
if grep -q '^\[GNUPG:\] BADSIG' status.txt; then die "signature de sha256sum.txt INVALIDE"; fi
awk '$2=="VALIDSIG" {print $NF}' status.txt | grep -qx "$SYNCTHING_KEY_FINGERPRINT" \
  || die "aucune signature valide de la clé de release épinglée"
grep "  $archive\$" sha256sum.txt | sha256sum -c - >/dev/null || die "SHA-256 de $archive incorrect"

if [ "$ext" = zip ]; then
  unzip -o -j -q "$archive" "$name/$exe"
else
  tar -xzf "$archive" --strip-components=1 "$name/$exe"
fi
chmod +x "$exe"
echo "$dest/$exe"
