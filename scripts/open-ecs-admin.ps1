$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$credentialFile = Join-Path $projectRoot ".env.ecs.txt"
if (-not (Test-Path -LiteralPath $credentialFile)) {
  throw "未找到 .env.ecs.txt"
}

$bytes = [System.IO.File]::ReadAllBytes($credentialFile)
$lines = ([System.Text.Encoding]::UTF8.GetString($bytes) -split "`r?`n") |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$values = @($lines | ForEach-Object { ($_ -replace "[^\x00-\x7F]", "").Trim() })

$serverHost = $values[0]
$serverUser = $values[1]
if ($serverHost -notmatch "^(?:\d{1,3}\.){3}\d{1,3}$") {
  throw "服务器地址格式不正确"
}

Write-Host "知返管理后台安全通道正在启动。" -ForegroundColor Green
Write-Host "输入服务器密码后，请保持此窗口开启，并在浏览器访问：http://127.0.0.1:3210"
& ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L "3210:127.0.0.1:3210" "$serverUser@$serverHost"
