Add-Type -AssemblyName System.Drawing

$srcPath = "E:\AI-Receptionist-System\images\favicon.png"
$img = [System.Drawing.Bitmap]::FromFile($srcPath)

function Test-Padding([System.Drawing.Color]$c) {
  if ($c.A -lt 20) { return $true }
  if ($c.R -lt 28 -and $c.G -lt 28 -and $c.B -lt 28) { return $true }
  return $false
}

$minX = $img.Width
$minY = $img.Height
$maxX = -1
$maxY = -1

for ($y = 0; $y -lt $img.Height; $y++) {
  for ($x = 0; $x -lt $img.Width; $x++) {
    $c = $img.GetPixel($x, $y)
    if (Test-Padding $c) { continue }
    if ($x -lt $minX) { $minX = $x }
    if ($y -lt $minY) { $minY = $y }
    if ($x -gt $maxX) { $maxX = $x }
    if ($y -gt $maxY) { $maxY = $y }
  }
}

if ($maxX -lt 0) { throw "No content found" }

$pad = [Math]::Max(2, [Math]::Round([Math]::Min($maxX - $minX + 1, $maxY - $minY + 1) * 0.02))
$left = [Math]::Max(0, $minX - $pad)
$top = [Math]::Max(0, $minY - $pad)
$right = [Math]::Min($img.Width - 1, $maxX + $pad)
$bottom = [Math]::Min($img.Height - 1, $maxY + $pad)
$cropW = $right - $left + 1
$cropH = $bottom - $top + 1

$rect = New-Object System.Drawing.Rectangle $left, $top, $cropW, $cropH
$cropped = $img.Clone($rect, $img.PixelFormat)

function Save-FilledSquare([System.Drawing.Bitmap]$source, [int]$size, [string]$path) {
  $out = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 30, 75))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scale = [Math]::Max($size / $source.Width, $size / $source.Height)
  $drawW = [Math]::Round($source.Width * $scale)
  $drawH = [Math]::Round($source.Height * $scale)
  $ox = [Math]::Floor(($size - $drawW) / 2)
  $oy = [Math]::Floor(($size - $drawH) / 2)
  $g.DrawImage($source, $ox, $oy, $drawW, $drawH)
  $g.Dispose()
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

$targets = @(
  "E:\AI-Receptionist-System\public\favicon.png",
  "E:\AI-Receptionist-System\public\images\favicon.png",
  "E:\AI-Receptionist-System\public\favicon-32.png",
  "E:\AI-Receptionist-System\images\favicon-tight.png"
)

Save-FilledSquare $cropped 64 $targets[0]
Copy-Item -Force $targets[0] $targets[1]
Save-FilledSquare $cropped 32 $targets[2]
Copy-Item -Force $targets[0] $targets[3]

@"
source=$($img.Width)x$($img.Height)
crop=${cropW}x${cropH} @${left},${top}
wrote=$($targets -join ', ')
"@ | Set-Content "E:\AI-Receptionist-System\.tmp-favicon-tighten.txt"

$cropped.Dispose()
$img.Dispose()
Write-Output "ok"
