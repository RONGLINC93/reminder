# Create a .zip from a directory, fixing two things Windows tooling gets wrong
# for cross-platform release archives:
#   1) entry names are stored as UTF-8 with the language-encoding flag set, so
#      non-ASCII names (e.g. the launcher 运行.bat / 停止.bat) never turn into
#      mojibake. `tar` on Windows stores them in the local ANSI code page (GBK)
#      without the flag.
#   2) path separators are forward slashes, as the zip spec requires, so
#      Linux/macOS tools extract the tree correctly. Compress-Archive on
#      Windows PowerShell 5.1 writes backslashes.
# Usage:
#   powershell -ExecutionPolicy Bypass -File make-zip.ps1 `
#     -Source .\dist\staging\pkg -Destination .\dist\pkg.zip
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 reads .ps1 as ANSI
#       when there is no BOM, so non-ASCII literals would be garbled).
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$src = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\', '/')
$dst = [System.IO.Path]::GetFullPath($Destination)
$dstDir = [System.IO.Path]::GetDirectoryName($dst)
if (-not (Test-Path -LiteralPath $dstDir)) { [void](New-Item -ItemType Directory -Path $dstDir -Force) }
if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }

# Must be the built-in Encoding.UTF8: .NET only sets the per-entry UTF-8
# language-encoding flag (bit 11) when the supplied encoding Equals Encoding.UTF8,
# and a custom UTF8Encoding($false) is not equal to it. The flag matters because
# readers otherwise decode non-ASCII names as CP437 and show mojibake.
$enc = [System.Text.Encoding]::UTF8
$count = 0

$fs = [System.IO.File]::Open($dst, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $true, $enc)
  try {
    Get-ChildItem -LiteralPath $src -Recurse -Force | ForEach-Object {
      $rel = $_.FullName.Substring($src.Length).TrimStart('\', '/')
      if ([string]::IsNullOrEmpty($rel)) { return }
      $name = $rel.Replace('\', '/')
      $stamp = $_.LastWriteTime
      # zip timestamps are only valid from 1980 onwards
      $stampOk = ($stamp.Year -ge 1980 -and $stamp.Year -le 2107)

      if ($_.PSIsContainer) {
        $entry = $zip.CreateEntry($name + '/')
        if ($stampOk) { $entry.LastWriteTime = $stamp }
      } else {
        $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
        # must be set before the entry stream is opened for writing
        if ($stampOk) { $entry.LastWriteTime = $stamp }
        $outStream = $entry.Open()
        $inStream = [System.IO.File]::OpenRead($_.FullName)
        try { $inStream.CopyTo($outStream) } finally { $inStream.Dispose(); $outStream.Dispose() }
        $count++
      }
    }
  } finally { $zip.Dispose() }
} finally { $fs.Dispose() }

Write-Host ("    zip entries: " + $count + " -> " + $dst)
