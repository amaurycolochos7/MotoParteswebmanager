@echo off
REM ========================================
REM Script para hacer PUSH desde tu PC
REM Ejecutar EN TU COMPUTADORA de desarrollo
REM ========================================

echo ========================================
echo   PUSH CAMBIOS - MotoPartes Manager
echo ========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "package.json" (
    echo ERROR: No se encuentra package.json
    echo Ejecuta este script desde la raiz del proyecto
    pause
    exit /b 1
)

REM Mostrar archivos modificados
echo Archivos modificados:
git status --short
echo.

REM Pedir mensaje de commit
set /p commit_msg="Mensaje del commit: "

if "%commit_msg%"=="" (
    echo ERROR: Debes escribir un mensaje
    pause
    exit /b 1
)

echo.
echo [1/3] Agregando cambios...
git add .
echo OK
echo.

echo [2/3] Haciendo commit...
git commit -m "%commit_msg%"
if errorlevel 1 (
    echo ERROR: Commit fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [3/3] Enviando al repositorio...
git push origin main
if errorlevel 1 (
    echo ERROR: Push fallo
    pause
    exit /b 1
)
echo OK
echo.

echo ========================================
echo   CAMBIOS ENVIADOS!
echo ========================================
echo.
echo Ahora en el SERVIDOR ejecuta:
echo   deploy-to-server.bat
echo.
echo para actualizar produccion.
echo.
pause
