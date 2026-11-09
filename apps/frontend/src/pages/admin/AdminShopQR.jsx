import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
    QrCode,
    Download,
    Phone,
    MessageCircle,
    Info,
    Copy,
    CheckCircle2,
    Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { workspaceService } from '../../lib/api';

const DEFAULT_MSG = 'Hola, quiero agendar una cita para mi moto.';

function normalizeMxPhone(raw) {
    if (!raw) return '';
    // Dejar solo dígitos
    const digits = String(raw).replace(/\D/g, '');
    // Si ya trae 52 al frente (13 dígitos típicos en MX), ok.
    if (digits.startsWith('52') && digits.length === 12) return digits;
    if (digits.length === 10) return `52${digits}`;
    return digits;
}

function buildWaUrl(phone, msg) {
    const p = normalizeMxPhone(phone);
    if (!p) return '';
    return `https://wa.me/${p}?text=${encodeURIComponent(msg || DEFAULT_MSG)}`;
}

export default function AdminShopQR() {
    const { activeWorkspace } = useAuth();
    const toast = useToast();
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState(DEFAULT_MSG);
    const [logoUrl, setLogoUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Cargar del workspace activo si hay datos en settings/branding.
        if (activeWorkspace) {
            const settings = activeWorkspace.settings || {};
            const branding = activeWorkspace.branding || {};
            setPhone(settings.whatsapp_contact_number || '');
            setMessage(settings.whatsapp_qr_message || DEFAULT_MSG);
            setLogoUrl(branding.logo_url || '/logo.png');
        }
    }, [activeWorkspace]);

    const url = buildWaUrl(phone, message);

    const copy = () => {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            toast.success('Link copiado.');
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const download = (scale = 4) => {
        const canvas = document.querySelector('#mp-shop-qr canvas');
        if (!canvas) return;
        // Re-dibujar a mayor resolución usando un canvas temporal.
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width * scale;
        tmp.height = canvas.height * scale;
        const ctx = tmp.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
        const a = document.createElement('a');
        a.href = tmp.toDataURL('image/png');
        a.download = `motopartes-qr-${activeWorkspace?.slug || 'taller'}.png`;
        a.click();
    };

    const printSheet = () => {
        const printable = document.getElementById('mp-shop-qr-printable').outerHTML;
        const w = window.open('', '_blank', 'width=720,height=960');
        if (!w) return;
        w.document.write(`<!doctype html><html><head><title>QR del taller</title>
            <style>
                body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
                h1 { font-size: 2rem; margin: 0 0 6px; }
                h2 { font-size: 1.1rem; color: var(--text-2); margin: 0 0 30px; font-weight: 500; }
                .qr { display: inline-block; padding: 20px; border: 2px dashed var(--text-3); border-radius: 20px; }
                .footer { margin-top: 30px; color: var(--text-2); font-size: 0.95rem; }
                .brand { margin-top: 40px; color: var(--text-3); font-size: 0.8rem; }
            </style></head><body>${printable}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await workspaceService.update({
                settings: {
                    ...(activeWorkspace?.settings || {}),
                    whatsapp_contact_number: phone,
                    whatsapp_qr_message: message,
                },
            });
            toast.success('Datos del QR guardados.');
        } catch (err) {
            toast.error(err?.message || 'No se pudo guardar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="sqr-page">
            <div className="sqr-header">
                <h1><QrCode size={26} /> Código QR del taller</h1>
                <p>Imprime este QR y pégalo en tu entrada. Tus clientes lo escanean y te escriben por WhatsApp para agendar cita.</p>
            </div>

            <div className="sqr-grid">
                <div className="sqr-form">
                    <div className="sqr-field">
                        <label><Phone size={14} /> Número de WhatsApp del taller</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="55 1234 5678"
                            autoComplete="tel"
                        />
                        <small>México: 10 dígitos. El sistema añade el prefijo 52 automáticamente.</small>
                    </div>

                    <div className="sqr-field">
                        <label><MessageCircle size={14} /> Mensaje pre-llenado</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Hola, quiero agendar cita"
                        />
                        <small>Este es el texto que verá el cliente ya escrito al abrir WhatsApp.</small>
                    </div>

                    <div className="sqr-field">
                        <label>Link generado</label>
                        <div className="sqr-url-row">
                            <input value={url} readOnly className="sqr-url" />
                            <button onClick={copy} className="sqr-btn-secondary">
                                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    <div className="sqr-info">
                        <Info size={16} />
                        <div>
                            Si tu taller todavía no tiene un WhatsApp con Business configurado,
                            úsalo igual con un número regular — funciona. Cambia al Business
                            más adelante si quieres catálogo y respuestas rápidas.
                        </div>
                    </div>

                    <div className="sqr-actions">
                        <button onClick={saveSettings} disabled={saving} className="sqr-btn-primary">
                            {saving ? 'Guardando...' : 'Guardar para próxima vez'}
                        </button>
                        <button onClick={() => download(4)} disabled={!url} className="sqr-btn-secondary">
                            <Download size={16} /> Descargar PNG
                        </button>
                        <button onClick={printSheet} disabled={!url} className="sqr-btn-secondary">
                            <Printer size={16} /> Hoja imprimible
                        </button>
                    </div>
                </div>

                <aside className="sqr-preview">
                    <div id="mp-shop-qr-printable">
                        <h1>{activeWorkspace?.name || 'Mi taller'}</h1>
                        <h2>Escanea para agendar por WhatsApp</h2>
                        <div className="qr" id="mp-shop-qr">
                            {url ? (
                                <QRCodeCanvas
                                    value={url}
                                    size={240}
                                    level="H"
                                    includeMargin
                                    imageSettings={logoUrl ? {
                                        src: logoUrl,
                                        height: 42,
                                        width: 42,
                                        excavate: true,
                                    } : undefined}
                                />
                            ) : (
                                <div className="sqr-empty">Añade un número para generar el QR.</div>
                            )}
                        </div>
                        <p className="footer">O escríbenos directamente al número en el QR.</p>
                        <p className="brand">Hecho con MotoPartes</p>
                    </div>
                </aside>
            </div>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.sqr-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.sqr-header h1 { display: flex; align-items: center; gap: 10px; font-size: 1.8rem; font-weight: 800; margin: 0 0 6px; color: var(--text); }
.sqr-header p { color: var(--text-2); margin: 0 0 28px; max-width: 640px; line-height: 1.5; }
.sqr-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 30px; align-items: start; }
@media (max-width: 860px) { .sqr-grid { grid-template-columns: 1fr; } }
.sqr-form { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 26px; display: flex; flex-direction: column; gap: 18px; }
.sqr-field { display: flex; flex-direction: column; gap: 6px; }
.sqr-field label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--text); font-size: 0.9rem; }
.sqr-field input, .sqr-field textarea { padding: 10px 14px; border: 1.5px solid var(--line-strong); border-radius: 10px; font-size: 0.95rem; font-family: inherit; resize: vertical; }
.sqr-field input:focus, .sqr-field textarea:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 4px rgba(239,68,68,0.1); }
.sqr-field small { color: var(--text-2); font-size: 0.8rem; }
.sqr-url-row { display: flex; gap: 8px; align-items: center; }
.sqr-url { flex: 1; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 10px; font-family: monospace; font-size: 0.82rem; background: var(--surface-2); color: var(--text-2); }
.sqr-btn-primary, .sqr-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; border: none; white-space: nowrap; }
.sqr-btn-primary { background: var(--brand); color: white; }
.sqr-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239,68,68,0.25); }
.sqr-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.sqr-btn-secondary { background: var(--surface); color: var(--text); border: 1.5px solid var(--line-strong); }
.sqr-btn-secondary:hover:not(:disabled) { background: var(--surface-2); border-color: var(--text-3); }
.sqr-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.sqr-actions { display: flex; gap: 10px; flex-wrap: wrap; padding-top: 8px; }
.sqr-info { display: flex; gap: 10px; padding: 12px 14px; background: var(--brand-50); border: 1px solid var(--brand-200); border-radius: 10px; color: var(--brand-deep); font-size: 0.88rem; line-height: 1.5; }
.sqr-info svg { flex-shrink: 0; margin-top: 2px; }
.sqr-preview { background: var(--surface); border: 2px dashed var(--line-strong); border-radius: 20px; padding: 30px; text-align: center; }
#mp-shop-qr-printable h1 { font-size: 1.6rem; margin: 0 0 4px; color: var(--text); }
#mp-shop-qr-printable h2 { font-size: 0.95rem; color: var(--text-2); margin: 0 0 20px; font-weight: 500; }
#mp-shop-qr-printable .qr { display: inline-block; max-width: 100%; box-sizing: border-box; padding: 14px; background: var(--surface); border-radius: 14px; }
/* El QR se encoge para caber en celular (no se sale de su caja) */
#mp-shop-qr-printable .qr canvas { max-width: 100%; height: auto !important; }
@media (max-width: 480px) { .sqr-preview { padding: 16px; } #mp-shop-qr-printable .qr { padding: 8px; } }
#mp-shop-qr-printable .footer { color: var(--text-2); font-size: 0.88rem; margin: 18px 0 0; }
#mp-shop-qr-printable .brand { color: var(--text-3); font-size: 0.78rem; margin: 18px 0 0; }
.sqr-empty { width: 240px; height: 240px; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 0.9rem; text-align: center; padding: 20px; }
`;
