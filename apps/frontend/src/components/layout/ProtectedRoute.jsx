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
        // Admin route: any of these wins.
        // - Profile.role === 'admin' (legacy global admin)
        // - Membership(active workspace).role in (owner, admin)
        // - Profile.is_master_mechanic === true (workshop owner/master)
        // The last one is the safety net: even if the AuthContext lost the
        // active workspace (stale localStorage, hydration race), a master
        // mechanic is by definition entitled to manage their own team.
        const allowed = user?.role === 'admin'
            || user?.role === 'admin_mechanic'
            || workspaceRole === 'owner'
            || workspaceRole === 'admin'
            || user?.is_master_mechanic === true;
        if (!allowed) {
            console.warn('[ProtectedRoute] admin denied', {
                profileRole: user?.role,
                workspaceRole,
                isMasterMechanic: user?.is_master_mechanic,
                path: location.pathname,
            });
            const redirectPath = user?.role === 'admin' ? '/admin' : '/mechanic';
            return <Navigate to={redirectPath} replace />;
        }
    } else if (requiredRole === 'mechanic') {
        // Mechanic route: accept any mechanic-flavored profile so master mechanics
        // (role='admin_mechanic') and auxiliaries don't loop. The previous strict
        // equality `role === 'mechanic'` redirected admin_mechanic to /mechanic
        // forever — Navigate replace inside the same route remounts ProtectedRoute,
        // which redirects again → infinite loop, blank screen.
        const allowed = user?.role === 'mechanic'
            || user?.role === 'admin_mechanic'
            || user?.role === 'admin'
            || user?.is_master_mechanic === true;
        if (!allowed) {
            console.warn('[ProtectedRoute] mechanic denied', {
                profileRole: user?.role,
                isMasterMechanic: user?.is_master_mechanic,
                path: location.pathname,
            });
            return <Navigate to="/login" replace />;
        }
    } else if (requiredRole && user?.role !== requiredRole) {
        // Other required roles: keep strict profile.role check.
        const redirectPath = user?.role === 'admin' ? '/admin' : '/mechanic';
        return <Navigate to={redirectPath} replace />;
    }

    return children;
}
