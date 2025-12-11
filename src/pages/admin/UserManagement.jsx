import { useState } from 'react';
import {
    Plus,
    User,
    Phone,
    Mail,
    Lock,
    X,
    Edit2,
    Trash2,
    Shield,
    Wrench
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function UserManagement() {
    const { users = [], addUser, updateUser, deleteUser } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        password: '',
        role: 'mechanic',
        commission_percentage: 10,
        permissions: {
            canManageAppointments: true,
            canManageQuotes: true,
            canViewAnalytics: false
        }
    });

    const openAddModal = () => {
        setEditingUser(null);
        setFormData({
            full_name: '',
            email: '',
            phone: '',
            password: '',
            role: 'mechanic',
            commission_percentage: 10,
            permissions: {
                canManageAppointments: true,
                canManageQuotes: true,
                canViewAnalytics: false
            }
        });
        setShowModal(true);
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setFormData({
            full_name: user.full_name,
            email: user.email,
            phone: user.phone || '',
            password: '',
            role: user.role,
            commission_percentage: user.commission_percentage || 10,
            permissions: user.permissions || {
                canManageAppointments: true,
                canManageQuotes: true,
                canViewAnalytics: user.role === 'admin'
            }
        });
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.full_name.trim() || !formData.email.trim()) {
            alert('Nombre y email son obligatorios');
            return;
        }

        if (!editingUser && !formData.password.trim()) {
            alert('La contraseña es obligatoria para nuevos usuarios');
            return;
        }

        const userData = {
            full_name: formData.full_name.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            role: formData.role,
            permissions: formData.permissions
        };

        if (editingUser) {
            if (formData.password.trim()) {
                userData.password = formData.password.trim();
            }
            updateUser(editingUser.id, userData);
        } else {
            userData.password = formData.password.trim();
            addUser(userData);
        }

        setShowModal(false);
        setFormData({
            full_name: '',
            email: '',
            phone: '',
            password: '',
            role: 'mechanic',
            permissions: {
                canManageAppointments: true,
                canManageQuotes: true,
                canViewAnalytics: false
            }
        });
    };

    const handleDelete = (user) => {
        if (confirm(`¿Eliminar a ${user.full_name}?`)) {
            deleteUser(user.id);
        }
    };

    const mechanics = users.filter(u => u.role === 'mechanic');
    const admins = users.filter(u => u.role === 'admin');

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Usuarios</h1>
                    <p className="page-subtitle">
                        {mechanics.length} mecánico{mechanics.length !== 1 ? 's' : ''} • {admins.length} admin{admins.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openAddModal}>
                    <Plus size={20} />
                    <span>Nuevo</span>
                </button>
            </div>

            <div className="section">
                <h3 className="section-subtitle">
                    <Wrench size={18} />
                    Mecánicos
                </h3>
                <div className="users-list">
                    {mechanics.length === 0 ? (
                        <div className="empty-card card">
                            <Wrench size={32} style={{ opacity: 0.3 }} />
                            <p className="text-secondary">No hay mecánicos registrados</p>
                        </div>
                    ) : (
                        mechanics.map(user => (
                            <div key={user.id} className="user-card card">
                                <div className="user-card-header">
                                    <div className="user-avatar mechanic">
                                        <Wrench size={24} />
                                    </div>
                                    <div className="user-info">
                                        <h3 className="user-name">
                                            {user.full_name}
                                        </h3>
                                        <div className="user-email">{user.email}</div>
                                        {user.phone && (
                                            <div className="user-phone">
                                                <Phone size={14} />
                                                {user.phone}
                                            </div>
                                        )}
                                        {user.commission_percentage != null && (
                                            <div className="user-commission">
                                                💰 Comisión: {user.commission_percentage}% mano de obra
                                            </div>
                                        )}
                                    </div>
                                    <div className="user-actions">
                                        <button className="btn-icon-small btn-edit" onClick={() => openEditModal(user)} title="Editar">
                                            <Edit2 size={18} />
                                        </button>
                                        <button className="btn-icon-small btn-delete" onClick={() => handleDelete(user)} title="Eliminar">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="section">
                <h3 className="section-subtitle">
                    <Shield size={18} />
                    Administradores
                </h3>
                <div className="users-list">
                    {admins.map(user => (
                        <div key={user.id} className="user-card card">
                            <div className="user-card-header">
                                <div className="user-avatar admin">
                                    <Shield size={24} />
                                </div>
                                <div className="user-info">
                                    <h3 className="user-name">
                                        {user.full_name}
                                    </h3>
                                    <div className="user-email">{user.email}</div>
                                    {user.phone && (
                                        <div className="user-phone">
                                            <Phone size={14} />
                                            {user.phone}
                                        </div>
                                    )}
                                </div>
                                <div className="user-actions">
                                    <button className="btn-icon-small btn-edit" onClick={() => openEditModal(user)} title="Editar">
                                        <Edit2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <button className="fab-button" onClick={openAddModal} title="Agregar usuario">
                <Plus size={24} />
            </button>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre Completo <span className="required">*</span>
                                </label>
                                <div className="input-with-icon">
                                    <User className="input-icon" size={20} />
                                    <input type="text" className="form-input" placeholder="Juan Pérez" value={formData.full_name}
                                        onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))} autoFocus />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Email (usuario) <span className="required">*</span>
                                </label>
                                <div className="input-with-icon">
                                    <Mail className="input-icon" size={20} />
                                    <input type="email" className="form-input" placeholder="usuario@motopartes.com" value={formData.email}
                                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Teléfono (opcional)</label>
                                <div className="input-with-icon">
                                    <Phone className="input-icon" size={20} />
                                    <input type="tel" className="form-input" placeholder="555-123-4567" value={formData.phone}
                                        onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Contraseña {editingUser ? '(dejar vacío para no cambiar)' : <span className="required">*</span>}
                                </label>
                                <div className="input-with-icon">
                                    <Lock className="input-icon" size={20} />
                                    <input type="password" className="form-input" placeholder="••••••" value={formData.password}
                                        onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Rol</label>
                                <select className="form-input" value={formData.role}
                                    onChange={e => {
                                        const newRole = e.target.value;
                                        setFormData(prev => ({
                                            ...prev,
                                            role: newRole,
                                            permissions: {
                                                ...prev.permissions,
                                                canViewAnalytics: newRole === 'admin'
                                            }
                                        }));
                                    }}>
                                    <option value="mechanic">Mecánico</option>
                                    <option value="admin">Administrador</option>
                                </select>
                                <p className="form-hint">
                                    {formData.role === 'mechanic' && '• Acceso a funciones de taller (órdenes, clientes, historial)'}
                                    {formData.role === 'admin' && '• Acceso total: panel admin + funciones de mecánico'}
                                </p>
                            </div>

                            {formData.role === 'mechanic' && (
                                <div className="form-group">
                                    <label className="form-label">
                                        Porcentaje de Comisión <span className="required">*</span>
                                    </label>
                                    <div className="commission-input-wrapper">
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={formData.commission_percentage}
                                            onChange={e => setFormData(prev => ({
                                                ...prev,
                                                commission_percentage: Number(e.target.value)
                                            }))}
                                        />
                                        <span className="percentage-symbol">%</span>
                                    </div>
                                    <p className="form-hint">
                                        💰 Porcentaje de mano de obra que gana el mecánico por cada servicio (no incluye refacciones)
                                    </p>
                                </div>
                            )}

                            {formData.role === 'mechanic' && (
                                <div className="form-group">
                                    <label className="form-label">Permisos Especiales</label>
                                    <div className="permissions-list">
                                        <label className="permission-item">
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.canManageAppointments}
                                                onChange={e => setFormData(prev => ({
                                                    ...prev,
                                                    permissions: {
                                                        ...prev.permissions,
                                                        canManageAppointments: e.target.checked
                                                    }
                                                }))}
                                            />
                                            <div className="permission-info">
                                                <strong>Gestionar Citas</strong>
                                                <span>Puede crear y administrar citas en el calendario</span>
                                            </div>
                                        </label>

                                        <label className="permission-item">
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.canManageQuotes}
                                                onChange={e => setFormData(prev => ({
                                                    ...prev,
                                                    permissions: {
                                                        ...prev.permissions,
                                                        canManageQuotes: e.target.checked
                                                    }
                                                }))}
                                            />
                                            <div className="permission-info">
                                                <strong>Crear Cotizaciones</strong>
                                                <span>Puede crear y enviar cotizaciones a clientes</span>
                                            </div>
                                        </label>

                                        <label className="permission-item">
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.canViewAnalytics}
                                                onChange={e => setFormData(prev => ({
                                                    ...prev,
                                                    permissions: {
                                                        ...prev.permissions,
                                                        canViewAnalytics: e.target.checked
                                                    }
                                                }))}
                                            />
                                            <div className="permission-info">
                                                <strong>Ver Analíticas</strong>
                                                <span>Puede acceder al dashboard de reportes y estadísticas</span>
                                            </div>
                                        </label>
                                    </div>
                                    <p className="form-hint">
                                        Los administradores tienen todos los permisos automáticamente
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                {editingUser ? (<><Edit2 size={18} />Guardar</>) : (<><Plus size={18} />Crear</>)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
.user-management-page{padding-bottom:80px}
.page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--spacing-lg)}
.page-title{font-size:1.5rem;font-weight:700;margin-bottom:4px}
.page-subtitle{color:var(--text-secondary);font-size:0.875rem}
.section{margin-bottom:var(--spacing-xl)}
.section-subtitle{font-size:0.9375rem;font-weight:600;color:var(--text-secondary);display:flex;align-items:center;gap:var(--spacing-sm);margin-bottom:var(--spacing-md)}
.users-list{display:flex;flex-direction:column;gap:var(--spacing-sm)}
.user-card{padding:var(--spacing-md)}
.user-card-header{display:flex;gap:var(--spacing-md);align-items:center}
.user-avatar{width:48px;height:48px;border-radius:var(--radius-full);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.user-avatar.mechanic{background:var(--primary-light);color:var(--primary)}
.user-avatar.admin{background:var(--accent-light);color:var(--accent)}
.user-info{flex:1;min-width:0}
.user-name{font-size:1rem;font-weight:600;margin-bottom:4px}
.user-email{font-size:0.8125rem;color:var(--text-secondary);margin-bottom:4px}
.user-phone{font-size:0.8125rem;color:var(--text-muted);display:flex;align-items:center;gap:4px}
.user-actions{display:flex;gap:var(--spacing-xs);flex-shrink:0}
.btn-icon-small{width:32px;height:32px;border-radius:var(--radius-md);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--transition-fast)}
.btn-edit{background:var(--secondary-light);color:var(--secondary)}
.btn-edit:hover{background:var(--secondary);color:white}
.btn-delete{background:rgba(239,68,68,0.1);color:var(--danger)}
.btn-delete:hover{background:var(--danger);color:white}
.empty-card{display:flex;flex-direction:column;align-items:center;gap:var(--spacing-sm);padding:var(--spacing-xl);text-align:center}
.required{color:var(--danger)}
.fab-button{position:fixed;bottom:calc(70px + var(--spacing-md));right:var(--spacing-md);width:56px;height:56px;background:var(--primary);border:none;border-radius:var(--radius-full);color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(59,130,246,0.4);cursor:pointer;transition:all var(--transition-fast);z-index:100}
.fab-button:hover{background:var(--primary-hover);transform:scale(1.1);box-shadow:0 6px 16px rgba(59,130,246,0.5)}
.fab-button:active{transform:scale(0.95)}
.role-badge{display:inline-block;padding:2px 8px;border-radius:var(--radius-md);font-size:0.6875rem;font-weight:600;margin-left:8px;vertical-align:middle}
.role-badge.admin-mech{background:var(--accent-light);color:var(--accent)}
.form-hint{font-size:0.75rem;color:var(--text-muted);margin-top:4px}
.permissions-list{display:flex;flex-direction:column;gap:var(--spacing-md);margin-top:var(--spacing-sm)}
.permission-item{display:flex;align-items:flex-start;gap:var(--spacing-sm);padding:var(--spacing-md);background:var(--bg-secondary);border-radius:var(--radius-md);cursor:pointer;transition:background var(--transition-fast)}
.permission-item:hover{background:var(--bg-tertiary)}
.permission-item input[type="checkbox"]{margin-top:2px;width:18px;height:18px;cursor:pointer;accent-color:var(--primary)}
.permission-info{flex:1;min-width:0}
.permission-info strong{display:block;font-size:0.875rem;color:var(--text-primary);margin-bottom:2px}
.permission-info span{display:block;font-size:0.75rem;color:var(--text-secondary);line-height:1.4}
.commission-input-wrapper{position:relative;display:flex;align-items:center}
.commission-input-wrapper input{padding-right:40px}
.percentage-symbol{position:absolute;right:var(--spacing-md);color:var(--text-secondary);font-weight:600;font-size:0.9375rem;pointer-events:none}
.user-commission{font-size:0.75rem;color:var(--accent);font-weight:600;margin-top:4px;display:flex;align-items:center;gap:4px}
`}</style>
        </div>
    );
}
