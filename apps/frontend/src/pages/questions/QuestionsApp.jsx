import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { questionsApi, getQToken, setQToken, clearQAuth } from '../../lib/questionsApi';

const OTHER = 'Otro, explicar';

// noindex: este módulo no debe indexarse en buscadores.
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    const prevTitle = document.title;
    document.title = 'Cuestionario interno MotoPartes';
    return () => {
      document.head.removeChild(tag);
      document.title = prevTitle;
    };
  }, []);
}

function hasValue(q, ans) {
  if (!ans) return false;
  const v = ans.answer_value;
  const t = (ans.answer_text || '').trim();
  switch (q.type) {
    case 'MULTI_CHOICE':
    case 'SORTABLE_LIST':
      return Array.isArray(v) && v.length > 0;
    case 'SINGLE_CHOICE':
      return (v != null && v !== '') || !!t;
    case 'NUMBER':
      return v != null && v !== '';
    case 'BOOLEAN':
      return v === true || v === false;
    default:
      return !!t;
  }
}

// Aplana las preguntas (incluye followups como pregunta propia) para progreso.
function flatten(sections) {
  const out = [];
  for (const s of sections) {
    for (const q of s.questions) {
      out.push({ ...q, section_title: s.title });
      if (q.followupKey) {
        out.push({
          key: q.followupKey,
          type: q.followupType || 'TEXT',
          required: !!q.followupRequired,
          label: q.followupLabel,
          section_title: s.title,
          isFollowup: true,
        });
      }
    }
  }
  return out;
}

