// Fase 7.2 — Notificaciones de tickets.
// Si no hay RESEND_API_KEY configurada, las llamadas hacen no-op y loguean.
// Nunca bloqueamos la creación/respuesta de tickets por fallo de email.

const PUBLIC_APP_URL = () => process.env.PUBLIC_APP_URL || 'https://motopartes.cloud';

function hasResend() {
    return !!process.env.RESEND_API_KEY;
}

async function sendEmail({ to, subject, html }) {
    if (!hasResend()) {
        console.log(`[notify] (skip — no RESEND) to=${to} subject=${subject}`);
        return;
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: process.env.RESEND_FROM || 'MotoPartes <noreply@motopartes.cloud>',
                to: [to],
                subject,
                html,
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error(`[notify] resend failed ${res.status}: ${err}`);
        }
    } catch (err) {
        console.error('[notify] fetch error:', err.message);
    }
}

async function postSlack(text) {
    const hook = process.env.SLACK_SUPPORT_WEBHOOK_URL;
    if (!hook) return;
    try {
        await fetch(hook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
    } catch (err) {
        console.error('[slack] failed:', err.message);
    }
}

export async function notifyNewTicket(ticket) {
    const superEmail = process.env.SUPER_ADMIN_EMAIL || 'amaury.colochos7@gmail.com';
    const url = `${PUBLIC_APP_URL()}/super/tickets/${ticket.id}`;
    const subject = `[Ticket #${ticket.ticket_number}] ${ticket.subject}`;
    const html = `
        <h2>Nuevo ticket de soporte</h2>
        <p><strong>Taller:</strong> ${ticket.workspace?.name || '(sin workspace)'}</p>
        <p><strong>De:</strong> ${ticket.creator?.full_name || ticket.creator?.email || '—'}</p>
        <p><strong>Categoría:</strong> ${ticket.category} · <strong>Prioridad:</strong> ${ticket.priority}</p>
        <p><strong>Asunto:</strong> ${ticket.subject}</p>
        <hr/>
        <p>${(ticket.messages?.[0]?.body_md || '').replace(/\n/g, '<br/>')}</p>
        <p><a href="${url}">Abrir en el panel →</a></p>
    `;
    await sendEmail({ to: superEmail, subject, html });
    await postSlack(`🎫 Ticket #${ticket.ticket_number} — *${ticket.subject}* (${ticket.workspace?.name || 'sin taller'}) — ${url}`);
}

export async function notifyTicketReply({ ticket_id, from }) {
    // from='customer' → avisa al super. from='admin' → avisa al cliente.
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const ticket = await prisma.supportTicket.findUnique({
            where: { id: ticket_id },
            include: {
                creator: { select: { email: true, full_name: true } },
                messages: { orderBy: { created_at: 'desc' }, take: 1 },
                workspace: { select: { name: true } },
            },
        });
        if (!ticket) return;

        if (from === 'customer') {
            const superEmail = process.env.SUPER_ADMIN_EMAIL || 'amaury.colochos7@gmail.com';
            const url = `${PUBLIC_APP_URL()}/super/tickets/${ticket.id}`;
            await sendEmail({
                to: superEmail,
                subject: `[Ticket #${ticket.ticket_number}] nueva respuesta del cliente`,
                html: `<p><strong>${ticket.creator?.full_name || 'Cliente'}</strong> respondió en <strong>${ticket.subject}</strong>:</p><blockquote>${(ticket.messages?.[0]?.body_md || '').slice(0, 500)}</blockquote><p><a href="${url}">Ver →</a></p>`,
            });
        } else if (from === 'admin') {
            if (!ticket.creator?.email) return;
            const url = `${PUBLIC_APP_URL()}/admin/support/${ticket.id}`;
            await sendEmail({
                to: ticket.creator.email,
                subject: `[MotoPartes] Respuesta a tu ticket #${ticket.ticket_number}`,
                html: `<p>Hola ${ticket.creator.full_name || ''},</p><p>Tienes una nueva respuesta en tu ticket <strong>${ticket.subject}</strong>.</p><blockquote>${(ticket.messages?.[0]?.body_md || '').slice(0, 500)}</blockquote><p><a href="${url}">Abrir ticket →</a></p><p>— Equipo MotoPartes</p>`,
            });
        }
    } finally {
        await prisma.$disconnect();
    }
}
