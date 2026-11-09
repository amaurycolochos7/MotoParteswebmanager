import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { taskService } from '../../lib/api';
import { CheckCircle2, Circle, Clock, Zap, User, CheckSquare } from 'lucide-react';
import './AdminV3.css';

export default function AdminTasks() {
    const toast = useToast();
    const [tab, setTab] = useState('pending');
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try { setTasks(await taskService.list({ status: tab })); }
        catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { refresh(); }, [tab]);

    const complete = async (t) => {
        try {
            await taskService.complete(t.id);
            setTasks((arr) => arr.filter((x) => x.id !== t.id));
        } catch (err) { toast.error(err.message); }
    };

    if (loading) return <div className="adm adm-loading">Cargando…</div>;

    return (
        <div className="adm" style={{ maxWidth: 880 }}>
            <header className="adm-head">
                <div>
                    <h1><CheckSquare size={22} /> Tareas</h1>
                    <p>Recordatorios internos, incluidos los creados por automatizaciones.</p>
                </div>
            </header>

            <div className="adm-seg" role="tablist">
                {['pending', 'completed'].map((t) => (
                    <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                        {t === 'pending' ? 'Pendientes' : 'Completadas'}
                    </button>
                ))}
            </div>

            <div className="adm-list">
                {tasks.map((t) => {
                    const overdue = t.due_at && new Date(t.due_at) < new Date() && !t.completed_at;
                    return (
                        <div key={t.id} className={`adm-task${overdue ? ' is-late' : ''}`}>
                            <button
                                type="button"
                                className={`adm-task__check${t.completed_at ? ' is-done' : ''}`}
                                onClick={() => (tab === 'pending' ? complete(t) : taskService.reopen(t.id).then(refresh))}
                                aria-label={tab === 'pending' ? 'Marcar como completada' : 'Reabrir tarea'}
                            >
                                {t.completed_at ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                            </button>
                            <div className="adm-task__main">
                                <div className={`adm-task__title${t.completed_at ? ' is-done' : ''}`}>{t.title}</div>
                                {t.description && <div className="adm-task__desc">{t.description}</div>}
                                <div className="adm-task__meta">
                                    {t.source === 'automation' && <span><Zap size={13} /> Automatización</span>}
                                    {t.due_at && (
                                        <span className={overdue ? 'is-late' : ''}>
                                            <Clock size={13} /> Vence {new Date(t.due_at).toLocaleString('es-MX')}
                                        </span>
                                    )}
                                    {t.assigned_to && <span><User size={13} /> Asignada</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {tasks.length === 0 && (
                    <div className="adm-empty">
                        <CheckSquare size={26} />
                        <h3>{tab === 'pending' ? 'No hay tareas pendientes' : 'Aún no hay tareas completadas'}</h3>
                        <p>{tab === 'pending' ? 'Estás al día.' : 'Las que completes aparecerán aquí.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
