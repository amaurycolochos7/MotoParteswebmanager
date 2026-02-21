// Photo Storage Service - Almacena fotos en IndexedDB (sin limite de 5MB como localStorage)

const DB_NAME = 'motopartes_photos';
const DB_VERSION = 1;
const STORE_NAME = 'order_photos';
const EXPIRATION_DAYS = 30;

/**
 * Abre la base de datos IndexedDB
 */
const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'orderId' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                store.createIndex('expiresAt', 'expiresAt', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Guardar fotos de una orden
 */
export const saveOrderPhotos = async (orderId, photos) => {
    try {
        console.log('Guardando fotos para orden:', orderId);

        // Limpiar fotos expiradas primero
        await cleanExpiredPhotos();

        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record = {
            orderId,
            photos,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = () => {
                console.log('Fotos guardadas correctamente para:', orderId);
                resolve(true);
            };
            request.onerror = () => {
                console.error('Error guardando fotos:', request.error);
                reject(request.error);
            };
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error guardando fotos:', e);
        return false;
    }
};

/**
 * Obtener fotos de una orden
 */
export const getOrderPhotos = async (orderId) => {
    try {
        console.log('Buscando fotos para orden:', orderId);
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve) => {
            const request = store.get(orderId);
            request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                    console.log('No se encontraron fotos para:', orderId);
                    resolve(null);
                    return;
                }

                // Verificar si expiro
                if (new Date(record.expiresAt) < new Date()) {
                    deleteOrderPhotos(orderId);
                    resolve(null);
                    return;
                }

                console.log('Fotos encontradas para:', orderId);
                resolve(record.photos);
            };
            request.onerror = () => resolve(null);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error obteniendo fotos:', e);
        return null;
    }
};

/**
 * Eliminar fotos de una orden
 */
export const deleteOrderPhotos = async (orderId) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve) => {
            const request = store.delete(orderId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error eliminando fotos:', e);
        return false;
    }
};

/**
 * Limpiar fotos expiradas
 */
export const cleanExpiredPhotos = async () => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let cleaned = 0;

        return new Promise((resolve) => {
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (new Date(cursor.value.expiresAt) < new Date()) {
                        cursor.delete();
                        cleaned++;
                    }
                    cursor.continue();
                } else {
                    if (cleaned > 0) {
                        console.log(`Limpiadas ${cleaned} fotos expiradas`);
                    }
                    resolve(cleaned);
                }
            };
            request.onerror = () => resolve(0);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error limpiando fotos:', e);
        return 0;
    }
};

/**
 * Verificar cuanto espacio ocupan las fotos (aproximado)
 */
export const getPhotoStorageSize = async () => {
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
            return `${usedMB} MB`;
        }
        return 'N/A';
    } catch (e) {
        return '0 KB';
    }
};

/**
 * Forzar limpieza de las fotos mas antiguas
 */
export const forceCleanOldestPhotos = async (count = 3) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('createdAt');

        return new Promise((resolve) => {
            let cleaned = 0;
            const request = index.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && cleaned < count) {
                    cursor.delete();
                    cleaned++;
                    cursor.continue();
                } else {
                    resolve(cleaned);
                }
            };
            request.onerror = () => resolve(0);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error forzando limpieza:', e);
        return 0;
    }
};

/**
 * Limpiar todo el almacenamiento de fotos
 */
export const clearAllPhotos = async () => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve) => {
            const request = store.clear();
            request.onsuccess = () => {
                console.log('Todo el almacenamiento de fotos ha sido limpiado');
                resolve(true);
            };
            request.onerror = () => resolve(false);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Error limpiando todo el storage:', e);
        return false;
    }
};

// Migrar datos de localStorage a IndexedDB (una sola vez)
export const migrateFromLocalStorage = async () => {
    try {
        const LEGACY_KEY = 'motopartes_order_photos';
        const oldData = localStorage.getItem(LEGACY_KEY);
        if (!oldData) return;

        const storage = JSON.parse(oldData);
        const orderIds = Object.keys(storage);

        if (orderIds.length === 0) {
            localStorage.removeItem(LEGACY_KEY);
            return;
        }

        console.log(`Migrando ${orderIds.length} ordenes de localStorage a IndexedDB...`);

        for (const orderId of orderIds) {
            const entry = storage[orderId];
            await saveOrderPhotos(orderId, entry.photos);
        }

        localStorage.removeItem(LEGACY_KEY);
        console.log('Migracion completada. localStorage limpiado.');
    } catch (e) {
        console.error('Error en migracion:', e);
    }
};
