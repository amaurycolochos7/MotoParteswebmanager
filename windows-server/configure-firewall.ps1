# ==================================================
# Script de Configuración de Firewall
# Ejecutar EN EL SERVIDOR con PowerShell como ADMIN
# ==================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   CONFIGURACIÓN DE FIREWALL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos ejecutando como Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: Debes ejecutar este script como Administrador" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[1/3] Habilitando puerto 80 (HTTP/IIS)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "MotoPartes - HTTP (IIS)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
if ($LASTEXITCODE -eq 0 -or $?) {
    Write-Host "[OK] Puerto 80 habilitado" -ForegroundColor Green
} else {
    Write-Host "[INFO] La regla ya existe o hubo un error menor" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2/3] Habilitando puerto 443 (HTTPS/IIS - futuro)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "MotoPartes - HTTPS (IIS)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue
if ($LASTEXITCODE -eq 0 -or $?) {
    Write-Host "[OK] Puerto 443 habilitado" -ForegroundColor Green
} else {
    Write-Host "[INFO] La regla ya existe o hubo un error menor" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] Habilitando puerto 3001 (WhatsApp Backend - solo red local)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "MotoPartes - WhatsApp Backend" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -RemoteAddress LocalSubnet -ErrorAction SilentlyContinue
if ($LASTEXITCODE -eq 0 -or $?) {
    Write-Host "[OK] Puerto 3001 habilitado (solo red local)" -ForegroundColor Green
} else {
    Write-Host "[INFO] La regla ya existe o hubo un error menor" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   FIREWALL CONFIGURADO!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Reglas creadas:" -ForegroundColor Green
Write-Host "  - Puerto 80:   HTTP (IIS) - Acceso público" -ForegroundColor Gray
Write-Host "  - Puerto 443:  HTTPS (IIS) - Acceso público" -ForegroundColor Gray
Write-Host "  - Puerto 3001: WhatsApp Backend - Solo red local" -ForegroundColor Gray
Write-Host ""
pause
