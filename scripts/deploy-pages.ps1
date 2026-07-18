$ErrorActionPreference = "Stop"

$env:VITE_API_BASE_URL = "https://daily-digital.kuanghong.workers.dev"
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Frontend build failed."
}

$backup = ".wrangler-worker-backup.toml"
Copy-Item -LiteralPath "wrangler.toml" -Destination $backup -Force
try {
  Copy-Item -LiteralPath "wrangler.pages.toml" -Destination "wrangler.toml" -Force
  npx wrangler pages deploy ./dist --project-name dailydigital --commit-dirty=true
  if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare Pages deployment failed."
  }
} finally {
  Copy-Item -LiteralPath $backup -Destination "wrangler.toml" -Force
  Remove-Item -LiteralPath $backup -Force
}
