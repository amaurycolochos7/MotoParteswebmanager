// ============================================================================
// MotoPartes Questions — definición estática del cuestionario
// ----------------------------------------------------------------------------
// Fuente única de verdad de las secciones y preguntas. El frontend la consume
// vía GET /api/questions/form. Las RESPUESTAS sí se persisten en la base de
// datos (modelos SurveyParticipant / SurveyAnswer).
//
// Convenciones:
//   type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TEXT' | 'LONG_TEXT' | 'NUMBER'
//         | 'BOOLEAN' | 'SORTABLE_LIST'
//   options: string[] (para SINGLE/MULTI/SORTABLE)
//   allowOther: true  → la opción "Otro, explicar" habilita un texto libre que
//                       se guarda en answer_text.
//   followupKey/followupLabel/followupType → "Campo adicional" que se guarda
//                       como una pregunta propia (question_key = followupKey).
//
// Si cambias preguntas/keys, sube SURVEY_VERSION para mantener trazabilidad.
// ============================================================================

export const SURVEY_VERSION = '2026-06-29.1';

export const SURVEY_INTRO =
  'Contesta según cómo trabajas realmente hoy en el taller.\n\n' +
  'No respondas pensando en cómo debería funcionar el sistema ideal. Responde con lo que haces en la práctica cuando llega un cliente, cuando registras una moto, cuando creas una orden, cuando cobras y cuando entregas el trabajo.\n\n' +
  'Si una opción no coincide exactamente, selecciona “Otro” y explica.';

export const PARTICIPANT_INSTRUCTION =
  'Contesta según cómo trabajas realmente hoy en el taller. No respondas pensando en cómo debería ser el sistema ideal, sino en lo que haces en la práctica.';

const OTHER = 'Otro, explicar';

