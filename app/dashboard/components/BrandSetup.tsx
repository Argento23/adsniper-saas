'use client';

import { useState, useEffect, useRef } from 'react';
import { FaSave, FaUser, FaPalette, FaCommentDots, FaGlobe, FaLink, FaImage, FaBox, FaTimes, FaUpload, FaMagic } from 'react-icons/fa';

interface BrandData {
    name: string;
    website: string;
    logo_url: string;
    primary_color: string;
    tone: string;
    avatar: string;
    product_photos: string[]; // base64 array of the user's product/brand photos
    default_scene_prompt: string; // user's preferred default scene description
}

interface BrandSetupProps {
    onSave: (data: BrandData) => void;
    existingData?: BrandData;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function BrandSetup({ onSave, existingData }: BrandSetupProps) {
    const [name, setName] = useState(existingData?.name || '');
    const [website, setWebsite] = useState(existingData?.website || '');
    const [logoUrl, setLogoUrl] = useState(existingData?.logo_url || '');
    const [primaryColor, setPrimaryColor] = useState(existingData?.primary_color || '#10b981');
    const [tone, setTone] = useState(existingData?.tone || 'Profesional');
    const [avatar, setAvatar] = useState(existingData?.avatar || '');
    const [productPhotos, setProductPhotos] = useState<string[]>(existingData?.product_photos || []);
    const [defaultScenePrompt, setDefaultScenePrompt] = useState(existingData?.default_scene_prompt || '');

    const [logoPreview, setLogoPreview] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (logoUrl) setLogoPreview(logoUrl);
    }, [logoUrl]);

    const handleProductPhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const base64s = await Promise.all(
                files.map(f => fileToBase64(f))
            );
            setProductPhotos(prev => [...prev, ...base64s].slice(0, 12)); // cap at 12 photos
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removePhoto = (idx: number) => {
        setProductPhotos(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data: BrandData = {
            name,
            website,
            logo_url: logoUrl,
            primary_color: primaryColor,
            tone,
            avatar,
            product_photos: productPhotos,
            default_scene_prompt: defaultScenePrompt
        };
        localStorage.setItem('AdSíntesisBrand', JSON.stringify(data));
        onSave(data);
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Identidad de Marca & Avatar</h2>
                    <p className="text-slate-400">Logo, fotos de producto y escena. La IA los integra en cada anuncio.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* LEFT COLUMN: Visual Identity */}
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                                <FaPalette className="w-5 h-5 text-emerald-400" /> Identidad Visual
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Nombre de la Marca</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ej: Nike, Apple..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                                        <FaGlobe className="w-4 h-4 text-slate-500" /> Sitio Web (Opcional)
                                    </label>
                                    <input
                                        type="url"
                                        value={website}
                                        onChange={(e) => setWebsite(e.target.value)}
                                        placeholder="https://tutienda.com"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                                        <FaLink className="w-4 h-4 text-slate-500" /> URL del Logo (PNG/SVG)
                                    </label>
                                    <div className="flex gap-4">
                                        <input
                                            type="url"
                                            value={logoUrl}
                                            onChange={(e) => setLogoUrl(e.target.value)}
                                            placeholder="https://.../logo.png"
                                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600"
                                        />
                                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden shrink-0">
                                            {logoPreview ? (
                                                <img src={logoPreview} alt="Logo" className="w-10 h-10 object-contain" onError={() => setLogoPreview('')} />
                                            ) : (
                                                <FaImage className="w-6 h-6 text-slate-300" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Color Principal de Marca</label>
                                    <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 rounded-xl p-2">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent"
                                        />
                                        <span className="text-slate-300 font-mono text-sm uppercase">{primaryColor}</span>
                                    </div>
                                </div>

                                {/* NEW: Product Photos Upload */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                                        <FaBox className="w-4 h-4 text-amber-400" /> Fotos del Producto (para integrar en escenas IA)
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">
                                        Subí hasta 12 fotos. La IA las integra perfectamente en escenas realistas con Bria Product Shot + FLUX IP-Adapter.
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        {productPhotos.map((src, idx) => (
                                            <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 group">
                                                <img src={src} alt={`Producto ${idx + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => removePhoto(idx)}
                                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <FaTimes className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {productPhotos.length < 12 && (
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                                className="aspect-square rounded-lg border-2 border-dashed border-slate-700 hover:border-emerald-500 transition-colors flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-emerald-400 disabled:opacity-50"
                                            >
                                                <FaUpload className="w-5 h-5" />
                                                <span className="text-[10px]">{uploading ? 'Subiendo...' : 'Subir'}</span>
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleProductPhotosUpload}
                                        className="hidden"
                                    />
                                </div>

                                {/* NEW: Default Scene Prompt */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                                        <FaMagic className="w-4 h-4 text-pink-400" /> Escena por defecto (opcional)
                                    </label>
                                    <textarea
                                        value={defaultScenePrompt}
                                        onChange={(e) => setDefaultScenePrompt(e.target.value)}
                                        placeholder="Ej: 'Mesa de mármol blanco con luz natural matutina, fondo desenfocado de cafetería moderna'. La IA lo usará por defecto si no especificás una escena."
                                        rows={3}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600 resize-none text-sm leading-relaxed"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Psychology & Avatar */}
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                                <FaUser className="w-5 h-5 text-purple-400" /> Psicología & Avatar
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                                        <FaCommentDots className="w-4 h-4 text-cyan-400" /> Tono de Voz
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['Profesional', 'Divertido', 'Urgente', 'Lujoso', 'Amigable', 'Agresivo'].map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setTone(t)}
                                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${tone === t ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Cliente Ideal (Avatar Detallado)
                                    </label>
                                    <textarea
                                        value={avatar}
                                        onChange={(e) => setAvatar(e.target.value)}
                                        placeholder="Describe a tu cliente ideal con detalle:
- Demografía: Edad, Género, Ubicación
- Psicografía: Intereses, Comportamientos
- Dolores: ¿Qué problema les quita el sueño?
- Deseos: ¿Qué aspiran lograr?"
                                        className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600 resize-none text-sm leading-relaxed"
                                        required
                                    />
                                    <p className="text-xs text-slate-500 mt-2 text-right">La IA usará esto para afilar los ganchos de venta.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                        <button
                            type="submit"
                            disabled={!name || !avatar}
                            className="w-full bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                        >
                            <FaSave className="w-6 h-6" /> Guardar Identidad Completa
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


