import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import AdminBilling from './pages/admin/AdminBilling';
import AdminAutomations from './pages/admin/AdminAutomations';
import AdminTemplates from './pages/admin/AdminTemplates';
import AdminTasks from './pages/admin/AdminTasks';
import AdminBotHealth from './pages/admin/AdminBotHealth';
import AdminReferrals from './pages/admin/AdminReferrals';
import AdminShopQR from './pages/admin/AdminShopQR';
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

// Public Pages
import ClientPortal from './pages/public/ClientPortal';
import Landing from './pages/public/Landing';
import Blog from './pages/public/Blog';
import BlogPost from './pages/public/BlogPost';
import Cases from './pages/public/Cases';
import CaseStudy from './pages/public/CaseStudy';

import './index.css';

// ProtectedRoute lives in components/layout/ProtectedRoute.jsx and accepts
// admin route entry for any of: Profile.role === 'admin', workspaceRole in
// (owner, admin), or is_master_mechanic === true. The previous local copy
// here only checked the first condition, which silently ignored every fix
// to the shared component and bounced master mechanics out of /admin/users.

// Componente principal de rutas
function AppRoutes() {
  const { isAuthenticated, user, loading } = useAuth();

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
            <Navigate to={getDefaultRoute()} replace />
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
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="order/:id" element={<MechanicOrderDetail />} />
        <Route path="orders/:id" element={<MechanicOrderDetail />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="users" element={<AdminUsers />} />
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
        <Route path="appointments" element={<MechanicAppointments />} />
        <Route path="history" element={<MechanicHistory />} />
        <Route path="earnings" element={<MechanicEarnings />} />
        <Route path="requests" element={<MasterRequests />} />
        <Route path="auxiliaries" element={<AuxiliaryDashboard />} />
        <Route path="my-requests" element={<MyRequests />} />
        <Route path="my-payments" element={<AuxiliaryPayments />} />
        <Route path="auxiliary/:id/orders" element={<AuxiliaryOrders />} />
        <Route path="whatsapp" element={<WhatsAppConnect />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="quotations/new" element={<NewQuotation />} />
        <Route path="quotations/:id" element={<QuotationDetail />} />
      </Route>

      {/* Portal público para clientes (sin auth) */}
      <Route path="/orden/:token" element={<ClientPortal />} />

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

      {/* 404 → dashboard si autenticado, landing si no */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to={getDefaultRoute()} replace />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}

// Visible error boundary so a runtime crash inside the app shows the actual
// stack on screen instead of leaving a blank page. Temporary diagnostic.
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
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          background: '#fef2f2',
          color: '#7f1d1d',
          minHeight: '100vh',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#b91c1c' }}>
            Runtime error in app
          </h2>
          <div style={{ marginBottom: 12 }}>
            <strong>Message:</strong> {String(this.state.error?.message || this.state.error)}
          </div>
          {this.state.error?.stack && (
            <details open>
              <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Stack</summary>
              {this.state.error.stack}
            </details>
          )}
          {this.state.info?.componentStack && (
            <details open>
              <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Component stack</summary>
              {this.state.info.componentStack}
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
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
