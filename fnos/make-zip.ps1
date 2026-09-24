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

# .NET Framework's ZipArchive writes UTF-8 names but never sets the per-entry
# UTF-8 language-encoding flag (general purpose bit 11). Readers that honour the
# spec (Python zipfile, some unzip builds, Windows Explorer) then decode
# non-ASCII names as CP437 and show mojibake. Patch the flag into every local
# file header and central directory record, driven by a proper central-directory
# walk (so no false match inside file data).
function Set-ZipUtf8Flag([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)

  # End Of Central Directory record: signature PK\x05\x06, scan from the end
  $eocd = -1
  for ($i = $bytes.Length - 22; $i -ge 0; $i--) {
    if ($bytes[$i] -eq 0x50 -and $bytes[$i + 1] -eq 0x4b -and $bytes[$i + 2] -eq 0x05 -and $bytes[$i + 3] -eq 0x06) { $eocd = $i; break }
  }
  if ($eocd -lt 0) { throw "zip: end-of-central-directory record not found" }

  $recordCount = [BitConverter]::ToUInt16($bytes, $eocd + 10)
  $offset = [int][BitConverter]::ToUInt32($bytes, $eocd + 16)

  for ($n = 0; $n -lt $recordCount; $n++) {
    if (-not ($bytes[$offset] -eq 0x50 -and $bytes[$offset + 1] -eq 0x4b -and $bytes[$offset + 2] -eq 0x01 -and $bytes[$offset + 3] -eq 0x02)) {
      throw ("zip: bad central directory record at offset " + $offset)
    }

    # central directory: flags at +8, local header offset at +42
    $flags = [BitConverter]::ToUInt16($bytes, $offset + 8) -bor 0x0800
    $bytes[$offset + 8] = [byte]($flags -band 0xff)
    $bytes[$offset + 9] = [byte](($flags -shr 8) -band 0xff)

    # local file header: flags at +6
    $local = [int][BitConverter]::ToUInt32($bytes, $offset + 42)
    $localFlags = [BitConverter]::ToUInt16($bytes, $local + 6) -bor 0x0800
    $bytes[$local + 6] = [byte]($localFlags -band 0xff)
    $bytes[$local + 7] = [byte](($localFlags -shr 8) -band 0xff)

    $nameLen = [BitConverter]::ToUInt16($bytes, $offset + 28)
    $extraLen = [BitConverter]::ToUInt16($bytes, $offset + 30)
    $commentLen = [BitConverter]::ToUInt16($bytes, $offset + 32)
    $offset += 46 + $nameLen + $extraLen + $commentLen
  }

  [System.IO.File]::WriteAllBytes($path, $bytes)
}
Set-ZipUtf8Flag $dst

Write-Host ("    zip entries: " + $count + " -> " + $dst)
