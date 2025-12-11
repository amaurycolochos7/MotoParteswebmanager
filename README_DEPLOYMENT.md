# 🚀 Guía Rápida de Deployment

## Tu Flujo de Trabajo Diario

### En Tu Computadora (Desarrollo)

1. **Desarrolla y prueba:**
   ```bash
   npm run dev
   ```

2. **Cuando esté listo, envía cambios:**
   ```bash
   push-changes.bat
   ```
   Te pedirá un mensaje de commit.

### En el Servidor (Producción)

3. **Actualiza el servidor:**
   - Conéctate al servidor via Remote Desktop
   - Abre PowerShell en `C:\inetpub\wwwroot\motopartes-manager`
   - Ejecuta:
     ```
     deploy-to-server.bat
     ```

¡Eso es todo! 🎉

---

## Comandos Útiles

### Desarrollo Local
```bash
# Iniciar frontend
npm run dev

# Iniciar backend
cd whatsapp-backend
npm start
```

### Producción (en el servidor)
```bash
# Ver logs del backend
pm2 logs whatsapp-backend

# Reiniciar backend manualmente
pm2 restart whatsapp-backend

# Reiniciar IIS
iisreset
```

---

## Configuración de IP del Servidor

Cuando sepas la IP del servidor, actualiza estos archivos:

**`.env.production`:**
```env
VITE_WHATSAPP_API_URL=http://TU_IP:3001
```

**`whatsapp-backend/.env.production`:**
```env
ALLOWED_ORIGINS=http://TU_IP,http://localhost
```

Luego ejecuta `deploy-to-server.bat` para aplicar cambios.

---

## Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| No se ve el sitio | `iisreset` en el servidor |
| API no responde | `pm2 restart whatsapp-backend` |
| WhatsApp no conecta | `pm2 logs whatsapp-backend` para ver errores |
| Git pull falla | Ejecutar PowerShell como Admin |

---

Para guía completa ver: [WINDOWS_SERVER_DEPLOYMENT.md](./WINDOWS_SERVER_DEPLOYMENT.md)
