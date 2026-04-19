// Casos de estudio. Mismo patrón que blog/posts.jsx.

export const CASES = [
    {
        slug: 'motopartes',
        shopName: 'Taller MotoPartes',
        city: 'México',
        planCode: 'flagship',
        hero: 'El taller que construyó la plataforma que hoy usas.',
        summary:
            'De 35 órdenes/mes en libreta a 60+ órdenes/mes 100% digitales, 0 motos perdidas, 0 peleas por comisiones.',
        metrics: [
            { label: 'Órdenes/mes', before: '35', after: '60+' },
            { label: 'Retorno de clientes', before: '40%', after: '68%' },
            { label: 'Tiempo buscar orden vieja', before: '12 min', after: '8 seg' },
            { label: 'Peleas por comisiones/mes', before: '2-3', after: '0' },
        ],
        body: () => (
            <>
                <p>
                    MotoPartes (el taller) es un taller mecánico de motos que opera en la
                    Ciudad de México desde hace más de 7 años. Especializado en
                    reparaciones, modificaciones y mantenimiento preventivo, atiende
                    clientes particulares y motociclistas de aplicaciones de entrega.
                </p>

                <h2>El problema de 2025</h2>
                <p>
                    Hasta mediados de 2025, el taller operaba con 8 libretas rotando:
                    órdenes, pagos, refacciones compradas, comisiones de mecánicos,
                    inventario... todo en papel. Cada pelea con un mecánico por la
                    quincena era porque la libreta no cuadraba con lo que el mecánico
                    recordaba. Cada reclamo de cliente por una pieza faltante era una
                    discusión sin foto que demostrara el ingreso.
                </p>
                <p>
                    El punto de quiebre: un cliente perdió la confianza porque su moto
                    estuvo lista 3 días en el taller sin que nadie le avisara. Esa moto
                    no regresó, y llevó a 2 clientes más con ella.
                </p>

                <h2>La decisión de construir MotoPartes (el producto)</h2>
                <p>
                    El dueño se cansó de probar apps genéricas que no entendían cómo
                    funciona un taller de motos específicamente (no de autos, no de un
                    concesionario). Junto con un desarrollador, empezaron a construir
                    MotoPartes sobre la base real del taller: cada flujo del producto
                    existe porque primero fue un problema en el taller.
                </p>

                <h2>La migración (2 semanas)</h2>
                <p>
                    Semana 1 — carga de datos: catálogo de servicios, clientes activos
                    del último año, inventario base de refacciones. Capacitación de
                    equipo: 2 horas.
                </p>
                <p>
                    Semana 2 — paralelo: libreta y sistema al mismo tiempo, comparando
                    al cierre del día. Cuando el sistema ganó en velocidad y confianza,
                    la libreta se archivó.
                </p>

                <h2>Los números después de 9 meses</h2>
                <ul>
                    <li>60+ órdenes al mes (antes: 35).</li>
                    <li>68% de clientes regresan para un segundo servicio (antes: 40%).</li>
                    <li>Tiempo buscando órdenes viejas: 8 segundos (antes: 12 min).</li>
                    <li>Peleas por comisiones con mecánicos: 0 (antes: 2-3/mes).</li>
                    <li>Motos olvidadas/perdidas: 0 (antes: 2/mes).</li>
                </ul>

                <h2>Lo que usan más del producto</h2>
                <ul>
                    <li>
                        <strong>Automatización "Lista para recoger"</strong>: dispara
                        WhatsApp automático al cliente cuando la orden cambia a "lista".
                        Cortó en 80% las motos olvidadas.
                    </li>
                    <li>
                        <strong>Fotos antes/después</strong>: documentan cada ingreso y
                        entrega. Los reclamos por piezas cayeron a cero.
                    </li>
                    <li>
                        <strong>Comisiones por mecánico</strong>: cada mecánico ve en
                        tiempo real sus ganancias. Quincenas sin peleas.
                    </li>
                    <li>
                        <strong>Portal del cliente</strong>: el cliente abre un link y ve
                        el avance de su moto sin escribir al taller. Menos interrupciones.
                    </li>
                </ul>

                <h2>Qué viene</h2>
                <p>
                    El taller está probando las nuevas integraciones: sincronización con
                    Google Calendar para que las citas entren al calendario del cliente,
                    y el programa de referidos partner — como cualquier taller que
                    recomiende MotoPartes recibe 30% vitalicio (condición especial por
                    ser el taller fundador).
                </p>
            </>
        ),
    },
];

export function getCase(slug) {
    return CASES.find((c) => c.slug === slug) || null;
}
