@echo off
chcp 65001 >nul
title MotoPartes - Instalar agente de impresion
cd /d "%~dp0"
"%~dp0MotoPartes-Impresion.exe" setup
echo.
pause
