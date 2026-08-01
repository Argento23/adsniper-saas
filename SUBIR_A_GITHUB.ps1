# Script para subir cambios críticos a GitHub
$token = Read-Host "Ingresa tu GitHub Personal Access Token (o presiona Enter para método manual)"

$filesToUpload = @(
    @{ local = "app\api\generate\route.ts"; remote = "app/api/generate/route.ts" },
    @{ local = "app\api\generate-video\route.ts"; remote = "app/api/generate-video/route.ts" },
    @{ local = "app\api\credits\route.ts"; remote = "app/api/credits/route.ts" },
    @{ local = "app\api\proxy-image\route.ts"; remote = "app/api/proxy-image/route.ts" },
    @{ local = "lib\replicate.ts"; remote = "lib/replicate.ts" },
    @{ local = "app\dashboard\page.tsx"; remote = "app/dashboard/page.tsx" },
    @{ local = "app\layout.tsx"; remote = "app/layout.tsx" },
    @{ local = "middleware.ts"; remote = "middleware.ts" },
    @{ local = ".env.local"; remote = ".env.local" }
)

if ($token.Length -gt 10) {
    Write-Host "🚀 Iniciando subida masiva a GitHub..." -ForegroundColor Cyan
    
    foreach ($file in $filesToUpload) {
        $localPath = "c:\Users\Gustavo\Downloads\neurova\adsniper-saas\$($file.local)"
        if (Test-Path $localPath) {
            Write-Host "📤 Subiendo $($file.remote)..." -ForegroundColor Yellow
            $content = Get-Content $localPath -Raw
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
            $base64 = [Convert]::ToBase64String($bytes)
            
            # Obtener SHA actual para el PUT
            try {
                $currentFile = Invoke-RestMethod -Uri "https://api.github.com/repos/Argento23/adsniper-saas/contents/$($file.remote)" -Method GET -Headers @{"Authorization" = "Bearer $token" }
                $sha = $currentFile.sha
            }
            catch { $sha = $null }

            $body = @{
                message = "fix: integracion replicate y optimizacion de tiempos"
                content = $base64
                branch  = "main"
            }
            if ($sha) { $body.sha = $sha }
            $jsonBody = $body | ConvertTo-Json

            Invoke-RestMethod -Uri "https://api.github.com/repos/Argento23/adsniper-saas/contents/$($file.remote)" -Method PUT -Headers @{"Authorization" = "Bearer $token" } -Body $jsonBody -ContentType "application/json"
            Write-Host "✅ $($file.remote) subido." -ForegroundColor Green
        }
    }
    Write-Host "`n✨ Todos los archivos subidos. Espera 2 minutos al deploy de Vercel." -ForegroundColor Green
}
else {
    Write-Host "`n════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "   MÉTODO MANUAL - SUBE ESTOS ARCHIVOS" -ForegroundColor Yellow  
    Write-Host "════════════════════════════════════════════════════"
    Write-Host "Debes copiar y pegar el contenido de los archivos listados arriba en GitHub:" -ForegroundColor White
    Write-Host "1. app/api/generate/route.ts" -ForegroundColor Cyan
    Write-Host "2. app/api/generate-video/route.ts" -ForegroundColor Cyan
    Write-Host "3. app/api/credits/route.ts" -ForegroundColor Cyan
    Write-Host "4. app/api/proxy-image/route.ts" -ForegroundColor Cyan
    Write-Host "5. lib/replicate.ts" -ForegroundColor Cyan
    Write-Host "6. app/dashboard/page.tsx" -ForegroundColor Cyan
    Write-Host "7. app/layout.tsx" -ForegroundColor Cyan
    Write-Host "8. middleware.ts" -ForegroundColor Cyan
    Write-Host "9. .env.local" -ForegroundColor Cyan
    Write-Host "`nSigue el proceso anterior para cada uno." -ForegroundColor Gray
    Read-Host "Presiona Enter al terminar"
}
