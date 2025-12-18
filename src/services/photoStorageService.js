// Photo Storage Service - Almacena fotos en localStorage con auto-limpieza

const PHOTO_STORAGE_KEY = 'motopartes_order_photos';
const EXPIRATION_DAYS = 30; // Las fotos se eliminan después de 30 días

// Guardar fotos de una orden
export const saveOrderPhotos = (orderId, photos) => {
    try {
        console.log('📸 Guardando fotos para orden:', orderId);
        const storage = getPhotoStorage();
        storage[orderId] = {
            photos,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(storage));
        console.log('✅ Fotos guardadas correctamente. Total órdenes con fotos:', Object.keys(storage).length);

        // Limpiar fotos expiradas cada vez que guardamos
        cleanExpiredPhotos();

        return true;
    } catch (e) {
        console.error('❌ Error guardando fotos:', e);
        return false;
    }
};

// Obtener fotos de una orden
export const getOrderPhotos = (orderId) => {
    try {
        console.log('📷 Buscando fotos para orden:', orderId);
        const storage = getPhotoStorage();
        console.log('📁 IDs disponibles en storage:', Object.keys(storage));
        const orderPhotos = storage[orderId];

        if (!orderPhotos) {
            console.log('❌ No se encontraron fotos para:', orderId);
            return null;
        }

        // Verificar si expiró
        if (new Date(orderPhotos.expiresAt) < new Date()) {
            deleteOrderPhotos(orderId);
            return null;
        }

        console.log('✅ Fotos encontradas para:', orderId);
        return orderPhotos.photos;
    } catch (e) {
        console.error('Error obteniendo fotos:', e);
        return null;
    }
};

// Eliminar fotos de una orden
export const deleteOrderPhotos = (orderId) => {
    try {
        const storage = getPhotoStorage();
        delete storage[orderId];
        localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(storage));
        return true;
    } catch (e) {
        console.error('Error eliminando fotos:', e);
        return false;
    }
};

// Obtener todas las fotos almacenadas
const getPhotoStorage = () => {
    try {
        const data = localStorage.getItem(PHOTO_STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        return {};
    }
};

// Limpiar fotos expiradas
export const cleanExpiredPhotos = () => {
    try {
        const storage = getPhotoStorage();
        const now = new Date();
        let cleaned = 0;

        Object.keys(storage).forEach(orderId => {
            if (new Date(storage[orderId].expiresAt) < now) {
                delete storage[orderId];
                cleaned++;
            }
        });

        if (cleaned > 0) {
            localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(storage));
            console.log(`Limpiadas ${cleaned} fotos expiradas`);
        }

        return cleaned;
    } catch (e) {
        console.error('Error limpiando fotos:', e);
        return 0;
    }
};

// Verificar cuánto espacio ocupan las fotos
export const getPhotoStorageSize = () => {
    try {
        const data = localStorage.getItem(PHOTO_STORAGE_KEY);
        if (!data) return '0 KB';
        const bytes = new Blob([data]).size;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch (e) {
        return '0 KB';
    }
};
