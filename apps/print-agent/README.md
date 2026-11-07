# Agente de impresión de MotoPartes (Windows)

Es un programa pequeño que se queda en la laptop del taller, **conectado a la impresora de tickets**.
Cada 3 segundos le pregunta a MotoPartes si hay un ticket por imprimir; si hay, lo imprime solo.
Nadie tiene que apretar nada en la laptop.

```
Celular o tablet  →  MotoPartes (internet)  →  Laptop del taller (este programa)  →  Impresora
 (marcan "Imprimir")                              pregunta cada 3 segundos            sale el ticket
```

**Qué necesitas**

- Una laptop o PC con **Windows 10 u 11**, con internet, que se quede **prendida** en horario de taller.
- La impresora de tickets conectada por **USB** (también sirve por cable de red).
- El rollo de papel de 80 mm.

> No hay que dejar abierto ningún programa: después de instalarlo, arranca solo cada vez que
> la laptop se enciende y entras a Windows.

## La forma más fácil: el `.exe` (no hay que instalar Node)

Se genera una carpeta lista para copiar a la laptop (`MotoPartes-Impresion.zip`) con **un solo programa**
(`MotoPartes-Impresion.exe`) y sus instaladores. Dentro trae su propia guía (`LEEME.txt`). Resumen:

1. Copia la carpeta a la laptop (por ejemplo `C:\MotoPartes\Impresion`).
2. En MotoPartes → **Impresión** → **Generar clave** y cópiala.
3. Doble clic en **`INSTALAR.bat`**, pega la clave, elige la impresora y confirma la prueba.

Cómo se genera (en tu computadora de desarrollo, Node 22+):

```
cd apps/print-agent/build
npm install          (solo la primera vez)
npm run build        → build/dist/MotoPartes-Impresion.zip
```

> El `.exe` no tiene firma digital: la primera vez Windows puede mostrar "Windows protegió su PC".
> Presiona **Más información → Ejecutar de todas formas**.

Comandos del `.exe`: `setup`, `run`, `test-print`, `check`, `autostart`, `autostart-off`, `version`.

Si prefieres no usar el `.exe`, la instalación con Node.js sigue abajo.

---

## Instalación (una sola vez, ~10 minutos)

### Paso 1 · Instala Node.js
Node.js es lo que hace funcionar el programa.

1. Entra a <https://nodejs.org/es/download> y baja la versión **LTS**.
2. Ábrelo y presiona **Siguiente** hasta terminar (no cambies nada).

> Si no lo instalas, no pasa nada: el paso 4 te avisa y te abre esta página.

### Paso 2 · Conecta la impresora en Windows
1. Conéctala por USB y enciéndela.
2. Windows normalmente la detecta sola. Mira en **Configuración → Bluetooth y dispositivos → Impresoras y escáneres**:
   debe aparecer con algún nombre (por ejemplo `POS-80` o `Hostech`).
3. **Si no aparece:** instala el controlador que venga con la impresora (CD, o la página del fabricante). Si no
   tiene controlador:
   - **Agregar dispositivo → "Agregar manualmente" → "Agregar una impresora local"**.
   - Puerto: **USB001** (o el USB que te ofrezca).
   - Fabricante: **Generic**  ·  Impresora: **Generic / Text Only**.
   - Ponle un nombre fácil, por ejemplo `Tickets`.

### Paso 3 · Copia esta carpeta a la laptop
Copia toda la carpeta `print-agent` a un lugar fijo, por ejemplo `C:\MotoPartes\print-agent`.
(No la borres ni la cambies de lugar después.)

### Paso 4 · Genera tu clave en MotoPartes
1. Entra a MotoPartes con tu usuario de administrador.
2. Ve a **Impresión** y presiona **Generar clave**.
3. **Copia la clave** (empieza con `mpp_`). Solo se muestra una vez; si la pierdes, genera otra.

### Paso 5 · Instala el agente
1. En la carpeta, haz **doble clic en `INSTALAR.bat`**.
2. Contesta lo que te pregunte (casi todo ya viene listo):
   - **Dirección de MotoPartes:** presiona Enter.
   - **Clave:** pega la clave del paso 4 (clic derecho para pegar) y Enter.
   - **Impresora:** elige **1 (USB)** y escribe el **número** de tu impresora en la lista.
   - **Prueba:** deja que imprima la página de prueba y contesta `s` si salió.
3. Al final dirá **LISTO**. Ya puedes cerrar la ventana: el agente sigue funcionando.

### ¿Cómo sé que quedó bien?
- En MotoPartes → **Impresión** debe aparecer **"Conectado"** en verde.
- Presiona **Imprimir prueba** en esa pantalla: debe salir un ticket.
- Abre una orden y presiona **Imprimir ticket**.

