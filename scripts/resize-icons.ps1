Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$srcPath = "D:\builder\写拉松插件\writeathon-companion\public\icons\logo128.png"

foreach ($size in $sizes) {
    $destPath = "D:\builder\写拉松插件\writeathon-companion\public\icons\logo$size.png"
    
    $src = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $size, $size)
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $src.Dispose()
    
    Write-Host "Created logo$size.png"
}
