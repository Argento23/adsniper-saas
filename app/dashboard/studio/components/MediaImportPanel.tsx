'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaFileVideo, FaFileAudio, FaFileImage, FaUpload, FaTrash, FaEye, FaInfo, FaSpinner, FaPlus } from 'react-icons/fa';
import { MediaAsset, saveMediaAsset, generateVideoThumbnail, generateAudioThumbnail, formatFileSize, formatDuration } from '@/lib/storage/indexed-media';
import { useToast } from './Toast';

interface ImportMediaPanelProps {
    projectId: string;
    onAssetsChange?: (assets: MediaAsset[]) => void;
    onAddToTimeline?: (asset: MediaAsset) => void;
    className?: string;
}

const ACCEPTED_TYPES = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'image/jpeg': '.jpg,.jpeg',
    'image/png': '.png',
    'image/webp': '.webp',
};

function getMediaType(mimeType: string): 'video' | 'audio' | 'image' {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'image';
}

function generateId(): string {
    return `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function ImportMediaPanel({ projectId, onAssetsChange, onAddToTimeline, className = '' }: ImportMediaPanelProps) {
    const [uploading, setUploading] = useState<Record<string, { progress: number; error?: string }>>({});
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const { showToast } = useToast();
    const fileRefsRef = useRef<Map<string, File>>(new Map());

    // Load existing assets on mount
    useEffect(() => {
        loadAssets();
    }, [projectId]);

    const loadAssets = async () => {
        try {
            const db = await (await import('@/lib/storage/indexed-media')).getDB();
            const tx = db.transaction('media', 'readonly');
            const items = await tx.objectStore('media').getAll();
            const refs: MediaAsset[] = items.map((item: any) => ({
                id: item.asset.id,
                name: item.asset.name,
                type: item.asset.type,
                duration: item.asset.duration,
                width: item.asset.width,
                height: item.asset.height,
                thumbnail: item.asset.thumbnail,
                fileId: item.asset.id,
                createdAt: item.asset.createdAt,
            }));
            setAssets(refs);
            onAssetsChange?.(refs);
        } catch (e) {
            console.error('Failed to load assets:', e);
        }
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        for (const file of acceptedFiles) {
            const id = generateId();
            fileRefsRef.current.set(id, file);

            setUploading(prev => ({ ...prev, [id]: { progress: 0 } }));

            try {
                const type = getMediaType(file.type);
                let thumbnail = '';
                let duration = 0;
                let width = 0;
                let height = 0;

                if (type === 'video') {
                    duration = await getVideoDuration(file);
                    const thumb = await generateVideoThumbnail(file);
                    thumbnail = thumb;
                    const dims = await getVideoDimensions(file);
                    width = dims.width;
                    height = dims.height;
                } else if (type === 'audio') {
                    duration = await getAudioDuration(file);
                    thumbnail = await generateAudioThumbnail(file as File);
                } else {
                    const dims = await getImageDimensions(file);
                    width = dims.width;
                    height = dims.height;
                    const canvas = document.createElement('canvas');
                    canvas.width = dims.width;
                    canvas.height = dims.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = '#1a1a2e';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = '#666';
                        ctx.font = '10px sans-serif';
                        ctx.fillText('Image', canvas.width / 3, canvas.height / 2);
                    }
                    thumbnail = canvas.toDataURL('image/jpeg', 0.8);
                }

                const asset: MediaAsset = {
                    id,
                    name: file.name,
                    type,
                    duration,
                    width,
                    height,
                    thumbnail,
                    fileId: id,
                    createdAt: new Date().toISOString(),
                };

                const blob = file.slice();
                await saveMediaAsset(projectId, { ...asset, fileId: id }, blob);

                const ref: MediaAsset = {
                    id,
                    name: file.name,
                    type: asset.type,
                    duration: asset.duration,
                    width: asset.width,
                    height: asset.height,
                    thumbnail: asset.thumbnail,
                    fileId: id,
                    createdAt: asset.createdAt,
                };

                setAssets(prev => [...prev, ref]);
                showToast('success', `Subido: ${file.name}`);
            } catch (e) {
                console.error('Upload error:', e);
                showToast('error', `Error subiendo ${file.name}`);
                setUploading(prev => ({ ...prev, [id]: { progress: 0, error: 'Error al subir' } }));
            } finally {
                setUploading(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }
        }
    }, [projectId]);

    const onDropRejected = useCallback((...args: any[]) => {
        const rejectedFiles = args[0] as { file: File; errors: { code: string; message: string }[] }[];
        for (const { file, errors } of rejectedFiles) {
            showToast('error', `${file.name}: ${errors.map(e => e.message).join(', ')}`);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
        onDrop,
        onDropRejected,
        accept: ACCEPTED_TYPES,
        multiple: true,
        noClick: false,
        noKeyboard: false,
    });

    const removeAsset = async (id: string) => {
        if (!confirm('¿Eliminar este archivo?')) return;

        try {
            const { deleteMediaAsset } = await import('@/lib/storage/indexed-media');
            await deleteMediaAsset(id);
            setAssets(prev => prev.filter(a => a.id !== id));
            showToast('success', 'Archivo eliminado');
        } catch (e) {
            showToast('error', 'Error al eliminar');
        }
    };

    const previewAsset = async (id: string) => {
        const asset = assets.find(a => a.id === id);
        if (!asset) return;

        // Open blob in new tab
        const mod = await import('@/lib/storage/indexed-media');
        const result = await mod.getMediaAsset(id);
        if (!result) return;
        const { blob } = result;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    const uploadingCount = Object.keys(uploading).length;

    return (
        <div
            {...getRootProps()}
            className={`relative border-2 border-dashed rounded-2xl p-6 transition-colors ${isDragActive ? 'border-emerald-500 bg-emerald-500/5' : isDragReject ? 'border-red-500 bg-red-500/5' : 'border-white/10'} ${className}`}
        >
            <input {...getInputProps()} />

            <div className="space-y-4">
                {/* Drop Zone Header */}
                <div className="text-center">
                    <div className={`mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center ${isDragActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/60'}`}>
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">Importar Media</h3>
                    <p className="text-sm text-slate-400">
                        {isDragActive ? 'Suelta los archivos aquí' : 'Arrastra videos, audio o imágenes, o haz clic para seleccionar'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        MP4, MOV, WEBM, MP3, WAV, JPG, PNG, WEBP
                    </p>
                </div>

                {/* Upload Progress */}
                {Object.keys(uploading).length > 0 && (
                    <div className="space-y-2 border-t border-white/5 pt-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subiendo...</h4>
                        {Object.entries(uploading).map(([id, { progress, error }]) => (
                            <div key={id} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
                                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                                    <FaSpinner className="w-5 h-5 text-emerald-400 animate-spin" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-white truncate">{fileRefsRef.current.get(id)?.name || 'Procesando...'}</span>
                                        <span className="text-slate-400">{Math.round(progress)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                                        <div
                                            className={`h-full rounded-full transition-all ${error ? 'bg-red-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    {error && (
                                        <p className="text-xs text-red-400 mt-1">{error}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Assets Grid */}
                <div className="border-t border-white/5 pt-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                            Archivos ({assets.length})
                        </h4>
                        {assets.length > 0 && (
                            <button
                                onClick={() => {
                                    if (confirm('¿Eliminar todos los archivos?')) {
                                        // Implementation would go here
                                    }
                                }}
                                className="text-xs text-red-400 hover:text-red-300"
                            >
                                Limpiar todo
                            </button>
                        )}
                    </div>

                    {assets.length === 0 && !isDragActive ? (
                        <div className="text-center py-12 text-slate-500">
                            <FaFileVideo className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                            <p>No hay archivos aún</p>
                            <p className="text-xs mt-1">Arrastra archivos o haz clic para subir</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {assets.map(asset => (
                                <div key={asset.id} className="group relative bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden hover:border-emerald-500/30 transition-all">
                                    <div className="aspect-video relative overflow-hidden bg-slate-800">
                                        {asset.thumbnail ? (
                                            <img
                                                src={asset.thumbnail}
                                                alt={asset.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                {asset.type === 'video' && <FaFileVideo className="w-12 h-12 text-slate-600" />}
                                                {asset.type === 'audio' && <FaFileAudio className="w-12 h-12 text-slate-600" />}
                                                {asset.type === 'image' && <FaFileImage className="w-12 h-12 text-slate-600" />}
                                            </div>
                                        )}
                                        <div className="absolute top-2 left-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                asset.type === 'video' ? 'bg-blue-500/20 text-blue-400' :
                                                asset.type === 'audio' ? 'bg-purple-500/20 text-purple-400' :
                                                'bg-emerald-500/20 text-emerald-400'
                                            }`}>
                                                {asset.type.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="absolute top-2 right-2">
                                            <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded font-mono">
                                                {asset.duration > 0 ? `${Math.floor(asset.duration / 60)}:${String(Math.floor(asset.duration % 60)).padStart(2, '0')}` : '--:--'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-medium text-white truncate" title={asset.name}>
                                                {asset.name}
                                            </h4>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => previewAsset(asset.id)}
                                                    className="p-1.5 text-slate-400 hover-text-white transition-colors rounded"
                                                    title="Previsualizar"
                                                >
                                                    <FaEye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => removeAsset(asset.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded"
                                                    title="Eliminar"
                                                >
                                                    <FaTrash className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <FaInfo className="w-3 h-3" />
                                                {asset.width}x{asset.height}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <FaInfo className="w-3 h-3" />
                                                {asset.duration > 0 ? `${Math.floor(asset.duration / 60)}:${String(Math.floor(asset.duration % 60)).padStart(2, '0')}` : '--:--'}
                                            </span>
                                        </div>
                                        {onAddToTimeline && asset.type === 'video' && (
                                            <button
                                                onClick={() => onAddToTimeline(asset)}
                                                className="w-full mt-2 px-3 py-1.5 text-xs font-bold text-white bg-emerald-500/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors"
                                                title="Agregar al timeline"
                                            >
                                                <FaPlus className="w-3 h-3 mr-1" /> Agregar al timeline
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper functions
function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve(video.duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve(0);
        };
    });
}

function getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.src = URL.createObjectURL(file);
        audio.onloadedmetadata = () => {
            URL.revokeObjectURL(audio.src);
            resolve(audio.duration);
        };
        audio.onerror = () => {
            URL.revokeObjectURL(audio.src);
            resolve(0);
        };
    });
}

function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve({ width: video.videoWidth, height: video.videoHeight });
        };
        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve({ width: 0, height: 0 });
        };
    });
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            resolve({ width: 0, height: 0 });
        };
    });
}

