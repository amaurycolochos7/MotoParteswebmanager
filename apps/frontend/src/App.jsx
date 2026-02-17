import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import AppLayout from './components/layout/AppLayout';

// Auth Pages
import Login from './pages/auth/Login';

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
  AuxiliaryOrders
} from './pages/mechanic/index.jsx';

// Public Pages
import ClientPortal from './pages/public/ClientPortal';

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

  // Determinar ruta por defecto según rol
  const getDefaultRoute = () => {
    if (!isAuthenticated) return '/login';
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
      </Route>

      {/* Portal público para clientes (sin auth) */}
      <Route path="/orden/:token" element={<ClientPortal />} />

      {/* Redirecciones por defecto */}
      <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
      <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
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
