// Mensajes automáticos de orden (V2): el SERVIDOR es el único remitente.
//  - statusKeyOf(): clave canónica de un estado ("En Reparación" -> en_proceso) para filtrar automatizaciones.
//  - ensureDefaultMessages(): migración idempotente que crea/activa las plantillas+automatizaciones por defecto.
import prisma, { workspaceContext } from './prisma.js';
import { DEFAULTS } from '../../prisma/seed-automation-defaults.js';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

/** minúsculas sin acentos ni signos. */
export function normalizeName(name) {
    return String(name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Clave canónica del estado. Los talleres nombran sus estados distinto ("Lista", "Lista para Entregar",
 * "En reparación", "En proceso"...); las automatizaciones filtran por esta clave.
 */
export function statusKeyOf(name) {
    const n = normalizeName(name);
    if (!n) return null;
    if (/^(recibida|registrada|nueva)$/.test(n)) return 'recibida';
    if (/^(diagnostico|en revision|revision)$/.test(n)) return 'en_revision';
    if (/^cotizacion/.test(n)) return 'cotizacion';
    if (/^autorizad[ao]$/.test(n)) return 'autorizada';
    if (/^(en proceso|en reparacion|reparacion)$/.test(n)) return 'en_proceso';
    if (/^esperando refaccion/.test(n)) return 'esperando_refacciones';
    if (/^lista( para (entregar|recoger))?$/.test(n)) return 'lista';
    if (/^entregad[ao]$/.test(n)) return 'entregada';
    if (/^cancelad[ao]$/.test(n)) return 'cancelada';
    return n.replace(/ /g, '_');
}

// Claves del seed que forman el conjunto de mensajes de orden (NO los recordatorios de cita ni tareas internas).
export const ORDER_MESSAGE_KEYS = [
    'confirmacion_ingreso', 'cotizacion_lista', 'lista_recoger',
    'estado_en_revision', 'estado_autorizada', 'estado_en_proceso',
    'estado_esperando_refacciones', 'estado_entregada', 'estado_cancelada',
];

/** ¿La fila nunca fue editada por una persona? (updated_at ≈ created_at) */
export function isUntouched(row, toleranceMs = 5000) {
    return Math.abs(new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()) <= toleranceMs;
}

/** Cuerpo que tenía la plantilla ANTES de agregar {atiende}: se puede mejorar sin pisar ediciones. */
export const withoutAtiende = (body) => String(body || '').replace('{atiende}', '');

/**
 * Crea o activa las plantillas y automatizaciones de orden de un taller. Idempotente. Reglas:
 *  - Si no existen, se crean ACTIVADAS (el taller ya tenía WhatsApp y antes la pantalla mandaba estos avisos).
 *  - Si existen y nadie las tocó (updated_at ≈ created_at) y estaban apagadas, se activan.
 *  - Una plantilla solo se actualiza (para agregar {atiende}) si su texto es EXACTAMENTE el anterior por defecto.
 *  - Nunca se pisa nada que una persona editó, ni se reactiva lo que alguien apagó a propósito.
 * Devuelve contadores para el log.
 */
export async function ensureDefaultMessages(workspaceId) {
    const out = { templates_created: 0, templates_upgraded: 0, automations_created: 0, automations_enabled: 0, automations_updated: 0 };
    const specs = DEFAULTS.filter((d) => ORDER_MESSAGE_KEYS.includes(d.key));

    for (const spec of specs) {
        let tpl = await unscoped(() => prisma.messageTemplate.findFirst({
            where: { workspace_id: workspaceId, name: spec.template.name, is_default: true },
        }));
        if (!tpl) {
            tpl = await unscoped(() => prisma.messageTemplate.create({
                data: { workspace_id: workspaceId, name: spec.template.name, channel: spec.template.channel, body: spec.template.body, is_default: true },
            }));
            out.templates_created += 1;
        } else if (tpl.body !== spec.template.body && tpl.body === withoutAtiende(spec.template.body)) {
            tpl = await unscoped(() => prisma.messageTemplate.update({ where: { id: tpl.id }, data: { body: spec.template.body } }));
            out.templates_upgraded += 1;
        }

        const auto = await unscoped(() => prisma.automation.findFirst({
            where: { workspace_id: workspaceId, name: spec.automation.name, is_default: true },
        }));
        if (!auto) {
            await unscoped(() => prisma.automation.create({
                data: {
                    workspace_id: workspaceId,
                    name: spec.automation.name,
                    description: spec.automation.description,
                    trigger: spec.automation.trigger,
                    filter: spec.automation.filter || {},
                    action: spec.automation.action,
                    params: { ...spec.automation.params, template_id: tpl.id, dedup_per_order: true, default_key: spec.key },
                    delay_minutes: spec.automation.delay_minutes || 0,
                    enabled: true,
                    is_default: true,
                },
            }));
            out.automations_created += 1;
            continue;
        }

        if (!isUntouched(auto)) continue; // alguien la editó o la apagó a propósito: no se toca
        const data = {};
        if (!auto.enabled) { data.enabled = true; out.automations_enabled += 1; }
        // Que "Lista" funcione aunque el estado del taller se llame "Lista para Entregar".
        if (spec.key === 'lista_recoger' && JSON.stringify(auto.filter) === JSON.stringify({ status_name: 'Lista' })) {
            data.filter = { status_key: 'lista' };
            out.automations_updated += 1;
        }
        if (Object.keys(data).length) {
            // Se conserva updated_at "intacto" no es posible (Prisma lo actualiza): por eso se marca default_key en params.
            await unscoped(() => prisma.automation.update({
                where: { id: auto.id },
                data: { ...data, params: { ...(auto.params || {}), dedup_per_order: true, default_key: spec.key } },
            }));
        }
    }
    return out;
}

/** Talleres que ya usan WhatsApp (tienen una sesión configurada o heredada). */
export async function workspacesWithWhatsApp() {
    const rows = await unscoped(() => prisma.workspace.findMany({
        where: { is_active: true, whatsapp_session_profile_id: { not: null } }, select: { id: true },
    }));
    return rows.map((r) => r.id);
}
