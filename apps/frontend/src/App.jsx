import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import AppLayout from './components/layout/AppLayout';

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
  AdminServices,
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
  MechanicServices,
  MechanicHistory,
  MechanicEarnings,
  MasterRequests,
  AuxiliaryDashboard,
  MyRequests,
  AuxiliaryPayments,
  AuxiliaryOrders,
  WhatsAppConnect
} from './pages/mechanic/index.jsx';

// Public Pages
import ClientPortal from './pages/public/ClientPortal';
import Landing from './pages/public/Landing';
import Blog from './pages/public/Blog';
import BlogPost from './pages/public/BlogPost';
import Cases from './pages/public/Cases';
import CaseStudy from './pages/public/CaseStudy';

import './index.css';

// Componente de ruta protegida
function ProtectedRoute({ children, requiredRole = null }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner spinner-lg"></div>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Verificar rol si es necesario
  if (requiredRole === 'admin' && user?.role !== 'admin') {
    return <Navigate to="/mechanic" replace />;
  }

  if (requiredRole === 'mechanic') {
    if (user?.role !== 'mechanic' && user?.role !== 'admin_mechanic') {
      return <Navigate to="/admin" replace />;
    }
  }

  return children;
}

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
        <Route path="services" element={<AdminServices />} />
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
        <Route path="services" element={<MechanicServices />} />
        <Route path="history" element={<MechanicHistory />} />
        <Route path="earnings" element={<MechanicEarnings />} />
        <Route path="requests" element={<MasterRequests />} />
        <Route path="auxiliaries" element={<AuxiliaryDashboard />} />
        <Route path="my-requests" element={<MyRequests />} />
        <Route path="my-payments" element={<AuxiliaryPayments />} />
        <Route path="auxiliary/:id/orders" element={<AuxiliaryOrders />} />
        <Route path="whatsapp" element={<WhatsAppConnect />} />
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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
