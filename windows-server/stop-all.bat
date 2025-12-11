@echo off
REM ========================================
REM Detener Todos los Servicios
REM ========================================

echo ========================================
echo   DETENIENDO SERVICIOS
echo ========================================
echo.

echo [1/2] Deteniendo WhatsApp Backend (PM2)...
pm2 stop all
echo OK
echo.

echo [2/2] Deteniendo IIS...
net stop W3SVC
echo OK
echo.

echo ========================================
echo   TODOS LOS SERVICIOS DETENIDOS
echo ========================================
echo.
pause
