import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { nextFromSearch } from './lib/safeNext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Auth Pages
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Onboarding from './pages/auth/Onboarding';

// Workspace + billing settings
import AdminWorkspace from './pages/admin/AdminWorkspace';
// Equipo, WhatsApp del taller y Conversaciones (V2)
import Team from './pages/shared/Team';
import WhatsAppSettings from './pages/shared/WhatsAppSettings';
import Inbox from './pages/shared/Inbox';
import AdminBilling from './pages/admin/AdminBilling';
import AdminAutomations from './pages/admin/AdminAutomations';
import AdminTemplates from './pages/admin/AdminTemplates';
import AdminTasks from './pages/admin/AdminTasks';
import AdminBotHealth from './pages/admin/AdminBotHealth';
import AdminReferrals from './pages/admin/AdminReferrals';
import AdminShopQR from './pages/admin/AdminShopQR';
import AdminPrinting from './pages/admin/AdminPrinting';
import AdminIntegrations from './pages/admin/AdminIntegrations';
import AdminSupport from './pages/admin/AdminSupport';
import AdminSupportNew from './pages/admin/AdminSupportNew';
import AdminSupportDetail from './pages/admin/AdminSupportDetail';

// Super Admin Pages
import SuperLayout from './pages/super/SuperLayout';
import SuperLogin from './pages/super/SuperLogin';
import SuperDashboard from './pages/super/SuperDashboard';
import SuperWorkspaces from './pages/super/SuperWorkspaces';
import SuperWorkspaceDetail from './pages/super/SuperWorkspaceDetail';
import SuperTickets from './pages/super/SuperTickets';
import SuperTicketDetail from './pages/super/SuperTicketDetail';
import SuperUsers from './pages/super/SuperUsers';
import SuperAudit from './pages/super/SuperAudit';
import SuperPayouts from './pages/super/SuperPayouts';
import SuperCanned from './pages/super/SuperCanned';
import SuperBilling from './pages/super/SuperBilling';
import SuperSettings from './pages/super/SuperSettings';

// Admin Pages
import {
  AdminDashboard,
  AdminOrders,
  AdminClients,
  AdminUsers,
  AdminMechanics,
  AdminAnalytics,
  AdminMechanicOrders
} from './pages/admin/index.jsx';

// Mechanic Pages
import {
  MechanicDashboard,
  MechanicNewOrder,
  MechanicOrders,
  MechanicOrderDetail,
  MechanicClients,
  MechanicAppointments,
  MechanicHistory,
  MechanicEarnings,
  MasterRequests,
  AuxiliaryDashboard,
  MyRequests,
  AuxiliaryPayments,
  AuxiliaryOrders,
  WhatsAppConnect,
  Quotations,
  NewQuotation,
  QuotationDetail
} from './pages/mechanic/index.jsx';

// Buscar cliente por teléfono (admin y mecánico)
import LookupClient from './pages/shared/LookupClient';

// Public Pages
import ClientPortal from './pages/public/ClientPortal';
import Landing from './pages/public/Landing';
import NotFound from './pages/public/NotFound';
import Blog from './pages/public/Blog';
import BlogPost from './pages/public/BlogPost';
import Cases from './pages/public/Cases';
import CaseStudy from './pages/public/CaseStudy';

// Módulo interno "MotoPartes Questions" (acceso solo por PIN, fuera de menús)
import QuestionsApp from './pages/questions/QuestionsApp';
import QuestionsAdmin from './pages/questions/QuestionsAdmin';

import './index.css';

// ProtectedRoute lives in components/layout/ProtectedRoute.jsx and accepts
// admin route entry for any of: Profile.role === 'admin', workspaceRole in
// (owner, admin), or is_master_mechanic === true. The previous local copy
// here only checked the first condition, which silently ignored every fix
// to the shared component and bounced master mechanics out of /admin/users.

