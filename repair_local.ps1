# AdSniper SaaS - Local Repair Script
# Usage: powershell -ExecutionPolicy Bypass -File repair_local.ps1

Write-Host "Starting AdSintesis Local Repair..." -ForegroundColor Cyan

# 1. Clean Cache
if (Test-Path ".next") {
    Write-Host "Cleaning Next.js cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".next"
}

# 2. Reinstall Dependencies
Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Cyan
npm install --force

# 3. Verify Environment Variables
if (-not (Test-Path ".env.local")) {
    Write-Host "WARNING: .env.local not found. Please configure it." -ForegroundColor Red
} else {
    Write-Host "SUCCESS: .env.local file detected." -ForegroundColor Green
}

# 4. Starting Server
Write-Host "Attempting to start development server..." -ForegroundColor Cyan
Write-Host "To stop the server, press Ctrl+C" -ForegroundColor Gray
npm run dev
