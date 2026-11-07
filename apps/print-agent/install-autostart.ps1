# Registra el agente para que se inicie solo al entrar a Windows (sin ventana y sin pedir administrador).
# Usa una Tarea Programada; si Windows no la permite, deja un acceso directo en la carpeta Inicio.
param([switch]$NoStart, [string]$Exe = '')

$ErrorActionPreference = 'Stop'
# Con -Exe (MotoPartes-Impresion.exe) la carpeta es la del .exe y no hace falta Node.
if ($Exe) { $dir = Split-Path -Parent $Exe } else { $dir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$vbs      = Join-Path $dir 'ejecutar-oculto.vbs'
$taskName = 'MotoPartes Agente de Impresion'
$lnkPath  = Join-Path ([Environment]::GetFolderPath('Startup')) 'MotoPartes Agente de Impresion.lnk'

if ($Exe) {
    # Lanzador sin ventana para el .exe (lo vuelve a iniciar si se cae).
    $vbsLines = @(
        'Option Explicit',
        'Dim sh, rc',
        'Set sh = CreateObject("WScript.Shell")',
        ('sh.CurrentDirectory = "' + $dir + '"'),
        'Do',
        ('    rc = sh.Run("""' + $Exe + '"" run", 0, True)'),
        '    If rc = 0 Or rc = 3 Then Exit Do',
        '    WScript.Sleep 15000',
        'Loop'
    )
    Set-Content -Path $vbs -Value $vbsLines -Encoding Default
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $dir 'config.json'))) {
    Write-Host 'Falta config.json. Ejecuta primero el asistente (INSTALAR.bat).' -ForegroundColor Red
    exit 1
}

$mode = ''
try {
    $user    = "$env:USERDOMAIN\$env:USERNAME"
    $action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"') -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $princ   = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                   -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 999 `
                   -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $princ `
        -Settings $set -Description 'Imprime los tickets de MotoPartes automaticamente.' -Force | Out-Null
    $mode = 'tarea'
} catch {
    # Sin permiso para la tarea programada: usamos la carpeta Inicio (no requiere administrador).
    try {
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut($lnkPath)
        $lnk.TargetPath = 'wscript.exe'
        $lnk.Arguments = '"' + $vbs + '"'
        $lnk.WorkingDirectory = $dir
        $lnk.WindowStyle = 7
        $lnk.Description = 'Agente de impresion de MotoPartes'
        $lnk.Save()
        $mode = 'inicio'
    } catch {
        Write-Host ('No se pudo configurar el inicio automatico: ' + $_.Exception.Message) -ForegroundColor Red
        exit 1
    }
}

if ($mode -eq 'tarea') {
    # Si antes quedo un acceso directo viejo, se quita para no abrir dos agentes.
    if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force -ErrorAction SilentlyContinue }
    Write-Host 'Inicio automatico listo (Tarea Programada de Windows).' -ForegroundColor Green
} else {
    Write-Host 'Inicio automatico listo (carpeta Inicio de Windows).' -ForegroundColor Green
}

if (-not $NoStart) {
    if ($mode -eq 'tarea') { Start-ScheduledTask -TaskName $taskName }
    else { Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbs + '"') -WorkingDirectory $dir }
    Write-Host 'El agente ya esta corriendo en segundo plano.' -ForegroundColor Green
}
exit 0
