# AdSniper - Deploy All Fixes
# Este script hace commit y push de todos los cambios a Vercel

Write-Host "🚀 AdSniper - Deployment de Correcciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
$expectedPath = "c:\Users\Gustavo\Downloads\neurova\adsniper-saas"
if ((Get-Location).Path -ne $expectedPath) {
    Write-Host "⚠️  Cambiando al directorio del proyecto..." -ForegroundColor Yellow
    Set-Location $expectedPath
}

Write-Host "📋 Cambios que se deployarán:" -ForegroundColor Green
Write-Host "  ✅ n8n rehabilitado (imágenes AI funcionarán)" -ForegroundColor White
Write-Host "  ✅ Prompts de Groq mejorados (copy más persuasivo)" -ForegroundColor White
Write-Host "  ✅ Templates locales premium (fallback de calidad)" -ForegroundColor White
Write-Host "  ✅ Video scripts arreglados (usan descripción real)" -ForegroundColor White
Write-Host "  ✅ Modal de preview de imágenes (sin URI_TOO_LONG)" -ForegroundColor White
Write-Host ""

# Mostrar status de git
Write-Host "📂 Archivos modificados:" -ForegroundColor Cyan
git status --short

Write-Host ""
$confirmDeploy = Read-Host "¿Hacer commit y push a Vercel? (S/N)"

if ($confirmDeploy -eq 'S' -or $confirmDeploy -eq 's' -or $confirmDeploy -eq 'Y' -or $confirmDeploy -eq 'y') {
    Write-Host ""
    Write-Host "🔧 Haciendo commit..." -ForegroundColor Yellow
    
    git add app/api/generate/route.ts
    git add app/dashboard/page.tsx
    git commit -m "fix: rehabilitar n8n + mejorar AI generation (copy, imágenes, video scripts)"
    
    Write-Host "📤 Haciendo push a Vercel..." -ForegroundColor Yellow
    git push origin main
    
    Write-Host ""
    Write-Host "✅ ¡Deploy iniciado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Vercel está buildeando tu proyecto..." -ForegroundColor Cyan
    Write-Host "   Ve a: https://vercel.com/argento23/adsniper-saas/deployments" -ForegroundColor White
    Write-Host ""
    Write-Host "⏱️  El deployment tomará ~2-3 minutos" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🧪 Después de deployar, prueba en:" -ForegroundColor Cyan
    Write-Host "   https://studio.generarise.space/dashboard" -ForegroundColor White
    Write-Host ""
    
}
else {
    Write-Host ""
    Write-Host "❌ Deployment cancelado" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Para deployar manualmente después, ejecuta:" -ForegroundColor Cyan
    Write-Host "   git add ." -ForegroundColor White
    Write-Host "   git commit -m 'fix: AI generation improvements'" -ForegroundColor White
    Write-Host "   git push origin main" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