---

## Uso diario
No hay nada que hacer. Solo mantén la laptop **prendida, con internet y con papel en la impresora**.
Si la laptop se apaga o se va el internet, **los tickets no se pierden**: esperan y salen cuando todo regrese.

### Que la laptop no se duerma
Si la laptop se suspende, deja de imprimir.

- **Configuración → Sistema → Inicio/apagado y batería (Energía) →** "Pantalla y suspensión": pon **Nunca** en suspender
  cuando está conectada a la corriente.
- Si es laptop y cierras la tapa: **Panel de control → Opciones de energía → "Elegir el comportamiento del cierre de la tapa"**
  → "Al cerrar la tapa": **No hacer nada**.

---

## Si no imprime

| Qué pasa | Qué hacer |
|---|---|
| En MotoPartes dice **"Sin conexión"** | La laptop está apagada, dormida o sin internet. Enciéndela / revisa el internet. En 10 segundos debe volver a "Conectado". |
| Dice **Conectado** pero no sale el ticket | Revisa que la impresora esté **encendida**, con **papel** y la **tapa cerrada**. Luego haz doble clic en `PROBAR-IMPRESORA.bat`. |
| `PROBAR-IMPRESORA.bat` dice "No existe una impresora llamada…" | El nombre cambió en Windows. Ejecuta `INSTALAR.bat` de nuevo y elige la impresora otra vez. |
| Salen símbolos raros en vez de letras | En MotoPartes → **Impresión**, desactiva **"Usar acentos"**. |
| El ticket sale cortado o muy angosto | En MotoPartes → **Impresión**, revisa el **ancho del papel** (80 mm = 48 columnas, 58 mm = 32). |
| El panel dice **"Clave inválida o revocada"** | Genera una **clave nueva** en MotoPartes y ejecuta `INSTALAR.bat` otra vez. |
| Quieres ver qué pasó | Abre `logs\agente.log` (se puede abrir con el Bloc de notas). |

Si cambiaste de laptop o impresora: vuelve a ejecutar `INSTALAR.bat` en la nueva.

---

## Archivos de esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `INSTALAR.bat` | Instala y configura todo (doble clic). |
| `PROBAR-IMPRESORA.bat` | Imprime una página de prueba. |
| `INICIAR.bat` | Arranca el agente a mano, con ventana (por si no quieres el inicio automático). |
| `DESINSTALAR.bat` | Quita el inicio automático y detiene el agente. |
| `config.json` | Tu configuración (se crea al instalar; **no lo compartas**, contiene la clave). |
| `logs\agente.log` | Registro de lo que hace el agente. |

---

## Para quien quiera saber cómo funciona (técnico)

- **Sin dependencias**: solo Node.js ≥ 18 y módulos integrados. ES modules.
- **Contrato con la API**: ver `docs/IMPRESION-CONTRATO.md`. El agente hace
  `GET /api/print-agent/poll` (latido + reclama trabajo) y `POST /api/print-agent/jobs/:id/result`,
  autenticado con el header `x-print-key`.
- **Modos de salida** (`config.json → mode`):
  - `usb`: manda los bytes ESC/POS **RAW** a la cola de impresión de Windows (`raw-print.ps1`, usa `winspool.drv`);
    no depende del controlador gráfico.
  - `network`: socket TCP a `host:port` (9100 por defecto) para impresoras con cable de red.
  - `file`: guarda cada ticket como `.bin` en `salida\` (pruebas sin impresora).
- **Confiabilidad**
  - Sin internet: espera creciente (6 s, 12 s, 24 s… máx. 30 s) y vuelve a 3 s al recuperarse.
  - Clave inválida/revocada (401): lo registra y reintenta cada 30 s.
  - Nunca imprime un trabajo dos veces (recuerda los ids; si una copia falló a la mitad, el reintento solo imprime las que faltan).
  - Si falla el aviso de resultado, lo reintenta **sin reimprimir**.
  - Instancia única (`agent.lock`), cierre limpio con Ctrl+C, registro con rotación (`logs\`).
- **config.json**

  ```json
  {
      "apiUrl": "https://motopartes.cloud",
      "key": "mpp_…",
      "mode": "usb",
      "printerName": "Tickets",
      "host": "",
      "port": 9100,
      "outputDir": "salida",
      "pollMs": 3000
  }
  ```

- **Línea de comandos**: `node agent.js [--test-print | --check | --version] [--config RUTA]`.
  Códigos de salida: `0` bien · `1` configuración incorrecta · `3` ya hay otro agente.
- **Pruebas**: `npm test` (servidor falso del contrato, modo `file`, sin impresoras reales ni internet).
