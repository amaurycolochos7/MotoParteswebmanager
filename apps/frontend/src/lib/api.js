// =============================================
// API Client - Reemplaza supabase.js
// Misma interfaz, implementación via REST API
// =============================================

const API_URL = import.meta.env.VITE_API_URL || '/api';
const WA_BOT_URL = import.meta.env.VITE_WHATSAPP_BOT_URL || '/api/whatsapp-bot';
const WA_BOT_KEY = import.meta.env.VITE_WHATSAPP_BOT_KEY || 'motopartes-whatsapp-key';

// Token management
let authToken = localStorage.getItem('motopartes_token');
let activeWorkspaceId = localStorage.getItem('motopartes_active_workspace');

function setToken(token) {
    authToken = token;
    if (token) localStorage.setItem('motopartes_token', token);
    else localStorage.removeItem('motopartes_token');
}

function getToken() {
    return authToken || localStorage.getItem('motopartes_token');
}

// Called by AuthContext whenever the user picks a workspace. The API uses
// this header to scope every query/write to that workspace via the Prisma
// auto-scope extension on the server side.
export function setActiveWorkspaceId(id) {
    activeWorkspaceId = id || null;
}

// Base fetch wrapper
async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { ...options.headers };

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (activeWorkspaceId && !headers['x-workspace-id']) {
        headers['x-workspace-id'] = activeWorkspaceId;
    }
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
        setToken(null);
        window.location.href = '/login';
        throw new Error('Sesión expirada');
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
        throw new Error(err.error || `Error ${res.status}`);
    }

    return res.json();
}

