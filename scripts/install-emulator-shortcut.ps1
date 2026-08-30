<#
.SYNOPSIS
    Pose sur le bureau le raccourci qui démarre l'émulateur Android, sans
    qu'aucune fenêtre de console n'apparaisse.

.DESCRIPTION
    Deux consoles se montraient au démarrage : celle du script PowerShell lancé
    par le raccourci, et celle de l'émulateur lui-même (il déverse la
    configuration de sa machine virtuelle sur sa sortie standard).

    La seconde disparaît côté launch-android-emulator.ps1, qui démarre
    l'émulateur avec `-WindowStyle Hidden`. La première demande ce petit
    programme fenêtré : un raccourci Windows ne peut pas cacher une console, et
    `-WindowStyle Hidden` la crée avant de la cacher — ce qui se voit.

    Réexécutable : le programme est recompilé s'il manque ou s'il est plus vieux
    que sa source, et le raccourci est réécrit à chaque fois.

.PARAMETER Name
    Nom du raccourci sur le bureau.
#>
param(
    [string]$Name = "Émulateur Android"
)

$ErrorActionPreference = "Stop"

$repository = Split-Path $PSScriptRoot -Parent
$source = Join-Path $PSScriptRoot "run-hidden.cs"
$launcher = Join-Path $PSScriptRoot "launch-android-emulator.ps1"

foreach ($required in @($source, $launcher)) {
    if (-not (Test-Path $required)) { throw "Fichier introuvable : $required" }
}

$toolDirectory = Join-Path $env:LOCALAPPDATA "NeoCalendar"
$runHidden = Join-Path $toolDirectory "run-hidden.exe"

# Le compilateur C# de .NET Framework, atteint par Windows PowerShell 5.1 :
# `Add-Type -OutputType` n'existe que là (PowerShell 7 compile en mémoire, avec
# Roslyn, et ne sait pas écrire d'exécutable).
$windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $windowsPowerShell)) {
    throw "Windows PowerShell 5.1 introuvable : impossible de compiler le lanceur."
}

$needsBuild =
    -not (Test-Path $runHidden) -or
    (Get-Item $source).LastWriteTimeUtc -gt (Get-Item $runHidden).LastWriteTimeUtc

if ($needsBuild) {
    if (-not (Test-Path $toolDirectory)) {
        New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
    }
    Write-Host "Compilation du lanceur silencieux..." -ForegroundColor Cyan
    & $windowsPowerShell -NoLogo -NonInteractive -Command `
        "Add-Type -Path '$source' -OutputAssembly '$runHidden' -OutputType WindowsApplication"
    if (-not (Test-Path $runHidden)) {
        throw "La compilation du lanceur a échoué."
    }
}

$powerShell = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
if (-not $powerShell) { $powerShell = $windowsPowerShell }

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$Name.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $runHidden
# `-NoWait` : personne ne lit la sortie d'un raccourci, donc le script n'a pas à
# rester en vie pour attendre la fin du démarrage d'Android.
$shortcut.Arguments =
    "`"$powerShell`" -NoLogo -NonInteractive -ExecutionPolicy Bypass " +
    "-File `"$launcher`" -NoWait"
$shortcut.WorkingDirectory = $repository
$shortcut.IconLocation = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe,0"
$shortcut.Description = "Démarre l'émulateur Android pour tester Neo Calendar"
$shortcut.Save()

Write-Host "Raccourci posé : $shortcutPath" -ForegroundColor Green
