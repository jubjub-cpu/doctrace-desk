param(
  [int]$Port = 4177,
  [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $root
& $NodePath (Join-Path $root "tools/static-server.mjs") --port $Port
