import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessagesSquare, Power, RefreshCw, Smartphone, QrCode, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { waService } from '../../lib/api';
import { Chip, Drawer } from '../../components/ui/kit';
import './WhatsAppSettings.css';

const STATE = {
  connected: { label: 'Conectado', tone: 'ok' },
  connecting: { label: 'Conectando', tone: 'warn' },
  qr: { label: 'Esperando que escanees el código', tone: 'warn' },
  disconnected: { label: 'Desconectado', tone: 'red' },
};

const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const l = d.length >= 10 ? d.slice(-10) : d;
  return l.length === 10 ? `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` : p || '';
};

/**
 * WhatsApp del taller: UN solo número para todos los mensajes automáticos y la bandeja.
 * Solo dueño/administrador pueden iniciar o cerrar la sesión.
 */
export default function WhatsAppSettings() {
  const { isManager, canViewInbox } = useAuth();
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setSt(await waService.status());
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Mientras no esté conectado, consulta cada 3 s (el QR se renueva solo); conectado, cada 15 s.
  useEffect(() => {
    clearInterval(timer.current);
    const every = st?.connected ? 15000 : 3000;
    timer.current = setInterval(() => { if (!document.hidden) refresh(); }, every);
    return () => clearInterval(timer.current);
  }, [st?.connected, refresh]);

  const start = async () => {
    setBusy(true);
    try { await waService.start(); toast.success('Iniciando WhatsApp… en unos segundos aparece el código QR'); await refresh(); }
    catch (e) { toast.error(e.message || 'No se pudo iniciar'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await waService.logout(); toast.success('Sesión cerrada. Ya puedes conectar el número nuevo.'); setConfirmOut(false); await refresh(); }
    catch (e) { toast.error(e.message || 'No se pudo cerrar la sesión'); }
    finally { setBusy(false); }
  };

  const meta = STATE[st?.state] || STATE.disconnected;

  return (
    <div className="wa k-rise">
      <header className="k-pagehead">
        <div>
          <h1>WhatsApp del taller</h1>
          <p>Un solo número para todo el taller: avisos de citas y órdenes, tickets y la bandeja de Conversaciones.</p>
        </div>
        {canViewInbox && <div className="k-pagehead__actions"><Link className="k-btn k-btn--ghost" to={isManager ? '/admin/inbox' : '/mechanic/inbox'}><MessagesSquare size={17} /> Abrir conversaciones</Link></div>}
      </header>

      {loadErr && !st && (
        <div className="k-note k-note--red"><AlertTriangle size={18} /><div>No se pudo consultar el estado. <button type="button" className="wa-link" onClick={refresh}>Reintentar</button></div></div>
      )}

      {!st && !loadErr && <div className="wa-card wa-card--load"><Loader2 className="wa-spin" size={22} /> Consultando estado…</div>}

      {st && (
        <div className="wa-grid">
          <section className="wa-card">
            <div className="wa-card__top">
              <span className={`wa-dot wa-dot--${meta.tone}`} />
              <div>
                <p className="wa-eyebrow">Estado</p>
                <h2>{meta.label}</h2>
              </div>
              <Chip tone={meta.tone}>{st.connected ? 'En línea' : 'Sin conexión'}</Chip>
            </div>

            {st.connected ? (
              <>
                <div className="wa-number">
                  <Smartphone size={22} />
                  <div>
                    <span>Número conectado</span>
                    <b className="mono">{fmtPhone(st.phone_number) || 'Sin dato'}</b>
                  </div>
                </div>
                {st.connected_at && <p className="wa-sub">Conectado desde {new Date(st.connected_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
                <div className="k-note k-note--ok"><CheckCircle2 size={18} /><div>Todo listo. Los mensajes automáticos salen de este número. Si WhatsApp se reconecta, los mensajes esperan en cola y se reenvían solos.</div></div>
                {isManager && <button type="button" className="k-btn k-btn--danger wa-out" onClick={() => setConfirmOut(true)}><Power size={16} /> Cerrar sesión para cambiar de número</button>}
              </>
            ) : (
              <>
                {st.qr_data_url ? (
                  <div className="wa-qr">
                    <img src={st.qr_data_url} alt="Código QR de WhatsApp" width={240} height={240} />
                    <ol>
                      <li>Abre <b>WhatsApp</b> en el teléfono del taller.</li>
                      <li>Entra a <b>Dispositivos vinculados</b>.</li>
                      <li>Toca <b>Vincular un dispositivo</b> y escanea este código.</li>
                    </ol>
                  </div>
                ) : (
                  <div className="wa-wait">
                    <QrCode size={30} />
                    <p>{st.state === 'connecting' ? 'Conectando con WhatsApp… esto puede tardar hasta un par de minutos.' : 'La sesión está cerrada.'}</p>
                  </div>
                )}
                {isManager ? (
                  <button type="button" className="k-btn k-btn--red" onClick={start} disabled={busy || st.state === 'connecting'}>
                    {busy ? <Loader2 className="wa-spin" size={16} /> : <RefreshCw size={16} />} {st.state === 'qr' ? 'Pedir un código nuevo' : 'Conectar WhatsApp'}
                  </button>
                ) : (
                  <div className="k-note k-note--warn"><AlertTriangle size={16} /><div>Solo el dueño o un administrador puede conectar el número.</div></div>
                )}
              </>
            )}
          </section>

          <aside className="wa-card wa-side">
            <h3>Cómo funciona</h3>
            <ul>
              <li><b>Un número para todos.</b> Nadie conecta su WhatsApp personal: cada mensaje del sistema sale del número del taller.</li>
              <li><b>Cada quien conserva el suyo.</b> Los mecánicos reciben sus avisos de citas en su teléfono personal, guardado en su ficha de Equipo.</li>
              <li><b>Cambiar de número.</b> Cierra la sesión actual y escanea el código con el número nuevo. No se pierde nada del sistema.</li>
            </ul>
            <div className="k-note k-note--info"><ShieldAlert size={16} /><div>Conviene que este número sea exclusivo del taller. Si se usa para platicar personal, esas conversaciones también aparecerían en la bandeja.</div></div>
          </aside>
        </div>
      )}

      <Drawer
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Cerrar sesión de WhatsApp"
        width={420}
        footer={<><button type="button" className="k-btn k-btn--ghost" onClick={() => setConfirmOut(false)}>Cancelar</button><button type="button" className="k-btn k-btn--red" onClick={logout} disabled={busy}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</button></>}
      >
        <div className="k-note k-note--warn"><AlertTriangle size={16} /><div>Mientras no conectes otro número, <b>no saldrá ningún mensaje automático</b> (citas, órdenes, tickets). Hazlo cuando tengas el nuevo teléfono a la mano.</div></div>
      </Drawer>
    </div>
  );
}