export const SECTIONS = [
  {
    key: 'perfil',
    title: 'Perfil del participante',
    questions: [
      { key: 'q1', type: 'SINGLE_CHOICE', required: true,
        label: '¿Quién está contestando?',
        options: ['ELIHU', 'MACIEL'] },
      { key: 'q2', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Cuál es tu función principal en el taller?',
        options: ['Atiendo clientes', 'Recibo motos', 'Creo órdenes', 'Hago diagnósticos', 'Hago reparaciones', 'Cobro trabajos', 'Superviso auxiliares', 'Reviso ganancias o comisiones', 'Envío mensajes al cliente', OTHER],
        followupKey: 'q2_detail', followupType: 'LONG_TEXT', followupRequired: false,
        followupLabel: 'Explica brevemente qué haces normalmente en el taller.' },
      { key: 'q3', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Con qué frecuencia usas MotoPartes?',
        options: ['Todos los días', 'Varias veces por semana', 'Solo cuando entra una moto', 'Solo para revisar órdenes', 'Casi no lo uso', OTHER] },
      { key: 'q4', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Desde dónde usas más el sistema?',
        options: ['Celular', 'Computadora', 'Tablet', 'Combinado', OTHER] },
    ],
  },
  {
    key: 'flujo',
    title: 'Flujo real cuando llega un cliente',
    questions: [
      { key: 'q5', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: 'Cuando llega un cliente con una moto, ¿qué haces primero?',
        options: ['Registro al cliente', 'Busco si el cliente ya existe', 'Reviso la moto primero', 'Creo una orden directamente', 'Hago una cotización primero', 'Le pregunto la falla', 'Tomo fotos', 'No sigo siempre el mismo orden', OTHER] },
      { key: 'q6', type: 'SORTABLE_LIST', required: true,
        label: 'Ordena los pasos como normalmente los haces.',
        helpText: 'Arrastra o usa las flechas para dejarlos en el orden real en que los haces.',
        options: ['Buscar o registrar cliente', 'Registrar moto', 'Preguntar falla', 'Revisar moto', 'Tomar fotos', 'Crear orden', 'Agregar servicio o costo', 'Pedir anticipo', 'Mandar WhatsApp', 'Entregar comprobante'] },
      { key: 'q7', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿En qué momento creas la orden?',
        options: ['Apenas llega el cliente', 'Después de revisar la moto', 'Después de hacer diagnóstico', 'Después de confirmar precio con el cliente', 'Hasta que el cliente deja anticipo', 'A veces no creo orden', OTHER] },
      { key: 'q8', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué parte del proceso actual te causa más problema?',
        options: ['Registrar cliente', 'Registrar moto', 'Buscar cliente existente', 'Crear orden', 'Agregar servicios', 'Agregar costos', 'Tomar fotos', 'Cobrar anticipo', 'Registrar pago', 'Cambiar estado', 'Enviar WhatsApp', 'Generar PDF', 'Ver ganancias', 'Ninguna', OTHER],
        followupKey: 'q8_detail', followupType: 'LONG_TEXT', followupRequired: false,
        followupLabel: 'Explica el problema principal.' },
    ],
  },
  {
    key: 'clientes',
    title: 'Registro de clientes',
    questions: [
      { key: 'q9', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué datos del cliente deben ser obligatorios?',
        options: ['Nombre completo', 'Teléfono', 'WhatsApp', 'Dirección', 'Correo', 'RFC / datos fiscales', 'Notas del cliente', 'Ninguno, debe ser rápido', OTHER] },
      { key: 'q10', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿El teléfono debe ser obligatorio?',
        options: ['Sí, siempre', 'No, a veces no lo tenemos', 'Solo si se enviará WhatsApp', OTHER] },
      { key: 'q11', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Cómo buscas normalmente a un cliente?',
        options: ['Por nombre', 'Por teléfono', 'Por placas', 'Por moto', 'Por historial', 'Casi nunca busco, lo registro de nuevo', OTHER] },
      { key: 'q12', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Qué debería pasar si el cliente ya existe?',
        options: ['El sistema debe avisarme y no duplicarlo', 'El sistema debe mostrarme su historial', 'El sistema debe dejarme actualizar sus datos', 'No importa si se duplica', OTHER] },
      { key: 'q13', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitas ver historial del cliente antes de crear una nueva orden?',
        options: ['Sí, siempre', 'Sí, pero solo si ha venido antes', 'No, no es necesario', 'Solo cuando hay garantía o reclamo', OTHER] },
    ],
  },
  {
    key: 'motos',
    title: 'Registro de motos',
    questions: [
      { key: 'q14', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué datos de la moto deben ser obligatorios?',
        options: ['Marca', 'Modelo', 'Año', 'Color', 'Placas', 'Kilometraje', 'Número de serie / VIN', 'Nivel de gasolina', 'Fotos', 'Notas', OTHER] },
      { key: 'q15', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Una misma persona puede tener varias motos registradas?',
        options: ['Sí', 'No', 'No sé', OTHER] },
      { key: 'q16', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué datos te sirven para identificar rápido la moto?',
        options: ['Marca', 'Modelo', 'Color', 'Placas', 'Foto', 'Nombre del cliente', 'Número de serie', OTHER] },
      { key: 'q17', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan registrar accesorios o condiciones con las que entra la moto?',
        options: ['Casco', 'Caja', 'Parrilla', 'Espejos', 'Documentos', 'Herramientas', 'Nivel de gasolina', 'Daños visibles', 'No es necesario', OTHER] },
    ],
  },
  {
    key: 'ordenes',
    title: 'Creación de orden de servicio',
    questions: [
      { key: 'q18', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué datos deben ser obligatorios para poder guardar una orden?',
        options: ['Cliente', 'Moto', 'Falla reportada', 'Diagnóstico', 'Servicio a realizar', 'Costo de mano de obra', 'Costo de refacciones', 'Anticipo', 'Fecha prometida de entrega', 'Fotos de ingreso', 'Mecánico asignado', 'Ninguno, debe dejar guardar rápido', OTHER] },
      { key: 'q19', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Prefieres que la orden se pueda guardar rápido y completarla después?',
        options: ['Sí, guardar rápido y completar después', 'No, debe obligar a llenar todo', 'Depende del tipo de trabajo', OTHER] },
      { key: 'q20', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué descripción escribes normalmente en la orden?',
        options: ['La falla que dice el cliente', 'El diagnóstico del mecánico', 'El servicio que se hará', 'Las refacciones que se usarán', 'El precio acordado', 'Observaciones internas', 'Casi no escribo descripción', OTHER],
        followupKey: 'q20_example', followupType: 'LONG_TEXT', followupRequired: false,
        followupLabel: 'Escribe un ejemplo real de cómo describirías una orden.' },
      { key: 'q21', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitas una fecha prometida de entrega?',
        options: ['Sí, siempre', 'Sí, pero opcional', 'No, no la usamos', 'Solo para trabajos grandes', OTHER] },
      { key: 'q22', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién debe poder crear órdenes?',
        options: ['Dueño', 'Mecánico maestro', 'Mecánico normal', 'Auxiliar', 'Recepción', 'Cualquier usuario del taller', OTHER] },
    ],
  },
  {
    key: 'fotos',
    title: 'Fotos y evidencia',
    questions: [
      { key: 'q23', type: 'SINGLE_CHOICE', required: true,
        label: '¿Tomas fotos cuando recibes una moto?',
        options: ['Sí, siempre', 'A veces', 'Solo si tiene daños', 'Solo en trabajos grandes', 'No'] },
      { key: 'q24', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué fotos deberían tomarse?',
        options: ['Frente', 'Parte trasera', 'Lado izquierdo', 'Lado derecho', 'Tablero / kilometraje', 'Placas', 'Daños visibles', 'Refacciones dañadas', 'No necesitamos fotos', OTHER] },
      { key: 'q25', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Las fotos deben guardarse en el sistema permanentemente?',
        options: ['Sí, son evidencia importante', 'Sí, pero solo por cierto tiempo', 'No, solo sirven al momento', 'No usamos fotos', OTHER] },
      { key: 'q26', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Las fotos deben aparecer en el PDF o comprobante?',
        options: ['Sí', 'No', 'Solo algunas', 'Solo si el cliente las pide', OTHER] },
      { key: 'q27', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Para qué usan las fotos principalmente?',
        options: ['Evidencia de daños', 'Mostrar avance al cliente', 'Evitar reclamos', 'Recordar cómo llegó la moto', 'Comprobar kilometraje', 'No las usamos', OTHER] },
    ],
  },
  {
    key: 'estados',
    title: 'Estados de la orden',
    questions: [
      { key: 'q28', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué estados usan realmente en el taller?',
        options: ['Recibida', 'Diagnóstico', 'Cotización', 'En proceso', 'Esperando refacción', 'Esperando autorización del cliente', 'Lista', 'Entregada', 'Cancelada', 'Garantía', OTHER] },
      { key: 'q29', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Cuál debería ser el primer estado de una orden nueva?',
        options: ['Recibida', 'Diagnóstico', 'Cotización', 'En proceso', 'Pendiente', OTHER] },
      { key: 'q30', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Qué estado debe indicar que la moto ya puede recogerse?',
        options: ['Lista', 'Terminada', 'Por entregar', 'Entregada', OTHER] },
      { key: 'q31', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿El cliente debe recibir WhatsApp cuando cambia el estado?',
        options: ['Sí, en todos los cambios', 'Solo cuando se crea la orden', 'Solo cuando está lista', 'Solo cuando se entrega', 'No', OTHER] },
      { key: 'q32', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién puede cambiar el estado de una orden?',
        options: ['Dueño', 'Mecánico maestro', 'Mecánico asignado', 'Auxiliar', 'Recepción', 'Cualquier usuario', OTHER] },
    ],
  },
  {
    key: 'servicios',
    title: 'Servicios, mano de obra y refacciones',
    questions: [
      { key: 'q33', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Cómo agregas normalmente los servicios?',
        options: ['Escribo el servicio manualmente', 'Lo elijo de un catálogo', 'Solo escribo una descripción general', 'Lo agrego después de revisar la moto', 'No lo registro bien actualmente', OTHER] },
      { key: 'q34', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan catálogo de servicios con precios?',
        options: ['Sí, sería útil', 'No, cada trabajo cambia mucho', 'Tal vez, pero editable', 'Solo para servicios comunes', OTHER] },
      { key: 'q35', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Deben separarse mano de obra y refacciones?',
        options: ['Sí, siempre', 'No, puede ir todo junto', 'Solo para reportes internos', 'Solo cuando el cliente lo pida', OTHER] },
      { key: 'q36', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan registrar costo interno y precio al cliente?',
        options: ['Sí, para saber ganancia', 'No, solo precio final', 'Solo en refacciones', 'Solo en mano de obra', OTHER] },
      { key: 'q37', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién puede modificar precios?',
        options: ['Dueño', 'Mecánico maestro', 'Mecánico normal', 'Auxiliar', 'Solo con autorización', OTHER] },
    ],
  },
  {
    key: 'pagos',
    title: 'Pagos, anticipos y saldos',
    questions: [
      { key: 'q38', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Cómo cobran normalmente?',
        options: ['Anticipo al recibir', 'Pago total al recibir', 'Pago total al entregar', 'Varios abonos', 'Transferencia', 'Efectivo', 'Tarjeta', 'Crédito / pendiente de pago', OTHER] },
      { key: 'q39', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿El sistema debe permitir varios abonos en una orden?',
        options: ['Sí, es necesario', 'No, solo anticipo y pago final', 'No usamos abonos', OTHER] },
      { key: 'q40', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan ver saldo pendiente?',
        options: ['Sí, siempre', 'Sí, pero solo si hay anticipo', 'No, no es necesario', OTHER] },
      { key: 'q41', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién puede marcar una orden como pagada?',
        options: ['Dueño', 'Mecánico maestro', 'Mecánico asignado', 'Auxiliar', 'Recepción', 'Solo quien cobra', OTHER] },
      { key: 'q42', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan recibo o comprobante de pago?',
        options: ['Sí, siempre', 'Sí, si el cliente lo pide', 'Solo por WhatsApp', 'No', OTHER] },
      { key: 'q43', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Qué pasa si el cliente no paga completo?',
        options: ['No se entrega la moto', 'Se entrega y queda saldo pendiente', 'Se registra como deuda', 'Se arregla fuera del sistema', OTHER] },
      { key: 'q44', type: 'LONG_TEXT', required: true,
        label: 'Explica cómo manejan hoy los pagos, anticipos y saldos.' },
    ],
  },
  {
    key: 'cotizaciones',
    title: 'Cotizaciones',
    questions: [
      { key: 'q45', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Usan cotizaciones antes de crear una orden?',
        options: ['Sí, siempre', 'A veces', 'Solo cuando el trabajo es caro', 'No, casi nunca', OTHER] },
      { key: 'q46', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Qué debe pasar cuando una cotización es aceptada?',
        options: ['Convertirse en orden automáticamente', 'Crear una orden nueva copiando los datos', 'Solo marcarla como aceptada', 'No usamos cotizaciones', OTHER] },
      { key: 'q47', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿El cliente debe aprobar cotizaciones por WhatsApp?',
        options: ['Sí', 'No', 'Sería útil', 'Solo en trabajos caros', OTHER] },
      { key: 'q48', type: 'LONG_TEXT', required: false,
        label: '¿Qué diferencia debería haber entre cotización y orden?' },
    ],
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp y comunicación',
    questions: [
      { key: 'q49', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué mensajes debería enviar el sistema por WhatsApp?',
        options: ['Orden creada', 'Moto en diagnóstico', 'Cotización lista', 'Cotización aprobada', 'Trabajo en proceso', 'Moto lista para recoger', 'Recordatorio para recoger', 'Comprobante de pago', 'PDF de orden', 'Promociones', 'Ninguno automático', OTHER] },
      { key: 'q50', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Quieres poder editar el mensaje antes de enviarlo?',
        options: ['Sí, siempre', 'Solo algunas veces', 'No, que se mande automático', OTHER] },
      { key: 'q51', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Quién debe mandar los mensajes?',
        options: ['El WhatsApp del taller', 'El WhatsApp del mecánico maestro', 'El WhatsApp del dueño', 'No importa', OTHER] },
      { key: 'q52', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Necesitan historial de mensajes enviados?',
        options: ['Sí', 'No', 'Solo mensajes importantes', OTHER] },
    ],
  },
  {
    key: 'maestro',
    title: 'Mecánico maestro, auxiliares y comisiones',
    questions: [
      { key: 'q53', type: 'LONG_TEXT', required: true,
        label: 'Para ti, ¿qué significa ser mecánico maestro?' },
      { key: 'q54', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué puede hacer un mecánico maestro que no debería hacer un auxiliar?',
        options: ['Crear órdenes sin aprobación', 'Aprobar órdenes', 'Cambiar precios', 'Cobrar', 'Marcar como pagado', 'Ver ganancias', 'Pagar comisiones', 'Conectar WhatsApp', 'Crear usuarios', 'Cancelar órdenes', OTHER] },
      { key: 'q55', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿El auxiliar debe poder crear órdenes directamente?',
        options: ['Sí', 'No, siempre debe pedir aprobación', 'Solo algunos auxiliares', 'Solo órdenes pequeñas', OTHER] },
      { key: 'q56', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Cómo se deben calcular las comisiones?',
        options: ['Sobre mano de obra', 'Sobre total de la orden', 'Sobre ganancia real', 'Monto fijo por trabajo', 'Depende del mecánico', 'No usamos comisiones', OTHER] },
      { key: 'q57', type: 'SINGLE_CHOICE', required: true, allowOther: true,
        label: '¿Cuándo se gana una comisión?',
        options: ['Cuando se crea la orden', 'Cuando se termina el trabajo', 'Cuando se entrega la moto', 'Cuando el cliente paga', OTHER] },
      { key: 'q58', type: 'LONG_TEXT', required: true,
        label: 'Explica cómo manejan hoy las comisiones.' },
    ],
  },
  {
    key: 'reportes',
    title: 'Reportes y panel principal',
    questions: [
      { key: 'q59', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué quieres ver al entrar al sistema?',
        options: ['Órdenes activas', 'Órdenes atrasadas', 'Motos listas', 'Pagos pendientes', 'Ventas del día', 'Ganancias de la semana', 'Comisiones pendientes', 'Citas', 'Clientes nuevos', OTHER] },
      { key: 'q60', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué reportes necesitas?',
        options: ['Ventas por día', 'Ventas por semana', 'Ventas por mes', 'Ganancia por mecánico', 'Órdenes por estado', 'Pagos pendientes', 'Comisiones pendientes', 'Servicios más comunes', 'Clientes frecuentes', 'Refacciones más usadas', OTHER] },
      { key: 'q61', type: 'LONG_TEXT', required: false,
        label: '¿Qué dato te ayudaría más para tomar decisiones?' },
    ],
  },
  {
    key: 'permisos',
    title: 'Permisos',
    questions: [
      { key: 'q62', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién puede editar clientes?',
        options: ['Dueño', 'Mecánico maestro', 'Mecánico normal', 'Auxiliar', 'Recepción', 'Nadie después de guardarlo', OTHER] },
      { key: 'q63', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Quién puede borrar clientes u órdenes?',
        options: ['Solo dueño', 'Dueño y mecánico maestro', 'Cualquier mecánico', 'Nadie debería borrar, solo cancelar', OTHER] },
      { key: 'q64', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué acciones deberían pedir autorización?',
        options: ['Borrar orden', 'Cancelar orden', 'Cambiar precio', 'Marcar como pagado', 'Dar descuento', 'Editar pago', 'Borrar cliente', 'Cambiar comisión', 'Ninguna', OTHER] },
      { key: 'q65', type: 'LONG_TEXT', required: true,
        label: '¿Qué cosas NO debería poder hacer un auxiliar?' },
    ],
  },
  {
    key: 'prioridades',
    title: 'Prioridades finales',
    questions: [
      { key: 'q66', type: 'MULTI_CHOICE', required: true, allowOther: true,
        label: '¿Qué es lo más urgente mejorar?',
        options: ['Registro de clientes', 'Registro de motos', 'Crear órdenes', 'Fotos de ingreso', 'Estados de orden', 'Pagos y saldos', 'Cotizaciones', 'WhatsApp', 'PDF / comprobantes', 'Comisiones', 'Reportes', 'Permisos', 'Inventario', OTHER] },
      { key: 'q67', type: 'LONG_TEXT', required: true,
        label: 'Si solo pudiéramos mejorar tres cosas primero, ¿cuáles serían?' },
      { key: 'q68', type: 'LONG_TEXT', required: true,
        label: '¿Qué parte del sistema actual te gusta y no quieres que se complique?' },
      { key: 'q69', type: 'LONG_TEXT', required: false,
        label: '¿Qué parte del sistema actual casi no usas?' },
      { key: 'q70', type: 'LONG_TEXT', required: true,
        label: 'Explica con tus palabras cómo debería funcionar una orden perfecta desde que llega el cliente hasta que se entrega la moto.' },
    ],
  },
];

