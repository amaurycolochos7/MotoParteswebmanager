# Impresión de tickets

Cierre de orden con ticket impreso (térmica de 80 mm) o enviado por WhatsApp.

```
Panel (celular, tablet, PC)        Servidor (API)                 Laptop del taller
  "Imprimir ticket"   ───────►   arma el ticket (ESC/POS)
                                 y lo guarda en la cola   ◄────  cada 3 s: ¿hay algo? (clave propia)
                                                          ────►  entrega el ticket
                                                                 el agente lo manda a la impresora (USB)
                                 marca "impreso"          ◄────  confirma el resultado
```

- **Contrato de la API:** [IMPRESION-CONTRATO.md](IMPRESION-CONTRATO.md) (fuente de verdad).
- **Agente de Windows:** [`apps/print-agent/`](../apps/print-agent/README.md) — instalación paso a paso para la laptop.
- **Ticket:** `apps/api/src/lib/ticket.js` (texto, ESC/POS y PDF de 80 mm) · ajustes: `apps/api/src/lib/print-settings.js`.
- **Panel:** `/admin/printing` (estado, clave, ajustes con vista previa, historial) y botones en el detalle de la orden.

## Qué pasa al cerrar una orden
Al pasar la orden a **Entregada** aparece "¿Cómo quieres entregar la nota?": **Imprimir ticket**,
**Enviar por WhatsApp**, **Las dos** o **Ahora no**. Los mismos botones están siempre en el detalle de la orden.
Si la laptop está apagada, el ticket **queda en cola** y sale solo cuando se conecte (se descartan los de más de 48 h).

## Contenido del ticket
Taller y folio · estado · ingreso/entrega · cliente (teléfono enmascarado `961xxxxx05`) · moto y placas ·
falla reportada (máx. 2 líneas) · servicios y refacciones · mano de obra / refacciones / **TOTAL** · pagos con recibo ·
**SALDO** y marca PAGADO · **garantía** · QR de seguimiento · "Este ticket no es factura".

### Garantía
Por defecto: **15 días naturales, ÚNICAMENTE en mano de obra; refacciones y piezas eléctricas NO tienen garantía.**
El texto, los días y el interruptor se cambian en **Impresión → Cómo se ve el ticket** (`warranty_*`).
> ⚠️ La Ley Federal de Protección al Consumidor (art. 77, reforma DOF 11-ene-2018) fija que la garantía de bienes y
> servicios **no puede ser inferior a 90 días**. Antes de usar 15 días de forma definitiva, conviene confirmarlo con un
> contador o abogado.

## Seguridad
- La clave del agente (`mpp_…`) solo se muestra una vez; en la base solo se guarda su hash SHA-256. Regenerarla desconecta la anterior.
- El agente no tiene sesión de usuario: solo puede leer y confirmar trabajos de **su** taller.
- Los endpoints del agente tienen límite de 120 peticiones por minuto.

## Despliegue
- Tablas nuevas `print_agents` y `print_jobs` (aditivas; el Dockerfile aplica `prisma db push`).
- Dependencia nueva en la API: `qrcode` (QR del PDF de WhatsApp).
- Variable opcional `PUBLIC_APP_URL` (por defecto `https://motopartes.cloud`) para el enlace del QR.
- Un deploy reinicia la API y puede desconectar unos segundos el bot de WhatsApp.

## Pruebas
- API: `cd apps/api && npm test` (incluye `test/ticket.test.js`).
- Agente: `cd apps/print-agent && npm test`.
- Sin impresora: el agente tiene modo `file` que guarda cada ticket como `.bin`.
