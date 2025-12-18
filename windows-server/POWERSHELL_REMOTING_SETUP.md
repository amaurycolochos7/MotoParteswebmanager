# Configuración de PowerShell Remoting para Windows Server

Esta guía te ayudará a habilitar PowerShell Remoting para que Antigravity pueda administrar tu servidor de forma remota.

## 📋 Requisitos Previos

- Windows Server con permisos de Administrador
- Conexión de red entre tu PC local y el servidor
- Conocer la IP del servidor

---

## 🖥️ PARTE 1: Configuración en el Servidor Windows

### Paso 1: Habilitar PowerShell Remoting

Conéctate al servidor (vía RDP) y ejecuta PowerShell como **Administrador**:

```powershell
# Habilitar WinRM (Windows Remote Management)
Enable-PSRemoting -Force

# Configurar WinRM para aceptar conexiones
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Reiniciar el servicio WinRM
Restart-Service WinRM
```

### Paso 2: Configurar el Firewall del Servidor

Ejecuta estos comandos para permitir las conexiones remotas:

```powershell
# Permitir PowerShell Remoting en el firewall
Enable-NetFirewallRule -Name "WINRM-HTTP-In-TCP"

# O crear una regla personalizada si no existe
New-NetFirewallRule -Name "WinRM-HTTP" -DisplayName "Windows Remote Management (HTTP-In)" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5985
```

### Paso 3: Verificar que WinRM está corriendo

```powershell
# Verificar el servicio WinRM
Get-Service WinRM

# Debería mostrar: Status = Running
```

### Paso 4: Obtener la IP del Servidor

```powershell
# Obtener la dirección IP del servidor
ipconfig

# Anota la IPv4 Address (ejemplo: 192.168.1.100)  

```

---

## 💻 PARTE 2: Configuración en tu PC Local

### Paso 1: Habilitar Cliente WinRM

En tu **PC local**, abre PowerShell como **Administrador** y ejecuta:

```powershell
# Habilitar el cliente WinRM
Enable-PSRemoting -Force

# Agregar el servidor a los hosts confiables
# Reemplaza 192.168.1.100 con la IP de tu servidor
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "10.0.2.15" -Force

# O permitir cualquier host (menos seguro pero más flexible)
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Reiniciar el servicio WinRM
Restart-Service WinRM
```

### Paso 2: Probar la Conexión

```powershell
# Probar conexión básica (reemplaza con tus datos)
Test-WSMan -ComputerName  192.168.1.104

# Si funciona, verás información sobre el servidor remoto
```

---

## 🔐 PARTE 3: Conectarse al Servidor

### Opción A: Conexión Interactiva (Manual)

```powershell
# Conectarse al servidor
# Reemplaza con la IP de tu servidor y tus credenciales
$serverIP = "192.168.1.104"
$credential = Get-Credential

# Entrar en sesión interactiva
Enter-PSSession -ComputerName $serverIP -Credential $credential
```

### Opción B: Ejecutar Comandos Remotos (Antigravity)

Cuando trabajes con Antigravity, yo podré ejecutar comandos así:

```powershell
# Ejecutar comando en el servidor
Invoke-Command -ComputerName 192.168.1.100 -Credential $cred -ScriptBlock {
    # Comandos que se ejecutarán en el servidor
    Get-Service | Where-Object {$_.Status -eq "Running"}
}
```

---

## 🧪 PARTE 4: Pruebas de Verificación

### Prueba 1: Información del Sistema Remoto

```powershell
$serverIP = "192.168.1.100"
$cred = Get-Credential

Invoke-Command -ComputerName $serverIP -Credential $cred -ScriptBlock {
    Get-ComputerInfo | Select-Object CsName, WindowsVersion, OsArchitecture
}
```

### Prueba 2: Listar Archivos Remotos