// ── Helpers derivados (fuente única para validación, comparación y export) ──

// Lista plana de TODAS las preguntas respondibles, incluyendo los "campos
// adicionales" (followups) como preguntas propias con su question_key.
export function flatQuestions() {
  const out = [];
  for (const section of SECTIONS) {
    for (const q of section.questions) {
      out.push({
        section_key: section.key,
        section_title: section.title,
        key: q.key,
        label: q.label,
        type: q.type,
        required: !!q.required,
        allowOther: !!q.allowOther,
        options: q.options || null,
      });
      if (q.followupKey) {
        out.push({
          section_key: section.key,
          section_title: section.title,
          key: q.followupKey,
          label: q.followupLabel,
          type: q.followupType || 'TEXT',
          required: !!q.followupRequired,
          allowOther: false,
          options: null,
          isFollowup: true,
          parentKey: q.key,
        });
      }
    }
  }
  return out;
}

// Set de question_keys obligatorias — usado por el backend para validar el envío.
export function requiredQuestionKeys() {
  return flatQuestions().filter((q) => q.required).map((q) => q.key);
}

// Mapa question_key → metadata, para resolver labels al exportar/comparar.
export function questionIndex() {
  const idx = {};
  for (const q of flatQuestions()) idx[q.key] = q;
  return idx;
}

export default { SURVEY_VERSION, SURVEY_INTRO, PARTICIPANT_INSTRUCTION, SECTIONS, flatQuestions, requiredQuestionKeys, questionIndex };
