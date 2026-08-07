# Generates PWA icons and iOS splash screens from public/logo.png.
# One-off asset generator — not part of the app build. Run with:
#   powershell -ExecutionPolicy Bypass -File tools/generate-pwa-assets.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $root "public\logo.png"
$iconsDir = Join-Path $root "public\icons"
$splashDir = Join-Path $root "public\splash"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
New-Item -ItemType Directory -Force -Path $splashDir | Out-Null

$bg = [System.Drawing.Color]::FromArgb(255, 11, 18, 32) # #0B1220
$rawLogo = New-Object System.Drawing.Bitmap $logoPath

# logo.png has asymmetric transparent padding baked in (the mark sits toward
# the top-left of its own canvas) — auto-crop to the opaque bounding box so
# "centering" below centers the actual glyph, not its lopsided canvas.
$minX = $rawLogo.Width; $minY = $rawLogo.Height; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $rawLogo.Height; $y++) {
    for ($x = 0; $x -lt $rawLogo.Width; $x++) {
        if ($rawLogo.GetPixel($x, $y).A -gt 10) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
$cropRect = New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)
$srcLogo = $rawLogo.Clone($cropRect, $rawLogo.PixelFormat)
$rawLogo.Dispose()
Write-Host "Cropped logo bounding box: $($cropRect.Width)x$($cropRect.Height) at ($minX,$minY)"

function New-Canvas($w, $h, $opaque) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    if ($opaque) {
        $g.Clear($bg)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-LogoCentered($g, $canvasW, $canvasH, $scale) {
    # Fit the (non-square) cropped logo within a scale*min(canvasW,canvasH) box,
    # preserving aspect ratio, centered on both axes.
    $box = [Math]::Round([Math]::Min($canvasW, $canvasH) * $scale)
    $ratio = [Math]::Min($box / $srcLogo.Width, $box / $srcLogo.Height)
    $w = [Math]::Round($srcLogo.Width * $ratio)
    $h = [Math]::Round($srcLogo.Height * $ratio)
    $x = [Math]::Round(($canvasW - $w) / 2)
    $y = [Math]::Round(($canvasH - $h) / 2)
    $g.DrawImage($srcLogo, $x, $y, $w, $h)
}

function Save-Png($bmp, $path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# --- App icons (transparent, "any" purpose) ---
foreach ($size in 192, 512) {
    $c = New-Canvas $size $size $false
    Draw-LogoCentered $c.Graphics $size $size 0.92
    Save-Png $c.Bitmap (Join-Path $iconsDir "icon-$size.png")
    $c.Graphics.Dispose(); $c.Bitmap.Dispose()
}

# --- Maskable icons (opaque bg, logo inside safe-zone circle ~ 60% of canvas) ---
foreach ($size in 192, 512) {
    $c = New-Canvas $size $size $true
    Draw-LogoCentered $c.Graphics $size $size 0.6
    Save-Png $c.Bitmap (Join-Path $iconsDir "icon-maskable-$size.png")
    $c.Graphics.Dispose(); $c.Bitmap.Dispose()
}

# --- Apple touch icon (opaque, iOS ignores alpha) ---
$c = New-Canvas 180 180 $true
Draw-LogoCentered $c.Graphics 180 180 0.72
Save-Png $c.Bitmap (Join-Path $iconsDir "apple-touch-icon.png")
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# --- Favicon-ish 32x32 (optional convenience) ---
$c = New-Canvas 32 32 $false
Draw-LogoCentered $c.Graphics 32 32 0.95
Save-Png $c.Bitmap (Join-Path $iconsDir "icon-32.png")
$c.Graphics.Dispose(); $c.Bitmap.Dispose()

# --- iOS splash screens (portrait only, orientation is locked to portrait) ---
$splashSizes = @(
    @{ w = 750;  h = 1334 },  # iPhone SE2/3, 6/7/8
    @{ w = 828;  h = 1792 },  # iPhone 11 / XR
    @{ w = 1080; h = 2340 },  # iPhone 12/13 mini
    @{ w = 1125; h = 2436 },  # iPhone X/XS/11 Pro
    @{ w = 1170; h = 2532 },  # iPhone 12/13/14
    @{ w = 1179; h = 2556 },  # iPhone 14 Pro/15/16
    @{ w = 1242; h = 2208 },  # iPhone 6+/7+/8+
    @{ w = 1242; h = 2688 },  # iPhone XS Max/11 Pro Max
    @{ w = 1284; h = 2778 },  # iPhone 12/13/14 Pro Max
    @{ w = 1290; h = 2796 }   # iPhone 14/15/16 Pro Max
)

foreach ($s in $splashSizes) {
    $c = New-Canvas $s.w $s.h $true
    Draw-LogoCentered $c.Graphics $s.w $s.h 0.32
    Save-Png $c.Bitmap (Join-Path $splashDir "splash-$($s.w)x$($s.h).png")
    $c.Graphics.Dispose(); $c.Bitmap.Dispose()
}

$srcLogo.Dispose()
Write-Host "Done. Icons in public/icons, splash screens in public/splash."
