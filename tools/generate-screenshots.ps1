# Generates branded manifest "screenshots" (for install prompts / PWABuilder
# store listings) from public/logo.png. Deliberately NOT a live capture of
# the running app: the real screens are behind auth and show real coach/
# client names and emails, which must never end up in a public manifest
# asset. This renders brand + feature copy only.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $root "public\logo.png"
$outDir = Join-Path $root "public\screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$bg = [System.Drawing.Color]::FromArgb(255, 11, 18, 32)      # #0B1220
$accent = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) # emerald
$textMain = [System.Drawing.Color]::FromArgb(255, 248, 250, 252)
$textMuted = [System.Drawing.Color]::FromArgb(255, 148, 163, 184)

$srcLogo = [System.Drawing.Image]::FromFile($logoPath)

function New-Slide($w, $h, $title, $subtitle, $bullets, $path) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($bg)

    # Logo, centered near top third
    $logoSize = [Math]::Round($w * 0.28)
    $g.DrawImage($srcLogo, [Math]::Round(($w - $logoSize) / 2), [Math]::Round($h * 0.12), $logoSize, $logoSize)

    $titleFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Round($w * 0.06), [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Round($w * 0.032), [System.Drawing.FontStyle]::Regular)
    $bulletFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Round($w * 0.028), [System.Drawing.FontStyle]::Regular)

    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center

    $titleY = $h * 0.46
    $titleRect = [System.Drawing.RectangleF]::new(0.0, [float]$titleY, [float]$w, [float]($h * 0.1))
    $g.DrawString($title, $titleFont, [System.Drawing.SolidBrush]::new($textMain), $titleRect, $format)

    $subY = $titleY + ($h * 0.09)
    $subRect = [System.Drawing.RectangleF]::new([float]($w * 0.1), [float]$subY, [float]($w * 0.8), [float]($h * 0.08))
    $g.DrawString($subtitle, $subFont, [System.Drawing.SolidBrush]::new($textMuted), $subRect, $format)

    $bulletY = $subY + ($h * 0.1)
    foreach ($b in $bullets) {
        $dotX = [float]($w * 0.14)
        $dotY = [float]($bulletY + ($w * 0.012))
        $dotSize = [float]($w * 0.018)
        $g.FillEllipse([System.Drawing.SolidBrush]::new($accent), $dotX, $dotY, $dotSize, $dotSize)
        $textPoint = [System.Drawing.PointF]::new([float]($w * 0.18), [float]$bulletY)
        $g.DrawString($b, $bulletFont, [System.Drawing.SolidBrush]::new($textMain), $textPoint)
        $bulletY += $h * 0.045
    }

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

$bullets1 = @("Live workout logging", "Progress charts & muscle balance", "Coach-built plans")
$out1 = Join-Path $outDir "narrow-1.png"
New-Slide 1080 1920 "FitEngineersss" "Coaches and clients, one app" $bullets1 $out1

$bullets2 = @("Client roster & invites", "Real-time training status", "AI-assisted workout drafts")
$out2 = Join-Path $outDir "narrow-2.png"
New-Slide 1080 1920 "Built for coaches" "Manage every client from your phone" $bullets2 $out2

$srcLogo.Dispose()
Write-Host "Done. Screenshots in public/screenshots."