// =============================================
// AUTH SERVICE
// =============================================
export const authService = {
    async login(email, password) {
        const result = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (result.token) setToken(result.token);
        return {
            data: {
                user: result.user,
                memberships: result.memberships || [],
            },
            error: null,
        };
    },

    async register({ email, password, fullName, workshopName, phone, businessType, referralSlug }) {
        const result = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                full_name: fullName,
                workshop_name: workshopName,
                phone,
                business_type: businessType || 'motorcycle',
                referral_slug: referralSlug || null,
            })
        });
        // In Phase 3 the register endpoint auto-logs-in: it returns
        // { success, user, memberships, token, message }.
        if (result?.token) setToken(result.token);
        return result;
    },

    async getProfile(id) {
        try {
            const data = await apiFetch(`/auth/profile/${id}`);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getAllUsers() {
        try {
            const data = await apiFetch('/auth/users');
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async createUser(userData) {
        try {
            const data = await apiFetch('/auth/users', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async updateUser(id, updates) {
        try {
            const data = await apiFetch(`/auth/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async deleteUser(id) {
        return apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
    },

    async deleteUserPermanently(id) {
        return apiFetch(`/auth/users/${id}/permanent`, { method: 'DELETE' });
    },

    logout() {
        setToken(null);
    }
};

// =============================================
// CLIENTS SERVICE
// =============================================
export const clientsService = {
    async getAll() {
        try {
            const data = await apiFetch('/clients');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getById(id) {
        try {
            const data = await apiFetch(`/clients/${id}`);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getByPhone(phone) {
        try {
            const data = await apiFetch(`/clients/phone/${phone}`);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async create(clientData) {
        try {
            const data = await apiFetch('/clients', {
                method: 'POST',
                body: JSON.stringify(clientData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async update(id, updates) {
        try {
            const data = await apiFetch(`/clients/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async delete(id) {
        try {
            await apiFetch(`/clients/${id}`, { method: 'DELETE' });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

// =============================================
// MOTORCYCLES SERVICE
// =============================================
export const motorcyclesService = {
    async getByClient(clientId) {
        try {
            const data = await apiFetch(`/motorcycles?clientId=${clientId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async create(motoData) {
        try {
            const data = await apiFetch('/motorcycles', {
                method: 'POST',
                body: JSON.stringify(motoData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async update(id, updates) {
        try {
            const data = await apiFetch(`/motorcycles/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async delete(id) {
        try {
            await apiFetch(`/motorcycles/${id}`, { method: 'DELETE' });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

// =============================================
// SERVICES CATALOG
// =============================================
export const servicesService = {
    async getAll() {
        try {
            const data = await apiFetch('/services');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async create(serviceData) {
        try {
            const data = await apiFetch('/services', {
                method: 'POST',
                body: JSON.stringify(serviceData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async update(id, updates) {
        try {
            const data = await apiFetch(`/services/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async delete(id) {
        try {
            await apiFetch(`/services/${id}`, { method: 'DELETE' });
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    async getMechanicsPerformance(startDate, endDate) {
        try {
            let url = '/stats/mechanics';
            const params = new URLSearchParams();
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            if (params.toString()) url += `?${params}`;
            const data = await apiFetch(url);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    }
};

// =============================================
// ORDER UPDATES SERVICE
// =============================================
export const orderUpdatesService = {
    async getAll() {
        try {
            const data = await apiFetch('/order-updates');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getByOrder(orderId) {
        try {
            const data = await apiFetch(`/order-updates?orderId=${orderId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async create(updateData) {
        try {
            const data = await apiFetch('/order-updates', {
                method: 'POST',
                body: JSON.stringify(updateData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

// =============================================
// ORDERS SERVICE
// =============================================
export const ordersService = {
    async getAll() {
        try {
            const data = await apiFetch('/orders');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getByMechanic(mechanicId) {
        try {
            const data = await apiFetch(`/orders?mechanicId=${mechanicId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getById(id) {
        try {
            const data = await apiFetch(`/orders/${id}`);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getByToken(token) {
        // Use raw fetch — this is a PUBLIC endpoint, no auth required.
        // apiFetch() would redirect to /login on 401 which breaks client tracking.
        try {
            const res = await fetch(`${API_URL}/orders/public/${token}`, {
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Orden no encontrada' }));
                throw new Error(err.error || `Error ${res.status}`);
            }
            const data = await res.json();
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getByClient(clientId) {
        try {
            const data = await apiFetch(`/orders/client/${clientId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async create(orderData) {
        try {
            const data = await apiFetch('/orders', {
                method: 'POST',
                body: JSON.stringify(orderData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async addService(orderId, serviceData) {
        try {
            const data = await apiFetch(`/orders/${orderId}/services`, {
                method: 'POST',
                body: JSON.stringify(serviceData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async updateStatus(orderId, statusId, changedBy, notes = '') {
        try {
            const data = await apiFetch(`/orders/${orderId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status_id: statusId, notes })
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async markAsPaid(orderId) {
        try {
            const data = await apiFetch(`/orders/${orderId}/paid`, { method: 'PUT' });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async update(orderId, updates) {
        try {
            const data = await apiFetch(`/orders/${orderId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async delete(orderId) {
        try {
            await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    async updateCosts(orderId, costsData) {
        try {
            const data = await apiFetch(`/orders/${orderId}/costs`, {
                method: 'PUT',
                body: JSON.stringify(costsData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

// =============================================
// ORDER STATUSES SERVICE
// =============================================
export const statusesService = {
    async getAll() {
        try {
            const data = await apiFetch('/statuses');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    }
};

// =============================================
// PHOTOS SERVICE
// =============================================
export const photosService = {
    async upload(file, orderId, category, caption, uploadedBy) {
        // Convert file to base64 URL (store in DB)
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const data = await apiFetch('/photos', {
                        method: 'POST',
                        body: JSON.stringify({
                            order_id: orderId,
                            url: reader.result,
                            category,
                            caption,
                        })
                    });
                    resolve({ data, error: null });
                } catch (error) {
                    resolve({ data: null, error });
                }
            };
            reader.readAsDataURL(file);
        });
    },

    async delete(photoId) {
        try {
            await apiFetch(`/photos/${photoId}`, { method: 'DELETE' });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
};

// =============================================
// STATISTICS SERVICE
// =============================================
export const statsService = {
    async getMechanicsPerformance(startDate, endDate) {
        try {
            let url = '/stats/mechanics';
            const params = new URLSearchParams();
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            if (params.toString()) url += `?${params}`;
            const data = await apiFetch(url);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getDashboardStats() {
        try {
            const data = await apiFetch('/stats/dashboard');
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

// =============================================
// WHATSAPP SESSION SERVICE
// =============================================
export const whatsappService = {
    async getSession() {
        try {
            const data = await apiFetch('/whatsapp/sessions');
            return { data: data?.[0] || null, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async updateSession(updates) {
        // Not used directly anymore; bot manages this
        return { data: updates, error: null };
    },

    // New multi-session methods
    async getAllSessions() {
        try {
            const data = await apiFetch('/whatsapp/sessions');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getSessionForMechanic(mechanicId) {
        try {
            const data = await apiFetch(`/whatsapp/sessions/${mechanicId}`);
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

// =============================================
// ORDER REQUESTS SERVICE (Auxiliary → Master)
// =============================================
export const orderRequestsService = {
    async getMasterMechanics() {
        try {
            const data = await apiFetch('/order-requests/masters');
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getPendingForMaster(masterId) {
        try {
            const data = await apiFetch(`/order-requests/pending/${masterId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getByAuxiliary(auxiliaryId) {
        try {
            const data = await apiFetch(`/order-requests/by-auxiliary/${auxiliaryId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getMyRequests(auxiliaryId) {
        return this.getByAuxiliary(auxiliaryId);
    },

    async create(requestData) {
        try {
            const data = await apiFetch('/order-requests', {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async approve(requestId, masterId, notes = '', createdOrderId = null) {
        try {
            const data = await apiFetch(`/order-requests/${requestId}/approve`, {
                method: 'PUT',
                body: JSON.stringify({ notes, created_order_id: createdOrderId })
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async reject(requestId, masterId, notes = '') {
        try {
            const data = await apiFetch(`/order-requests/${requestId}/reject`, {
                method: 'PUT',
                body: JSON.stringify({ notes })
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getPendingCount(masterId) {
        try {
            const data = await apiFetch(`/order-requests/pending-count/${masterId}`);
            return { data: data.count || 0, error: null };
        } catch (error) {
            return { data: 0, error };
        }
    },

    async getAuxiliariesWithStats(masterId) {
        try {
            const data = await apiFetch(`/order-requests/auxiliaries/${masterId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    }
};

// =============================================
// MECHANIC EARNINGS SERVICE
// =============================================
export const earningsService = {
    async recordEarning(orderData, mechanicId, supervisorId = null) {
        try {
            const data = await apiFetch('/earnings', {
                method: 'POST',
                body: JSON.stringify({
                    order_id: orderData.id,
                    mechanic_id: mechanicId,
                    labor_amount: orderData.labor_total || 0,
                    supervisor_id: supervisorId
                })
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getMechanicEarnings(mechanicId, startDate, endDate) {
        try {
            let url = `/earnings?mechanicId=${mechanicId}`;
            if (startDate) url += `&startDate=${startDate}`;
            if (endDate) url += `&endDate=${endDate}`;
            const data = await apiFetch(url);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getAuxiliaryEarnings(masterId, startDate, endDate) {
        return this.getMechanicEarnings(masterId, startDate, endDate);
    },

    async getWeeklySummary(mechanicId) {
        try {
            const data = await apiFetch(`/earnings/weekly/${mechanicId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async markAsPaid(earningIds) {
        try {
            const data = await apiFetch('/earnings/mark-paid', {
                method: 'PUT',
                body: JSON.stringify({ earningIds })
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
};

// =============================================
// PAYMENT REQUESTS SERVICE
// =============================================
export const paymentRequestsService = {
    async create(paymentData) {
        try {
            const data = await apiFetch('/payment-requests', {
                method: 'POST',
                body: JSON.stringify(paymentData)
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async accept(paymentId, auxiliaryId) {
        try {
            const data = await apiFetch(`/payment-requests/${paymentId}/accept`, {
                method: 'PUT',
                body: JSON.stringify({})
            });
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async getPendingForAuxiliary(auxiliaryId) {
        try {
            const data = await apiFetch(`/payment-requests/pending/${auxiliaryId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getHistoryForAuxiliary(auxiliaryId) {
        try {
            const data = await apiFetch(`/payment-requests/history/${auxiliaryId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getHistoryForMaster(masterId) {
        try {
            const data = await apiFetch(`/payment-requests/history/${masterId}`);
            return { data, error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    async getPendingCount(auxiliaryId) {
        try {
            const data = await apiFetch(`/payment-requests/pending-count/${auxiliaryId}`);
            return { data: data.count || 0, error: null };
        } catch (error) {
            return { data: 0, error };
        }
    }
};

// =============================================
// WhatsApp Bot Client (for sending)
// =============================================
async function waBotFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': WA_BOT_KEY,
        ...options.headers
    };
    const res = await fetch(`${WA_BOT_URL}${path}`, { ...options, headers });
    return res;
}

export const whatsappBotService = {
    async getBotSessions() {
        try {
            const res = await waBotFetch('/sessions');
            if (!res.ok) throw new Error('Bot no disponible');
            return res.json();
        } catch { return []; }
    },

    async getSessionStatus(mechanicId) {
        try {
            const res = await waBotFetch(`/sessions/${mechanicId}/status`);
            return res.ok ? res.json() : { exists: false, isConnected: false };
        } catch { return { exists: false, isConnected: false }; }
    },

    async getQR(mechanicId) {
        try {
            const res = await waBotFetch(`/sessions/${mechanicId}/qr`);
            return res.ok ? res.json() : { qr: null };
        } catch { return { qr: null }; }
    },

    async startSession(mechanicId) {
        try {
            const res = await waBotFetch(`/sessions/${mechanicId}/start`, { method: 'POST' });
            return res.ok;
        } catch { return false; }
    },

    async logoutSession(mechanicId) {
        try {
            const res = await waBotFetch(`/sessions/${mechanicId}/logout`, { method: 'POST' });
            return res.ok;
        } catch { return false; }
    },

    async sendMessage(mechanicId, phone, message) {
        try {
            const res = await waBotFetch('/send-message', {
                method: 'POST',
                body: JSON.stringify({ mechanicId, phone, message })
            });
            if (res.ok) return { success: true, automated: true };
            return { success: false, fallback: true };
        } catch {
            return { success: false, fallback: true };
        }
    },

    async sendForOrder(orderId, phone, message) {
        try {
            const res = await waBotFetch('/send-for-order', {
                method: 'POST',
                body: JSON.stringify({ orderId, phone, message })
            });
            if (res.ok) return { success: true, automated: true };
            return { success: false, fallback: true };
        } catch {
            return { success: false, fallback: true };
        }
    },

    async getBotHealth() {
        try {
            const res = await fetch(`${WA_BOT_URL.replace('/api', '')}/health`);
            return res.ok ? res.json() : null;
        } catch { return null; }
    }
};

// Backward compatibility
export const supabase = null;
export default null;

// =============================================
// WORKSPACE SERVICE (Phase 3)
// =============================================
export const workspaceService = {
    async getCurrent() {
        return apiFetch('/workspaces/current');
    },
    async update(data) {
        return apiFetch('/workspaces/current', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    async completeOnboarding() {
        return apiFetch('/workspaces/current/complete-onboarding', {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },
    async listMembers() {
        return apiFetch('/workspaces/current/members');
    },
    async listInvitations() {
        return apiFetch('/workspaces/current/invitations');
    },
    async createInvitation({ email, role }) {
        return apiFetch('/workspaces/current/invitations', {
            method: 'POST',
            body: JSON.stringify({ email, role }),
        });
    },
    async deleteInvitation(id) {
        return apiFetch(`/workspaces/current/invitations/${id}`, { method: 'DELETE' });
    },
    async getUsage() {
        return apiFetch('/workspaces/current/usage');
    },
    async listMine() {
        return apiFetch('/workspaces/mine');
    },
    async listPublicPlans() {
        return apiFetch('/workspaces/plans');
    },
};

// =============================================
// BILLING SERVICE (Phase 4)
// =============================================
export const billingService = {
    async getStatus() {
        return apiFetch('/billing/status');
    },
    async listPlans() {
        return apiFetch('/billing/plans');
    },
    async checkout({ plan_code, interval }) {
        return apiFetch('/billing/checkout', {
            method: 'POST',
            body: JSON.stringify({ plan_code, interval }),
        });
    },
    async openPortal() {
        return apiFetch('/billing/portal', { method: 'POST', body: JSON.stringify({}) });
    },
    async cancelSubscription() {
        return apiFetch('/billing/cancel', { method: 'POST', body: JSON.stringify({}) });
    },
    async resumeSubscription() {
        return apiFetch('/billing/resume', { method: 'POST', body: JSON.stringify({}) });
    },
};

// =============================================
// AUTOMATIONS / TEMPLATES / TASKS (Phase 5)
// =============================================
export const automationService = {
    list() { return apiFetch('/automations'); },
    create(data) { return apiFetch('/automations', { method: 'POST', body: JSON.stringify(data) }); },
    update(id, data) { return apiFetch(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    remove(id) { return apiFetch(`/automations/${id}`, { method: 'DELETE' }); },
    listJobs(opts = {}) {
        const qs = new URLSearchParams(opts).toString();
        return apiFetch(`/automations/jobs${qs ? '?' + qs : ''}`);
    },
};

export const templateService = {
    list() { return apiFetch('/templates'); },
    create(data) { return apiFetch('/templates', { method: 'POST', body: JSON.stringify(data) }); },
    update(id, data) { return apiFetch(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    remove(id) { return apiFetch(`/templates/${id}`, { method: 'DELETE' }); },
};

export const taskService = {
    list(opts = {}) {
        const qs = new URLSearchParams(opts).toString();
        return apiFetch(`/tasks${qs ? '?' + qs : ''}`);
    },
    create(data) { return apiFetch('/tasks', { method: 'POST', body: JSON.stringify(data) }); },
    complete(id) { return apiFetch(`/tasks/${id}/complete`, { method: 'PUT', body: JSON.stringify({}) }); },
    reopen(id) { return apiFetch(`/tasks/${id}/reopen`, { method: 'PUT', body: JSON.stringify({}) }); },
    remove(id) { return apiFetch(`/tasks/${id}`, { method: 'DELETE' }); },
};

export const referralsService = {
    getMine() { return apiFetch('/referrals/me'); },
    regenerateSlug(slug) {
        return apiFetch('/referrals/regenerate-slug', {
            method: 'POST',
            body: JSON.stringify({ slug }),
        });
    },
};

export const integrationsService = {
    getStatus() { return apiFetch('/integrations/status'); },
    googleAuthUrl() { return apiFetch('/integrations/google/auth-url'); },
    googleDisconnect() {
        return apiFetch('/integrations/google/disconnect', {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },
};

// ───────────────────────────────────────────────
// TICKETS (cliente de un workspace)
// ───────────────────────────────────────────────
export const ticketsService = {
    list() { return apiFetch('/tickets'); },
    get(id) { return apiFetch(`/tickets/${id}`); },
    create(data) {
        return apiFetch('/tickets', { method: 'POST', body: JSON.stringify(data) });
    },
    reply(id, body_md) {
        return apiFetch(`/tickets/${id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ body_md }),
        });
    },
    markResolved(id) {
        return apiFetch(`/tickets/${id}/mark-resolved`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },
};

// ───────────────────────────────────────────────
// SUPER-ADMIN (panel /super)
// ───────────────────────────────────────────────
export const superService = {
    // Métricas
    metrics() { return apiFetch('/super/metrics'); },

    // Workspaces
    listWorkspaces(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/workspaces${qs ? '?' + qs : ''}`);
    },
    getWorkspace(id) { return apiFetch(`/super/workspaces/${id}`); },
    assignPlan(id, data) {
        return apiFetch(`/super/workspaces/${id}/plan`, { method: 'POST', body: JSON.stringify(data) });
    },
    extendTrial(id, data) {
        return apiFetch(`/super/workspaces/${id}/extend-trial`, { method: 'POST', body: JSON.stringify(data) });
    },
    suspend(id, reason) {
        return apiFetch(`/super/workspaces/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
    },
    unsuspend(id) {
        return apiFetch(`/super/workspaces/${id}/unsuspend`, { method: 'POST', body: JSON.stringify({}) });
    },
    togglePartner(id) {
        return apiFetch(`/super/workspaces/${id}/partner-toggle`, { method: 'POST', body: JSON.stringify({}) });
    },
    impersonate(id, reason) {
        return apiFetch(`/super/workspaces/${id}/impersonate`, { method: 'POST', body: JSON.stringify({ reason }) });
    },
    endImpersonate(session_id) {
        return apiFetch('/super/impersonate/end', { method: 'POST', body: JSON.stringify({ session_id }) });
    },

    // Usuarios
    listUsers(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/users${qs ? '?' + qs : ''}`);
    },
    deactivateUser(id) {
        return apiFetch(`/super/users/${id}/deactivate`, { method: 'POST', body: JSON.stringify({}) });
    },
    reactivateUser(id) {
        return apiFetch(`/super/users/${id}/reactivate`, { method: 'POST', body: JSON.stringify({}) });
    },

    // Audit
    audit(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/audit${qs ? '?' + qs : ''}`);
    },

    // Billing / Payouts
    listSubscriptions(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/subscriptions${qs ? '?' + qs : ''}`);
    },
    listPayouts(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/payouts${qs ? '?' + qs : ''}`);
    },
    payPayout(id, data) {
        return apiFetch(`/super/payouts/${id}/pay`, { method: 'POST', body: JSON.stringify(data) });
    },
    skipPayout(id, reason) {
        return apiFetch(`/super/payouts/${id}/skip`, { method: 'POST', body: JSON.stringify({ reason }) });
    },

    // Tickets
    listTickets(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`/super/tickets${qs ? '?' + qs : ''}`);
    },
    getTicket(id) { return apiFetch(`/super/tickets/${id}`); },
    replyTicket(id, data) {
        return apiFetch(`/super/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(data) });
    },
    patchTicket(id, data) {
        return apiFetch(`/super/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },

    // Canned
    listCanned() { return apiFetch('/super/canned'); },
    createCanned(data) { return apiFetch('/super/canned', { method: 'POST', body: JSON.stringify(data) }); },
    updateCanned(id, data) { return apiFetch(`/super/canned/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    deleteCanned(id) { return apiFetch(`/super/canned/${id}`, { method: 'DELETE' }); },

    // Maintenance
    runPayoutSweep() {
        return apiFetch('/super/maintenance/run-payout-sweep', { method: 'POST', body: JSON.stringify({}) });
    },
};
