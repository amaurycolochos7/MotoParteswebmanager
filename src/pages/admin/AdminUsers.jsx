import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../lib/supabase';
import {
    Plus,
    Edit2,
    Trash2,
    User,
    Mail,
    Phone,
    Shield,
    Percent,
    X,
    Save,
    UserCheck,
    UserX,
    Calendar,
    MessageSquare,
    Eye,
    EyeOff,
    MonitorSmartphone,
    ClipboardList,
    Wrench,
    Crown,
    Users,
    CheckCircle,
    AlertTriangle
} from 'lucide-react';

export default function AdminUsers() {
    const navigate = useNavigate();
    const toast = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [deletingPermanently, setDeletingPermanently] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        password: '',
        role: 'mechanic',
        commission_percentage: 10,
        can_create_appointments: true,
        can_send_messages: true,
        can_create_clients: true,
        can_create_services: false,
        can_edit_clients: false,
        can_delete_orders: false,
        is_master_mechanic: false,
        requires_approval: false,
        can_view_approved_orders: true
    });

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await authService.getAllUsers();
            setUsers(data || []);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                full_name: user.full_name || '',
                email: user.email || '',
                phone: user.phone || '',
                password: '',
                role: user.role || 'mechanic',
                commission_percentage: user.commission_percentage || 10,
                can_create_appointments: user.can_create_appointments !== false,
                can_send_messages: user.can_send_messages !== false,
                can_create_clients: user.can_create_clients !== false,
                can_create_services: user.can_create_services === true,
                can_edit_clients: user.can_edit_clients === true,
                can_delete_orders: user.can_delete_orders === true,
                is_master_mechanic: user.is_master_mechanic === true,
                requires_approval: user.requires_approval === true,
                can_view_approved_orders: user.can_view_approved_orders !== false
            });
        } else {
            setEditingUser(null);
            setFormData({
                full_name: '',
                email: '',
                phone: '',
                password: '',
                role: 'mechanic',
                commission_percentage: 10,
                can_create_appointments: true,
                can_send_messages: true,
                can_create_clients: true,
                can_create_services: false,
                can_edit_clients: false,
                can_delete_orders: false,
                is_master_mechanic: false,
                requires_approval: false,
                can_view_approved_orders: true
            });
        }
        setShowPassword(false); // Reset visualización
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingUser(null);
    };

    const handleSave = async () => {
        if (!formData.full_name.trim() || !formData.email.trim()) {
            toast.warning('Nombre y email son requeridos');
            return;
        }

        if (!editingUser && !formData.password) {
            toast.warning('La contraseña es requerida para nuevos usuarios');
            return;
        }

        try {
            if (editingUser) {
                await authService.updateUser(editingUser.id, {
                    full_name: formData.full_name,
                    phone: formData.phone,
                    role: formData.role,
                    commission_percentage: parseFloat(formData.commission_percentage) || 10,
                    can_create_appointments: formData.can_create_appointments,
                    can_send_messages: formData.can_send_messages,
                    can_create_clients: formData.can_create_clients,
                    can_create_services: formData.can_create_services,
                    can_edit_clients: formData.can_edit_clients,
                    can_delete_orders: formData.can_delete_orders,
                    is_master_mechanic: formData.is_master_mechanic,
                    requires_approval: formData.requires_approval,
                    can_view_approved_orders: formData.can_view_approved_orders,
                    ...(formData.password && { password_hash: formData.password })
                });
            } else {
                await authService.createUser({
                    full_name: formData.full_name,
                    email: formData.email,
                    phone: formData.phone,
                    password: formData.password,
                    role: formData.role,
                    commission_percentage: parseFloat(formData.commission_percentage) || 10,
                    can_create_appointments: formData.can_create_appointments,
                    can_send_messages: formData.can_send_messages,
                    can_create_clients: formData.can_create_clients,
                    can_create_services: formData.can_create_services,
                    can_edit_clients: formData.can_edit_clients,
                    can_delete_orders: formData.can_delete_orders,
                    is_master_mechanic: formData.is_master_mechanic,
                    requires_approval: formData.requires_approval,
                    can_view_approved_orders: formData.can_view_approved_orders
                });
            }
            handleCloseModal();
            loadUsers();
            toast.success(editingUser ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente');
        } catch (error) {
            toast.error('Error al guardar: ' + error.message);
        }
    };

    const handleToggleActive = async (userId, isActive) => {
        try {
            await authService.updateUser(userId, { is_active: !isActive });
            loadUsers();
            toast.success(isActive ? 'Usuario desactivado' : 'Usuario activado');
        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    };

    const handleDeleteUser = (user) => {
        setUserToDelete(user);
        setShowDeleteModal(true);
    };

    const confirmDeletePermanent = async () => {
        if (!userToDelete) return;

        setDeletingPermanently(true);
        try {
            await authService.deleteUserPermanently(userToDelete.id);
            setShowDeleteModal(false);
            setUserToDelete(null);
            loadUsers();
            toast.success('Usuario y todas sus dependencias eliminados permanentemente');
        } catch (error) {
            toast.error('Error al eliminar: ' + error.message);
        } finally {
            setDeletingPermanently(false);
        }
    };

    const handleShareCredentials = (user) => {
        if (!user.phone) {
            toast.warning('El usuario no tiene teléfono registrado');
            return;
        }

        const message =
            `*CREDENCIALES DE ACCESO - MotoPartes Manager*

Hola *${user.full_name}*, aquí tienes tus datos para ingresar a la plataforma:

*TUS DATOS:*
> Nombre: ${user.full_name}
> Correo: ${user.email}
> Teléfono: ${user.phone}

*PARA INICIAR SESIÓN:*
> Usuario: ${user.email} (Correo)
> Contraseña: (La que definiste o se te asignó)`;

        const whatsappUrl = `https://wa.me/${user.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const getRoleBadge = (role) => {
        const roles = {
            admin: { label: 'Administrador', color: 'var(--danger)' },
            mechanic: { label: 'Mecánico', color: 'var(--primary)' },
            admin_mechanic: { label: 'Mecánico Maestro', color: 'var(--warning)' }
        };
        const config = roles[role] || roles.mechanic;
        return (
            <span className="role-badge" style={{ background: `${config.color}20`, color: config.color }}>
                <Shield size={12} />
                {config.label}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
                <div className="spinner spinner-lg"></div>
                <p>Cargando usuarios...</p>
            </div>
        );
    }

    return (
        <div className="admin-users">
            {/* Header */}
            <div className="page-header-mobile">
                <div>
                    <h1 className="page-title">Usuarios del Sistema</h1>
                    <p className="page-subtitle">
                        {users.length} usuarios registrados
                    </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleOpenModal()}>
                    <Plus size={18} />
                    <span className="btn-text-mobile">Nuevo</span>
                </button>
            </div>

            {/* Lista de usuarios - Tarjetas responsive */}
            <div className="user-cards-grid">
                {users.map(user => (
                    <div key={user.id} className={`user-card-new ${!user.is_active ? 'inactive' : ''}`}>
                        {/* Header con avatar y nombre */}
                        <div className="user-header-new">
                            <div className="user-avatar-new">
                                {user.full_name?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="user-info-new">
                                <h3 className="user-name-new">{user.full_name}</h3>
                                {getRoleBadge(user.role)}
                            </div>
                            <div className={`status-indicator ${user.is_active ? 'active' : 'inactive'}`}>
                                {user.is_active ? '✓ Activo' : '✗ Inactivo'}
                            </div>
                        </div>

                        {/* Datos de contacto */}
                        <div className="user-contact-new">
                            <div className="contact-row">
                                <Mail size={16} />
                                <span>{user.email}</span>
                            </div>
                            {user.phone && (
                                <div className="contact-row">
                                    <Phone size={16} />
                                    <span>{user.phone}</span>
                                </div>
                            )}
                            {user.role !== 'admin' && (
                                <div className="contact-row commission">
                                    <Percent size={16} />
                                    <span>Comisión: <strong>{user.commission_percentage}%</strong></span>
                                </div>
                            )}
                        </div>

                        {/* Acciones con etiquetas claras */}
                        <div className="user-actions-new">
                            <button
                                className="action-btn-new edit"
                                onClick={() => handleOpenModal(user)}
                            >
                                <Edit2 size={16} />
                                Editar
                            </button>
                            <button
                                className="action-btn-new whatsapp"
                                onClick={() => handleShareCredentials(user)}
                            >
                                <MessageSquare size={16} />
                                WhatsApp
                            </button>
                            {user.role !== 'admin' && (
                                <button
                                    className="action-btn-new orders"
                                    onClick={() => navigate(`/admin/users/${user.id}/orders`)}
                                >
                                    <ClipboardList size={16} />
                                    Órdenes
                                </button>
                            )}
                        </div>

                        {/* Acciones peligrosas separadas */}
                        <div className="user-danger-actions">
                            <button
                                className={`danger-btn ${user.is_active ? 'deactivate' : 'activate'}`}
                                onClick={() => handleToggleActive(user.id, user.is_active)}
                            >
                                {user.is_active ? (
                                    <><UserX size={14} /> Desactivar</>
                                ) : (
                                    <><UserCheck size={14} /> Activar</>
                                )}
                            </button>
                            <button
                                className="danger-btn delete"
                                onClick={() => handleDeleteUser(user)}
                            >
                                <Trash2 size={14} /> Eliminar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal modal-mobile" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                            </h3>
                            <button className="modal-close" onClick={handleCloseModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre completo <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    Email <span className="required">*</span>
                                </label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    disabled={!!editingUser}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Teléfono</label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    Contraseña {!editingUser && <span className="required">*</span>}
                                </label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="form-input"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={editingUser ? 'Dejar vacío para mantener' : 'Contraseña'}
                                />
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div className="form-row-mobile">
                                <div className="form-group">
                                    <label className="form-label">Rol</label>
                                    <select
                                        className="form-select"
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="mechanic">Mecánico</option>
                                        <option value="admin_mechanic">Mecánico Maestro</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Comisión (%)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.commission_percentage}
                                        onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                                        min="0"
                                        max="100"
                                    />
                                </div>
                            </div>

                            {/* Permisos del mecánico */}
                            {formData.role !== 'admin' && (
                                <div className="permissions-section">
                                    <label className="form-label">Permisos del Mecánico</label>
                                    <div className="permissions-grid">
                                        <label className="toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={formData.can_create_appointments}
                                                onChange={(e) => setFormData({ ...formData, can_create_appointments: e.target.checked })}
                                            />
                                            <span className="toggle-content">
                                                <Calendar size={16} />
                                                Puede crear citas
                                            </span>
                                        </label>
                                        <label className="toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={formData.can_send_messages}
                                                onChange={(e) => setFormData({ ...formData, can_send_messages: e.target.checked })}
                                            />
                                            <span className="toggle-content">
                                                <MessageSquare size={16} />
                                                Puede enviar mensajes
                                            </span>
                                        </label>
                                        <label className="toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={formData.can_create_clients}
                                                onChange={(e) => setFormData({ ...formData, can_create_clients: e.target.checked })}
                                            />
                                            <span className="toggle-content">
                                                <User size={16} />
                                                <Plus size={10} style={{ marginLeft: -4 }} />
                                                Puede crear clientes
                                            </span>
                                        </label>
                                        <label className="toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={formData.can_create_services}
                                                onChange={(e) => setFormData({ ...formData, can_create_services: e.target.checked })}
                                            />
                                            <span className="toggle-content">
                                                <Wrench size={16} />
                                                Puede crear servicios
                                            </span>
                                        </label>
                                        <label className="toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={formData.can_delete_orders}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    can_delete_orders: e.target.checked,
                                                    can_edit_clients: e.target.checked
                                                })}
                                            />
                                            <span className="toggle-content">
                                                <Edit2 size={16} />
                                                Puede editar y eliminar (Clientes y Órdenes)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Tipo de Mecánico (Maestro/Auxiliar) */}
                            {formData.role === 'mechanic' && (
                                <div className="permissions-section mechanic-type-section">
                                    <label className="form-label">
                                        <Crown size={16} style={{ marginRight: 6, color: 'var(--warning)' }} />
                                        Tipo de Mecánico
                                    </label>
                                    <div className="permissions-grid">
                                        <label className="toggle-label toggle-highlight">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_master_mechanic}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    is_master_mechanic: e.target.checked,
                                                    requires_approval: e.target.checked ? false : formData.requires_approval
                                                })}
                                            />
                                            <span className="toggle-content">
                                                <Crown size={16} />
                                                Mecánico Maestro
                                                <small className="toggle-hint">Puede aprobar órdenes de auxiliares</small>
                                            </span>
                                        </label>
                                        <label className="toggle-label toggle-highlight">
                                            <input
                                                type="checkbox"
                                                checked={formData.requires_approval}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    requires_approval: e.target.checked,
                                                    is_master_mechanic: e.target.checked ? false : formData.is_master_mechanic
                                                })}
                                            />
                                            <span className="toggle-content">
                                                <Users size={16} />
                                                Requiere Aprobación (Auxiliar)
                                                <small className="toggle-hint">Debe solicitar aprobación para crear órdenes</small>
                                            </span>
                                        </label>
                                        {formData.requires_approval && (
                                            <label className="toggle-label">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.can_view_approved_orders}
                                                    onChange={(e) => setFormData({ ...formData, can_view_approved_orders: e.target.checked })}
                                                />
                                                <span className="toggle-content">
                                                    <CheckCircle size={16} />
                                                    Puede ver órdenes aprobadas
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={handleCloseModal}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={18} />
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Borrado Permanente */}
            {showDeleteModal && (
                <div className="modal-overlay danger" onClick={() => !deletingPermanently && setShowDeleteModal(false)}>
                    <div className="modal modal-mobile modal-danger" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>
                                <AlertTriangle size={24} style={{ marginRight: 8 }} />
                                Confirmar Borrado Total
                            </h3>
                            <button
                                className="modal-close"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deletingPermanently}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="danger-warning-box">
                                <p>Estás a punto de eliminar permanentemente a:</p>
                                <div className="user-to-delete-info">
                                    <strong>{userToDelete?.full_name}</strong>
                                    <span>{userToDelete?.email}</span>
                                </div>

                                <div className="cascade-warning">
                                    <h4 style={{ color: '#991b1b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 700 }}>
                                        Esta acción forzará el borrado de:
                                    </h4>
                                    <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: '#7f1d1d' }}>
                                        <li>Todas sus órdenes de servicio</li>
                                        <li>Historial de servicios y fotos</li>
                                        <li>Registros de ganancias y comisiones</li>
                                        <li>Solicitudes de pago y de órdenes</li>
                                    </ul>
                                </div>

                                <p style={{ marginTop: '16px', fontWeight: 600, color: '#dc2626', fontSize: '0.9rem' }}>
                                    ¡Esta acción es irreversible y destruirá todos los datos asociados!
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deletingPermanently}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={confirmDeletePermanent}
                                disabled={deletingPermanently}
                                style={{ background: 'var(--danger)', color: 'white' }}
                            >
                                {deletingPermanently ? (
                                    <>
                                        <span className="spinner spinner-white" style={{ width: 16, height: 16 }}></span>
                                        Borrando...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        ELIMINAR TODO
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .page-header-mobile {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                    flex-wrap: wrap;
                }

                .btn-text-mobile {
                    display: inline;
                }

                @media (max-width: 480px) {
                    .btn-text-mobile {
                        display: none;
                    }
                }

                .user-cards-grid {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .user-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-md);
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border-color);
                }

                .user-card.inactive {
                    opacity: 0.6;
                }

                .user-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-sm);
                }

                .user-card-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    flex: 1;
                    min-width: 0;
                }

                .user-card-info > div {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                }

                .user-card-info strong {
                    font-size: 0.9375rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .user-avatar-sm {
                    width: 40px;
                    height: 40px;
                    min-width: 40px;
                    background: var(--primary);
                    color: white;
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.875rem;
                    font-weight: 600;
                }

                .user-card-actions {
                    display: flex;
                    gap: 4px;
                    flex-shrink: 0;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    max-width: 180px;
                }

                .action-warning {
                    background: #fef3c7;
                    color: #d97706;
                }
                
                .action-warning:hover {
                    background: #fde68a;
                }

                .action-delete {
                    background: #fee2e2;
                    color: #dc2626;
                }
                
                .action-delete:hover {
                    background: #fecaca;
                }

                .action-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: var(--radius-md);
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .action-edit {
                    background: #dbeafe;
                    color: #2563eb;
                }
                
                .action-edit:hover {
                    background: #bfdbfe;
                }

                .action-share {
                    background: #dbeafe;
                    color: #0891b2; /* cyan-600 */
                }
                .action-share:hover {
                    background: #cffafe;
                }

                .action-view-services {
                    background: #e0e7ff;
                    color: #4f46e5; /* indigo-600 */
                }
                .action-view-services:hover {
                    background: #c7d2fe;
                }

                .action-danger {
                    background: #fee2e2;
                    color: #dc2626;
                }
                
                .action-danger:hover {
                    background: #fecaca;
                }

                .action-success {
                    background: #dcfce7;
                    color: #16a34a;
                }
                
                .action-success:hover {
                    background: #bbf7d0;
                }

                .user-card-body {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .user-card-detail {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .user-card-detail span {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .user-card-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: var(--spacing-sm);
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                }

                .role-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 8px;
                    border-radius: var(--radius-full);
                    font-size: 0.6875rem;
                    font-weight: 600;
                }

                .commission-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: var(--success-light);
                    color: var(--success);
                    border-radius: var(--radius-sm);
                    font-size: 0.8125rem;
                    font-weight: 600;
                }

                .modal-mobile {
                    width: calc(100% - 32px);
                    max-width: 420px;
                    max-height: calc(100vh - 40px);
                }

                .form-row-mobile {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-md);
                }

                @media (max-width: 480px) {
                    .form-row-mobile {
                        grid-template-columns: 1fr;
                    }
                }

                .permissions-section {
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                }

                .permissions-grid {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .toggle-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-hover);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: background var(--transition-fast);
                }

                .toggle-label:hover {
                    background: var(--bg-selected);
                }

                .toggle-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--primary);
                }

                .toggle-content {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    flex-wrap: wrap;
                }

                .toggle-hint {
                    width: 100%;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-left: 20px;
                }

                .toggle-highlight {
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(249, 115, 22, 0.05) 100%);
                    border: 1px solid rgba(245, 158, 11, 0.2);
                }

                .toggle-highlight:hover {
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%);
                }

                .mechanic-type-section {
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.05) 0%, rgba(245, 158, 11, 0.02) 100%);
                    border: 1px solid rgba(245, 158, 11, 0.15);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    margin-top: var(--spacing-md);
                }

                .mechanic-type-section .form-label {
                    display: flex;
                    align-items: center;
                    margin-bottom: var(--spacing-sm);
                    color: var(--warning);
                    font-weight: 600;
                }

                .form-group {
                    position: relative;
                }

                .password-toggle-btn {
                    position: absolute;
                    right: 12px;
                    top: 38px; /* Ajustado para alinear con input */
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                }

                .password-toggle-btn:hover {
                    color: var(--primary);
                }

                /* ========== NEW USER CARD STYLES ========== */
                .user-card-new {
                    background: var(--bg-card);
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                    border: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .user-card-new.inactive {
                    opacity: 0.7;
                    background: #f8fafc;
                }

                .user-header-new {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .user-avatar-new {
                    width: 52px;
                    height: 52px;
                    min-width: 52px;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    color: white;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.125rem;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }

                .user-info-new {
                    flex: 1;
                    min-width: 0;
                }

                .user-name-new {
                    margin: 0 0 4px 0;
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: #1e293b;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .status-indicator {
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .status-indicator.active {
                    background: #dcfce7;
                    color: #16a34a;
                }

                .status-indicator.inactive {
                    background: #f1f5f9;
                    color: #64748b;
                }

                .user-contact-new {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 12px 16px;
                    background: #f8fafc;
                    border-radius: 10px;
                }

                .contact-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.9rem;
                    color: #475569;
                }

                .contact-row svg {
                    color: #94a3b8;
                    flex-shrink: 0;
                }

                .contact-row.commission {
                    color: #059669;
                }

                .contact-row.commission svg {
                    color: #059669;
                }

                .user-actions-new {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .action-btn-new {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    border-radius: 8px;
                    border: none;
                    font-size: 0.8125rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .action-btn-new.edit {
                    background: #dbeafe;
                    color: #2563eb;
                }
                .action-btn-new.edit:hover {
                    background: #bfdbfe;
                }

                .action-btn-new.whatsapp {
                    background: #dcfce7;
                    color: #16a34a;
                }
                .action-btn-new.whatsapp:hover {
                    background: #bbf7d0;
                }

                .action-btn-new.orders {
                    background: #e0e7ff;
                    color: #4f46e5;
                }
                .action-btn-new.orders:hover {
                    background: #c7d2fe;
                }

                .user-danger-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 12px;
                    border-top: 1px solid #e2e8f0;
                }

                .danger-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 12px;
                    border-radius: 6px;
                    border: 1px solid transparent;
                    font-size: 0.75rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: transparent;
                }

                .danger-btn.deactivate {
                    color: #d97706;
                    border-color: #fde68a;
                }
                .danger-btn.deactivate:hover {
                    background: #fef3c7;
                }

                .danger-btn.activate {
                    color: #16a34a;
                    border-color: #bbf7d0;
                }
                .danger-btn.activate:hover {
                    background: #dcfce7;
                }

                .danger-btn.delete {
                    color: #dc2626;
                    border-color: #fecaca;
                }
                .danger-btn.delete:hover {
                    background: #fee2e2;
                }

                @media (max-width: 480px) {
                    .user-card-new {
                        padding: 16px;
                    }

                    .user-header-new {
                        flex-wrap: wrap;
                    }

                    .status-indicator {
                        order: -1;
                        width: 100%;
                        text-align: center;
                        margin-bottom: 8px;
                    }

                    .user-actions-new {
                        flex-direction: column;
                    }

                    .action-btn-new {
                        justify-content: center;
                    }

                    .user-danger-actions {
                        flex-direction: column;
                    }

                    .danger-btn {
                        justify-content: center;
                    }
                }

                /* Danger Modal Styles */
                .modal-danger {
                    border-top: 4px solid var(--danger);
                }

                .danger-warning-box {
                    background: #fff5f5;
                    border: 1px solid #feb2b2;
                    padding: 20px;
                    border-radius: 12px;
                }

                .user-to-delete-info {
                    margin: 12px 0;
                    padding: 12px;
                    background: white;
                    border: 1px solid #fed7d7;
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                }

                .cascade-warning {
                    margin-top: 16px;
                    padding: 12px;
                    background: #fffaf0;
                    border-left: 4px solid #f6ad55;
                    border-radius: 4px;
                }

                .spinner-white {
                    border-color: rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                }
            `}</style>
        </div>
    );
}