export default function QuestionsApp() {
  useNoIndex();
  const navigate = useNavigate();

  const [token, setToken] = useState(getQToken());
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [form, setForm] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [answers, setAnswers] = useState({});
  const [sectionIdx, setSectionIdx] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [message, setMessage] = useState('');
  const dirty = useRef(false);

  const draftKey = participant ? `motopartes_questions_draft_${participant.key}` : null;

  // ── Carga inicial tras tener token ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, me] = await Promise.all([questionsApi.getForm(), questionsApi.getMe()]);
      setForm(f);
      setParticipant(me.participant);
      // Mezcla: respuestas del servidor + borrador local (local gana si hay edits sin guardar).
      let merged = { ...(me.answers || {}) };
      try {
        const localRaw = localStorage.getItem(`motopartes_questions_draft_${me.participant.key}`);
        if (localRaw && me.participant.status !== 'SUBMITTED') {
          const local = JSON.parse(localRaw);
          merged = { ...merged, ...local };
        }
      } catch { /* ignore */ }
      setAnswers(merged);
    } catch (e) {
      if (e.status === 401) {
        clearQAuth();
        setToken(null);
      } else {
        setMessage(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  // Backup local en cada cambio (evita pérdida si se cierra el navegador).
  useEffect(() => {
    if (draftKey && Object.keys(answers).length) {
      try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* ignore */ }
    }
  }, [answers, draftKey]);

  const locked = participant?.locked || participant?.status === 'SUBMITTED';

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await questionsApi.auth(pin.trim());
      setQToken(res.token);
      localStorage.setItem('motopartes_questions_role', res.role);
      if (res.role === 'admin') {
        navigate('/questions/admin');
        return;
      }
      setToken(res.token);
      setPin('');
    } catch (err) {
      setAuthError(err.message || 'PIN incorrecto.');
    } finally {
      setAuthLoading(false);
    }
  };

  const setAnswer = (key, partial) => {
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...partial } }));
  };

  const buildPayload = useCallback(() => {
    return Object.entries(answers).map(([question_key, a]) => ({
      question_key,
      answer_value: a?.answer_value ?? null,
      answer_text: a?.answer_text ?? null,
    }));
  }, [answers]);

  const save = useCallback(async (silent = false) => {
    if (locked) return;
    setSaving(true);
    try {
      await questionsApi.saveAnswers(buildPayload());
      dirty.current = false;
      setSavedAt(new Date());
      if (!silent) setMessage('Borrador guardado.');
    } catch (e) {
      setMessage(`No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [buildPayload, locked]);

  // Autosave periódico (cada 45s si hay cambios) — red de seguridad.
  useEffect(() => {
    if (!token || locked) return;
    const id = setInterval(() => { if (dirty.current) save(true); }, 45000);
    return () => clearInterval(id);
  }, [token, locked, save]);

  // Autosave al escribir (debounce 1.2s tras el último cambio). Esto guarda el
  // borrador en el servidor casi en tiempo real, de modo que cerrar o
  // actualizar la ventana nunca pierde lo contestado y se continúa al volver.
  useEffect(() => {
    if (!token || locked || !dirty.current) return;
    const t = setTimeout(() => { if (dirty.current) save(true); }, 1200);
    return () => clearTimeout(t);
  }, [answers, token, locked, save]);

  // Guardar al cerrar/recargar.
  useEffect(() => {
    const handler = () => {
      if (dirty.current && draftKey) {
        try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [answers, draftKey]);

  const goToSection = async (idx) => {
    if (!locked && dirty.current) await save(true);
    setSectionIdx(idx);
    setReviewing(false);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!window.confirm('¿Enviar tus respuestas? Después no podrás editarlas hasta que el administrador las desbloquee.')) return;
    if (!locked && dirty.current) await save(true);
    setLoading(true);
    try {
      const res = await questionsApi.submit();
      setParticipant((p) => ({ ...p, status: 'SUBMITTED', locked: true, submitted_at: res.submitted_at }));
      if (draftKey) localStorage.removeItem(draftKey);
      setMessage('¡Listo! Tus respuestas fueron enviadas. Gracias.');
      setReviewing(false);
    } catch (e) {
      if (e.payload?.missing?.length) {
        setMessage(`Faltan ${e.payload.missing.length} preguntas obligatorias por contestar.`);
      } else {
        setMessage(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── PANTALLA DE PIN ──
  if (!token) {
    return (
      <div className="mq-screen">
        <form className="mq-card" onSubmit={handleAuth}>
          <h1 className="mq-logo">MotoPartes <span>Questions</span></h1>
          <p className="mq-sub">Cuestionario interno MotoPartes. Ingresa tu PIN para continuar.</p>
          <input
            className="mq-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {authError && <div className="mq-error">{authError}</div>}
          <button className="mq-btn mq-btn-primary" type="submit" disabled={authLoading || !pin.trim()}>
            {authLoading ? 'Validando…' : 'Entrar'}
          </button>
        </form>
        <Styles />
      </div>
    );
  }

  if (loading && !form) {
    return <div className="mq-screen"><div className="mq-card"><p>Cargando…</p></div><Styles /></div>;
  }

  // ── ESTADO ENVIADO (bloqueado) ──
  if (locked) {
    return (
      <div className="mq-screen">
        <div className="mq-card">
          <h1 className="mq-logo">MotoPartes <span>Questions</span></h1>
          <div className="mq-badge mq-badge-ok">Respuestas enviadas</div>
          <p className="mq-sub">
            Gracias, {participant?.display_name}. Tus respuestas ya fueron enviadas
            {participant?.submitted_at ? ` el ${new Date(participant.submitted_at).toLocaleString('es-MX')}` : ''}.
          </p>
          <p className="mq-sub">Si necesitas corregir algo, pide al administrador que desbloquee tu cuestionario.</p>
          <button className="mq-btn" onClick={() => { clearQAuth(); setToken(null); }}>Salir</button>
        </div>
        <Styles />
      </div>
    );
  }

  const sections = form?.sections || [];
  const flat = flatten(sections);
  const answeredCount = flat.filter((q) => hasValue(q, answers[q.key])).length;
  const percent = flat.length ? Math.round((answeredCount / flat.length) * 100) : 0;
  const section = sections[sectionIdx];
  const isLast = sectionIdx === sections.length - 1;

  return (
    <div className="mq-screen mq-screen-form">
      <div className="mq-form-wrap">
        {/* Header + progreso */}
        <div className="mq-head">
          <div className="mq-head-top">
            <span className="mq-participant">{participant?.display_name}</span>
            <button className="mq-link" onClick={() => { clearQAuth(); setToken(null); }}>Salir</button>
          </div>
          <div className="mq-progress"><div className="mq-progress-bar" style={{ width: `${percent}%` }} /></div>
          <div className="mq-progress-label">{percent}% · Sección {sectionIdx + 1} de {sections.length}</div>
        </div>

        {message && <div className="mq-toast" onClick={() => setMessage('')}>{message}</div>}

        {!reviewing && form?.participant_instruction && sectionIdx === 0 && (
          <div className="mq-instruction">{form.participant_instruction}</div>
        )}

        {!reviewing && section && (
          <div className="mq-section">
            <h2 className="mq-section-title">{section.title}</h2>
            {section.questions.map((q) => (
              <QuestionField key={q.key} q={q} answers={answers} setAnswer={setAnswer} />
            ))}

            <div className="mq-nav">
              {sectionIdx > 0 && (
                <button className="mq-btn" onClick={() => goToSection(sectionIdx - 1)}>← Anterior</button>
              )}
              <button className="mq-btn" onClick={() => save(false)} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              {!isLast ? (
                <button className="mq-btn mq-btn-primary" onClick={() => goToSection(sectionIdx + 1)}>Siguiente →</button>
              ) : (
                <button className="mq-btn mq-btn-primary" onClick={async () => { if (dirty.current) await save(true); setReviewing(true); window.scrollTo(0, 0); }}>
                  Revisar y enviar →
                </button>
              )}
            </div>
            {savedAt && <div className="mq-saved">Guardado {savedAt.toLocaleTimeString('es-MX')}</div>}
          </div>
        )}

        {reviewing && (
          <div className="mq-section">
            <h2 className="mq-section-title">Revisión final</h2>
            <p className="mq-sub">Revisa tus respuestas antes de enviar. Puedes volver a cualquier sección para corregir.</p>
            <div className="mq-progress-label" style={{ marginBottom: 12 }}>{answeredCount} de {flat.length} respondidas</div>
            {sections.map((s, i) => (
              <div key={s.key} className="mq-review-sec">
                <div className="mq-review-head">
                  <strong>{i + 1}. {s.title}</strong>
                  <button className="mq-link" onClick={() => goToSection(i)}>Editar</button>
                </div>
                {flatten([s]).map((q) => (
                  <div key={q.key} className="mq-review-row">
                    <span className="mq-review-q">{q.label}{q.required ? ' *' : ''}</span>
                    <span className={`mq-review-a ${hasValue(q, answers[q.key]) ? '' : 'mq-review-a-empty'}`}>
                      {renderLocal(q, answers[q.key]) || '— sin responder —'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div className="mq-nav">
              <button className="mq-btn" onClick={() => setReviewing(false)}>← Volver</button>
              <button className="mq-btn mq-btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar respuestas'}
              </button>
            </div>
          </div>
        )}
      </div>
      <Styles />
    </div>
  );
}

// Render local de una respuesta (para la pantalla de revisión).
function renderLocal(q, ans) {
  if (!ans) return '';
  const v = ans.answer_value;
  const t = (ans.answer_text || '').trim();
  switch (q.type) {
    case 'SINGLE_CHOICE':
      if (v === OTHER || (!v && t)) return t ? `Otro: ${t}` : 'Otro';
      return t ? `${v} (Otro: ${t})` : (v || '');
    case 'MULTI_CHOICE': {
      const arr = Array.isArray(v) ? v.slice() : [];
      const base = arr.filter((x) => x !== OTHER);
      let out = base.join(', ');
      if (arr.includes(OTHER)) out = out ? `${out}, Otro: ${t}` : `Otro: ${t}`;
      return out;
    }
    case 'SORTABLE_LIST':
      return Array.isArray(v) ? v.join(' → ') : '';
    case 'NUMBER':
      return v == null ? '' : String(v);
    case 'BOOLEAN':
      return v === true ? 'Sí' : v === false ? 'No' : '';
    default:
      return t;
  }
}

// ── Renderizador de una pregunta según su tipo ──
function QuestionField({ q, answers, setAnswer }) {
  const ans = answers[q.key] || {};
  const showOther = q.allowOther;

  const renderFollowup = () => {
    if (!q.followupKey) return null;
    const fans = answers[q.followupKey] || {};
    return (
      <div className="mq-followup">
        <label className="mq-flabel">{q.followupLabel}</label>
        <textarea
          className="mq-textarea"
          rows={3}
          value={fans.answer_text || ''}
          onChange={(e) => setAnswer(q.followupKey, { answer_value: null, answer_text: e.target.value })}
        />
      </div>
    );
  };

  return (
    <div className="mq-q">
      <label className="mq-q-label">{q.label}{q.required ? <span className="mq-req"> *</span> : null}</label>
      {q.helpText && <div className="mq-help">{q.helpText}</div>}

      {q.type === 'SINGLE_CHOICE' && (
        <div className="mq-opts">
          {q.options.map((opt) => (
            <label key={opt} className={`mq-opt ${ans.answer_value === opt ? 'sel' : ''}`}>
              <input
                type="radio"
                name={q.key}
                checked={ans.answer_value === opt}
                onChange={() => setAnswer(q.key, { answer_value: opt, answer_text: opt === OTHER ? (ans.answer_text || '') : null })}
              />
              <span>{opt}</span>
            </label>
          ))}
          {showOther && ans.answer_value === OTHER && (
            <input className="mq-input mq-other" placeholder="Explica…" value={ans.answer_text || ''}
              onChange={(e) => setAnswer(q.key, { answer_value: OTHER, answer_text: e.target.value })} />
          )}
        </div>
      )}

      {q.type === 'MULTI_CHOICE' && (
        <div className="mq-opts">
          {q.options.map((opt) => {
            const arr = Array.isArray(ans.answer_value) ? ans.answer_value : [];
            const checked = arr.includes(opt);
            return (
              <label key={opt} className={`mq-opt ${checked ? 'sel' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked ? arr.filter((x) => x !== opt) : [...arr, opt];
                    setAnswer(q.key, { answer_value: next, answer_text: next.includes(OTHER) ? (ans.answer_text || '') : null });
                  }}
                />
                <span>{opt}</span>
              </label>
            );
          })}
          {showOther && Array.isArray(ans.answer_value) && ans.answer_value.includes(OTHER) && (
            <input className="mq-input mq-other" placeholder="Explica…" value={ans.answer_text || ''}
              onChange={(e) => setAnswer(q.key, { answer_text: e.target.value })} />
          )}
        </div>
      )}

      {q.type === 'SORTABLE_LIST' && (
        <SortableList q={q} ans={ans} setAnswer={setAnswer} />
      )}

      {q.type === 'BOOLEAN' && (
        <div className="mq-bool">
          <button type="button" className={`mq-btn ${ans.answer_value === true ? 'mq-btn-primary' : ''}`} onClick={() => setAnswer(q.key, { answer_value: true })}>Sí</button>
          <button type="button" className={`mq-btn ${ans.answer_value === false ? 'mq-btn-primary' : ''}`} onClick={() => setAnswer(q.key, { answer_value: false })}>No</button>
        </div>
      )}

      {q.type === 'NUMBER' && (
        <input className="mq-input" type="number" value={ans.answer_value ?? ''}
          onChange={(e) => setAnswer(q.key, { answer_value: e.target.value === '' ? null : Number(e.target.value) })} />
      )}

      {(q.type === 'TEXT') && (
        <input className="mq-input" value={ans.answer_text || ''}
          onChange={(e) => setAnswer(q.key, { answer_value: null, answer_text: e.target.value })} />
      )}

      {(q.type === 'LONG_TEXT') && (
        <textarea className="mq-textarea" rows={4} value={ans.answer_text || ''}
          onChange={(e) => setAnswer(q.key, { answer_value: null, answer_text: e.target.value })} />
      )}

      {renderFollowup()}
    </div>
  );
}

