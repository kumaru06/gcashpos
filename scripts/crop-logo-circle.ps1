param(
  [string]$InputPath,
  [string]$OutputPath,
  [double]$DiameterPercent = 0.86
)

Add-Type -AssemblyName System.Drawing

$resolved = Resolve-Path $InputPath
$src = [System.Drawing.Bitmap]::FromFile($resolved)
$min = [Math]::Min($src.Width, $src.Height)
$cx = [int](($src.Width - $min) / 2)
$cy = [int](($src.Height - $min) / 2)
$diam = [Math]::Max(64, [int]($min * $DiameterPercent))
$offset = [int](($min - $diam) / 2)

$out = New-Object System.Drawing.Bitmap $diam, $diam, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$clip = New-Object System.Drawing.Drawing2D.GraphicsPath
$clip.AddEllipse(0, 0, $diam, $diam)
$g.SetClip($clip)

$srcRect = New-Object System.Drawing.Rectangle ($cx + $offset), ($cy + $offset), $diam, $diam
$destRect = New-Object System.Drawing.Rectangle 0, 0, $diam, $diam
$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$fullOut = Join-Path (Get-Location) $OutputPath
$outDir = Split-Path $fullOut -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$out.Save($fullOut, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$src.Dispose()

Write-Host "Wrote $OutputPath ($diam x $diam)"
