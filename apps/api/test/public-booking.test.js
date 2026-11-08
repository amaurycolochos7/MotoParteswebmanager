// Logica pura de la cita en linea (lib/booking.js): validaciones, motos, cupo por mecanico, limite de intentos y aviso.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    norm, compact, sameMoto, findSameMoto, buildMotoLabel,
    validateBookingBody, customerInputError,
    occupancy, isSlotOpen, createRateLimiter, mechanicNoticeText,
    MAX_PENDING_PER_PHONE, MSG_PICK_MECHANIC,
} from '../src/lib/booking.js';

const MECH = '5236d9b0-9508-415f-b27f-5e53415233bd';
const OTHER = '7b795e9a-c398-49f1-9ca0-aee971805172';
const base = {
    telefono: '961 123 4567', mecanico_id: MECH, tipo_servicio: 'Afinación general',
    fecha: '2030-01-07', hora: '10:00', nombre: 'Juan Pérez', moto_marca: 'Honda', moto_modelo: 'CB190R', moto_anio: '2021',
};

// ── Texto y motos ────────────────────────────────────────────────────────
test('norm y compact ignoran mayúsculas, acentos, espacios y guiones', () => {
    assert.equal(norm('  ÁNGEL   Pérez '), 'angel perez');
    assert.equal(compact('CB 190-R'), 'cb190r');
    assert.equal(compact('Dominar 400'), 'dominar400');
});

test('sameMoto: misma marca y modelo aunque cambie el formato', () => {
    assert.equal(sameMoto({ brand: 'Honda', model: 'CB190R', year: 2021 }, { marca: 'honda', modelo: 'cb 190 r', anio: '2021' }), true);
    assert.equal(sameMoto({ brand: 'Honda', model: 'CB190R', year: 2021 }, { marca: 'Yamaha', modelo: 'CB190R', anio: '2021' }), false);
    assert.equal(sameMoto({ brand: 'Honda', model: 'CB190R', year: 2021 }, { marca: 'Honda', modelo: 'CB125', anio: '2021' }), false);
});

test('sameMoto: años distintos son motos distintas; sin año coincide con cualquiera', () => {
    assert.equal(sameMoto({ brand: 'Italika', model: 'FT150', year: 2019 }, { marca: 'Italika', modelo: 'FT150', anio: '2022' }), false);
    assert.equal(sameMoto({ brand: 'Italika', model: 'FT150', year: null }, { marca: 'Italika', modelo: 'FT150', anio: '2022' }), true);
    assert.equal(sameMoto({ brand: 'Italika', model: 'FT150', year: 2019 }, { marca: 'Italika', modelo: 'FT150', anio: '' }), true);
});

test('findSameMoto devuelve la moto existente o null', () => {
    const motos = [{ id: 'a', brand: 'Honda', model: 'CB190R', year: 2021 }, { id: 'b', brand: 'Bajaj', model: 'Pulsar 200', year: null }];
    assert.equal(findSameMoto(motos, { marca: 'BAJAJ', modelo: 'pulsar200', anio: '' }).id, 'b');
    assert.equal(findSameMoto(motos, { marca: 'Suzuki', modelo: 'GN125', anio: '' }), null);
    assert.equal(findSameMoto([], { marca: 'x', modelo: 'y' }), null);
});

test('buildMotoLabel junta lo que haya', () => {
    assert.equal(buildMotoLabel({ marca: 'Honda', modelo: 'CB190R', anio: 2021 }), 'Honda CB190R 2021');
    assert.equal(buildMotoLabel({ marca: 'Honda', modelo: 'CB190R', anio: null }), 'Honda CB190R');
});

// ── Validaciones ─────────────────────────────────────────────────────────
test('validateBookingBody acepta una solicitud completa y normaliza el teléfono', () => {
    const r = validateBookingBody(base);
    assert.equal(r.error, undefined);
    assert.equal(r.data.phone, '9611234567');
    assert.equal(r.data.mecanicoId, MECH);
    assert.equal(r.data.marca, 'Honda');
});

test('validateBookingBody acepta teléfono con lada', () => {
    assert.equal(validateBookingBody({ ...base, telefono: '+52 961 123 4567' }).data.phone, '9611234567');
});

test('el mecánico es obligatorio: no hay opción "cualquiera"', () => {
    for (const bad of [undefined, null, '', '   ', 'cualquiera', 'abc', 123]) {
        const r = validateBookingBody({ ...base, mecanico_id: bad });
        assert.equal(r.error, MSG_PICK_MECHANIC, String(bad));
    }
    const noField = { ...base }; delete noField.mecanico_id;
    assert.equal(validateBookingBody(noField).error, MSG_PICK_MECHANIC);
});

test('validateBookingBody rechaza teléfono, fecha, hora, servicio y año inválidos', () => {
    assert.match(validateBookingBody({ ...base, telefono: '12345' }).error, /Teléfono/);
    assert.match(validateBookingBody({ ...base, fecha: '' }).error, /Fecha y hora/);
    assert.match(validateBookingBody({ ...base, hora: '' }).error, /Fecha y hora/);
    assert.match(validateBookingBody({ ...base, tipo_servicio: '  ' }).error, /servicio/);
    assert.match(validateBookingBody({ ...base, moto_anio: '21' }).error, /año/);
    assert.match(validateBookingBody({ ...base, moto_id: 'no-es-uuid' }).error, /moto/);
});

