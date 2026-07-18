param(
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$failures = New-Object System.Collections.Generic.List[string]

$requiredFiles = @(
  "index.html",
  "assets/styles.css",
  "assets/app.js",
  "assets/analysis.mjs",
  "data/packets.json",
  "tests/analysis.test.mjs",
  "tests/browser-smoke.mjs",
  "tools/static-server.mjs",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/CASE_STUDY.md",
  "docs/RELEASE_NOTES.md",
  "docs/VALIDATION.md",
  "docs/screenshots/doctrace-approved-workflow.png",
  "docs/screenshots/doctrace-mobile-workflow.png",
  "LICENSE",
  ".gitignore",
  ".env.example",
  ".nojekyll",
  "package.json"
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $file))) {
    $failures.Add("Missing required file: $file")
  }
}

if (Test-Path -LiteralPath (Join-Path $root "data/packets.json")) {
  try {
    $fixture = Get-Content -Raw -LiteralPath (Join-Path $root "data/packets.json") | ConvertFrom-Json
    if ($fixture.packets.Count -lt 2) { $failures.Add("At least two synthetic packets are required.") }
    foreach ($packet in $fixture.packets) {
      if ($packet.documents.Count -lt 3) { $failures.Add("Packet $($packet.id) needs at least three source documents.") }
      $packetText = $packet.documents.clauses.text -join " "
      if ($packetText -notmatch "Synthetic-data notice") { $failures.Add("Packet $($packet.id) lacks a synthetic-data notice.") }
    }
  } catch {
    $failures.Add("Packet fixture is not valid JSON: $($_.Exception.Message)")
  }
}

$htmlPath = Join-Path $root "index.html"
if (Test-Path -LiteralPath $htmlPath) {
  $html = Get-Content -Raw -LiteralPath $htmlPath
  foreach ($required in @('<meta name="viewport"', 'class="skip-link"', 'id="workspace"', 'aria-live=', 'type="module"')) {
    if ($html -notmatch [Regex]::Escape($required)) { $failures.Add("index.html is missing: $required") }
  }
}

$sourceFiles = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
  $_.FullName -notlike "*\.git\*" -and
  $_.FullName -ne $MyInvocation.MyCommand.Path -and
  $_.Extension -in @(".html", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".example")
}
$allText = ($sourceFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"

$sensitivePatterns = @(
  "(?i)gmail\.com",
  "sk-[A-Za-z0-9]{20,}",
  "gh[opsu]_[A-Za-z0-9]{20,}",
  "BEGIN (RSA|OPENSSH) PRIVATE KEY"
)
foreach ($pattern in $sensitivePatterns) {
  if ($allText -match $pattern) { $failures.Add("Potential private information or secret pattern found: $pattern") }
}

foreach ($phrase in @("synthetic", "deterministic", "human verification", "not legal advice")) {
  if ($allText -notmatch [Regex]::Escape($phrase)) { $failures.Add("Required disclosure phrase missing: $phrase") }
}

if (-not $NodePath) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $NodePath = $nodeCommand.Source }
}

if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) {
  $failures.Add("Node.js was not found. Pass -NodePath with a valid Node.js executable to run logic tests.")
} else {
  & $NodePath (Join-Path $root "tests/analysis.test.mjs")
  if ($LASTEXITCODE -ne 0) { $failures.Add("Logic tests failed with exit code $LASTEXITCODE.") }
}

if ($failures.Count -gt 0) {
  Write-Host "DOCUTRACE VALIDATION FAILED"
  foreach ($failure in $failures) { Write-Host "- $failure" }
  exit 1
}

Write-Host "DOCUTRACE VALIDATION PASSED"
Write-Host "Checked repository structure, synthetic fixtures, disclosures, privacy patterns, accessible HTML hooks, and analysis logic."
