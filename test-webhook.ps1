param(
  [string]$Url = "http://1.117.68.99:9000/hooks/overheat-deploy",
  [string]$Secret = "3c7eca679ab21b0ac41591cecd504fdda87b758060cc6cd1c8beed7670e9986a",
  [string]$Ref = "refs/heads/main"
)

$ErrorActionPreference = "Stop"

$body = ConvertTo-Json @{ ref = $Ref } -Compress
$bodyFile = Join-Path $env:TEMP "overheat-webhook-body.json"

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($bodyFile, $body, $utf8NoBom)

$hmac = [System.Security.Cryptography.HMACSHA256]::new()
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))
$sig = "sha256=" + (($hash | ForEach-Object { $_.ToString("x2") }) -join "")

Write-Host "POST $Url"
Write-Host "Body: $body"
Write-Host "Signature: $sig"

curl.exe -v `
  -H "Content-Type: application/json" `
  -H "X-GitHub-Event: push" `
  -H "X-GitHub-Delivery: local-test-$(Get-Date -Format yyyyMMddHHmmss)" `
  -H "X-Hub-Signature-256: $sig" `
  --data-binary "@$bodyFile" `
  $Url

exit $LASTEXITCODE
