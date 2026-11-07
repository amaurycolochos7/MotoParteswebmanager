@echo off
chcp 65001 >nul
title MotoPartes - Instalar agente de impresion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [X] No encuentro Node.js en esta computadora.
    echo      1. Se abrira la pagina de descarga: baja la version "LTS" e instalala
    echo         ^(Siguiente, Siguiente... hasta terminar^).
    echo      2. Despues vuelve a hacer doble clic en INSTALAR.bat
    echo.
    start https://nodejs.org/es/download
    pause
    exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 (
    echo.
    echo  [X] Tu Node.js es muy viejo. Instala la version LTS desde https://nodejs.org
    echo.
    start https://nodejs.org/es/download
    pause
    exit /b 1
)

node setup.js
if errorlevel 1 (
    echo.
    echo  [X] La configuracion no se completo. Vuelve a abrir INSTALAR.bat para intentarlo de nuevo.
    echo.
    pause
    exit /b 1
)

echo.
echo  Activando el inicio automatico...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
if errorlevel 1 (
    echo.
    echo  [!] No se pudo activar el inicio automatico. Puedes usar INICIAR.bat a mano.
    echo.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   LISTO. El agente ya imprime solo, aunque cierres esta ventana.
echo   En MotoPartes, la pantalla "Impresion" debe decir "Conectado".
echo  ============================================================
echo.
pause
