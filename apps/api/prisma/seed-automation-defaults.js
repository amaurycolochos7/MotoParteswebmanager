// Idempotent seed of the 7 default automations + their templates per workspace.
// Run:  node prisma/seed-automation-defaults.js  (backfills every workspace)
// Or programmatically per-workspace: seedDefaultsForWorkspace(workspaceId, tx)
//
// Defaults are created DISABLED. The owner toggles them on from the UI.

import { PrismaClient } from '@prisma/client';

const DEFAULTS = [
    {
        key: 'confirmacion_ingreso',
        template: {
            name: 'Confirmación de ingreso',
            channel: 'whatsapp',
            body: 'Hola {cliente}, recibimos tu {marca} {modelo} en {taller}. Tu folio es *{folio}*. Te avisaremos cuando esté lista. ¡Gracias por confiar en nosotros!',
        },
        automation: {
            name: 'Confirmación de ingreso',
            description: 'Al registrar una orden, envía mensaje de bienvenida al cliente.',
            trigger: 'order.created',
            action: 'whatsapp.send_template',
            params: { to: 'client' },
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
            body: '¡Hola {cliente}! Tu {marca} {modelo} ya está lista para recoger. Folio: {folio}. Total: {total}. Te esperamos en {taller}.',
        },
        automation: {
            name: 'Lista para recoger',
            description: 'Cuando la orden cambia a "Lista", avisa al cliente que puede pasar por su moto.',
            trigger: 'order.status_changed',
            filter: { status_name: 'Lista' },
            action: 'whatsapp.send_template',
            params: { to: 'client' },
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
