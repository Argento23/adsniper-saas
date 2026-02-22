'use client';

import { useState, useEffect } from 'react';
import { FaSave, FaUser, FaPalette, FaCommentDots, FaGlobe, FaLink, FaImage } from 'react-icons/fa';

interface BrandData {
    name: string;
    website: string;
    logo_url: string;
    primary_color: string;
    tone: string;
    avatar: string;
}

interface BrandSetupProps {
    onSave: (data: BrandData) => void;
    existingData?: BrandData;
}

export default function BrandSetup({ onSave, existingData }: BrandSetupProps) {
    const [name, setName] = useState(existingData?.name || '');
    const [website, setWebsite] = useState(existingData?.website || '');
    const [logoUrl, setLogoUrl] = useState(existingData?.logo_url || '');
    const [primaryColor, setPrimaryColor] = useState(existingData?.primary_color || '#10b981'); // Default Emerald
    const [tone, setTone] = useState(existingData?.tone || 'Profesional');
    const [avatar, setAvatar] = useState(existingData?.avatar || '');

    // Logo Preview State
    const [logoPreview, setLogoPreview] = useState('');

    useEffect(() => {
        if (logoUrl) setLogoPreview(logoUrl);
    }, [logoUrl]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = { name, website, logo_url: logoUrl, primary_color: primaryColor, tone, avatar };
        localStorage.setItem('adSniperBrand', JSON.stringify(data));
        onSave(data);
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Identidad de Marca & Avatar</h2>
                    <p className="text-slate-400">Define los activos visuales y psicológicos de tu marca.</p>
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
