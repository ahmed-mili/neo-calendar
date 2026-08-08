$ErrorActionPreference = 'Stop'
$Repo = 'C:\dev\neo-calendar'
Set-Location $Repo

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ est requis.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'JDK 17 est requis.' }

npm install --ignore-scripts
npm --prefix apps/windows install --ignore-scripts
npm --prefix apps/android install --ignore-scripts
npm --prefix apps/windows run build
npm --prefix apps/android run build
npm --prefix apps/android run android:sync

# Le chemin du SDK n'est plus versionné : il change d'un poste à l'autre. On le
# réécrit ici quand il manque, pour que Gradle n'ait pas à le deviner.
$LocalProperties = Join-Path $Repo 'apps\android\native\local.properties'
if (-not (Test-Path $LocalProperties)) {
    $Sdk = $env:ANDROID_HOME
    if (-not $Sdk) { $Sdk = $env:ANDROID_SDK_ROOT }
    if (-not $Sdk) { $Sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    if (-not (Test-Path $Sdk)) {
        throw "SDK Android introuvable. Ouvrez le projet dans Android Studio, ou pointez ANDROID_HOME dessus."
    }
    "sdk.dir=$($Sdk -replace '\\', '\\\\')" | Set-Content $LocalProperties -Encoding ASCII
    Write-Host "local.properties ecrit vers $Sdk"
}

# `assembleRelease` : c'est la variante signee par la cle fixe du depot, la
# seule qui s'installe par-dessus une version deja posee sur le telephone.
$Gradle = Get-Command gradle -ErrorAction SilentlyContinue
if (-not $Gradle) { throw 'Gradle 8.9+ est requis (ou lancez depuis le terminal Android Studio).' }
Push-Location apps\android\native
try { gradle assembleRelease } finally { Pop-Location }

$BuiltApk = Join-Path $Repo 'apps\android\native\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $BuiltApk)) { throw "APK absent après build: $BuiltApk" }
if ((Get-Item $BuiltApk).Length -le 0) { throw 'APK généré mais vide.' }

$Version = (Get-Content (Join-Path $Repo 'apps\android\package.json') | ConvertFrom-Json).version
$Target = Join-Path $Repo "neo-calendar-android-$Version.apk"
Copy-Item $BuiltApk $Target -Force
Write-Host "APK: $Target"