```powershell
Invoke-Command -ComputerName $serverIP -Credential $cred -ScriptBlock {
    Get-ChildItem C:\ | Select-Object Name, Length, LastWriteTime
}
```

### Prueba 3: Crear Archivo de Prueba

```powershell
Invoke-Command -ComputerName $serverIP -Credential $cred -ScriptBlock {
    "Test desde PowerShell Remoting - $(Get-Date)" | Out-File C:\remote-test.txt
    Get-Content C:\remote-test.txt
}
```

---

## 🚨 Solución de Problemas

### Error: "Access is denied"
```powershell
# Asegúrate de estar usando credenciales de Administrador
# Verifica que el usuario tenga permisos en el servidor
```

### Error: "The WinRM client cannot process the request"
```powershell
# En el servidor, ejecuta:
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
Restart-Service WinRM

# En el cliente, ejecuta:
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
Restart-Service WinRM
```

### Error: "The connection to the remote host was refused"
```powershell
# Verifica el firewall del servidor
Get-NetFirewallRule -Name "WINRM-HTTP-In-TCP" | Select-Object Name, Enabled

# Habilítalo si está deshabilitado
Enable-NetFirewallRule -Name "WINRM-HTTP-In-TCP"
```

### El servidor está en otra red / Internet público

Si el servidor está en Internet (no en tu red local), necesitarás:

1. **Puerto Forwarding en el router del servidor:**
   - Redirigir puerto 5985 (HTTP) o 5986 (HTTPS) a la IP interna del servidor

2. **Usar HTTPS (más seguro):**
```powershell
# En el servidor, configurar HTTPS para WinRM
winrm quickconfig -transport:https
```

3. **Usar certificado SSL (recomendado para producción):**
   - Configura un certificado SSL válido
   - Usa el puerto 5986 para conexiones HTTPS

---

## ✅ Configuración para Uso con Antigravity

Una vez configurado, cuando trabajemos juntos:

1. **Me darás la IP del servidor** (ejemplo: `192.168.1.100` o IP pública)
2. **Yo ejecutaré comandos remotos** desde tu PC local
3. **Podremos configurar:**
   - IIS y sitios web
   - PM2 y servicios Node.js
   - Firewall y seguridad
   - Deployment automático
   - Y cualquier otra configuración necesaria

### Script Helper para Guardar Credenciales (Opcional)

Puedes crear un script para guardar las credenciales de forma segura:

```powershell
# guardar-credenciales.ps1
$serverIP = "192.168.1.100"
$credential = Get-Credential -Message "Ingresa las credenciales de Administrador del servidor"

# Guardar en variable de entorno (solo para la sesión actual)
$env:SERVER_IP = $serverIP
$global:ServerCredential = $credential

Write-Host "✅ Credenciales guardadas para esta sesión" -ForegroundColor Green
Write-Host "Servidor: $serverIP" -ForegroundColor Cyan
```

---

## 📝 Próximos Pasos

Una vez completada esta configuración:

1. ✅ Podremos instalar y configurar IIS remotamente
2. ✅ Configurar PM2 y servicios Node.js
3. ✅ Hacer deployment del proyecto MotoPartes Manager
4. ✅ Configurar el dominio y certificados SSL
5. ✅ Automatizar actualizaciones desde GitHub

---

## 🔒 Consideraciones de Seguridad

> [!WARNING]
> **Para producción, considera:**
> - Usar HTTPS (puerto 5986) en lugar de HTTP (puerto 5985)
> - No usar `TrustedHosts = "*"`, especifica IPs exactas
> - Configurar autenticación Kerberos si estás en un dominio
> - Usar VPN si el servidor está en Internet público
> - Implementar fail2ban para prevenir ataques de fuerza bruta

---

## 📞 ¿Listo para Continuar?

Una vez hayas completado estos pasos, avísame y continuaremos con:
- Instalación de IIS
- Configuración del proyecto
- Setup de PM2
- Configuración del dominio
- ¡Y todo lo demás!
