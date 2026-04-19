import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Building2, Users, Ticket, CreditCard, Gift,
    FileText, ShieldCheck, LogOut, Menu, X, AlertCircle, Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Layout base del panel super-admin. Todo el /super/* lo usa.
// Dark por defecto. Sidebar colapsable en móvil.

const NAV = [
    { to: '/super',              icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/super/workspaces',   icon: Building2,       label: 'Talleres' },
    { to: '/super/tickets',      icon: Ticket,          label: 'Tickets' },
    { to: '/super/users',        icon: Users,           label: 'Usuarios' },
    { to: '/super/billing',      icon: CreditCard,      label: 'Suscripciones' },
    { to: '/super/payouts',      icon: Gift,            label: 'Pagos referidos' },
    { to: '/super/canned',       icon: FileText,        label: 'Plantillas' },
    { to: '/super/audit',        icon: ShieldCheck,     label: 'Auditoría' },
    { to: '/super/settings',     icon: Settings,        label: 'Configuración' },
];

export default function SuperLayout() {
    const { user, logout, loading } = useAuth();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    if (loading) {
        return (
            <div className="super-loading">
                <div className="super-spinner" />
            </div>
        );
    }

    if (!user) return <Navigate to="/super/login" replace />;
    if (!user.is_super_admin) {
        return (
            <div className="super-denied">
                <AlertCircle size={36} />
                <h2>Acceso restringido</h2>
                <p>Este panel es solo para super-administradores. Tu cuenta no tiene ese permiso.</p>
                <button onClick={() => navigate('/')}>Volver al sitio</button>
            </div>
        );
    }

    return (
        <div className="super-shell">
            <aside className={`super-sidebar ${mobileOpen ? 'open' : ''}`}>
                <div className="super-brand">
                    <div className="super-brand-logo">MP</div>
                    <div>
                        <div className="super-brand-title">MotoPartes</div>
                        <div className="super-brand-sub">Panel super-admin</div>
                    </div>
                </div>
                <nav className="super-nav">
                    {NAV.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.end}
                            className={({ isActive }) => `super-nav-item${isActive ? ' active' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <n.icon size={18} /> <span>{n.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="super-user">
                    <div className="super-user-avatar">{(user.full_name || user.email || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="super-user-name">{user.full_name}</div>
                        <div className="super-user-email">{user.email}</div>
                    </div>
                    <button className="super-icon-btn" title="Cerrar sesión" onClick={() => { logout(); navigate('/super/login'); }}>
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            <main className="super-main">
                <div className="super-topbar">
                    <button className="super-burger" onClick={() => setMobileOpen((v) => !v)}>
                        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="super-topbar-title">Super Admin</div>
                </div>
                <div className="super-content">
                    <Outlet />
                </div>
            </main>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.super-shell { min-height: 100vh; display: flex; background: #0b0f1a; color: #e5e7eb; font-family: inherit; }
.super-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0f1a; }
.super-spinner { width: 32px; height: 32px; border: 3px solid #1e293b; border-top-color: #ef4444; border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.super-denied { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: #0b0f1a; color: #e5e7eb; padding: 40px; text-align: center; }
.super-denied svg { color: #ef4444; }
.super-denied button { background: #ef4444; color: white; border: none; padding: 10px 22px; border-radius: 10px; font-weight: 600; cursor: pointer; }

.super-sidebar { width: 260px; background: #0f172a; border-right: 1px solid #1e293b; display: flex; flex-direction: column; flex-shrink: 0; position: sticky; top: 0; height: 100vh; }
.super-brand { display: flex; gap: 10px; align-items: center; padding: 18px 18px; border-bottom: 1px solid #1e293b; }
.super-brand-logo { width: 38px; height: 38px; background: linear-gradient(135deg,#ef4444,#dc2626); color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; letter-spacing: 1px; }
.super-brand-title { font-weight: 700; font-size: 0.95rem; color: #f1f5f9; }
.super-brand-sub { font-size: 0.75rem; color: #64748b; }
.super-nav { flex: 1; padding: 12px 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.super-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: #94a3b8; text-decoration: none; font-size: 0.9rem; transition: all 0.15s; }
.super-nav-item:hover { background: #1e293b; color: #e5e7eb; }
.super-nav-item.active { background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.05)); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
.super-nav-item.active svg { color: #ef4444; }
.super-user { display: flex; align-items: center; gap: 10px; padding: 14px 12px; border-top: 1px solid #1e293b; }
.super-user-avatar { width: 34px; height: 34px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #f1f5f9; font-size: 0.85rem; flex-shrink: 0; }
.super-user-name { font-size: 0.84rem; font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.super-user-email { font-size: 0.72rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.super-icon-btn { background: #1e293b; border: none; color: #94a3b8; padding: 7px; border-radius: 7px; cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
.super-icon-btn:hover { background: #334155; color: #f1f5f9; }

.super-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.super-topbar { display: none; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #0f172a; }
.super-burger { background: #1e293b; color: #e5e7eb; border: none; padding: 8px; border-radius: 8px; cursor: pointer; }
.super-topbar-title { font-weight: 700; }
.super-content { flex: 1; overflow-y: auto; padding: 24px; max-width: 1400px; width: 100%; margin: 0 auto; }

@media (max-width: 860px) {
    .super-sidebar { position: fixed; top: 0; left: 0; z-index: 60; transform: translateX(-100%); transition: transform 0.2s ease; }
    .super-sidebar.open { transform: translateX(0); box-shadow: 0 0 40px rgba(0,0,0,0.5); }
    .super-topbar { display: flex; }
    .super-content { padding: 16px; }
}

/* Common primitives used across super pages */
.sp-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; }
.sp-card h2 { font-size: 1rem; font-weight: 700; color: #f1f5f9; margin: 0 0 14px; }
.sp-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.sp-title { font-size: 1.5rem; font-weight: 800; color: #f1f5f9; margin: 0 0 4px; letter-spacing: -0.3px; }
.sp-subtitle { color: #64748b; font-size: 0.92rem; margin: 0; }
.sp-btn-primary { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; border: none; padding: 9px 16px; border-radius: 9px; font-weight: 600; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
.sp-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239,68,68,0.3); }
.sp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.sp-btn-secondary { background: #1e293b; color: #e5e7eb; border: 1px solid #334155; padding: 9px 16px; border-radius: 9px; font-weight: 600; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
.sp-btn-secondary:hover { background: #334155; }
.sp-btn-danger { background: #7f1d1d; color: white; border: 1px solid #991b1b; padding: 9px 16px; border-radius: 9px; font-weight: 600; font-size: 0.88rem; cursor: pointer; }
.sp-btn-danger:hover { background: #991b1b; }
.sp-input { background: #0b0f1a; color: #e5e7eb; border: 1px solid #334155; border-radius: 8px; padding: 9px 12px; font-size: 0.9rem; width: 100%; font-family: inherit; }
.sp-input:focus { outline: none; border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
.sp-label { display: block; font-size: 0.82rem; color: #94a3b8; font-weight: 600; margin-bottom: 5px; }
.sp-table-wrap { overflow-x: auto; }
.sp-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.sp-table th { text-align: left; padding: 12px; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 1px solid #1e293b; }
.sp-table td { padding: 14px 12px; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
.sp-table tr:hover td { background: #111827; }
.sp-table tr:last-child td { border-bottom: none; }
.sp-table a { color: #fca5a5; text-decoration: none; }
.sp-table a:hover { text-decoration: underline; }
.sp-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; }
.sp-pill-green { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
.sp-pill-yellow { background: rgba(234,179,8,0.15); color: #facc15; border: 1px solid rgba(234,179,8,0.3); }
.sp-pill-red { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
.sp-pill-gray { background: rgba(100,116,139,0.15); color: #cbd5e1; border: 1px solid rgba(100,116,139,0.3); }
.sp-pill-blue { background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
.sp-pill-purple { background: rgba(168,85,247,0.15); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.3); }
.sp-empty { text-align: center; padding: 50px 20px; color: #64748b; }
`;
