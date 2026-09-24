#Requires -Version 5.1
<#
.SYNOPSIS
  Build a Chrome Web Store release package for Brocs.

.DESCRIPTION
  Reads version from manifest.json, copies runtime files into dist/brocs-{version}/,
  and creates dist/brocs-{version}.zip with manifest.json at the ZIP root.

.EXAMPLE
  .\build-release.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Err([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Write-WarnLine([string]$Message) {
  Write-Host "WARNING: $Message" -ForegroundColor Yellow
}

function Get-ProjectRoot {
  if ($PSScriptRoot) {
    return (Resolve-Path -LiteralPath $PSScriptRoot).Path
  }
  return (Resolve-Path -LiteralPath (Get-Location)).Path
}

function Read-Manifest([string]$ManifestPath) {
  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    Write-Err "manifest.json not found at $ManifestPath"
  }

  try {
    $raw = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8
    return $raw | ConvertFrom-Json
  } catch {
    Write-Err "Failed to parse manifest.json: $($_.Exception.Message)"
  }
}

function Test-ChromeVersion([string]$Version) {
  # Chrome Web Store: 1–4 dot-separated integers (0–65535). Brocs requires major.minor.patch.
  return $Version -match '^\d+\.\d+\.\d+(\.\d+)?$'
}

function Get-NoteProperty($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

function Get-ManifestLocalPaths($Manifest) {
  $paths = New-Object System.Collections.Generic.List[string]

  function Add-Path([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return }
    if ($p -match '^(https?:|data:|chrome://|chrome-extension://)') { return }
    $normalized = $p -replace '\\', '/'
    $normalized = $normalized.TrimStart('./')
    if (-not $paths.Contains($normalized)) {
      $paths.Add($normalized)
    }
  }

  $background = Get-NoteProperty $Manifest 'background'
  $serviceWorker = Get-NoteProperty $background 'service_worker'
  if ($serviceWorker) {
    Add-Path ([string]$serviceWorker)
  }

  $contentScripts = Get-NoteProperty $Manifest 'content_scripts'
  if ($contentScripts) {
    foreach ($cs in @($contentScripts)) {
      $jsList = Get-NoteProperty $cs 'js'
      if ($jsList) {
        foreach ($js in @($jsList)) { Add-Path ([string]$js) }
      }
      $cssList = Get-NoteProperty $cs 'css'
      if ($cssList) {
        foreach ($css in @($cssList)) { Add-Path ([string]$css) }
      }
    }
  }

  $icons = Get-NoteProperty $Manifest 'icons'
  if ($icons) {
    foreach ($prop in $icons.PSObject.Properties) {
      Add-Path ([string]$prop.Value)
    }
  }

  $action = Get-NoteProperty $Manifest 'action'
  if ($action) {
    $defaultIcon = Get-NoteProperty $action 'default_icon'
    if ($defaultIcon) {
      if ($defaultIcon -is [string]) {
        Add-Path $defaultIcon
      } else {
        foreach ($prop in $defaultIcon.PSObject.Properties) {
          Add-Path ([string]$prop.Value)
        }
      }
    }
    $popup = Get-NoteProperty $action 'default_popup'
    if ($popup) {
      Add-Path ([string]$popup)
    }
  }

  $optionsPage = Get-NoteProperty $Manifest 'options_page'
  if ($optionsPage) {
    Add-Path ([string]$optionsPage)
  }

  $optionsUi = Get-NoteProperty $Manifest 'options_ui'
  $optionsUiPage = Get-NoteProperty $optionsUi 'page'
  if ($optionsUiPage) {
    Add-Path ([string]$optionsUiPage)
  }

  $war = Get-NoteProperty $Manifest 'web_accessible_resources'
  if ($war) {
    foreach ($entry in @($war)) {
      $resources = Get-NoteProperty $entry 'resources'
      if ($resources) {
        foreach ($res in @($resources)) {
          Add-Path ([string]$res)
        }
      }
    }
  }

  return $paths
}

function Get-JsImports([string]$JsFilePath, [string]$ProjectRoot) {
  $imports = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $JsFilePath)) {
    return $imports
  }

  $content = Get-Content -LiteralPath $JsFilePath -Raw -Encoding UTF8
  $patterns = @(
    'import\s+[^''"]*[''"](\.[^''"]+)[''"]',
    'import\s*\(\s*[''"](\.[^''"]+)[''"]\s*\)',
    'export\s+[^''"]*from\s*[''"](\.[^''"]+)[''"]'
  )

  $dir = Split-Path -Parent $JsFilePath
  foreach ($pattern in $patterns) {
    $regexMatches = [regex]::Matches($content, $pattern)
    foreach ($m in $regexMatches) {
      $rel = $m.Groups[1].Value
      $resolved = [System.IO.Path]::GetFullPath((Join-Path $dir $rel))
      if (-not $resolved.StartsWith($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }
      $relative = $resolved.Substring($ProjectRoot.Length).TrimStart('\', '/')
      $relative = $relative -replace '\\', '/'
      if (-not $imports.Contains($relative)) {
        $imports.Add($relative)
      }
    }
  }

  return $imports
}

function Collect-RuntimeFiles([string]$ProjectRoot, $Manifest) {
  $files = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [void]$files.Add('manifest.json')

  $queue = New-Object System.Collections.Generic.Queue[string]
  foreach ($p in (Get-ManifestLocalPaths $Manifest)) {
    $queue.Enqueue($p)
  }

  # Always include runtime icon assets used by the extension.
  $iconsDir = Join-Path $ProjectRoot 'icons'
  if (Test-Path -LiteralPath $iconsDir) {
    Get-ChildItem -LiteralPath $iconsDir -File -Recurse |
      Where-Object { $_.Extension -match '^\.(png|jpe?g|webp|gif|svg)$' } |
      ForEach-Object {
        $rel = $_.FullName.Substring($ProjectRoot.Length).TrimStart('\', '/')
        $queue.Enqueue(($rel -replace '\\', '/'))
      }
  }

  while ($queue.Count -gt 0) {
    $item = $queue.Dequeue()
    if (-not $files.Add($item)) {
      continue
    }

    if ($item -match '\.js$') {
      $full = Join-Path $ProjectRoot ($item -replace '/', '\')
      foreach ($imp in (Get-JsImports $full $ProjectRoot)) {
        if (-not $files.Contains($imp)) {
          $queue.Enqueue($imp)
        }
      }
    }
  }

  return @($files)
}

function Test-ExcludedPath([string]$RelativePath) {
  $p = $RelativePath -replace '\\', '/'
  $blockedPrefixes = @(
    '.git/', '.github/', '.idea/', '.vscode/', '.cursor/',
    'node_modules/', 'dist/', 'tmp/', 'temp/', 'tests/', 'test/',
    'screenshots/', 'docs/', 'development/', 'coverage/'
  )
  foreach ($prefix in $blockedPrefixes) {
    if ($p.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  $blockedNames = @(
    '.gitignore', '.gitattributes', '.editorconfig',
    'README.md', 'CHANGELOG.md', 'TODO.md', 'LICENSE',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'build-release.ps1', 'package.json'
  )
  $name = Split-Path -Leaf $p
  foreach ($blocked in $blockedNames) {
    if ($name -eq $blocked) {
      return $true
    }
  }

  if ($p -match '\.(psd|ai|sketch|fig|map|log|tmp|bak)$') {
    return $true
  }

  return $false
}

function Assert-ManifestValid($Manifest, [string]$ProjectRoot) {
  $manifestVersion = Get-NoteProperty $Manifest 'manifest_version'
  if ($null -eq $manifestVersion) {
    Write-Err "manifest.json is missing manifest_version."
  }
  if ([int]$manifestVersion -ne 3) {
    Write-Err "manifest_version must be 3 (found: $manifestVersion)."
  }

  $name = Get-NoteProperty $Manifest 'name'
  if ([string]::IsNullOrWhiteSpace([string]$name)) {
    Write-Err "manifest.json is missing name."
  }

  $version = Get-NoteProperty $Manifest 'version'
  if ([string]::IsNullOrWhiteSpace([string]$version)) {
    Write-Err "manifest.json is missing version."
  }
  if (-not (Test-ChromeVersion ([string]$version))) {
    Write-Err "Invalid version '$version'. Expected major.minor.patch (e.g. 0.1.0)."
  }

  $description = Get-NoteProperty $Manifest 'description'
  if ([string]::IsNullOrWhiteSpace([string]$description)) {
    Write-Err "manifest.json is missing description."
  }

  if ($null -eq (Get-NoteProperty $Manifest 'action')) {
    Write-Err "manifest.json is missing action section."
  }

  $icons = Get-NoteProperty $Manifest 'icons'
  if ($null -eq $icons) {
    Write-Err "manifest.json is missing icons."
  } else {
    foreach ($required in @('16', '48', '128')) {
      $prop = $icons.PSObject.Properties[$required]
      if (-not $prop -or [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
        Write-Err "manifest.json icons must include size $required."
      }
    }
  }

  $devPermissions = @(
    'debugger', 'nativeMessaging', 'geolocation', 'clipboardRead',
    'clipboardWrite', 'management', 'devtools', 'webRequestBlocking'
  )
  $permissions = Get-NoteProperty $Manifest 'permissions'
  if ($permissions) {
    foreach ($perm in @($permissions)) {
      if ($devPermissions -contains ([string]$perm)) {
        Write-Err "Development-only or disallowed permission found: $perm"
      }
    }
  }

  $manifestText = Get-Content -LiteralPath (Join-Path $ProjectRoot 'manifest.json') -Raw -Encoding UTF8
  if ($manifestText -match 'localhost|127\.0\.0\.1|0\.0\.0\.0') {
    Write-Err "manifest.json contains localhost / loopback URL(s)."
  }
  if ($manifestText -match 'http://localhost|https://localhost') {
    Write-Err "manifest.json contains localhost endpoint(s)."
  }
}

function Test-RuntimeLocalhost([string]$ReleaseDir) {
  $warnings = New-Object System.Collections.Generic.List[string]
  $patterns = @(
    'http://localhost',
    'https://localhost',
    'localhost',
    '127.0.0.1',
    '0.0.0.0'
  )

  Get-ChildItem -LiteralPath $ReleaseDir -Recurse -File |
    Where-Object { $_.Extension -match '^\.(js|json|html|css|mjs)$' } |
    ForEach-Object {
      $rel = $_.FullName.Substring($ReleaseDir.Length).TrimStart('\', '/')
      $lines = Get-Content -LiteralPath $_.FullName -Encoding UTF8
      for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith('//') -or $trimmed.StartsWith('*') -or $trimmed.StartsWith('/*')) {
          continue
        }
        foreach ($pat in $patterns) {
          if ($line -like "*$pat*") {
            $warnings.Add("${rel}:$($i + 1) contains '$pat'")
            break
          }
        }
      }
    }

  return $warnings
}

function Test-JsSyntax([string]$ReleaseDir) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    return @()
  }

  $errors = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $ReleaseDir -Recurse -Filter *.js -File | ForEach-Object {
    $rel = $_.FullName.Substring($ReleaseDir.Length).TrimStart('\', '/')
    $result = & node --check $_.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
      $errors.Add("JavaScript syntax error in ${rel}: $result")
    }
  }
  return $errors
}

function New-ZipFromDirectory([string]$SourceDir, [string]$ZipPath) {
  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $files = Get-ChildItem -LiteralPath $SourceDir -Recurse -File
    foreach ($file in $files) {
      $entryName = $file.FullName.Substring($SourceDir.Length).TrimStart('\', '/').Replace('\', '/')
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $file.FullName,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      )
    }
  } finally {
    $zip.Dispose()
  }
}

function Get-ZipEntryNames([string]$ZipPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    return @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  } finally {
    $zip.Dispose()
  }
}

# --- main ---

$ProjectRoot = Get-ProjectRoot
$ManifestPath = Join-Path $ProjectRoot 'manifest.json'
$DistRoot = Join-Path $ProjectRoot 'dist'

Write-Host "Brocs Release Builder"
Write-Host ""

$Manifest = Read-Manifest $ManifestPath
Assert-ManifestValid $Manifest $ProjectRoot

$Version = [string]$Manifest.version
$ReleaseName = "brocs-$Version"
$ReleaseDir = Join-Path $DistRoot $ReleaseName
$ZipPath = Join-Path $DistRoot "$ReleaseName.zip"
$ShaPath = Join-Path $DistRoot "$ReleaseName.zip.sha256"

Write-Host "Permissions:"
$permissions = Get-NoteProperty $Manifest 'permissions'
if ($permissions) {
  foreach ($perm in @($permissions)) {
    Write-Host "- $perm"
  }
} else {
  Write-Host "- (none)"
}
Write-Host ""
Write-Host "Host permissions:"
$hostPermissions = Get-NoteProperty $Manifest 'host_permissions'
if ($hostPermissions) {
  foreach ($hp in @($hostPermissions)) {
    Write-Host "- $hp"
  }
} else {
  Write-Host "- (none)"
}
Write-Host ""

$runtimeFiles = Collect-RuntimeFiles $ProjectRoot $Manifest

foreach ($rel in $runtimeFiles) {
  if (Test-ExcludedPath $rel) {
    Write-Err "Runtime collection unexpectedly selected excluded path: $rel"
  }
  $src = Join-Path $ProjectRoot ($rel -replace '/', '\')
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Err "$rel referenced by the extension does not exist."
  }
}

# Clean previous release artifacts for this version
if (Test-Path -LiteralPath $ReleaseDir) {
  Remove-Item -LiteralPath $ReleaseDir -Recurse -Force
}
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
if (Test-Path -LiteralPath $ShaPath) {
  Remove-Item -LiteralPath $ShaPath -Force
}

New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

foreach ($rel in ($runtimeFiles | Sort-Object)) {
  $src = Join-Path $ProjectRoot ($rel -replace '/', '\')
  $dst = Join-Path $ReleaseDir ($rel -replace '/', '\')
  $dstParent = Split-Path -Parent $dst
  if (-not (Test-Path -LiteralPath $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  Copy-Item -LiteralPath $src -Destination $dst -Force
}

$releaseManifest = Join-Path $ReleaseDir 'manifest.json'
if (-not (Test-Path -LiteralPath $releaseManifest)) {
  Write-Err "dist\$ReleaseName\manifest.json was not created."
}

# Verify every manifest-referenced local file exists in the release dir
foreach ($rel in (Get-ManifestLocalPaths $Manifest)) {
  $check = Join-Path $ReleaseDir ($rel -replace '/', '\')
  if (-not (Test-Path -LiteralPath $check)) {
    Write-Err "$rel referenced by manifest.json does not exist."
  }
}

$localhostWarnings = Test-RuntimeLocalhost $ReleaseDir
foreach ($w in $localhostWarnings) {
  Write-WarnLine $w
}

$jsErrors = Test-JsSyntax $ReleaseDir
foreach ($err in $jsErrors) {
  Write-Err $err
}

New-ZipFromDirectory -SourceDir $ReleaseDir -ZipPath $ZipPath

$entryNames = Get-ZipEntryNames $ZipPath
if ($entryNames -notcontains 'manifest.json') {
  $nested = $entryNames | Where-Object { $_ -match '/manifest\.json$' }
  if ($nested) {
    Write-Err "manifest.json must be at ZIP root, found nested: $($nested -join ', ')"
  }
  Write-Err "ZIP is missing manifest.json at the archive root."
}

$forbiddenInZip = @('.git/', '.cursor/', 'dist/', 'node_modules/')
foreach ($entry in $entryNames) {
  foreach ($bad in $forbiddenInZip) {
    if ($entry.StartsWith($bad, [System.StringComparison]::OrdinalIgnoreCase) -or
        $entry -match "/$([regex]::Escape($bad.TrimEnd('/')))/") {
      Write-Err "ZIP unexpectedly contains forbidden path: $entry"
    }
  }
  if (Test-ExcludedPath $entry) {
    Write-Err "ZIP contains excluded development file: $entry"
  }
}

$zipInfo = Get-Item -LiteralPath $ZipPath
$zipSizeBytes = $zipInfo.Length
$zipSizeKb = [math]::Round($zipSizeBytes / 1KB, 0)
if ($zipSizeBytes -gt 1MB) {
  $mb = [math]::Round($zipSizeBytes / 1MB, 1)
  Write-WarnLine "Brocs release package is unexpectedly large: $mb MB"
}

$hash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
Set-Content -LiteralPath $ShaPath -Value "$hash  $ReleaseName.zip" -Encoding ASCII

Write-Host ""
Write-Host "Version:           $Version"
Write-Host "Manifest:          OK"
Write-Host "Manifest V3:       OK"
Write-Host "Runtime files:     OK ($($runtimeFiles.Count) files)"
Write-Host "Icons:             OK"
Write-Host "Package structure: OK"
Write-Host ""
Write-Host "Release directory:"
Write-Host "dist\$ReleaseName"
Write-Host ""
Write-Host "Chrome Web Store package:"
Write-Host "dist\$ReleaseName.zip"
Write-Host ""
Write-Host "Package size:"
Write-Host "$zipSizeKb KB"
Write-Host ""
Write-Host "SHA-256:"
Write-Host $hash
Write-Host ""
Write-Host "Checksum file:"
Write-Host "dist\$ReleaseName.zip.sha256"
Write-Host ""
Write-Host "Release package is ready." -ForegroundColor Green
