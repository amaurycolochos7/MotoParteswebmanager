const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Upload PDF to backend storage
 * @param {Blob} pdfBlob - PDF file as Blob
 * @param {string} filename - Filename for the PDF
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadPDFToStorage(pdfBlob, filename) {
    try {
        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}_${filename}`;

        console.log('[Storage] Subiendo PDF:', uniqueFilename);

        // Convert blob to base64 for API upload
        const reader = new FileReader();
        const base64Data = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(pdfBlob);
        });

        const token = localStorage.getItem('motopartes_token');
        const res = await fetch(`${API_URL}/photos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                url: base64Data,
                category: 'pdf',
                caption: uniqueFilename,
                order_id: null
            })
        });

        if (!res.ok) throw new Error('Error al subir archivo');
        const data = await res.json();

        return {
            success: true,
            url: base64Data, // Use data URL directly
            path: uniqueFilename
        };

    } catch (error) {
        console.error('[Storage] Error uploading PDF:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Delete PDF from storage
 * @param {string} filePath - Path of the file to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deletePDFFromStorage(filePath) {
    try {
        // For now, PDFs stored as base64 don't need separate deletion
        return { success: true };
    } catch (error) {
        console.error('[Storage] Error deleting PDF:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
