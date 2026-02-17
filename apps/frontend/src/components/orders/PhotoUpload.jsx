import { useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

export default function PhotoUpload({ onPhotosAdded }) {
    const [uploading, setUploading] = useState(false);
    const [category, setCategory] = useState('before');
    const [caption, setCaption] = useState('');
    const [preview, setPreview] = useState(null);

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploading(true);

        const photos = [];
        for (const file of files) {
            try {
                const base64 = await fileToBase64(file);
                // Resize image
                const resized = await resizeImage(base64, 1200);

                photos.push({
                    url: resized,
                    category,
                    caption: caption || `${categoryNames[category]}`,
                    file_name: file.name,
                });
            } catch (error) {
                console.error('Error processing image:', error);
            }
        }

        if (photos.length > 0) {
            onPhotosAdded(photos);
            setPreview(null);
            setCaption('');
            e.target.value = '';
        }

        setUploading(false);
    };

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const resizeImage = (base64, maxWidth) => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.src = base64;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        });
    };

    const categoryNames = {
        before: 'Antes',
        after: 'Después',
        evidence: 'Evidencia'
    };

    return (
        <div className="photo-upload">
            <div className="upload-controls">
                <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                        <option value="before">📸 Antes (Problemas encontrados)</option>
                        <option value="after">✅ Después (Trabajo terminado)</option>
                        <option value="evidence">🔍 Evidencia (Garantía/Justificación)</option>
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Descripción (opcional)</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Ej: Pastillas de freno desgastadas..."
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                    />
                </div>
            </div>

            <label className="upload-button">
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    disabled={uploading}
                    style={{ display: 'none' }}
                />
                {uploading ? (
                    <>
                        <div className="spinner"></div>
                        <span>Procesando...</span>
                    </>
                ) : (
                    <>
                        <Upload size={20} />
                        <span>Seleccionar Fotos</span>
                    </>
                )}
            </label>

            <style>{`
                .photo-upload {
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 2px dashed var(--border-color);
                }

                .upload-controls {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                }

                .upload-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-lg);
                    background: var(--primary);
                    color: white;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    font-weight: 600;
                }

                .upload-button:hover:not(:has(input:disabled)) {
                    background: var(--primary-hover);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }

                .upload-button:has(input:disabled) {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
