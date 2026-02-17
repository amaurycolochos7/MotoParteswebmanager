import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding database...');

    // 1. Create order statuses
    const statuses = [
        { name: 'Registrada', color: '#06b6d4', display_order: 1, is_terminal: false },
        { name: 'En Revisión', color: '#f59e0b', display_order: 2, is_terminal: false },
        { name: 'En Proceso', color: '#3b82f6', display_order: 3, is_terminal: false },
        { name: 'Esperando Refacciones', color: '#8b5cf6', display_order: 4, is_terminal: false },
        { name: 'Lista para Entregar', color: '#22c55e', display_order: 5, is_terminal: false },
        { name: 'Entregada', color: '#6b7280', display_order: 6, is_terminal: true },
        { name: 'Cancelada', color: '#ef4444', display_order: 7, is_terminal: true },
    ];

    for (const s of statuses) {
        await prisma.orderStatus.upsert({
            where: { name: s.name },
            update: s,
            create: s
        });
    }
    console.log('  ✅ Order statuses created');

    // 2. Create services catalog
    const services = [
        { name: 'Cambio de Aceite', base_price: 250, category: 'mantenimiento', display_order: 1 },
        { name: 'Afinación', base_price: 800, category: 'motor', display_order: 2 },
        { name: 'Frenos', base_price: 400, category: 'frenos', display_order: 3 },
        { name: 'Sistema Eléctrico', base_price: 600, category: 'electrico', display_order: 4 },
        { name: 'Suspensión', base_price: 500, category: 'suspension', display_order: 5 },
        { name: 'Diagnóstico General', base_price: 150, category: 'general', display_order: 6 },
        { name: 'Lavado y Engrasado', base_price: 200, category: 'mantenimiento', display_order: 7 },
    ];

    for (const s of services) {
        const existing = await prisma.service.findFirst({ where: { name: s.name } });
        if (!existing) await prisma.service.create({ data: s });
    }
    console.log('  ✅ Services catalog created');

    // 3. Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.profile.upsert({
        where: { email: 'admin@motopartes.com' },
        update: {},
        create: {
            email: 'admin@motopartes.com',
            password_hash: adminPassword,
            full_name: 'Administrador',
            phone: '5551234567',
            role: 'admin',
            is_master_mechanic: false,
        }
    });
    console.log('  ✅ Admin user created (admin@motopartes.com / admin123)');

    // 4. Create demo master mechanic
    const mechPassword = await bcrypt.hash('mech123', 10);
    await prisma.profile.upsert({
        where: { email: 'maestro@motopartes.com' },
        update: {},
        create: {
            email: 'maestro@motopartes.com',
            password_hash: mechPassword,
            full_name: 'Carlos Mecánico Maestro',
            phone: '5559876543',
            role: 'mechanic',
            commission_percentage: 50,
            is_master_mechanic: true,
        }
    });
    console.log('  ✅ Master mechanic created (maestro@motopartes.com / mech123)');

    // 5. Create demo auxiliary mechanic
    await prisma.profile.upsert({
        where: { email: 'auxiliar@motopartes.com' },
        update: {},
        create: {
            email: 'auxiliar@motopartes.com',
            password_hash: mechPassword,
            full_name: 'Pedro Mecánico Auxiliar',
            phone: '5551112222',
            role: 'mechanic',
            commission_percentage: 10,
            is_master_mechanic: false,
            requires_approval: true,
            can_view_approved_orders: true,
        }
    });
    console.log('  ✅ Auxiliary mechanic created (auxiliar@motopartes.com / mech123)');

    console.log('\n🎉 Seed complete!');
}

seed()
    .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
