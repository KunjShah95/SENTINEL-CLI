Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$ink = [System.Drawing.ColorTranslator]::FromHtml('#0A0B0A')
$moss = [System.Drawing.ColorTranslator]::FromHtml('#8BD99A')
$mossBrush = New-Object System.Drawing.SolidBrush($moss)
$inkBrush = New-Object System.Drawing.SolidBrush($ink)

# Rounded square tile
$r = 108
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
$path.AddArc(0, $size - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($mossBrush, $path)

# Diamond mark: outer dark diamond with an inner moss diamond = the ◈ glyph
function New-Diamond([double]$c, [double]$d) {
    $top = $c - $d
    $bottom = $c + $d
    $right = $c + $d
    $left = $c - $d
    return [System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point([int]$c, [int]$top)),
        (New-Object System.Drawing.Point([int]$right, [int]$c)),
        (New-Object System.Drawing.Point([int]$c, [int]$bottom)),
        (New-Object System.Drawing.Point([int]$left, [int]$c))
    )
}

$outer = New-Diamond 256 150
$inner = New-Diamond 256 74

$g.FillPolygon($inkBrush, $outer)
$g.FillPolygon($mossBrush, $inner)

$g.Dispose()
$out = Join-Path $PSScriptRoot '..\public\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "wrote $out"
