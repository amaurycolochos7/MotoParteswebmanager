import { useState, useEffect, useCallback } from 'react';
import { questionsApi, getQToken, setQToken, clearQAuth } from '../../lib/questionsApi';

function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    const prev = document.title;
    document.title = 'Admin · Cuestionario MotoPartes';
    return () => { document.head.removeChild(tag); document.title = prev; };
  }, []);
}

export default function QuestionsAdmin() {
  useNoIndex();
  const [token, setToken] = useState(getQToken());
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('motopartes_questions_role') === 'admin');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState('resumen');
  const [summary, setSummary] = useState(null);
  const [compare, setCompare] = useState(null);
  const [individual, setIndividual] = useState({ ELIHU: null, MACIEL: null });
  const [indKey, setIndKey] = useState('ELIHU');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const authed = token && isAdmin;

  const loadSummary = useCallback(async () => {
    try { setSummary(await questionsApi.adminSummary()); }
    catch (e) { if (e.status === 401 || e.status === 403) { clearQAuth(); setToken(null); setIsAdmin(false); } else setError(e.message); }
  }, []);

  useEffect(() => { if (authed) loadSummary(); }, [authed, loadSummary]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await questionsApi.auth(pin.trim());
      if (res.role !== 'admin') {
        setAuthError('Este acceso es solo para el administrador de respuestas.');
        return;
      }
      setQToken(res.token);
      localStorage.setItem('motopartes_questions_role', 'admin');
      setToken(res.token);
      setIsAdmin(true);
      setPin('');
    } catch (err) {
      setAuthError(err.message || 'PIN incorrecto.');
    } finally {
      setAuthLoading(false);
    }
  };

  const openCompare = async () => {
    setTab('comparativa');
    if (!compare) { setBusy(true); try { setCompare(await questionsApi.adminCompare()); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  };

  const openIndividual = async (key) => {
    setTab('individual'); setIndKey(key);
    if (!individual[key]) {
      setBusy(true);
      try { const data = await questionsApi.adminResponses(key); setIndividual((p) => ({ ...p, [key]: data })); }
      catch (e) { setError(e.message); } finally { setBusy(false); }
    }
  };

  const unlock = async (key) => {
    const reason = window.prompt(`Desbloquear el cuestionario de ${key} para que pueda editar. Motivo (opcional):`, '');
    if (reason === null) return;
    setBusy(true);
    try {
      await questionsApi.adminUnlock(key, reason);
      await loadSummary();
      setError(`${key} desbloqueado. Ya puede editar y reenviar.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // ── PIN ──
  if (!authed) {
    return (
      <div className="qa-screen">
        <form className="qa-card" onSubmit={handleAuth}>
          <h1 className="qa-logo">MotoPartes <span>Questions</span></h1>
          <p className="qa-sub">Panel de administrador. Ingresa el PIN de administrador para ver y comparar respuestas.</p>
          <input className="qa-input" type="password" inputMode="numeric" autoComplete="off" placeholder="PIN de administrador"
            value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          {authError && <div className="qa-error">{authError}</div>}
          <button className="qa-btn qa-btn-primary" type="submit" disabled={authLoading || !pin.trim()}>
            {authLoading ? 'Validando…' : 'Entrar'}
          </button>
        </form>
        <Styles />
      </div>
    );
  }

  return (
    <div className="qa-wrap">
      <header className="qa-header">
        <h1 className="qa-logo">MotoPartes <span>Questions</span> · Admin</h1>
        <button className="qa-link" onClick={() => { clearQAuth(); setToken(null); setIsAdmin(false); }}>Salir</button>
      </header>

      <nav className="qa-tabs">
        <button className={tab === 'resumen' ? 'on' : ''} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'individual' ? 'on' : ''} onClick={() => openIndividual(indKey)}>Individual</button>
        <button className={tab === 'comparativa' ? 'on' : ''} onClick={openCompare}>Comparativa</button>
        <button className={tab === 'export' ? 'on' : ''} onClick={() => setTab('export')}>Exportar</button>
      </nav>

      {error && <div className="qa-toast" onClick={() => setError('')}>{error}</div>}

      {/* ── RESUMEN ── */}
      {tab === 'resumen' && summary && (
        <div className="qa-grid">
          {summary.participants.map((p) => (
            <div key={p.key} className="qa-pcard">
              <div className="qa-pcard-head">
                <strong>{p.display_name}</strong>
                <span className={`qa-status qa-${p.status}`}>{labelStatus(p.status)}</span>
              </div>
              <div className="qa-bar"><div style={{ width: `${p.completion.percent}%` }} /></div>
              <div className="qa-pmeta">{p.completion.percent}% · {p.completion.answered}/{p.completion.total} respondidas</div>
              <div className="qa-pmeta">Última edición: {p.last_edit ? new Date(p.last_edit).toLocaleString('es-MX') : '—'}</div>
              <div className="qa-pmeta">Enviado: {p.submitted_at ? new Date(p.submitted_at).toLocaleString('es-MX') : '— no enviado —'}</div>
              <div className="qa-pactions">
                <button className="qa-btn" onClick={() => openIndividual(p.key)}>Ver respuestas</button>
                {p.locked && <button className="qa-btn qa-btn-warn" onClick={() => unlock(p.key)} disabled={busy}>Desbloquear</button>}
              </div>
            </div>
          ))}
          <p className="qa-version">Versión del cuestionario: {summary.survey_version}</p>
        </div>
      )}

      {/* ── INDIVIDUAL ── */}
      {tab === 'individual' && (
        <div>
          <div className="qa-switch">
            <button className={indKey === 'ELIHU' ? 'on' : ''} onClick={() => openIndividual('ELIHU')}>ELIHU</button>
            <button className={indKey === 'MACIEL' ? 'on' : ''} onClick={() => openIndividual('MACIEL')}>MACIEL</button>
          </div>
          {busy && <p>Cargando…</p>}
          {individual[indKey] && (
            <div className="qa-list">
              {groupBySection(individual[indKey].rows).map((g) => (
                <div key={g.section} className="qa-sec">
                  <h3>{g.section}</h3>
                  {g.rows.map((r) => (
                    <div key={r.question_key} className="qa-row">
                      <div className="qa-q">{r.question}</div>
                      <div className={`qa-a ${r.answer ? '' : 'empty'}`}>{r.answer || '— sin responder —'}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COMPARATIVA ── */}
      {tab === 'comparativa' && (
        <div>
          {busy && <p>Cargando…</p>}
          {compare && (
            <div className="qa-table-wrap">
              <table className="qa-table">
                <thead>
                  <tr><th>Sección</th><th>Pregunta</th><th>ELIHU</th><th>MACIEL</th><th>Diferencia detectada</th></tr>
                </thead>
                <tbody>
                  {compare.comparison.map((r) => (
                    <tr key={r.question_key} className={diffClass(r.diff)}>
                      <td className="qa-td-sec">{r.section}</td>
                      <td>{r.question}</td>
                      <td>{r.elihu || '—'}</td>
                      <td>{r.maciel || '—'}</td>
                      <td className="qa-td-diff">{r.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── EXPORT ── */}
      {tab === 'export' && (
        <div className="qa-export">
          <p className="qa-sub">Descarga las respuestas comparadas de ELIHU y MACIEL para analizarlas.</p>
          <div className="qa-export-btns">
            <button className="qa-btn qa-btn-primary" onClick={() => questionsApi.download('csv')}>Exportar CSV</button>
            <button className="qa-btn" onClick={() => questionsApi.download('json')}>Exportar JSON</button>
            <button className="qa-btn" onClick={() => questionsApi.download('md')}>Exportar Markdown</button>
            <button className="qa-btn" onClick={() => questionsApi.download('txt')}>Exportar Texto</button>
          </div>
        </div>
      )}
      <Styles />
    </div>
  );
}

function labelStatus(s) {
  return { NOT_STARTED: 'No iniciado', IN_PROGRESS: 'En progreso', SUBMITTED: 'Enviado' }[s] || s;
}
function diffClass(d) {
  if (d.startsWith('Difieren')) return 'diff-no';
  if (d.startsWith('Ambos')) return 'diff-ok';
  return 'diff-partial';
}
function groupBySection(rows) {
  const out = [];
  let cur = null;
  for (const r of rows) {
    if (!cur || cur.section !== r.section) { cur = { section: r.section, rows: [] }; out.push(cur); }
    cur.rows.push(r);
  }
  return out;
}

function Styles() {
  return (
    <style>{`
      .qa-screen { min-height: 100vh; background: #1d1d1f; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: system-ui, sans-serif; }
      .qa-card { background: #fff; border-radius: 16px; padding: 32px 24px; width: 100%; max-width: 380px; box-shadow: 0 10px 40px rgba(0,0,0,.25); text-align: center; }
      .qa-logo { font-size: 22px; font-weight: 800; color: #1d1d1f; margin: 0 0 8px; }
      .qa-logo span { color: #ef4444; }
      .qa-sub { color: #474747; font-size: 14px; line-height: 1.5; }
      .qa-input { width: 100%; padding: 14px 16px; border: 2px solid #e8e8ed; border-radius: 10px; font-size: 16px; margin: 12px 0; box-sizing: border-box; }
      .qa-input:focus { outline: none; border-color: #ef4444; }
      .qa-error { color: #dc2626; font-size: 13px; margin: 6px 0; }
      .qa-btn { padding: 10px 16px; border: 1px solid #d2d2d7; background: #fff; color: #1d1d1f; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .qa-btn:disabled { opacity: .5; }
      .qa-btn-primary { background: #111827; color: #fff; border-color: #111827; }
      .qa-btn-warn { background: #fef3c7; border-color: #fcd34d; color: #92400e; }

      .qa-wrap { max-width: 1100px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif; color: #1d1d1f; }
      .qa-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
      .qa-link { background: none; border: none; color: #6e6e73; cursor: pointer; text-decoration: underline; }
      .qa-tabs { display: flex; gap: 6px; border-bottom: 2px solid #e8e8ed; margin-bottom: 16px; flex-wrap: wrap; }
      .qa-tabs button { padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: 15px; font-weight: 600; color: #6e6e73; border-bottom: 2px solid transparent; margin-bottom: -2px; }
      .qa-tabs button.on { color: #ef4444; border-bottom-color: #ef4444; }
      .qa-toast { background: #1d1d1f; color: #fff; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; cursor: pointer; }

      .qa-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
      .qa-pcard { background: #fff; border: 1px solid #e8e8ed; border-radius: 14px; padding: 18px; }
      .qa-pcard-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 18px; }
      .qa-status { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
      .qa-NOT_STARTED { background: #f5f5f7; color: #6e6e73; }
      .qa-IN_PROGRESS { background: #fef9c3; color: #a16207; }
      .qa-SUBMITTED { background: #dcfce7; color: #15803d; }
      .qa-bar { height: 8px; background: #e8e8ed; border-radius: 999px; overflow: hidden; margin-bottom: 6px; }
      .qa-bar div { height: 100%; background: #ef4444; }
      .qa-pmeta { font-size: 12px; color: #6e6e73; margin: 2px 0; }
      .qa-pactions { display: flex; gap: 8px; margin-top: 12px; }
      .qa-version { grid-column: 1 / -1; font-size: 12px; color: #86868b; }

      .qa-switch { display: flex; gap: 8px; margin-bottom: 14px; }
      .qa-switch button { padding: 8px 18px; border: 1px solid #d2d2d7; background: #fff; border-radius: 999px; cursor: pointer; font-weight: 600; }
      .qa-switch button.on { background: #111827; color: #fff; border-color: #111827; }
      .qa-list { display: flex; flex-direction: column; gap: 18px; }
      .qa-sec h3 { font-size: 15px; color: #ef4444; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .04em; }
      .qa-row { padding: 10px 0; border-bottom: 1px solid #f5f5f7; }
      .qa-q { font-size: 13px; color: #6e6e73; }
      .qa-a { font-size: 15px; font-weight: 500; margin-top: 2px; }
      .qa-a.empty { color: #d2d2d7; font-style: italic; font-weight: 400; }

      .qa-table-wrap { overflow-x: auto; }
      .qa-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .qa-table th, .qa-table td { border: 1px solid #e8e8ed; padding: 8px 10px; text-align: left; vertical-align: top; }
      .qa-table th { background: #f5f5f7; position: sticky; top: 0; }
      .qa-td-sec { color: #6e6e73; font-size: 12px; white-space: nowrap; }
      .qa-td-diff { font-weight: 600; }
      .qa-table tr.diff-no { background: #fef2f2; }
      .qa-table tr.diff-no .qa-td-diff { color: #dc2626; }
      .qa-table tr.diff-ok .qa-td-diff { color: #15803d; }
      .qa-table tr.diff-partial { background: #fffbeb; }
      .qa-table tr.diff-partial .qa-td-diff { color: #a16207; }

      .qa-export-btns { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    `}</style>
  );
}
