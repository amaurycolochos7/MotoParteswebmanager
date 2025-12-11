import { supabase } from '../lib/supabase';

/**
 * Upload PDF to Supabase Storage
 * @param {Blob} pdfBlob - PDF file as Blob
 * @param {string} filename - Filename for the PDF
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadPDFToStorage(pdfBlob, filename) {
    try {
        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}_${filename}`;
        const filePath = `service-orders/${uniqueFilename}`;

        console.log('[Storage] Subiendo PDF a Supabase Storage:', filePath);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('pdfs')
            .upload(filePath, pdfBlob, {
                contentType: 'application/pdf',
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('[Storage] Error al subir PDF:', error);
            throw error;
        }

        console.log('[Storage] PDF subido exitosamente:', data);

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from('pdfs')
            .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;
        console.log('[Storage] URL pública generada:', publicUrl);

        return {
            success: true,
            url: publicUrl,
            path: filePath
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
 * Delete PDF from Supabase Storage
 * @param {string} filePath - Path of the file to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deletePDFFromStorage(filePath) {
    try {
        const { error } = await supabase.storage
            .from('pdfs')
            .remove([filePath]);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('[Storage] Error deleting PDF:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
