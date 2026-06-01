# MotoPartes VC — Landing Page & Sistema de Citas Online

**Subdominio:** `vc.motopartes.cloud`
**Negocio:** Moto Partes — Taller mecánico + Refaccionaria, Venustiano Carranza, Chiapas
**Coordenadas:** 16.3372744, -92.5594909
**Inicio:** 2026-06-01

---

## Objetivo

Crear una landing page pública e independiente para el taller físico **Moto Partes VC**.
No reemplaza `motopartes.cloud` (SaaS dashboard). Es la presencia web del negocio:
- Promociona servicios de taller + refaccionaria
- Muestra banner de promoción de junio 2026
- Permite agendar citas online conectadas al sistema existente
- Notifica automáticamente al cliente por WhatsApp cuando el admin confirma la cita

---

## Arquitectura del flujo de citas

```
[vc.motopartes.cloud — formulario de cita]
         ↓ POST público (sin auth)
[API: /api/public/appointments]
         ↓ crea appointment status = "pending_external", source = "external"
[DB: tabla appointments]
         ↑ admin ve cita en el dashboard SaaS (badge de notificación)
[Dashboard → Confirmar / Rechazar]
         ↓ PUT /api/appointments/:id/status → "confirmed" | "rejected"
[Event bus → appointment.confirmed / appointment.rejected]
         ↓
[Bot WhatsApp → mensaje automático al cliente]
```

---

## Estado de Fases

### FASE 1 — Backend [✅ COMPLETADA]
- [x] 1A · Migración Prisma: `source`, `client_phone`, `client_name_ext` en `appointments`
- [x] 1B · Endpoint público `POST /api/public/appointments` → `apps/api/src/routes/public.js`
- [x] 1C · Eventos `appointment.confirmed` y `appointment.rejected` en `appointments.js`
- [x] 1D · `buildVars` extendido para clientes externos + 2 templates WA en seed
- [x] 1E · CORS update (`vc.motopartes.cloud`) + registro de ruta pública en `index.js`

### FASE 2 — Dashboard SaaS [✅ COMPLETADA]
- [x] 2A · Reescritura de `AppointmentCalendar.jsx` con fetch real a la API
- [x] 2B · Filtros: Todas / Del sitio web / Internas
- [x] 2C · Badge "Web" + alerta naranja en pantalla principal
- [x] 2D · Botones **Confirmar** ✓ y **Rechazar** ✕ → disparan WA automático
- [x] 2E · `appointmentsService` agregado a `apps/frontend/src/lib/api.js`

### FASE 3 — Landing Page [✅ COMPLETADA]
- [x] 3A · `apps/landing-vc/index.html` — estructura completa
- [x] 3B · `apps/landing-vc/style.css` — diseño con paleta del SaaS
- [x] 3C · `apps/landing-vc/app.js` — countdown, form, navbar, WA links
- [x] 3D · Hero + Servicios + Refaccionaria + Promo junio + Citas + Ubicación + Footer
- [x] 3E · Formulario conectado a `POST /api/public/appointments`
- [x] 3F · Dockerfile listo

### FASE 4 — Deploy [⏳ PENDIENTE — requiere acción manual]
- [ ] 4A · **DNS**: agregar registro A `vc` → `187.77.11.79` en el proveedor de dominio
- [ ] 4B · **API env var**: agregar `LANDING_VC_WORKSPACE_ID=<uuid del workspace flagship>` al contenedor API
- [ ] 4C · **Nueva app en Dokploy**: repo branch + subdirectory `apps/landing-vc/` + dominio `vc.motopartes.cloud`
- [ ] 4D · **WA number**: reemplazar `9XXXXXXXXX` en `apps/landing-vc/app.js` con el número real
- [ ] 4E · **Seed nuevos templates**: correr `node prisma/seed-automation-defaults.js` en el contenedor API
- [ ] 4F · **Prisma migrate**: correr `npx prisma db push` en el contenedor API para aplicar los 3 nuevos campos
- [ ] 4G · **Activar automations**: en el dashboard, ir a Automatizaciones y activar "Cita confirmada" y "Cita rechazada"

---

## Cómo obtener el LANDING_VC_WORKSPACE_ID

En el VPS, ejecutar:
```bash
docker exec <contenedor-api> npx prisma studio
# o directamente:
docker exec <contenedor-postgres> psql -U motopartes -d motopartes -c "SELECT id, slug FROM workspaces LIMIT 5;"
```
El workspace del taller flagship es el que tiene slug `motopartes` o similar. Copiar ese UUID.

---

## Diseño visual

| Token | Valor | Uso |
|---|---|---|
| `--primary` | `#2563eb` | Botones principales, links |
| `--dark` | `#1e293b` | Hero bg, footer, headers oscuros |
| `--accent` | `#f59e0b` | Promos, badges, CTA secundario |
| `--text` | `#1e293b` | Texto general |
| `--light` | `#f1f5f9` | Fondos de secciones alternas |
| `--white` | `#ffffff` | Cards, overlays |

**Tipografías:** Bebas Neue (headlines) · Inter (cuerpo)

---

## Templates WhatsApp nuevos

**`appointment.confirmed`**
```
Hola {nombre_cliente} 👋

Tu cita en *Moto Partes VC* ha sido *confirmada* ✅

📅 Fecha: {fecha}
🕐 Hora: {hora}
🔧 Servicio: {tipo_servicio}

¡Te esperamos! 🏍️
```

**`appointment.rejected`**
```
Hola {nombre_cliente}, lamentablemente no tenemos disponibilidad para el {fecha}.

Por favor contáctanos para reagendar 📞
```

---

## Archivos creados / modificados

| Estado | Archivo |
|---|---|
| ✅ Creado | `apps/landing-vc/index.html` |
| ✅ Creado | `apps/landing-vc/style.css` |
| ✅ Creado | `apps/landing-vc/app.js` |
| ✅ Creado | `apps/landing-vc/Dockerfile` |
| ✅ Creado | `apps/api/src/routes/public.js` |
| ✅ Modificado | `apps/api/prisma/schema.prisma` |
| ✅ Modificado | `apps/api/src/routes/appointments.js` |
| ✅ Modificado | `apps/api/src/lib/automations.js` |
| ✅ Modificado | `apps/api/prisma/seed-automation-defaults.js` |
| ✅ Modificado | `apps/api/src/index.js` |
| ✅ Modificado | `apps/frontend/src/lib/api.js` |
| ✅ Modificado | `apps/frontend/src/pages/mechanic/AppointmentCalendar.jsx` |

---

## Datos del negocio

- **Nombre:** Moto Partes
- **Ciudad:** Venustiano Carranza, Chiapas, México
- **Coordenadas:** `16.3372744, -92.5594909`
- **WhatsApp taller:** _(pendiente confirmar número)_
- **Horario:** Lun–Sáb 9:00–18:00
- **Promo junio:** Servicio completo $1,500 → $1,200 MXN (vigente 1–30 jun 2026)
