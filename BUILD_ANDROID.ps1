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

$Gradle = Get-Command gradle -ErrorAction SilentlyContinue
if (-not $Gradle) { throw 'Gradle 8.9+ est requis (ou lancez depuis le terminal Android Studio).' }
Push-Location apps\android\native
try { gradle assembleDebug } finally { Pop-Location }

$BuiltApk = Join-Path $Repo 'apps\android\native\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $BuiltApk)) { throw "APK absent après build: $BuiltApk" }
if ((Get-Item $BuiltApk).Length -le 0) { throw 'APK généré mais vide.' }
Copy-Item $BuiltApk (Join-Path $Repo 'neo-calendar-android.apk') -Force
Write-Host "APK: $Repo\neo-calendar-android.apk"
