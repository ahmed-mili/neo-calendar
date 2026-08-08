# Génère les bitmaps de l'installeur NSIS à partir du logo de l'application.
#
# NSIS impose les dimensions et le format : 150x57 pour la bande d'en-tête,
# 164x314 pour la colonne des pages Bienvenue et Fin, en BMP 24 bits — un PNG
# ou un BMP avec canal alpha s'affiche noir. Relancer ce script quand le logo
# ou les couleurs du thème changent :
#
#   pwsh apps/windows/src-tauri/installer/make-images.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSCommandPath
$logoPath = Join-Path (Split-Path -Parent $root) "icons\icon.png"

if (-not (Test-Path $logoPath)) {
    Write-Error "Logo introuvable : $logoPath"
    exit 1
}

# Couleurs du thème par défaut (catppuccin-mocha.css).
$crust = [System.Drawing.Color]::FromArgb(17, 17, 27)
$base = [System.Drawing.Color]::FromArgb(30, 30, 46)
$accent = [System.Drawing.Color]::FromArgb(101, 143, 242)
$text = [System.Drawing.Color]::FromArgb(205, 214, 244)

$logo = [System.Drawing.Image]::FromFile($logoPath)

function New-Canvas([int]$width, [int]$height) {
    $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = 'AntiAlias'
    $graphics.InterpolationMode = 'HighQualityBicubic'
    $graphics.TextRenderingHint = 'ClearTypeGridFit'
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

# ── La colonne des pages Bienvenue et Fin ────────────────────
$sidebar = New-Canvas 164 314
$g = $sidebar.Graphics

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point 0, 314),
    $crust,
    $base
)
$g.FillRectangle($gradient, 0, 0, 164, 314)
$gradient.Dispose()

# Un halo d'accent derrière le logo, comme la lueur que porte l'application.
$halo = New-Object System.Drawing.Drawing2D.GraphicsPath
$halo.AddEllipse(2, 26, 160, 160)
$haloBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($halo)
$haloBrush.CenterColor = [System.Drawing.Color]::FromArgb(70, $accent.R, $accent.G, $accent.B)
$haloBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $accent.R, $accent.G, $accent.B))
$g.FillPath($haloBrush, $halo)
$haloBrush.Dispose()
$halo.Dispose()

$g.DrawImage($logo, 40, 62, 84, 84)

$titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", 12, [System.Drawing.FontStyle]::Regular)
$titleBrush = New-Object System.Drawing.SolidBrush $text
$format = New-Object System.Drawing.StringFormat
$format.Alignment = 'Center'
$g.DrawString("Neo Calendar", $titleFont, $titleBrush, (New-Object System.Drawing.RectangleF 0, 160, 164, 24), $format)

$subFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, $text.R, $text.G, $text.B))
$g.DrawString("Votre calendrier, en local", $subFont, $subBrush, (New-Object System.Drawing.RectangleF 0, 184, 164, 20), $format)

# Un trait d'accent en pied de colonne, pour asseoir la composition.
$accentPen = New-Object System.Drawing.Pen $accent, 3
$g.DrawLine($accentPen, 58, 292, 106, 292)
$accentPen.Dispose()

$g.Dispose()
$sidebar.Bitmap.Save((Join-Path $root "sidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sidebar.Bitmap.Dispose()

# ── La bande d'en-tête des pages suivantes ───────────────────
# Elle borde la barre blanche de NSIS, que rien ne permet d'assombrir sans
# template maison : le fond reste donc blanc et seul le logo la marque.
$header = New-Canvas 150 57
$h = $header.Graphics
$h.Clear([System.Drawing.Color]::White)
$h.DrawImage($logo, 10, 8, 41, 41)

$headerFont = New-Object System.Drawing.Font("Segoe UI Semibold", 9, [System.Drawing.FontStyle]::Regular)
$headerBrush = New-Object System.Drawing.SolidBrush $base
$h.DrawString("Neo Calendar", $headerFont, $headerBrush, 57, 20)

$h.Dispose()
$header.Bitmap.Save((Join-Path $root "header.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$header.Bitmap.Dispose()

$logo.Dispose()

Write-Output "sidebar.bmp (164x314) et header.bmp (150x57) generes dans $root"
