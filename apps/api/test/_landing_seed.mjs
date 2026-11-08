// Datos de prueba para revisar la landing a mano:  node test/_landing_seed.mjs seed | clean
// Crea mecánicos "Visual …" (teléfonos 999…) y un cliente "Visual Cliente" con 2 motos; clean lo borra.
import prisma from '../src/lib/prisma.js';
const WS = process.env.LANDING_VC_WORKSPACE_ID || '7b795e9a-c398-49f1-9ca0-aee971805172';
const PHONE_KNOWN = '9990001111';
const mode = process.argv[2];
if (mode === 'seed') {
    const mk = async (i, name, role) => {
        const p = await prisma.profile.create({ data: { email: `visual-${i}@test.local`, full_name: name, phone: `99900000${i}0`, role: 'mechanic' } });
        await prisma.membership.create({ data: { workspace_id: WS, profile_id: p.id, role } });
    };
    await mk(1, 'Visual Maciel Hernández', 'mechanic');
    await mk(2, 'Visual Eligio Hernández', 'owner');
    await mk(3, 'Visual Auxiliar Pérez', 'auxiliary');
    const c = await prisma.client.create({ data: { workspace_id: WS, phone: PHONE_KNOWN, full_name: 'Visual Cliente Ramírez Gómez' } });
    await prisma.motorcycle.create({ data: { workspace_id: WS, client_id: c.id, brand: 'Honda', model: 'CB190R', year: 2021, plates: 'XYZ-123' } });
    await prisma.motorcycle.create({ data: { workspace_id: WS, client_id: c.id, brand: 'Italika', model: 'FT150', year: null } });
    console.log('seed ok; teléfono conocido', PHONE_KNOWN);
} else if (mode === 'clean') {
    const profs = await prisma.profile.findMany({ where: { email: { startsWith: 'visual-' } }, select: { id: true } });
    const ids = profs.map((p) => p.id);
    const appts = await prisma.appointment.findMany({ where: { OR: [{ assigned_mechanic_id: { in: ids } }, { client_phone: { startsWith: '999' } }] }, select: { id: true } });
    await prisma.appointmentEvent.deleteMany({ where: { appointment_id: { in: appts.map((a) => a.id) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appts.map((a) => a.id) } } });
    const cl = await prisma.client.findMany({ where: { workspace_id: WS, phone: { startsWith: '999' }, OR: [{ full_name: { startsWith: 'Visual' } }, { origin: 'cita_web' }] }, select: { id: true } });
    await prisma.motorcycle.deleteMany({ where: { client_id: { in: cl.map((c) => c.id) } } });
    await prisma.client.deleteMany({ where: { id: { in: cl.map((c) => c.id) } } });
    await prisma.membership.deleteMany({ where: { profile_id: { in: ids } } });
    await prisma.profile.deleteMany({ where: { id: { in: ids } } });
    console.log('clean ok');
}
await prisma.$disconnect();
