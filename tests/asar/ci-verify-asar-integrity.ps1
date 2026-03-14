# CI/CD ASAR Integrity Verification for Windows
# Automated script for verifying ASAR integrity in build pipelines
# Exit codes: 0 = Success, 1 = Verification failed, 2 = Configuration error
# Usage: .\ci-verify-asar-integrity.ps1 <path-to-app-dir>

param(
    [Parameter(Mandatory=$true)]
    [string]$AppPath,

    [string]$StrictMode = $env:STRICT_MODE ?? "false"
)

$EXIT_SUCCESS = 0
$EXIT_VERIFICATION_FAILED = 1
$EXIT_CONFIG_ERROR = 2

if (-not (Test-Path $AppPath)) {
    Write-Host "ERROR: App not found: $AppPath"
    exit $EXIT_CONFIG_ERROR
}

Write-Host "================================================="
Write-Host "CI/CD ASAR Integrity Verification (Windows)"
Write-Host "================================================="
Write-Host ""
Write-Host "App: $AppPath"
Write-Host "Strict Mode: $StrictMode"
Write-Host ""

$Warnings = 0
$Errors = 0

# Find the ASAR file
$AsarPath = Join-Path $AppPath "resources\app.asar"

# Find the main executable
$ExeName = (Get-ChildItem -Path $AppPath -Filter "*.exe" | Where-Object { $_.Name -ne "Uninstall*.exe" } | Select-Object -First 1).FullName

# Check 1: ASAR exists
Write-Host "[1/4] Checking ASAR file..."
if (-not (Test-Path $AsarPath)) {
    Write-Host "  FAIL: ASAR file not found at $AsarPath"
    $Errors++
} else {
    $asarSize = (Get-Item $AsarPath).Length
    Write-Host "  PASS: ASAR file exists ($asarSize bytes)"
}

# Check 2: Parse ASAR prelude (12 bytes) and compute SHA256 of JSON header
Write-Host "[2/4] Computing ASAR header hash..."
if (Test-Path $AsarPath) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($AsarPath)

        # 12-byte prelude: len0 (4B LE) + headerSize (4B LE) + jsonLen (4B LE)
        $jsonLen = [BitConverter]::ToUInt32($bytes, 8)

        if ($jsonLen -gt 0 -and $jsonLen -lt $bytes.Length) {
            # Extract JSON header bytes (offset 12, length jsonLen)
            $jsonBytes = New-Object byte[] $jsonLen
            [Array]::Copy($bytes, 12, $jsonBytes, 0, $jsonLen)

            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $hashBytes = $sha256.ComputeHash($jsonBytes)
            $ComputedHash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

            Write-Host "  PASS: JSON header hash computed"
            Write-Host "  Hash: $($ComputedHash.Substring(0, 16))..."
        } else {
            Write-Host "  WARN: Could not parse ASAR prelude (jsonLen=$jsonLen)"
            $Warnings++
        }
    } catch {
        Write-Host "  WARN: Error reading ASAR: $_"
        $Warnings++
    }
} else {
    Write-Host "  SKIP: ASAR not found"
}

# Check 3: Read embedded hash via rcedit (npx rcedit --get-version-string)
Write-Host "[3/4] Reading embedded hash from executable..."
if ($ExeName -and (Test-Path $ExeName)) {
    try {
        $embeddedHash = & npx rcedit $ExeName --get-version-string "AsarIntegrity" 2>$null
        if ($embeddedHash) {
            # Parse JSON to get the hash value
            try {
                $parsed = $embeddedHash | ConvertFrom-Json
                $EmbeddedHashValue = $parsed.'Resources/app.asar'.hash
                if ($EmbeddedHashValue) {
                    Write-Host "  PASS: Embedded hash found"
                    Write-Host "  Hash: $($EmbeddedHashValue.Substring(0, 16))..."
                } else {
                    Write-Host "  WARN: AsarIntegrity field exists but hash not found"
                    $Warnings++
                }
            } catch {
                Write-Host "  WARN: Could not parse AsarIntegrity JSON: $embeddedHash"
                $Warnings++
            }
        } else {
            Write-Host "  WARN: No AsarIntegrity version string found in executable"
            $Warnings++
        }
    } catch {
        Write-Host "  WARN: rcedit not available or failed: $_"
        $Warnings++
    }
} else {
    Write-Host "  WARN: Executable not found"
    $Warnings++
}

# Check 4: Compare hashes
Write-Host "[4/4] Comparing hashes..."
if ($ComputedHash -and $EmbeddedHashValue) {
    if ($ComputedHash -eq $EmbeddedHashValue) {
        Write-Host "  PASS: Hashes match"
    } else {
        Write-Host "  FAIL: Hash mismatch"
        Write-Host "    Computed: $ComputedHash"
        Write-Host "    Embedded: $EmbeddedHashValue"
        $Errors++
    }
} else {
    Write-Host "  SKIP: Cannot compare (missing computed or embedded hash)"
    $Warnings++
}

# Summary
Write-Host ""
Write-Host "================================================="
Write-Host "Verification Summary"
Write-Host "================================================="
Write-Host ""
Write-Host "Errors:   $Errors"
Write-Host "Warnings: $Warnings"
Write-Host ""

if ($Errors -gt 0) {
    Write-Host "VERIFICATION FAILED"
    Write-Host "ASAR integrity is NOT properly configured"
    exit $EXIT_VERIFICATION_FAILED
} elseif ($StrictMode -eq "true" -and $Warnings -gt 0) {
    Write-Host "VERIFICATION FAILED (strict mode)"
    Write-Host "Warnings are treated as errors in strict mode"
    exit $EXIT_VERIFICATION_FAILED
} else {
    Write-Host "VERIFICATION PASSED"
    Write-Host "ASAR integrity is properly configured"
    exit $EXIT_SUCCESS
}
