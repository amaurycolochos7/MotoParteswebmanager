# ==================================================
# Script de Instalación PM2 como Servicio Windows
# Ejecutar EN EL SERVIDOR con PowerShell como ADMIN
# ==================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   INSTALACIÓN PM2 - Windows Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos ejecutando como Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: Debes ejecutar este script como Administrador" -ForegroundColor Red
    Write-Host "Haz click derecho en PowerShell > Ejecutar como administrador" -ForegroundColor Yellow
    pause
    exit 1
}

# Verificar que Node.js esté instalado
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js instalado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js no encontrado. Instálalo primero desde https://nodejs.org" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "[1/4] Instalando PM2 globalmente..." -ForegroundColor Yellow
npm install -g pm2
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló la instalación de PM2" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[OK] PM2 instalado" -ForegroundColor Green

Write-Host ""
Write-Host "[2/4] Instalando PM2 Windows Service..." -ForegroundColor Yellow
npm install -g pm2-windows-service
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló la instalación de pm2-windows-service" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[OK] pm2-windows-service instalado" -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Configurando PM2 como servicio de Windows..." -ForegroundColor Yellow
Write-Host "IMPORTANTE: Presiona ENTER en todas las preguntas (valores por defecto)" -ForegroundColor Cyan
pm2-service-install -n PM2
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló la configuración del servicio" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[OK] Servicio PM2 configurado" -ForegroundColor Green

Write-Host ""
Write-Host "[4/4] Iniciando WhatsApp Backend con PM2..." -ForegroundColor Yellow

# Navegar al directorio del backend
$backendPath = Join-Path $PSScriptRoot "..\whatsapp-backend"
Set-Location $backendPath

# Iniciar aplicación con PM2
pm2 start ecosystem.config.cjs --env production
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló el inicio de la aplicación" -ForegroundColor Red
    pause
    exit 1
}

# Guardar configuración PM2
pm2 save
pm2 startup

Write-Host "[OK] WhatsApp Backend iniciado" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   INSTALACIÓN COMPLETADA!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "El servicio PM2 se ha configurado y está corriendo." -ForegroundColor Green
Write-Host "WhatsApp Backend se iniciará automáticamente con Windows." -ForegroundColor Green
Write-Host ""
Write-Host "Comandos útiles:" -ForegroundColor Yellow
Write-Host "  pm2 list              - Ver procesos" -ForegroundColor Gray
Write-Host "  pm2 logs              - Ver logs" -ForegroundColor Gray
Write-Host "  pm2 restart all       - Reiniciar" -ForegroundColor Gray
Write-Host "  pm2 stop all          - Detener" -ForegroundColor Gray
Write-Host ""
pause