test('customerInputError: cliente nuevo necesita nombre y moto; el existente puede traer moto_id', () => {
    const nuevo = validateBookingBody({ ...base, nombre: '' }).data;
    assert.match(customerInputError(nuevo, false), /nombre/);
    const sinMoto = validateBookingBody({ ...base, moto_marca: '', moto_modelo: '' }).data;
    assert.match(customerInputError(sinMoto, true), /marca y el modelo/);
    const conId = validateBookingBody({ ...base, nombre: '', moto_marca: '', moto_modelo: '', moto_id: OTHER }).data;
    assert.equal(customerInputError(conId, true), null);
    assert.match(customerInputError(conId, false), /nombre|moto/); // un cliente nuevo no puede traer moto_id
    assert.equal(customerInputError(validateBookingBody({ ...base, nombre: '' }).data, true), null); // existente: nombre opcional
    assert.equal(MAX_PENDING_PER_PHONE, 5);
});

// ── Cupo de horarios por mecánico ────────────────────────────────────────
test('occupancy cuenta el total y por mecánico', () => {
    const occ = occupancy([
        { slot: '10:00', mechanic_id: MECH }, { slot: '10:00', mechanic_id: OTHER },
        { slot: '11:00', mechanic_id: null }, { slot: '10:00', mechanic_id: null },
    ]);
    assert.deepEqual(occ.total, { '10:00': 3, '11:00': 1 });
    assert.deepEqual(occ.byMechanic[MECH], { '10:00': 1 });
});

test('isSlotOpen: sin mecánico solo cuenta el cupo global', () => {
    const occ = occupancy([{ slot: '10:00', mechanic_id: MECH }]);
    assert.equal(isSlotOpen(occ, '10:00', { capacity: 2 }), true);
    assert.equal(isSlotOpen(occ, '10:00', { capacity: 1 }), false);
});

test('isSlotOpen: con mecánico ocupado esa hora se cierra solo para él', () => {
    const occ = occupancy([{ slot: '10:00', mechanic_id: MECH }]);
    assert.equal(isSlotOpen(occ, '10:00', { capacity: 2, mechanicId: MECH }), false); // ocupado
    assert.equal(isSlotOpen(occ, '10:00', { capacity: 2, mechanicId: OTHER }), true);  // otro mecánico libre
    assert.equal(isSlotOpen(occ, '11:00', { capacity: 2, mechanicId: MECH }), true);   // otra hora
});

test('isSlotOpen: aunque el mecánico esté libre, el cupo global del taller manda', () => {
    const occ = occupancy([{ slot: '10:00', mechanic_id: OTHER }, { slot: '10:00', mechanic_id: null }]);
    assert.equal(isSlotOpen(occ, '10:00', { capacity: 2, mechanicId: MECH }), false);
});

// ── Límite de intentos ───────────────────────────────────────────────────
test('createRateLimiter bloquea al pasar el máximo y se reinicia con la ventana', () => {
    let t = 1000;
    const rl = createRateLimiter({ max: 3, windowMs: 100, now: () => t });
    assert.equal(rl.hit('a'), false);
    assert.equal(rl.hit('a'), false);
    assert.equal(rl.hit('a'), false);
    assert.equal(rl.hit('a'), true);   // 4o intento
    assert.equal(rl.hit('b'), false);  // otra llave no se afecta
    t += 101;
    assert.equal(rl.hit('a'), false);  // ventana nueva
    rl.sweep();
    assert.ok(rl.size() <= 2);
});

// ── Aviso al mecánico ────────────────────────────────────────────────────
const ctx = {
    mecanico: 'Maciel Hernández', cliente: 'Juan Pérez', telefono: '9611234567', moto: 'Honda CB190R 2021',
    servicio: 'Afinación general', fecha: 'sábado, 8 de noviembre', hora: '10:00 am', notas: 'Hace ruido', link: 'https://motopartes.cloud/mechanic/appointments?cita=abc',
};
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

test('el aviso al mecánico lleva cliente, moto, servicio, fecha y enlace, sin emojis', () => {
    for (const kind of ['requested', 'assigned', 'customerChose', 'customerCancelled']) {
        const t = mechanicNoticeText(kind, ctx);
        assert.match(t, /Maciel/);
        for (const piece of ['Juan Pérez', '9611234567', 'Honda CB190R 2021', 'Afinación general', 'sábado, 8 de noviembre', '10:00 am', ctx.link]) {
            assert.ok(t.includes(piece), `${kind} sin ${piece}`);
        }
        assert.doesNotMatch(t, EMOJI, kind);
    }
    assert.match(mechanicNoticeText('requested', ctx), /nueva solicitud/);
    assert.throws(() => mechanicNoticeText('otro', ctx));
});
