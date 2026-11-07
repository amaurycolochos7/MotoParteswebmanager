# Quita el inicio automatico y detiene el agente.
param([string]$Exe = '')
$ErrorActionPreference = 'SilentlyContinue'
if ($Exe) { $dir = Split-Path -Parent $Exe } else { $dir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$taskName = 'MotoPartes Agente de Impresion'
$lnkPath  = Join-Path ([Environment]::GetFolderPath('Startup')) 'MotoPartes Agente de Impresion.lnk'

if (Get-ScheduledTask -TaskName $taskName) {
    Stop-ScheduledTask -TaskName $taskName
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host 'Tarea programada eliminada.'
}
if (Test-Path $lnkPath) {
    Remove-Item $lnkPath -Force
    Write-Host 'Acceso directo de Inicio eliminado.'
}

# Primero el lanzador (si no, reiniciaria el agente), luego el agente.
Get-CimInstance Win32_Process -Filter "Name = 'wscript.exe'" |
    Where-Object { $_.CommandLine -like '*ejecutar-oculto.vbs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$lock = Join-Path $dir 'agent.lock'
if (Test-Path $lock) {
    $agentPid = [int](Get-Content $lock -Raw)
    if ($agentPid) { Stop-Process -Id $agentPid -Force }
    Remove-Item $lock -Force
}
Write-Host 'Agente detenido. Ya no se iniciara solo.'
