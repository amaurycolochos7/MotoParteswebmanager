// Idempotent production sync for the two order-notification WhatsApp messages:
//   - "Confirmación de ingreso"  (order.created)          → orden registrada
//   - "Lista para recoger"       (order.status_changed=Lista) → servicio concluido
//
// What it does (all idempotent, NON-destructive — only UPDATEs specific rows):
//   1. Updates the body of the two is_default templates to the canonical text
//      in seed-automation-defaults.js (single source of truth).
//   2. Sets params.dedup_per_order=true on the two automations (keeps
//      template_id + to intact).
//   3. Enables ONLY these two automations, ONLY for the targeted workspace(s).
//
// Target selection (multi-tenant safety — the message signature is
// workshop-specific, so we do NOT touch other tenants by default):
//   default              → workspaces where is_flagship = true
//   --workspace <slug|id> → that single workspace
//   --all                → every workspace (use only if single-tenant prod)
//   --no-enable          → update bodies/params but do NOT flip enabled
//
// Usage:  node prisma/update-order-notification-templates.js [--workspace X] [--all] [--no-enable]

import { PrismaClient } from '@prisma/client';
import { DEFAULTS } from './seed-automation-defaults.js';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const KEYS = ['confirmacion_ingreso', 'lista_recoger'];
const SPECS = KEYS.map((k) => DEFAULTS.find((d) => d.key === k));

function parseArgs(argv) {
    const args = { workspace: null, all: false, enable: true };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--workspace') args.workspace = argv[++i];
        else if (argv[i] === '--all') args.all = true;
        else if (argv[i] === '--no-enable') args.enable = false;
    }
    return args;
}

async function selectWorkspaces(args) {
    if (args.workspace) {
        const ws = await prisma.workspace.findFirst({
            where: { OR: [{ slug: args.workspace }, { id: args.workspace }] },
            select: { id: true, slug: true, name: true, is_flagship: true },
        });
        return ws ? [ws] : [];
    }
    if (args.all) {
        return prisma.workspace.findMany({ select: { id: true, slug: true, name: true, is_flagship: true } });
    }
    return prisma.workspace.findMany({
        where: { is_flagship: true },
        select: { id: true, slug: true, name: true, is_flagship: true },
    });
}

async function syncWorkspace(ws, { enable }) {
    const report = { workspace: ws.slug, updated_templates: 0, updated_automations: 0, enabled: 0, skipped: [] };

    for (const spec of SPECS) {
        // 1) Template body — match the is_default template by canonical name.
        const tpl = await prisma.messageTemplate.findFirst({
            where: { workspace_id: ws.id, name: spec.template.name, is_default: true },
            select: { id: true, body: true },
        });
        if (!tpl) {
            report.skipped.push(`template "${spec.template.name}" not found (run seed first)`);
            continue;
        }
        if (tpl.body !== spec.template.body) {
            await prisma.messageTemplate.update({ where: { id: tpl.id }, data: { body: spec.template.body } });
            report.updated_templates += 1;
        }

        // 2) Automation params (dedup) + optional enable.
        const auto = await prisma.automation.findFirst({
            where: { workspace_id: ws.id, name: spec.automation.name, is_default: true },
            select: { id: true, params: true, enabled: true, filter: true, trigger: true },
        });
        if (!auto) {
            report.skipped.push(`automation "${spec.automation.name}" not found (run seed first)`);
            continue;
        }

        const data = {};
        const params = { ...(auto.params || {}) };
        if (params.dedup_per_order !== true) {
            params.dedup_per_order = true;
            data.params = params;
        }
        if (enable && auto.enabled !== true) {
            data.enabled = true;
        }
        if (Object.keys(data).length > 0) {
            await prisma.automation.update({ where: { id: auto.id }, data });
            if (data.params) report.updated_automations += 1;
            if (data.enabled) report.enabled += 1;
        }
    }
    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const workspaces = await selectWorkspaces(args);

    if (!workspaces.length) {
        console.log('No matching workspace. Nothing to do.');
        console.log('Hint: pass --workspace <slug> or --all if there is no flagship workspace.');
        return;
    }

    console.log(`Target workspaces (${workspaces.length}):`, workspaces.map((w) => `${w.slug}${w.is_flagship ? ' [flagship]' : ''}`).join(', '));
    console.log(`Enable automations: ${args.enable ? 'YES' : 'no (--no-enable)'}\n`);

    for (const ws of workspaces) {
        const r = await syncWorkspace(ws, { enable: args.enable });
        console.log(`  ${r.workspace}: templates updated=${r.updated_templates}, automations dedup-set=${r.updated_automations}, enabled=${r.enabled}`
            + (r.skipped.length ? `, skipped: ${r.skipped.join('; ')}` : ''));
    }
    console.log('\n✓ Done. Re-running is safe (idempotent).');
}

main()
    .catch((e) => { console.error('update failed:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
