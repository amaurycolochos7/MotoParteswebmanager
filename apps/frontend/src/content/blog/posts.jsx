// Catálogo de artículos del blog. Cada post es JSX inline para evitar
// un parser MDX runtime (añadiría ~200KB a bundle). Si crecemos a 20+
// posts conviene migrar a markdown + unified/rehype en build time.
//
// Convención: el slug se usa en la URL (/blog/:slug) y debe ser kebab-case.
// `excerpt` sale en el listado; `publishedAt` es ISO; `readMinutes` es una
// pista para el usuario (1 min ≈ 200 palabras).

export const POSTS = [
    {
        slug: '10-servicios-imprescindibles-taller-motos',
        title: '10 servicios imprescindibles que tu taller de motos debe ofrecer',
        excerpt:
            'Desde cambio de aceite hasta diagnóstico eléctrico, estos son los servicios que generan el 80% del ingreso en un taller promedio de motocicletas en México.',
        author: 'Equipo MotoPartes',
        publishedAt: '2026-03-05',
        readMinutes: 6,
        tags: ['operación', 'servicios', 'ingresos'],
        body: () => (
            <>
                <p>
                    La mayoría de talleres de motos en México facturan entre $80,000 y
                    $250,000 MXN al mes. Cuando desglosamos de dónde viene ese ingreso
                    en talleres que llevan sus números, aparecen los mismos 10 servicios
                    una y otra vez. Si tu taller no está ofreciéndolos (o peor, los está
                    ofreciendo pero no los está cobrando al precio correcto), estás
                    dejando dinero en la mesa.
                </p>

                <h2>1. Cambio de aceite</h2>
                <p>
                    El servicio de entrada más frecuente. Precio sugerido para motos de
                    125-200cc: <strong>$350 MXN</strong> (incluye filtro). Para motos
                    deportivas o scooter 300+: $550-$700. Si sólo cobras aceite +
                    sustitución, estás regalando el acceso al cliente; aprovecha la
                    oportunidad para una revisión de 5 puntos gratis (cadena, frenos,
                    batería, luces, llantas) — 2 de cada 3 clientes salen con un servicio
                    adicional.
                </p>

                <h2>2. Afinación menor y mayor</h2>
                <p>
                    Menor (~$600): bujías, limpieza de carburador/inyector, ajuste de
                    válvulas. Mayor (~$1,200): todo lo anterior + filtros + sincronización.
                    Clave: cobrar la mano de obra aparte de las refacciones. Muchos
                    talleres pierden 20-30% sólo por "tirarle" el trabajo al precio de
                    la refacción.
                </p>

                <h2>3. Frenos (balatas y ajuste)</h2>
                <p>
                    Ajuste simple: $400 MXN. Cambio de balatas delanteras: $550-$800
                    dependiendo de moto. Los frenos son la #1 causa de devoluciones, así
                    que documenta siempre con foto antes/después. En MotoPartes la foto
                    queda asociada a la orden — ya no hay "yo no fui".
                </p>

                <h2>4. Cambio y ajuste de cadena</h2>
                <p>
                    Entre $600 y $1,000. Si tu cliente usa su moto a diario, esto pasa
                    cada 8-10 meses. Agenda el recordatorio en MotoPartes (trigger
                    `moto.service_due` basado en km) y el cliente regresa.
                </p>

                <h2>5. Cambio de llantas</h2>
                <p>
                    $300 MXN mano de obra por llanta. Aquí el margen real está en la
                    refacción: compra mayoreo a 3 proveedores distintos y rota. No te
                    cases con una marca si puedes ofrecer 2 opciones al cliente (más
                    económica / más durabilidad).
                </p>

                <h2>6. Balanceo</h2>
                <p>
                    $250 MXN. Casi nadie lo pide, pero si lo ofreces como "complemento
                    obligatorio" del cambio de llanta, se convierte en $250 extra en el
                    90% de las órdenes sin esfuerzo adicional.
                </p>

                <h2>7. Diagnóstico eléctrico</h2>
                <p>
                    $450 MXN de diagnóstico + refacciones. Luces que no encienden,
                    arranque que falla, batería que no carga. Este servicio es "alto
                    margen / alta queja" porque el cliente a veces siente que pagó mucho
                    por "nada visible". Siempre entrega un reporte escrito con lo que
                    encontraste.
                </p>

                <h2>8. Lavado y engrase</h2>
                <p>
                    $200 MXN. Barato, frecuente, te mantiene visible. Lo bueno: lo puede
                    hacer tu auxiliar, dejando al mecánico libre para servicios más
                    caros.
                </p>

                <h2>9. Revisión general</h2>
                <p>
                    $500 MXN. Tu servicio de "primera cita". Lo cobras incluso si no hay
                    nada que reparar — el cliente paga por tu diagnóstico, no por la
                    reparación. Si no lo cobras, estás trabajando gratis.
                </p>

                <h2>10. Ajuste de suspensión</h2>
                <p>
                    $600-$1,200 dependiendo del tipo de moto. Servicio premium que pocos
                    talleres dominan. Si el tuyo sí, cobra lo que vale. Pocos clientes,
                    alta lealtad.
                </p>

                <h3>¿Cómo saber cuál te conviene priorizar?</h3>
                <p>
                    Mide. En MotoPartes cada orden registra servicio + precio + mecánico.
                    Al final del mes ves qué generó el 80% de tu ingreso y con qué
                    margen. Si un servicio está abajo del 15% de margen, súbele al
                    precio o déjalo de ofrecer.
                </p>
            </>
        ),
    },
    {
        slug: 'comisiones-mecanico-sin-pelearte',
        title: 'Cómo llevar las comisiones por mecánico sin pelearte al final del mes',
        excerpt:
            'El problema no es cuánto pagas — es cómo calculas. Te explicamos el sistema de 3 números que usan los talleres que no pelean con su equipo.',
        author: 'Equipo MotoPartes',
        publishedAt: '2026-03-18',
        readMinutes: 5,
        tags: ['equipo', 'pagos', 'operación'],
        body: () => (
            <>
                <p>
                    "Tú dijiste que me pagabas el 40%, pero esto no suma." Si has tenido
                    esta conversación con tu mecánico al cierre de la quincena, el
                    problema no es la comisión — es que no hay registro claro de quién
                    hizo qué y a qué precio.
                </p>

                <h2>El sistema de 3 números</h2>
                <p>
                    Cada orden tiene 3 números que importan para comisiones:
                </p>
                <ul>
                    <li>
                        <strong>Mano de obra</strong> — lo que cobras por el servicio.
                        ESTE es el número sobre el que se calcula la comisión del
                        mecánico.
                    </li>
                    <li>
                        <strong>Refacciones</strong> — lo que cobras por partes. NO entra
                        en la comisión del mecánico (es tuyo o de quien las consiguió).
                    </li>
                    <li>
                        <strong>Costo de refacción</strong> — lo que pagaste. Tu margen
                        real.
                    </li>
                </ul>
                <p>
                    Si tu mecánico cobra 40% y hizo una afinación mayor de $1,200 con
                    $300 de refacciones, su pago es <strong>$480</strong> (40% de $1,200),
                    no $600 (40% de $1,500).
                </p>

                <h2>Cómo lo registra MotoPartes</h2>
                <p>
                    Cada mecánico tiene un porcentaje configurado en su perfil. Al
                    cerrar una orden, el sistema calcula automáticamente:
                </p>
                <pre>
{`comisión = Σ(mano_obra_servicios) × porcentaje_mecánico`}
                </pre>
                <p>
                    Al final del mes, en la pantalla <em>Mis Ganancias</em>, el mecánico
                    ve cada orden donde participó, el monto y el total. Cero discusiones.
                </p>

                <h2>Múltiples mecánicos por orden</h2>
                <p>
                    Si una orden la tocaron 2 mecánicos (el master que diagnosticó y el
                    auxiliar que hizo la chamba), defines quién recibe la comisión al
                    cerrar. El Plan Pro te permite repartirla 50/50, 70/30 o como
                    acuerden.
                </p>

                <h2>Adelantos y descuentos</h2>
                <p>
                    ¿Le prestaste $500 al mecánico el martes? Registra el adelanto y el
                    sistema lo resta del pago final. Igual con herramientas compradas
                    para él, multas por retardos o bonos por órdenes completadas a
                    tiempo.
                </p>

                <h2>El día de pago</h2>
                <p>
                    Imprime (o manda por WhatsApp) el desglose por mecánico con: número
                    de orden, cliente, servicio, tu precio, su comisión. El mecánico
                    firma al recibir. En MotoPartes todo esto queda en el historial de
                    la orden — si hay dudas, vuelven a verlo sin discutir.
                </p>
                <p>
                    La verdad incómoda: los talleres que pelean con su equipo cada
                    quincena NO tienen un problema de dinero. Tienen un problema de
                    transparencia. Haz visible el cálculo y las peleas desaparecen.
                </p>
            </>
        ),
    },
    {
        slug: 'de-la-libreta-al-whatsapp',
        title: 'De la libreta al WhatsApp: cómo un taller real cambió en 2 semanas',
        excerpt:
            'Hace un año el taller MotoPartes llevaba órdenes en libreta. Hoy mueve 60+ órdenes al mes sin perder una sola moto. Esto es lo que cambió.',
        author: 'Equipo MotoPartes',
        publishedAt: '2026-04-02',
        readMinutes: 7,
        tags: ['historia', 'caso real', 'transformación'],
        body: () => (
            <>
                <p>
                    Si entras al taller MotoPartes hoy, lo primero que vas a notar es lo
                    que <em>no</em> vas a ver: libretas con hojas arrugadas, hojas sueltas
                    de cotización, notas adhesivas en el refrigerador con teléfonos
                    incompletos. Nada de eso existe ya.
                </p>

                <h2>Antes: 8 libretas rotando</h2>
                <p>
                    Hasta mediados de 2025, el taller llevaba las órdenes igual que la
                    mayoría: una libreta para clientes, otra para pagos, otra para
                    refacciones compradas, otra para comisiones del mecánico. 8 libretas
                    en rotación. Tiempo promedio buscando una orden vieja de un cliente:
                    12 minutos. Veces al mes que se perdía una moto porque nadie recordaba
                    a qué cliente le pertenecía: al menos 2.
                </p>

                <h2>El disparador</h2>
                <p>
                    Un cliente llamó enojado: su moto llevaba 3 días "lista" y nadie le
                    había avisado. Estaba en el taller, terminada, en un rincón. El
                    mecánico asumió que el admin ya había avisado; el admin asumió que
                    el mecánico le había marcado al cliente. La moto se entregó, pero el
                    cliente nunca regresó — $6,000 al año perdidos.
                </p>

                <h2>La migración</h2>
                <p>
                    Dos semanas de setup:
                </p>
                <ul>
                    <li>
                        <strong>Semana 1:</strong> cargar catálogo de servicios, inventario
                        de refacciones base, todos los clientes activos del último año.
                        Capacitar al mecánico (2 horas en total).
                    </li>
                    <li>
                        <strong>Semana 2:</strong> paralelo. Libreta Y sistema al mismo
                        tiempo. Al final de la semana se comparaban los dos. Cuando el
                        sistema empezó a ganarle a la libreta en velocidad y en no
                        perder datos, la libreta fue al cajón.
                    </li>
                </ul>

                <h2>El cambio medible</h2>
                <ul>
                    <li>Órdenes/mes: de 35 promedio a <strong>60+</strong>.</li>
                    <li>
                        Clientes que regresan: de 40% a <strong>68%</strong>. Los
                        recordatorios automáticos por WhatsApp hicieron la diferencia.
                    </li>
                    <li>
                        Tiempo buscando una orden vieja: de 12 min a <strong>8 segundos</strong>.
                    </li>
                    <li>
                        Peleas con el mecánico por la quincena: de 2-3 al mes a <strong>cero</strong>.
                    </li>
                </ul>

                <h2>Lo que aprendieron (y lo que puedes copiarles)</h2>
                <p>
                    <strong>1. No intentes migrar todo de un día:</strong> usa 1 semana
                    en paralelo para que el equipo gane confianza.
                </p>
                <p>
                    <strong>2. Carga SOLO los clientes del último año</strong> — los
                    demás migran solos cuando vuelven.
                </p>
                <p>
                    <strong>3. Activa las automatizaciones poco a poco:</strong> empieza
                    con "Lista para recoger" y "Recordatorio 24h". Las demás cuando
                    domines esas.
                </p>
                <p>
                    <strong>4. Haz que el mecánico vea sus ganancias en vivo.</strong>
                    Cuando ve su comisión acumulándose en tiempo real, trabaja más
                    rápido y con más cuidado.
                </p>

                <p>
                    Si tu taller hoy sigue en libreta, no es cuestión de si vas a cambiar
                    — es cuestión de cuánto dinero más vas a dejar en la mesa antes de
                    hacerlo.
                </p>
            </>
        ),
    },
    {
        slug: 'checklist-recepcion-moto',
        title: 'Checklist de recepción: 12 puntos que te ahorran reclamos',
        excerpt:
            'Documenta lo que recibes y te ahorras el 90% de los reclamos post-servicio. Este es el checklist que seguimos en cada ingreso.',
        author: 'Equipo MotoPartes',
        publishedAt: '2026-04-12',
        readMinutes: 4,
        tags: ['operación', 'procesos', 'checklist'],
        body: () => (
            <>
                <p>
                    "Mi moto llegó sin ese rayón." "El espejo estaba, no se dónde quedó."
                    "Le faltó el llavero." Cada reclamo de estos cuesta 1-2 horas de
                    gestión + pérdida de confianza. La solución no es discutir — es
                    documentar todo en el ingreso.
                </p>

                <h2>Los 12 puntos</h2>
                <ol>
                    <li>Foto frontal completa de la moto</li>
                    <li>Foto lateral derecha</li>
                    <li>Foto lateral izquierda</li>
                    <li>Foto trasera</li>
                    <li>Kilometraje del odómetro (foto cercana)</li>
                    <li>Nivel de gasolina (foto)</li>
                    <li>Espejos (ambos, foto)</li>
                    <li>Asiento y parrilla (foto)</li>
                    <li>Rayones o golpes existentes (fotos individuales)</li>
                    <li>Accesorios instalados (alarma, luces, GPS)</li>
                    <li>Objetos en la moto (casco, guantes, llavero) — listar</li>
                    <li>Firma del cliente aprobando la foto-entrega</li>
                </ol>

                <h2>Cómo lo hacemos en MotoPartes</h2>
                <p>
                    Al crear la orden nueva, el sistema te pide las fotos en una pantalla
                    única. Pasas las 4 fotos principales en 30 segundos desde el celular.
                    El cliente firma directo en el celular antes de irse. Todo queda en
                    la orden.
                </p>
                <p>
                    Si al final hay un reclamo, abres la orden, muestras la foto del
                    ingreso. Caso cerrado en 2 minutos.
                </p>

                <h2>El beneficio inesperado</h2>
                <p>
                    Además de resolver reclamos, estas fotos te sirven para la foto
                    "antes y después" que mandas por WhatsApp al cliente con el PDF de
                    la orden. Es la diferencia entre "ya quedó tu moto" y "aquí está
                    cómo la recibimos vs cómo te la entregamos". El segundo genera
                    recomendaciones.
                </p>
            </>
        ),
    },
    {
        slug: 'cotizacion-que-convierte',
        title: 'Cómo hacer una cotización que realmente convierte',
        excerpt:
            'El 40% de las cotizaciones se pierden no por el precio sino por cómo se presentan. 7 reglas para cerrar más órdenes.',
        author: 'Equipo MotoPartes',
        publishedAt: '2026-04-17',
        readMinutes: 5,
        tags: ['ventas', 'cotización', 'conversión'],
        body: () => (
            <>
                <p>
                    Un taller hace 20 cotizaciones a la semana y cierra 8. Otro hace 20
                    y cierra 14. El servicio es el mismo, el precio parecido, la zona
                    la misma. La diferencia: cómo cotizan.
                </p>

                <h2>Regla 1: Responde antes de 15 minutos</h2>
                <p>
                    Si tardas más de 30 minutos en enviar la cotización, la tasa de
                    cierre cae a la mitad. El cliente ya preguntó en otros 3 lugares y
                    eligió al primero que respondió con claridad.
                </p>

                <h2>Regla 2: PDF, no texto en WhatsApp</h2>
                <p>
                    Un PDF con logo, fecha, datos del cliente, desglose y total se ve
                    profesional. Un mensaje de texto "son 1200 de afinación" se ve
                    improvisado. MotoPartes genera el PDF con tu logo en 3 clics.
                </p>

                <h2>Regla 3: Desglosa, no totalices</h2>
                <p>
                    "$1,500" genera 2 segundos de análisis antes de "déjame pensarlo".
                    "$600 mano de obra + $450 refacciones + $300 filtros + $150 IVA" el
                    cliente entiende qué paga y acepta más rápido. Justifica cada peso.
                </p>

                <h2>Regla 4: Vigencia explícita</h2>
                <p>
                    "Esta cotización es válida por 48 horas" mueve al cliente a decidir.
                    Sin vigencia, la cotización se vuelve wallpaper.
                </p>

                <h2>Regla 5: Da 2 opciones</h2>
                <p>
                    Si cotizas balatas, ofrece "$550 (marca genérica, 6-8 meses)" y
                    "$750 (marca premium, 14-18 meses)". Siempre se elige una — rara
                    vez se rechazan las dos.
                </p>

                <h2>Regla 6: Foto del problema</h2>
                <p>
                    Cuando cotizas una reparación (no mantenimiento), adjunta la foto de
                    lo que encontraste. "Esta es la balata que hay que cambiar" junto
                    con el precio baja la objeción del 50% al 10%.
                </p>

                <h2>Regla 7: Un solo seguimiento, claro</h2>
                <p>
                    24 horas después: "Hola Juan, te mandé el presupuesto de tu Vento.
                    ¿Seguimos con ese plan o quieres que ajustemos?" Una sola vez. Más
                    es acosar; menos es desaparecer.
                </p>

                <p>
                    En MotoPartes, las automatizaciones te envían el recordatorio 24h
                    después por ti si el cliente no contestó. Cierras más, trabajas
                    menos.
                </p>
            </>
        ),
    },
];

export function getPost(slug) {
    return POSTS.find((p) => p.slug === slug) || null;
}