// Componente principal de rutas
function AppRoutes() {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner spinner-lg"></div>
        <p>Cargando...</p>
      </div>
    );
  }

  // Ruta por defecto para usuarios AUTENTICADOS (dashboard según rol).
  // Usuarios no autenticados aterrizan en la Landing pública.
  const getDefaultRoute = () => {
    if (user?.role === 'admin') return '/admin';
    return '/mechanic';
  };

  return (
    <Routes>
      {/* Ruta pública - Login */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            // Con sesión abierta, /login?next=... regresa a donde iba el usuario.
            <Navigate to={nextFromSearch(location.search) || getDefaultRoute()} replace />
          ) : (
            <Login />
          )
        }
      />

      {/* Ruta pública - Registro de taller */}
      <Route
        path="/signup"
        element={
          isAuthenticated ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Signup />
          )
        }
      />

      {/* Wizard de onboarding — sólo para usuarios autenticados */}
      <Route
        path="/onboarding"
        element={
          isAuthenticated ? <Onboarding /> : <Navigate to="/login" replace />
        }
      />

      {/* Rutas de Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MechanicDashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="order/:id" element={<MechanicOrderDetail />} />
        <Route path="orders/:id" element={<MechanicOrderDetail />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="lookup" element={<LookupClient />} />
        <Route path="users" element={<Navigate to="/admin/team" replace />} />
        <Route path="team" element={<Team />} />
        <Route path="whatsapp" element={<WhatsAppSettings />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="users/:id/orders" element={<AdminMechanicOrders />} />
        <Route path="mechanics" element={<AdminMechanics />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="workspace" element={<AdminWorkspace />} />
        <Route path="billing" element={<AdminBilling />} />
        <Route path="automations" element={<AdminAutomations />} />
        <Route path="templates" element={<AdminTemplates />} />
        <Route path="tasks" element={<AdminTasks />} />
        <Route path="bot-health" element={<AdminBotHealth />} />
        <Route path="referrals" element={<AdminReferrals />} />
        <Route path="shop-qr" element={<AdminShopQR />} />
        <Route path="printing" element={<AdminPrinting />} />
        <Route path="integrations" element={<AdminIntegrations />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="support/new" element={<AdminSupportNew />} />
        <Route path="support/:id" element={<AdminSupportDetail />} />
      </Route>

      {/* Rutas de Mecánico */}
      <Route
        path="/mechanic"
        element={
          <ProtectedRoute requiredRole="mechanic">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MechanicDashboard />} />
        <Route path="new-order" element={<MechanicNewOrder />} />
        <Route path="orders" element={<MechanicOrders />} />
        <Route path="order/:id" element={<MechanicOrderDetail />} />
        <Route path="clients" element={<MechanicClients />} />
        <Route path="lookup" element={<LookupClient />} />
        <Route path="appointments" element={<MechanicAppointments />} />
        <Route path="history" element={<MechanicHistory />} />
        <Route path="earnings" element={<MechanicEarnings />} />
        <Route path="requests" element={<MasterRequests />} />
        <Route path="auxiliaries" element={<AuxiliaryDashboard />} />
        <Route path="my-requests" element={<MyRequests />} />
        <Route path="my-payments" element={<AuxiliaryPayments />} />
        <Route path="auxiliary/:id/orders" element={<AuxiliaryOrders />} />
        <Route path="whatsapp" element={<Navigate to="/admin/whatsapp" replace />} />
        <Route path="team" element={<Team />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="quotations/new" element={<NewQuotation />} />
        <Route path="quotations/:id" element={<QuotationDetail />} />
      </Route>

      {/* Portal público para clientes (sin auth) */}
      <Route path="/orden/:token" element={<ClientPortal />} />

      {/* Módulo interno "MotoPartes Questions" — acceso solo por PIN.
          Va FUERA de AppLayout y ProtectedRoute (no usa el auth principal) y
          NO aparece en ningún menú. Solo accesible por enlace directo + PIN. */}
      <Route path="/questions" element={<QuestionsApp />} />
      <Route path="/questions/admin" element={<QuestionsAdmin />} />

      {/* Blog y casos (públicos) */}
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/casos" element={<Cases />} />
      <Route path="/casos/:slug" element={<CaseStudy />} />

      {/* Super Admin — panel paralelo al admin del workspace */}
      <Route path="/super/login" element={<SuperLogin />} />
      <Route path="/super" element={<SuperLayout />}>
        <Route index element={<SuperDashboard />} />
        <Route path="workspaces" element={<SuperWorkspaces />} />
        <Route path="workspaces/:id" element={<SuperWorkspaceDetail />} />
        <Route path="tickets" element={<SuperTickets />} />
        <Route path="tickets/:id" element={<SuperTicketDetail />} />
        <Route path="users" element={<SuperUsers />} />
        <Route path="audit" element={<SuperAudit />} />
        <Route path="payouts" element={<SuperPayouts />} />
        <Route path="canned" element={<SuperCanned />} />
        <Route path="billing" element={<SuperBilling />} />
        <Route path="settings" element={<SuperSettings />} />
      </Route>

      {/* Home: si ya está logueado va al dashboard; si no, muestra la landing pública */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to={getDefaultRoute()} replace />
          ) : (
            <Landing />
          )
        }
      />

      {/* 404 → página diseñada de "no encontrado" */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

// Si algo se rompe dentro de la app, en vez de una pantalla en blanco (o un texto técnico en inglés)
// se muestra un aviso claro en español con un botón para volver a cargar.
// Los fallos de "el nodo ya no es hijo" los causa un traductor o extensión del navegador que cambia
// la pantalla por debajo de React (ver lib/domGuard.js): esos se recuperan solos con una recarga,
// una sola vez por minuto para no caer en un bucle.
const RELOAD_KEY = 'motopartes_error_reload';
const isDomMismatch = (e) => /insertBefore|removeChild|not a child|NotFoundError/i.test(`${e?.name || ''} ${e?.message || e || ''}`);

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);
    this.setState({ info });
    if (isDomMismatch(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 60 * 1000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch { /* sin sessionStorage: se queda el aviso con el botón */ }
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const detail = [
      String(this.state.error?.message || this.state.error),
      this.state.error?.stack,
      this.state.info?.componentStack,
    ].filter(Boolean).join('\n\n');
    return (
      <div translate="no" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#f5f5f7', color: '#0b0b0c',
        fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: 440, padding: 24, background: '#fff', border: '1px solid #e6e6ea', borderRadius: 16, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Algo salió mal</h1>
          <p style={{ margin: '0 0 20px', color: '#5b5b61', lineHeight: 1.5 }}>
            La pantalla tuvo un problema, pero tu información está a salvo. Toca el botón para volver a cargar.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{
            width: '100%', minHeight: 48, padding: '12px 16px', font: 'inherit', fontWeight: 700,
            color: '#fff', background: '#dc2626', border: 0, borderRadius: 10, cursor: 'pointer',
          }}>
            Recargar
          </button>
          <details style={{ marginTop: 16, textAlign: 'left', color: '#5b5b61', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Detalle técnico (para soporte)</summary>
            <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11 }}>{detail}</pre>
          </details>
        </div>
      </div>
    );
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;
