import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { taskService } from '../../lib/api';
import { CheckCircle2, Circle, Clock, Zap, User } from 'lucide-react';

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

    if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;

    return (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Tareas</h1>
            <p style={{ color: '#64748b', margin: '4px 0 20px' }}>
                Recordatorios internos — incluyen los creados por automatizaciones.
            </p>

            <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 10, marginBottom: 20, width: 'fit-content' }}>
                {['pending', 'completed'].map((t) => (
                    <button key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: tab === t ? 'white' : 'transparent',
                            color: tab === t ? '#0f172a' : '#64748b',
                            fontWeight: 600, fontSize: '0.85rem',
                            boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}>
                        {t === 'pending' ? 'Pendientes' : 'Completadas'}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tasks.map((t) => {
                    const overdue = t.due_at && new Date(t.due_at) < new Date() && !t.completed_at;
                    return (
                        <div key={t.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
                            background: 'white', border: '1px solid', borderColor: overdue ? '#fecaca' : '#e2e8f0',
                            borderRadius: 10,
                        }}>
                            <button onClick={() => tab === 'pending' ? complete(t) : taskService.reopen(t.id).then(refresh)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', paddingTop: 2 }}>
                                {t.completed_at ? <CheckCircle2 size={22} color="#16a34a" /> : <Circle size={22} color="#94a3b8" />}
                            </button>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, color: '#0f172a', textDecoration: t.completed_at ? 'line-through' : 'none' }}>{t.title}</div>
                                {t.description && <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>{t.description}</div>}
                                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {t.source === 'automation' && <span style={{ color: '#8b5cf6' }}><Zap size={11} /> automatización</span>}
                                    {t.due_at && (
                                        <span style={{ color: overdue ? '#dc2626' : '#64748b' }}>
                                            <Clock size={11} /> Vence {new Date(t.due_at).toLocaleString('es-MX')}
                                        </span>
                                    )}
                                    {t.assigned_to && <span><User size={11} /> asignada</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {tasks.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 12 }}>
                        {tab === 'pending' ? 'No hay tareas pendientes 🎉' : 'No hay tareas completadas aún.'}
                    </div>
                )}
            </div>
        </div>
    );
}
