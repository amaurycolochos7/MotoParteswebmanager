import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';

// Layout
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Auth Pages
import Login from './pages/auth/Login';

// Mechanic Pages
import MechanicDashboard from './pages/mechanic/MechanicDashboard';
import NewServiceOrder from './pages/mechanic/NewServiceOrder';
import MechanicOrders from './pages/mechanic/MechanicOrders';
import MechanicHistory from './pages/mechanic/MechanicHistory';
import OrderDetail from './pages/mechanic/OrderDetail';
import ClientsList from './pages/mechanic/ClientsList';
import AppointmentCalendar from './pages/mechanic/AppointmentCalendar';
import QuotationsList from './pages/mechanic/QuotationsList';
import NewQuotation from './pages/mechanic/NewQuotation';
import RemindersPanel from './pages/mechanic/RemindersPanel';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import WhatsAppConnection from './pages/admin/WhatsAppConnection';
import AdminSettings from './pages/admin/AdminSettings';
import AnalyticsDashboard from './pages/admin/AnalyticsDashboard';
import MechanicsManagement from './pages/admin/MechanicsManagement';

// Public Pages
import ClientPortal from './pages/public/ClientPortal';

import './index.css';

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

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={user?.role === 'admin' ? '/admin' : '/mechanic'} replace />
            : <Login />
        }
      />

      {/* Mechanic Routes */}
      <Route
        path="/mechanic"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MechanicDashboard />} />
        <Route path="new-order" element={<NewServiceOrder />} />
        <Route path="orders" element={<MechanicOrders />} />
        <Route path="history" element={<MechanicHistory />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="appointments" element={<AppointmentCalendar />} />
        <Route path="quotations" element={<QuotationsList />} />
        <Route path="quotations/new" element={<NewQuotation />} />
        <Route path="order/:id" element={<OrderDetail />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<MechanicOrders />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="whatsapp" element={<WhatsAppConnection />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="analytics" element={<AnalyticsDashboard />} />
        <Route path="reminders" element={<RemindersPanel />} />
        <Route path="mechanics" element={<MechanicsManagement />} />
      </Route>

      {/* Public Client Portal (no auth required) */}
      <Route path="/orden/:token" element={<ClientPortal />} />

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
