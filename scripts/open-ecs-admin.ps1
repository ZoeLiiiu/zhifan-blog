$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$credentialFile = Join-Path $projectRoot ".env.ecs.txt"
if (-not (Test-Path -LiteralPath $credentialFile)) {
  throw "Cannot find .env.ecs.txt"
}

$bytes = [System.IO.File]::ReadAllBytes($credentialFile)
$lines = ([System.Text.Encoding]::UTF8.GetString($bytes) -split "`r?`n") |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$values = @($lines | ForEach-Object { ($_ -replace "[^\x00-\x7F]", "").Trim() })

$serverHost = $values[0]
$serverUser = $values[1]
if ($serverHost -notmatch "^(?:\d{1,3}\.){3}\d{1,3}$") {
  throw "Invalid ECS server address"
}

Write-Host "Zhifan admin secure tunnel is starting." -ForegroundColor Green
Write-Host "Enter the ECS password, keep this window open, then visit: http://127.0.0.1:3210"
& ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L "3210:127.0.0.1:3210" "$serverUser@$serverHost"
