import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2, Camera } from 'lucide-react';

export default function PhotoGallery({ photos = [], onDeletePhoto, canDelete = false }) {
    const [lightboxIndex, setLightboxIndex] = useState(null);

    if (!photos || photos.length === 0) {
        return (
            <div className="no-photos">
                <Camera size={48} style={{ opacity: 0.3 }} />
                <p>No hay fotos para mostrar</p>
            </div>
        );
    }

    const categorized = {
        before: photos.filter(p => p.category === 'before'),
        after: photos.filter(p => p.category === 'after'),
        evidence: photos.filter(p => p.category === 'evidence')
    };

    const categoryTitles = {
        before: '📸 Antes',
        after: '✅ Después',
        evidence: '🔍 Evidencia'
    };

    const openLightbox = (index) => setLightboxIndex(index);
    const closeLightbox = () => setLightboxIndex(null);
    const nextPhoto = () => setLightboxIndex((lightboxIndex + 1) % photos.length);
    const prevPhoto = () => setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length);

    return (
        <div className="photo-gallery">
            {Object.entries(categorized).map(([cat, catPhotos]) => {
                if (catPhotos.length === 0) return null;

                return (
                    <div key={cat} className="photo-category">
                        <h4 className="category-title">{categoryTitles[cat]}</h4>
                        <div className="photos-grid">
                            {catPhotos.map((photo, idx) => {
                                const globalIndex = photos.indexOf(photo);
                                return (
                                    <div key={idx} className="photo-item">
                                        <img
                                            src={photo.url}
                                            alt={photo.caption}
                                            onClick={() => openLightbox(globalIndex)}
                                            loading="lazy"
                                        />
                                        {photo.caption && (
                                            <div className="photo-caption">{photo.caption}</div>
                                        )}
                                        {canDelete && onDeletePhoto && (
                                            <button
                                                className="delete-photo-btn"
                                                onClick={() => onDeletePhoto(globalIndex)}
                                                title="Eliminar foto"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Lightbox */}
            {lightboxIndex !== null && (
                <div className="lightbox" onClick={closeLightbox}>
                    <button className="lightbox-close" onClick={closeLightbox}>
                        <X size={24} />
                    </button>
                    <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); prevPhoto(); }}>
                        <ChevronLeft size={32} />
                    </button>
                    <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); nextPhoto(); }}>
                        <ChevronRight size={32} />
                    </button>
                    <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                        <img src={photos[lightboxIndex].url} alt={photos[lightboxIndex].caption} />
                        {photos[lightboxIndex].caption && (
                            <div className="lightbox-caption">{photos[lightboxIndex].caption}</div>
                        )}
                        <div className="lightbox-counter">
                            {lightboxIndex + 1} / {photos.length}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .photo-gallery {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-lg);
                }

                .photo-category {
                    animation: fadeIn 0.3s ease;
                }

                .category-title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-md);
                    color: var(--text-primary);
                }

                .photos-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: var(--spacing-md);
                }

                .photo-item {
                    position: relative;
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    background: var(--bg-tertiary);
                    aspect-ratio: 1;
                    cursor: pointer;
                    transition: transform var(--transition-fast);
                }

                .photo-item:hover {
                    transform: scale(1.05);
                }

                .photo-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .photo-caption {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
                    color: white;
                    padding: var(--spacing-sm);
                    font-size: 0.75rem;
                }

                .delete-photo-btn {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 28px;
                    height: 28px;
                    border-radius: var(--radius-md);
                    border: none;
                    background: rgba(239, 68, 68, 0.9);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    opacity: 0;
                    transition: opacity var(--transition-fast);
                }

                .photo-item:hover .delete-photo-btn {
                    opacity: 1;
                }

                .delete-photo-btn:hover {
                    background: #dc2626;
                }

                .no-photos {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-2xl);
                    color: var(--text-secondary);
                }

                /* Lightbox */
                .lightbox {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.95);
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                }

                .lightbox-close {
                    position: absolute;
                    top: var(--spacing-md);
                    right: var(--spacing-md);
                    width: 48px;
                    height: 48px;
                    border-radius: var(--radius-full);
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background var(--transition-fast);
                    z-index: 10001;
                }

                .lightbox-close:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .lightbox-nav {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 48px;
                    height: 48px;
                    border-radius: var(--radius-full);
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background var(--transition-fast);
                    z-index: 10001;
                }

                .lightbox-nav:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .lightbox-nav.prev {
                    left: var(--spacing-md);
                }

                .lightbox-nav.next {
                    right: var(--spacing-md);
                }

                .lightbox-content {
                    max-width: 90vw;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .lightbox-content img {
                    max-width: 100%;
                    max-height: 80vh;
                    object-fit: contain;
                    border-radius: var(--radius-lg);
                }

                .lightbox-caption {
                    color: white;
                    margin-top: var(--spacing-md);
                    text-align: center;
                    font-size: 1rem;
                }

                .lightbox-counter {
                    color: rgba(255, 255, 255, 0.7);
                    margin-top: var(--spacing-sm);
                    font-size: 0.875rem;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
