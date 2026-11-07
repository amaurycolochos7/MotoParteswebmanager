@echo off
chcp 65001 >nul
title MotoPartes - Quitar agente de impresion
cd /d "%~dp0"
"%~dp0MotoPartes-Impresion.exe" autostart-off
echo.
pause
