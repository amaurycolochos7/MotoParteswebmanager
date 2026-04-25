import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
    const { isAuthenticated, user, workspaceRole, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner spinner-lg"></div>
                <p>Cargando...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requiredRole === 'admin') {
        // Admin route: allow if profile.role === 'admin' OR if the user is
        // owner/admin of the active workspace (membership-based access).
        const allowed = user?.role === 'admin'
            || workspaceRole === 'owner'
            || workspaceRole === 'admin';
        if (!allowed) {
            const redirectPath = user?.role === 'admin' ? '/admin' : '/mechanic';
            return <Navigate to={redirectPath} replace />;
        }
    } else if (requiredRole && user?.role !== requiredRole) {
        // Other required roles: keep strict profile.role check.
        const redirectPath = user?.role === 'admin' ? '/admin' : '/mechanic';
        return <Navigate to={redirectPath} replace />;
    }

    return children;
}