function SortableList({ q, ans, setAnswer }) {
  const list = Array.isArray(ans.answer_value) && ans.answer_value.length ? ans.answer_value : q.options;
  const move = (i, dir) => {
    const arr = list.slice();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setAnswer(q.key, { answer_value: arr });
  };
  return (
    <div className="mq-sortable">
      {list.map((item, i) => (
        <div key={item} className="mq-sort-item">
          <span className="mq-sort-num">{i + 1}</span>
          <span className="mq-sort-label">{item}</span>
          <span className="mq-sort-ctrls">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .mq-screen { min-height: 100vh; background: #0f172a; display: flex; align-items: center; justify-content: center; padding: 20px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .mq-screen-form { align-items: flex-start; background: #f1f5f9; }
      .mq-card { background: #fff; border-radius: 16px; padding: 32px 24px; width: 100%; max-width: 380px; box-shadow: 0 10px 40px rgba(0,0,0,.25); text-align: center; }
      .mq-logo { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 8px; }
      .mq-logo span { color: #ef4444; }
      .mq-sub { color: #475569; font-size: 14px; line-height: 1.5; margin: 8px 0; }
      .mq-input { width: 100%; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; margin: 10px 0; box-sizing: border-box; }
      .mq-input:focus { outline: none; border-color: #ef4444; }
      .mq-textarea { width: 100%; padding: 12px 14px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
      .mq-textarea:focus { outline: none; border-color: #ef4444; }
      .mq-error { color: #dc2626; font-size: 13px; margin: 6px 0; }
      .mq-btn { padding: 12px 18px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .mq-btn:disabled { opacity: .5; cursor: not-allowed; }
      .mq-btn-primary { background: #111827; color: #fff; border-color: #111827; }
      .mq-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; margin: 8px 0; }
      .mq-badge-ok { background: #dcfce7; color: #15803d; }

      .mq-form-wrap { width: 100%; max-width: 640px; margin: 0 auto; padding-bottom: 60px; }
      .mq-head { position: sticky; top: 0; background: #f1f5f9; padding: 16px 0 10px; z-index: 5; }
      .mq-head-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .mq-participant { font-weight: 800; color: #0f172a; font-size: 16px; }
      .mq-link { background: none; border: none; color: #64748b; cursor: pointer; font-size: 13px; text-decoration: underline; }
      .mq-progress { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
      .mq-progress-bar { height: 100%; background: #ef4444; transition: width .3s; }
      .mq-progress-label { font-size: 12px; color: #64748b; margin-top: 4px; }
      .mq-instruction { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; padding: 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
      .mq-toast { background: #0f172a; color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 14px; margin-bottom: 12px; cursor: pointer; }
      .mq-section { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
      .mq-section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 16px; }
      .mq-q { padding: 16px 0; border-bottom: 1px solid #f1f5f9; }
      .mq-q:last-of-type { border-bottom: none; }
      .mq-q-label { display: block; font-weight: 600; color: #1e293b; font-size: 15px; margin-bottom: 10px; line-height: 1.4; }
      .mq-req { color: #ef4444; }
      .mq-help { font-size: 13px; color: #64748b; margin-bottom: 8px; }
      .mq-opts { display: flex; flex-direction: column; gap: 8px; }
      .mq-opt { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; font-size: 15px; }
      .mq-opt.sel { border-color: #111827; background: #f8fafc; }
      .mq-opt input { width: 18px; height: 18px; flex-shrink: 0; }
      .mq-other { margin-top: 4px; }
      .mq-bool { display: flex; gap: 10px; }
      .mq-followup { margin-top: 12px; }
      .mq-flabel { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
      .mq-sortable { display: flex; flex-direction: column; gap: 6px; }
      .mq-sort-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
      .mq-sort-num { width: 24px; height: 24px; background: #111827; color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
      .mq-sort-label { flex: 1; font-size: 14px; }
      .mq-sort-ctrls button { width: 30px; height: 30px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; cursor: pointer; margin-left: 4px; }
      .mq-sort-ctrls button:disabled { opacity: .35; }
      .mq-nav { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
      .mq-nav .mq-btn-primary { margin-left: auto; }
      .mq-saved { font-size: 12px; color: #94a3b8; margin-top: 8px; text-align: right; }
      .mq-review-sec { margin-bottom: 18px; }
      .mq-review-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .mq-review-row { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid #f8fafc; }
      .mq-review-q { font-size: 13px; color: #64748b; }
      .mq-review-a { font-size: 15px; color: #0f172a; font-weight: 500; }
      .mq-review-a-empty { color: #cbd5e1; font-style: italic; font-weight: 400; }
      @media (max-width: 480px) { .mq-nav .mq-btn-primary { margin-left: 0; width: 100%; } }
    `}</style>
  );
}
