@echo off
REM ========================================
REM Verificar Estado de Servicios
REM ========================================

echo ========================================
echo   ESTADO DE SERVICIOS
echo ========================================
echo.

echo [IIS (Frontend)]
sc query W3SVC | findstr "STATE"
echo.

echo [PM2 Service]
sc query PM2 | findstr "STATE"
echo.

echo [WhatsApp Backend (PM2)]
pm2 list
echo.

echo [Backend Health Check]
curl -s http://localhost:3001/api/health
echo.
echo.

echo ========================================
echo   PUERTOS EN USO
echo ========================================
echo.

echo Puerto 80 (IIS):
netstat -ano | findstr ":80 "
echo.

echo Puerto 3001 (WhatsApp Backend):
netstat -ano | findstr ":3001"
echo.

pause
