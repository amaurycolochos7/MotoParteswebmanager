@echo off
REM ========================================
REM Script de Deployment para Windows Server
REM Ejecutar EN EL SERVIDOR después de hacer push
REM ========================================

echo ========================================
echo   DEPLOYMENT - MotoPartes Manager
echo ========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "package.json" (
    echo ERROR: No se encuentra package.json
    echo Ejecuta este script desde la raiz del proyecto
    pause
    exit /b 1
)

echo [1/6] Obteniendo ultimos cambios de Git...
git pull origin main
if errorlevel 1 (
    echo ERROR: Git pull fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [2/6] Instalando dependencias del frontend...
call npm install
if errorlevel 1 (
    echo ERROR: npm install fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [3/6] Compilando frontend para produccion...
call npm run build
if errorlevel 1 (
    echo ERROR: Build fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [4/6] Instalando dependencias del backend...
cd whatsapp-backend
call npm install
if errorlevel 1 (
    echo ERROR: npm install (backend) fallo
    cd ..
    pause
    exit /b 1
)
cd ..
echo OK
echo.

echo [5/6] Reiniciando backend (PM2)...
pm2 restart whatsapp-backend
if errorlevel 1 (
    echo ADVERTENCIA: No se pudo reiniciar PM2
    echo Si es la primera vez, ejecuta manualmente:
    echo   cd whatsapp-backend
    echo   pm2 start server.js --name whatsapp-backend --env production
    echo   pm2 save
)
echo OK
echo.

echo [6/6] Reiniciando IIS...
iisreset /noforce
echo OK
echo.

echo ========================================
echo   DEPLOYMENT COMPLETADO!
echo ========================================
echo.
echo Verifica que todo funcione:
echo   Frontend: http://localhost
echo   Backend:  http://localhost/api/health
echo.
echo Logs del backend: pm2 logs whatsapp-backend
echo.
pause
