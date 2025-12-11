@echo off
REM ========================================
REM Iniciar Todos los Servicios
REM ========================================

echo ========================================
echo   INICIANDO SERVICIOS
echo ========================================
echo.

echo [1/2] Iniciando IIS...
net start W3SVC
echo OK
echo.

echo [2/2] Iniciando WhatsApp Backend (PM2)...
pm2 start all
echo OK
echo.

echo ========================================
echo   TODOS LOS SERVICIOS INICIADOS
echo ========================================
echo.

echo Verifica el estado con: check-status.bat
echo.
pause
