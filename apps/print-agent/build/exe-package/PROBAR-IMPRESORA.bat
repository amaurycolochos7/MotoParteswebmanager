@echo off
chcp 65001 >nul
title MotoPartes - Prueba de impresora
cd /d "%~dp0"
"%~dp0MotoPartes-Impresion.exe" test-print
echo.
pause
