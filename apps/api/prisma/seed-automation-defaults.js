// Idempotent seed of the 7 default automations + their templates per workspace.
// Run:  node prisma/seed-automation-defaults.js  (backfills every workspace)
// Or programmatically per-workspace: seedDefaultsForWorkspace(workspaceId, tx)
//
// Defaults are created DISABLED. The owner toggles them on from the UI.

import { PrismaClient } from '@prisma/client';

export const DEFAULTS = [
    {
        key: 'confirmacion_ingreso',
        template: {
            name: 'Confirmación de ingreso',
            channel: 'whatsapp',
            body: "Hola, {cliente}. 👋\n\n✅ *Orden {folio} · Registrada con éxito*\n\nTe informamos que recibimos tu *{moto}* en nuestro taller. A partir de ahora usaremos este medio para compartirte cada avance del servicio.\n\n• *Motivo de ingreso:* {motivo}{atiende}\n\n*Próximos pasos:*\nCuando termine la evaluación técnica de tu motocicleta, te enviaremos el presupuesto detallado, con mano de obra y refacciones, para tu revisión y autorización.\n\nSi tienes alguna duda o necesitas algo más, escríbenos por este chat.\n\nAtentamente,\n*MotoPartes Club · Taller V. Carranza*",
        },
        automation: {
            name: 'Confirmación de ingreso',
            description: 'Al registrar una orden, envía mensaje de bienvenida al cliente.',
            trigger: 'order.created',
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'cotizacion_lista',
        template: {
            name: 'Cotización lista',
            channel: 'whatsapp',
            body: 'Hola {cliente}, tu cotización para la {marca} {modelo} está lista. Total: *{total}*. Avísanos si autorizas el servicio. — {taller}',
        },
        automation: {
            name: 'Cotización lista',
            description: 'Cuando la orden pasa al estado "Cotización", avisa al cliente.',
            trigger: 'order.status_changed',
            filter: { status_name: 'Cotización' },
            action: 'whatsapp.send_template',
            params: { to: 'client' },
        },
    },
    {
        key: 'lista_recoger',
        template: {
            name: 'Lista para recoger',
            channel: 'whatsapp',
            body: "*{cliente}*,\n\nTe informamos que el servicio de tu *{moto}* ha concluido con éxito y ya se encuentra listo para ser entregado en nuestras instalaciones.\n\n• *Orden de servicio:* {folio}\n• *Total a liquidar:* {total}{atiende}\n\n*Horarios de entrega:*\n\n• Lunes a Viernes: 9:00 a 18:00 hrs.\n• Sábados: 9:00 a 14:00 hrs.\n\nGracias por tu confianza. Si tienes alguna duda o necesitas algo más, estamos para ayudarte.\n\nAtentamente,\n*MotoPartes · Taller V. Carranza*",
        },
        automation: {
            name: 'Lista para recoger',
            description: 'Cuando la orden cambia a "Lista", avisa al cliente que puede pasar por su moto.',
            trigger: 'order.status_changed',
            filter: { status_name: 'Lista' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'recordatorio_cita_24h',
        template: {
            name: 'Recordatorio cita 24h',
            channel: 'whatsapp',
            body: 'Hola {cliente}, te recordamos tu cita mañana a las {hora} en {taller}. Servicio: {servicio}. Si no puedes asistir, avísanos con tiempo.',
        },
        automation: {
            name: 'Recordatorio de cita 24h antes',
            description: 'Mensaje automático 24 horas antes de una cita agendada.',
            trigger: 'appointment.upcoming_24h',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
        },
    },
    {
        key: 'feedback_post_servicio',
        template: {
            name: 'Feedback post-servicio',
            channel: 'whatsapp',
            body: 'Hola {cliente}, ¿cómo te pareció el servicio en {taller}? Nos ayudaría mucho tu reseña: {google_reviews}. ¡Gracias!',
        },
        automation: {
            name: 'Feedback post-servicio (48h)',
            description: 'Dos días después de entregar la moto, pide reseña al cliente.',
            trigger: 'order.completed',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
            delay_minutes: 48 * 60,
        },
    },
    {
        key: 'aniversario_cliente',
        template: {
            name: 'Aniversario de cliente',
            channel: 'whatsapp',
            body: '¡Hola {cliente}! Hoy cumples un año con nosotros en {taller} 🎉. Como regalo, tienes 10% de descuento en tu siguiente servicio con el código *ANIVERSARIO*.',
        },
        automation: {
            name: 'Aniversario del cliente',
            description: 'Un año después de la primera orden, envía un cupón por WhatsApp.',
            trigger: 'client.first_visit_anniversary',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
        },
    },
    {
        key: 'cita_confirmada',
        template: {
            name: 'Cita confirmada (landing)',
            channel: 'whatsapp',
            body: 'Hola {cliente} 👋\n\nTu cita en *{taller}* ha sido *confirmada* ✅\n\n📅 Fecha: {fecha}\n🕐 Hora: {hora}\n🔧 Servicio: {servicio}\n\n¡Te esperamos! 🏍️',
        },
        automation: {
            name: 'Cita confirmada — notificación al cliente',
            description: 'Al confirmar una cita solicitada desde la landing, avisa al cliente por WhatsApp.',
            trigger: 'appointment.confirmed',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
        },
    },
    {
        key: 'cita_rechazada',
        template: {
            name: 'Cita rechazada (landing)',
            channel: 'whatsapp',
            body: 'Hola {cliente}, lamentablemente no tenemos disponibilidad para el {fecha}.\n\nPor favor contáctanos para reagendar 📞 — {taller}',
        },
        automation: {
            name: 'Cita rechazada — notificación al cliente',
            description: 'Al rechazar una cita de la landing, avisa al cliente para que reagende.',
            trigger: 'appointment.rejected',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
        },
    },
    {
        key: 'orden_estancada',
        template: {
            name: 'Orden estancada (tarea interna)',
            channel: 'whatsapp', // unused — task.create doesn't consume template body
            body: 'Revisar orden {folio} ({marca} {modelo}, cliente {cliente}). Sin actividad hace más de 3 días.',
        },
        automation: {
            name: 'Alerta de orden estancada',
            description: 'Crea una tarea interna para el admin cuando una orden lleva 3+ días sin moverse.',
            trigger: 'order.idle_3_days',
            action: 'task.create',
            params: {
                assigned_to: 'owner',
                title: 'Orden estancada: {folio}',
                description: 'La orden {folio} ({marca} {modelo}, cliente {cliente}) no ha tenido actualizaciones en 3+ días.',
                due_in_hours: 24,
            },
        },
    },
    // ── V2: mensajes por cambio de estado (antes los mandaba la pantalla; ahora SOLO el servidor) ──
    {
        key: 'estado_en_revision',
        template: {
            name: 'Estado: en revisión',
            channel: 'whatsapp',
            body: "*{cliente}*,\n\n*{folio} - EN REVISIÓN*\n\nTu motocicleta *{moto}* está en revisión con nuestro equipo técnico.{atiende}\n\nEstamos evaluando los trabajos necesarios y te mantendremos al tanto.\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: en revisión',
            description: 'Al pasar la orden a diagnóstico / revisión, avisa al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'en_revision' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'estado_autorizada',
        template: {
            name: 'Estado: autorizada',
            channel: 'whatsapp',
            body: "*{cliente}*,\n\n*{folio} - AUTORIZADA*\n\nTu cotización fue autorizada y abrimos la orden de servicio para tu *{moto}*.{atiende}\n\nEn breve comenzamos el trabajo.\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: autorizada',
            description: 'Al autorizarse la orden, avisa al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'autorizada' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'estado_en_proceso',
        template: {
            name: 'Estado: en proceso',
            channel: 'whatsapp',
            body: "Hola *{cliente}*\n\n*Orden {folio} · En proceso*\n\nYa estamos trabajando en tu *{moto}*. Nuestro equipo la está atendiendo para dejarla en óptimas condiciones.{atiende}\n\nTe avisaremos en cuanto esté lista.\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: en proceso',
            description: 'Al pasar la orden a proceso / reparación, avisa al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'en_proceso' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'estado_esperando_refacciones',
        template: {
            name: 'Estado: esperando refacciones',
            channel: 'whatsapp',
            body: "*{cliente}*,\n\n*{folio} - ESPERANDO REFACCIONES*\n\nTe informamos que el servicio de tu motocicleta *{moto}* requiere refacciones que ya fueron solicitadas.{atiende}\n\nEn cuanto estén disponibles, continuaremos con la reparación.\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: esperando refacciones',
            description: 'Al quedar la orden esperando refacciones, avisa al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'esperando_refacciones' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'estado_entregada',
        template: {
            name: 'Estado: entregada',
            channel: 'whatsapp',
            body: "Hola *{cliente}*\n\n*Orden {folio} · Entregada*\n\nTu *{moto}* fue entregada. Fue un gusto atenderte.{atiende}\n\nSi más adelante necesitas mantenimiento o cualquier ajuste, aquí estamos. ¡Buen camino!\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: entregada',
            description: 'Al entregar la orden, agradece al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'entregada' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
    {
        key: 'estado_cancelada',
        template: {
            name: 'Estado: cancelada',
            channel: 'whatsapp',
            body: "*{cliente}*,\n\n*{folio} - CANCELADA*\n\nLa orden de servicio de tu motocicleta *{moto}* ha sido cancelada.\n\nSi tienes alguna duda, estamos para ayudarte.\n\n*{taller}*",
        },
        automation: {
            name: 'Estado: cancelada',
            description: 'Al cancelar la orden, avisa al cliente (una vez por orden).',
            trigger: 'order.status_changed',
            filter: { status_key: 'cancelada' },
            action: 'whatsapp.send_template',
            params: { to: 'client', dedup_per_order: true },
        },
    },
];

/**
 * Seed defaults for one workspace inside an existing Prisma transaction.
 * Safe to call from the register() flow.
 */
export async function seedDefaultsForWorkspace(tx, workspaceId) {
    for (const spec of DEFAULTS) {
        // 1) Ensure template
        let tpl = await tx.messageTemplate.findFirst({
            where: { workspace_id: workspaceId, name: spec.template.name, is_default: true },
        });
        if (!tpl) {
            tpl = await tx.messageTemplate.create({
                data: {
                    workspace_id: workspaceId,
                    name: spec.template.name,
                    channel: spec.template.channel,
                    body: spec.template.body,
                    is_default: true,
                },
            });
        }
        // 2) Ensure automation linked to that template (by key in metadata of params)
        const existing = await tx.automation.findFirst({
            where: { workspace_id: workspaceId, is_default: true, name: spec.automation.name },
        });
        if (!existing) {
            await tx.automation.create({
                data: {
                    workspace_id: workspaceId,
                    name: spec.automation.name,
                    description: spec.automation.description,
                    trigger: spec.automation.trigger,
                    filter: spec.automation.filter || {},
                    action: spec.automation.action,
                    params: {
                        ...spec.automation.params,
                        template_id: tpl.id,
                    },
                    delay_minutes: spec.automation.delay_minutes || 0,
                    enabled: false, // always off by default — owner flips them on
                    is_default: true,
                },
            });
        }
    }
}

async function main() {
    const prisma = new PrismaClient({ log: ['warn', 'error'] });
    const workspaces = await prisma.workspace.findMany({ select: { id: true, slug: true } });
    let total = 0;
    for (const ws of workspaces) {
        await prisma.$transaction(async (tx) => {
            await seedDefaultsForWorkspace(tx, ws.id);
        });
        total += 1;
        console.log(`  ${ws.slug}: defaults seeded`);
    }
    console.log(`\n✓ Seeded defaults for ${total} workspace(s).`);
    await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
    main().catch((e) => {
        console.error('seed failed:', e);
        process.exit(1);
    });
}
