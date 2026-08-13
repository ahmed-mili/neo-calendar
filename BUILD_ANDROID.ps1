$ErrorActionPreference = 'Stop'
$Repo = $PSScriptRoot
Set-Location $Repo

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ est requis.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'JDK 17 est requis.' }

npm install --ignore-scripts
npm --prefix apps/windows install --ignore-scripts
npm --prefix apps/android install --ignore-scripts
npm --prefix apps/windows run build
npm --prefix apps/android run build
npm --prefix apps/android run android:sync

# Le chemin du SDK n'est pas versionné : il change d'un poste à l'autre. On le
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

# La clé et ses mots de passe sont hors du dépôt. Le fichier local est chiffré
# par DPAPI et n'est lisible que par ce compte Windows sur cette machine.
$SecretsFile = $env:NEO_CALENDAR_SIGNING_SECRETS
if (-not $SecretsFile) {
    $SecretsFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.neo-calendar\signing\local-signing-secrets.dpapi'
}
if (-not (Test-Path -LiteralPath $SecretsFile)) {
    throw "Secrets de signature introuvables : $SecretsFile"
}
$Encrypted = (Get-Content -Raw -LiteralPath $SecretsFile).Trim()
$Secure = ConvertTo-SecureString $Encrypted
$Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
try {
    $Signing = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) |
        ConvertFrom-Json
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
}
$env:ANDROID_KEYSTORE_PATH = $Signing.ANDROID_KEYSTORE_PATH
$env:ANDROID_KEYSTORE_PASSWORD = $Signing.ANDROID_KEYSTORE_PASSWORD
$env:ANDROID_KEY_ALIAS = $Signing.ANDROID_KEY_ALIAS
$env:ANDROID_KEY_PASSWORD = $Signing.ANDROID_KEY_PASSWORD

$Gradle = Join-Path $Repo 'apps\android\native\gradlew.bat'
if (-not (Test-Path -LiteralPath $Gradle)) { throw "Wrapper Gradle introuvable : $Gradle" }
Push-Location (Join-Path $Repo 'apps\android\native')
try { & $Gradle --no-daemon assembleRelease } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'La compilation Android release a échoué.' }

$BuiltApk = Join-Path $Repo 'apps\android\native\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $BuiltApk)) { throw "APK absent après build: $BuiltApk" }
if ((Get-Item $BuiltApk).Length -le 0) { throw 'APK généré mais vide.' }

$Version = (Get-Content (Join-Path $Repo 'apps\android\package.json') | ConvertFrom-Json).version
$Target = Join-Path $Repo "neo-calendar-android-$Version.apk"
Copy-Item $BuiltApk $Target -Force
Write-Host "APK: $Target"