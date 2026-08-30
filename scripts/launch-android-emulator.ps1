<#
.SYNOPSIS
    Démarre l'émulateur Android utilisé pour tester Neo Calendar.

.DESCRIPTION
    Un seul émulateur, lancé de la même façon depuis le bureau ou depuis un
    terminal : s'il tourne déjà, la commande ne fait rien plutôt que d'ouvrir
    une deuxième fenêtre sur le même AVD (l'AVD est verrouillé et le second
    démarrage échoue en laissant un verrou derrière lui).

    Le nom de l'AVD n'est pas écrit en dur : le script prend celui demandé,
    sinon le seul disponible, sinon il liste ce qu'il y a et s'arrête.

.PARAMETER Avd
    Nom de l'AVD à démarrer. Par défaut : le seul AVD installé.

.PARAMETER NoWait
    Rend la main dès que l'émulateur est lancé, sans attendre la fin du
    démarrage d'Android.
#>
param(
    [string]$Avd,
    [switch]$NoWait
)

$ErrorActionPreference = "Stop"

function Get-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    )
    foreach ($path in $candidates) {
        if ($path -and (Test-Path (Join-Path $path "emulator\emulator.exe"))) {
            return $path
        }
    }
    throw "SDK Android introuvable. Installe-le, ou définis ANDROID_HOME."
}

$sdk = Get-AndroidSdk
$emulator = Join-Path $sdk "emulator\emulator.exe"
$adb = Join-Path $sdk "platform-tools\adb.exe"

$avds = @(& $emulator -list-avds | Where-Object { $_.Trim() })
if ($avds.Count -eq 0) {
    throw "Aucun AVD installé. Crée-en un depuis Android Studio (Device Manager)."
}

if (-not $Avd) {
    if ($avds.Count -eq 1) {
        $Avd = $avds[0]
    } else {
        Write-Host "Plusieurs AVD disponibles :" -ForegroundColor Yellow
        $avds | ForEach-Object { Write-Host "  - $_" }
        throw "Précise lequel : -Avd <nom>"
    }
} elseif ($avds -notcontains $Avd) {
    Write-Host "AVD disponibles :" -ForegroundColor Yellow
    $avds | ForEach-Object { Write-Host "  - $_" }
    throw "AVD inconnu : $Avd"
}

# Déjà en route : le processus emulator porte le nom de l'AVD sur sa ligne de
# commande, donc on n'a pas besoin d'adb pour le savoir.
$running = Get-CimInstance Win32_Process -Filter "Name = 'qemu-system-x86_64.exe' OR Name = 'emulator.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($Avd) }

if ($running) {
    Write-Host "L'émulateur $Avd tourne déjà." -ForegroundColor Green
} else {
    Write-Host "Démarrage de l'émulateur $Avd..." -ForegroundColor Cyan
    # `-WindowStyle Hidden` vise la console de l'émulateur, pas sa fenêtre :
    # emulator.exe déverse toute la configuration de sa machine virtuelle sur sa
    # sortie standard, dans une console noire qui s'ouvre à côté. Vérifié à
    # l'écran : la console ne paraît plus, la fenêtre de l'émulateur si.
    Start-Process -FilePath $emulator -ArgumentList @("-avd", $Avd) -WorkingDirectory (Split-Path $emulator) -WindowStyle Hidden
}

if ($NoWait) { return }

if (-not (Test-Path $adb)) {
    Write-Host "platform-tools absent : impossible d'attendre la fin du démarrage." -ForegroundColor Yellow
    return
}

Write-Host "Attente du démarrage d'Android (Ctrl+C pour rendre la main)..." -ForegroundColor Cyan
& $adb wait-for-device | Out-Null

# `wait-for-device` rend la main dès que adb parle au device, bien avant que
# l'écran d'accueil existe : c'est `sys.boot_completed` qui dit que le système
# est réellement prêt à recevoir une installation.
for ($i = 0; $i -lt 180; $i++) {
    $booted = (& $adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
    if ($booted -eq "1") {
        Write-Host "Émulateur $Avd prêt." -ForegroundColor Green
        return
    }
    Start-Sleep -Seconds 2
}

Write-Host "L'émulateur n'a pas fini de démarrer au bout de 6 minutes." -ForegroundColor Yellow
