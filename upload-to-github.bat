@echo off
REM =========================================
REM Script para subir el proyecto a GitHub
REM PRIMERA VEZ SOLAMENTE
REM =========================================

echo =========================================
echo   SUBIR PROYECTO A GITHUB
echo =========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "package.json" (
    echo ERROR: No se encuentra package.json
    echo Ejecuta este script desde la raiz del proyecto
    pause
    exit /b 1
)

echo IMPORTANTE: Antes de continuar, crea el repositorio en GitHub
echo Ve a: https://github.com/new
echo.
echo Configuracion recomendada:
echo   - Visibility: Private
echo   - NO marques "Add a README file"
echo.
pause

echo.
set /p github_url="Pega aqui la URL de tu repositorio (ej: https://github.com/usuario/repo.git): "

if "%github_url%"=="" (
    echo ERROR: Debes pegar la URL del repositorio
    pause
    exit /b 1
)

echo.
echo [1/5] Inicializando Git...
git init
if errorlevel 1 (
    echo ERROR: Git init fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [2/5] Agregando archivos...
git add .
echo OK
echo.

echo [3/5] Haciendo commit inicial...
git commit -m "Initial commit - MotoPartes Manager completo"
if errorlevel 1 (
    echo ERROR: Commit fallo
    pause
    exit /b 1
)
echo OK
echo.

echo [4/5] Configurando branch principal...
git branch -M main
echo OK
echo.

echo [5/5] Conectando con GitHub y subiendo...
git remote add origin %github_url%
git push -u origin main
if errorlevel 1 (
    echo.
    echo ERROR: Push fallo
    echo.
    echo Posibles soluciones:
    echo 1. Verifica que la URL sea correcta
    echo 2. Asegurate de estar logueado en Git
    echo 3. Ejecuta manualmente: git push -u origin main
    pause
    exit /b 1
)
echo OK
echo.

echo =========================================
echo   PROYECTO SUBIDO A GITHUB!
echo =========================================
echo.
echo Tu proyecto ahora esta en: %github_url%
echo.
echo Pasos siguientes:
echo 1. Instala Windows Server
echo 2. Clona el proyecto con: git clone %github_url%
echo 3. Sigue la guia: FIRST_TIME_SETUP.md
echo.
pause
