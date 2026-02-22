'use client';

import { useState, useEffect } from 'react';
import { FaStar, FaLayerGroup, FaBolt, FaFire, FaSpinner, FaArrowRight, FaExternalLinkAlt, FaHeart, FaComments, FaPaperPlane, FaBookmark, FaRegCopy, FaCheck, FaGlobe, FaImage, FaCog, FaVideo, FaPen, FaMagic, FaCloudUploadAlt, FaTrash } from 'react-icons/fa';
import { UserButton } from "@clerk/nextjs";
import BrandSetup from './components/BrandSetup';
import VideoScriptViewer from './components/VideoScriptViewer';
import UpgradeModal from './components/UpgradeModal';

const MOCK_SCRIPTS = [
    {
        title: "POV: Descubrí esto",
        angle: "Storytelling",
        audio_suggestion: "Trending 'Oh No' remix",
        platform: "TikTok",
        sections: [
            { type: "Gancho", content: "POV: Estás por descubrir algo que cambia todo.", duration: "3s" },
            { type: "Cuerpo", content: "(Cámara en mano) Miren lo que acabo de encontrar. La diferencia se nota desde el primer uso.", duration: "12s" },
            { type: "CTA", content: "Link en bio. Quedan pocas unidades.", duration: "4s" }
        ]
    },
    {
        title: "Tutorial Express",
        angle: "How-To",
        audio_suggestion: "Lo-fi study beats",
        platform: "Reels",
        sections: [
            { type: "Gancho", content: "3 formas de usarlo que no conocías 👇", duration: "3s" },
            { type: "Cuerpo", content: "Tip 1: Uso principal. Tip 2: Hack creativo. Tip 3: El secreto que nadie te cuenta.", duration: "15s" },
            { type: "CTA", content: "Guardá este video y comprá en el link de la bio.", duration: "3s" }
        ]
    },
    {
        title: "Antes vs Después",
        angle: "Transformación",
        audio_suggestion: "Dramatic reveal sound",
        platform: "TikTok",
        sections: [
            { type: "Gancho", content: "ANTES vs DESPUÉS 😱", duration: "3s" },
            { type: "Cuerpo", content: "(Split screen) El cambio es increíble. La transformación habla sola.", duration: "10s" },
            { type: "CTA", content: "Comentá '🔥' y te mando el link.", duration: "3s" }
        ]
    },
    {
        title: "Cosas que no sabías",
        angle: "Educativo Viral",
        audio_suggestion: "Audio 'Cosas que no sabías'",
        platform: "Shorts",
        sections: [
            { type: "Gancho", content: "Cosas que no sabías sobre este producto:", duration: "2s" },
            { type: "Cuerpo", content: "1. Beneficio clave. 2. Lo usan profesionales. 3. Dato sorprendente. *Green screen*", duration: "12s" },
            { type: "CTA", content: "Seguime para más y link en bio.", duration: "3s" }
        ]
    }
];

const MOCK_ADS = [
    {
        type: "Viral Hook",
        headline: "Stop Wasting Money on Bad Ads",
        primary_text: "This simple tool saved me hours of work. The results are insane! 🚀 #GrowthHacking #Marketing",
        generated_image_url: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?auto=format&fit=crop&w=800&q=80"
    },
    {
        type: "Problem/Solution",
        headline: "Finally, a Solution That Works",
        primary_text: "Tired of complicated workflows? AdSniper makes it easy. Try it today and see the difference.",
        generated_image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80"
    },
    {
        type: "Social Proof",
        headline: "Everyone is Talking About This",
        primary_text: "Join thousands of satisfied users who have transformed their business. Don't miss out! ⭐⭐⭐⭐⭐",
        generated_image_url: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80"
    }
];

const FALLBACK_IMAGE = "https://placehold.co/800x800/101827/ffffff.png?text=Ad+Image"; // Simple, reliable placeholder

// --- AD CARD COMPONENT (Fixes Shared State Bug) ---
const AdCard = ({ ad, index, brand, productImage, videosRemaining, onVideoGenerated }: { ad: any, index: number, brand: any, productImage: string, videosRemaining: number, onVideoGenerated?: (remaining: number) => void }) => {
    const [imgSrc, setImgSrc] = useState(ad.generated_image_url || productImage || FALLBACK_IMAGE);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [generatingVideo, setGeneratingVideo] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);

    useEffect(() => {
        const newSrc = ad.generated_image_url || ad.product_image_fallback || productImage || FALLBACK_IMAGE;
        setImgSrc(newSrc);
        setVideoUrl(null); // Reset video on ad change
        setHasError(false);
    }, [ad, productImage]);

    const handleGenerateVideo = async () => {
        if (videosRemaining <= 0) {
            alert("Has alcanzado tu límite de videos. Mejorá tu plan para generar más videos.");
            return;
        }

        if (!imgSrc || imgSrc.includes('placehold.co')) {
            alert("Se necesita una imagen válida para generar video.");
            return;
        }

        setGeneratingVideo(true);
        try {
            const resp = await fetch('/api/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: imgSrc })
            });
            const data = await resp.json();

            if (resp.status === 403) {
                alert(data.message || "Se requiere un plan Pro o superior para generar videos.");
                return;
            }

            if (data.videoUrl) {
                setVideoUrl(data.videoUrl);
                if (data.videosRemaining !== undefined && onVideoGenerated) {
                    onVideoGenerated(data.videosRemaining);
                }
            } else {
                alert(data.message || data.error || "Error al generar video");
            }
        } catch (err) {
            console.error(err);
            alert("Error de conexión al generar video");
        } finally {
            setGeneratingVideo(false);
        }
    };

    const handleImageError = (e: any) => {
        console.error(`Ad #${index} Image Load Error for SRC:`, e.currentTarget.src);
        if (imgSrc === ad.generated_image_url && productImage) {
            setImgSrc(productImage);
        } else if (imgSrc !== FALLBACK_IMAGE) {
            setImgSrc(FALLBACK_IMAGE);
        } else {
            setHasError(true);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(ad.primary_text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: `${index * 150}ms` }}>
            {/* Phone Frame */}
            <div className="bg-white text-slate-900 rounded-[2rem] overflow-hidden shadow-2xl relative border-[8px] border-slate-800 transform hover:scale-[1.02] transition-transform duration-300">
                {/* Status Bar Mock */}
                <div className="h-6 bg-white flex justify-between px-6 pt-2 items-center text-[10px] font-bold text-slate-800">
                    <span>9:41</span>
                    <div className="flex gap-1">
                        <span className="w-4 h-2 bg-slate-800 rounded-sm"></span>
                        <span className="w-3 h-2 bg-slate-800 rounded-sm"></span>
                    </div>
                </div>

                {/* Instagram Header */}
                <div className="flex items-center justify-between p-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full p-[2px]`} style={{ background: `linear-gradient(to top right, ${brand?.primary_color || '#3b82f6'}, #a855f7)` }}>
                            <div className="w-full h-full bg-white rounded-full p-[2px] overflow-hidden">
                                {brand?.logo_url ? (
                                    <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                                        {brand?.name ? brand.name.charAt(0).toUpperCase() : 'A'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="leading-tight">
                            <p className="text-xs font-bold flex items-center">
                                {brand?.name || 'Your Brand'}
                                <span className="ml-1 bg-blue-500 text-white rounded-full p-[1px]"><FaCheck className="w-2 h-2" /></span>
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">Sponsored</p>
                        </div>
                    </div>
                    <div className="text-slate-400 text-lg font-bold pb-2">...</div>
                </div>

                {/* Content Area (Image or Video) */}
                <div className="aspect-square bg-slate-900 relative group overflow-hidden flex items-center justify-center border-t border-slate-800">
                    {videoUrl ? (
                        <video
                            src={videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    ) : !hasError ? (
                        <img
                            src={imgSrc}
                            alt="Ad Creative"
                            className={`w-full h-full object-cover transition-all duration-1000 group-hover:scale-105 ${imgSrc.includes('pollinations') || imgSrc.includes('data:') ? 'animate-in fade-in fill-mode-both' : ''}`}
                            loading="eager"
                            onError={handleImageError}
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-slate-900">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-lg border border-slate-700">
                                <FaImage className="w-8 h-8 text-slate-500" />
                            </div>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Imagen Protegida</p>
                            <p className="text-xs text-slate-600">No se pudo cargar la imagen</p>
                        </div>
                    )}

                    <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-lg z-20 bg-black/50 backdrop-blur-md border border-white/10">
                        {videoUrl ? 'AI VIDEO' : `${ad.type} Angle`}
                    </div>

                    <div className={`absolute bottom-0 left-0 w-full py-2 px-4 flex justify-between items-center bg-white/90 backdrop-blur-md border-t border-slate-100 z-20`}>
                        <span className="text-xs font-bold text-slate-900">Shop Now</span>
                        <FaArrowRight className="w-3 h-3 text-slate-900" style={{ color: brand?.primary_color || '#0f172a' }} />
                    </div>

                    {/* Loading Overlay for Video */}
                    {generatingVideo && (
                        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 transition-all">
                            <FaSpinner className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
                            <p className="text-white font-bold text-sm animate-pulse uppercase tracking-widest">Creando Movimiento...</p>
                            <p className="text-slate-400 text-[10px] mt-1 px-8 text-center">Esto puede tardar hasta 30 segundos</p>
                        </div>
                    )}
                </div>

                {/* DEBUG/PREVIEW BUTTON */}
                {!videoUrl && (ad.generated_image_url || imgSrc) && (
                    <div className="bg-slate-50 p-2 text-center border-b border-slate-100">
                        <button
                            onClick={() => setShowImageModal(true)}
                            className="text-[10px] text-slate-500 font-bold hover:text-slate-800 transition-colors flex items-center justify-center gap-1 mx-auto"
                        >
                            <FaExternalLinkAlt className="w-2 h-2" /> VER IMAGEN COMPLETA
                        </button>
                    </div>
                )}

                {/* Image Preview Modal */}
                {showImageModal && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
                        onClick={() => setShowImageModal(false)}
                    >
                        <div className="relative max-w-6xl max-h-[90vh] w-full h-full flex flex-col">
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    onClick={() => setShowImageModal(false)}
                                    className="bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-md border border-white/20 transition-all"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="flex-1 flex items-center justify-center overflow-hidden">
                                <img
                                    src={ad.generated_image_url || imgSrc}
                                    alt="Vista previa de imagen"
                                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Bar */}
                <div className="flex justify-between items-center p-3 text-slate-800">
                    <div className="flex gap-4">
                        <FaHeart className="w-6 h-6 hover:text-red-500 transition-colors cursor-pointer" />
                        <FaComments className="w-6 h-6 hover:text-slate-600 transition-colors cursor-pointer" />
                        <FaPaperPlane className="w-6 h-6 hover:text-slate-600 transition-colors cursor-pointer" />
                    </div>
                    <FaBookmark className="w-6 h-6 hover:text-slate-600 transition-colors cursor-pointer" />
                </div>

                {/* Copy Area */}
                <div className="px-3 pb-6 text-sm">
                    <p className="font-bold text-sm mb-1">{ad.headline}</p>
                    <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {ad.primary_text}
                    </p>
                </div>
            </div>

            {/* Actions Below Phone */}
            <div className="mt-4 flex flex-col gap-2 items-center">
                <div className="flex gap-2">
                    <button
                        onClick={copyToClipboard}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                        {copied ? <FaCheck className="w-4 h-4" /> : <FaRegCopy className="w-4 h-4" />}
                        {copied ? 'Copiado!' : 'Copiar Texto'}
                    </button>
                    {!videoUrl && (
                        <button
                            onClick={handleGenerateVideo}
                            disabled={generatingVideo || hasError || imgSrc.includes('placehold.co') || videosRemaining <= 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 ${videosRemaining <= 0
                                ? 'bg-slate-600 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 shadow-purple-500/20'
                                }`}
                            title={videosRemaining <= 0 ? 'Mejorá tu plan para generar videos' : `${videosRemaining} videos restantes este mes`}
                        >
                            {generatingVideo ? <FaSpinner className="animate-spin" /> : <FaVideo />}
                            {videosRemaining <= 0
                                ? '🔒 Video Pro'
                                : generatingVideo
                                    ? 'Generando...'
                                    : `Animar Ad (${videosRemaining})`
                            }
                        </button>
                    )}
                </div>
                {videoUrl && (
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                            <FaBolt className="text-yellow-500" /> VIDEO GENERADO CON AI
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        const resp = await fetch(videoUrl);
                                        const blob = await resp.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `adsniper-video-${Date.now()}.mp4`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                    } catch {
                                        window.open(videoUrl, '_blank');
                                    }
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20"
                            >
                                <FaCloudUploadAlt className="w-3 h-3 rotate-180" /> Descargar Video
                            </button>
                            <button
                                onClick={async () => {
                                    if (navigator.share) {
                                        try {
                                            const resp = await fetch(videoUrl);
                                            const blob = await resp.blob();
                                            const file = new File([blob], 'adsniper-video.mp4', { type: 'video/mp4' });
                                            await navigator.share({ files: [file], title: 'Ad Video - AdSniper' });
                                        } catch {
                                            navigator.clipboard.writeText(videoUrl);
                                            alert('Link del video copiado!');
                                        }
                                    } else {
                                        navigator.clipboard.writeText(videoUrl);
                                        alert('Link del video copiado al portapapeles!');
                                    }
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                            >
                                <FaPaperPlane className="w-3 h-3" /> Compartir
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
// ----------------------------------------

export default function Dashboard() {
    // Brand & Usage State
    const [brand, setBrand] = useState<any>(null);
    const [credits, setCredits] = useState<number | null>(null);
    const [plan, setPlan] = useState<string>('free');
    const [videosRemaining, setVideosRemaining] = useState<number>(0);
    const [videoLimit, setVideoLimit] = useState<number>(0);
    const [view, setView] = useState<'setup' | 'generator'>('setup');
    const [showUpgrade, setShowUpgrade] = useState(false);

    // Generator State
    const [inputMode, setInputMode] = useState<'link' | 'manual'>('link'); // 'link' or 'manual'
    const [url, setUrl] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [manualDesc, setManualDesc] = useState('');
    const [manualVisual, setManualVisual] = useState('');
    const [manualImageBase64, setManualImageBase64] = useState<string | null>(null);

    const [language, setLanguage] = useState('es');
    const [count, setCount] = useState(3);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'ads' | 'scripts'>('ads');

    // Data State
    const [ads, setAds] = useState<any[]>([]);
    const [scripts, setScripts] = useState<any[]>([]);
    const [productImage, setProductImage] = useState('');
    const [productTitle, setProductTitle] = useState('');
    const [error, setError] = useState('');

    // Removed shared imageError state
    // const [imageError, setImageError] = useState(false); 

    // Initial Load - Brand & Credits
    useEffect(() => {
        console.log('🚀 Dashboard: Initializing...');

        // Load Brand
        try {
            const savedBrand = localStorage.getItem('adSniperBrand');
            if (savedBrand) {
                console.log('📦 Dashboard: Brand found in storage');
                setBrand(JSON.parse(savedBrand));
                setView('generator');
            } else {
                console.log('❓ Dashboard: No brand found, showing setup');
            }
        } catch (err) {
            console.error('❌ Dashboard: Error loading brand from storage:', err);
            setView('setup');
        }

        // Fetch Credits
        fetchCredits();
    }, []);

    const fetchCredits = async () => {
        try {
            const res = await fetch('/api/credits');
            const data = await res.json();
            if (data.credits !== undefined) {
                setCredits(data.credits);
                setPlan(data.plan);
            }
            if (data.videosRemaining !== undefined) {
                setVideosRemaining(data.videosRemaining);
                setVideoLimit(data.videoLimit || 0);
            }
        } catch (err) {
            console.error("Error fetching credits:", err);
        }
    };

    const handleBrandSave = (data: any) => {
        console.log('✅ Dashboard: Brand saved');
        setBrand(data);
        setView('generator');
    };



    const generateAds = async () => {
        if (inputMode === 'link' && !url) return;
        if (inputMode === 'manual' && (!manualTitle || !manualDesc)) return;
        setLoading(true);
        setError('');
        setAds([]);
        setScripts([]);
        setProductImage('');
        setProductTitle('');
        // setImageError(false); // Removed

        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productUrl: inputMode === 'link' ? url : undefined,
                    manual_title: inputMode === 'manual' ? manualTitle : undefined,
                    manual_description: inputMode === 'manual' ? manualDesc : undefined,
                    manual_image_prompt: inputMode === 'manual' ? manualVisual : undefined,
                    manual_image_base64: inputMode === 'manual' ? manualImageBase64 : undefined,
                    language: language,
                    count: count, // Pass count to backend
                    brand // Pass the brand identity to the API
                }),
            });

            const data = await res.json();
            if (data.VERSION_MARKER) {
                console.log(`🚀 Backend Version: ${data.VERSION_MARKER}`);
            }



            if (data.product_image) setProductImage(data.product_image);
            if (data.product_title) setProductTitle(data.product_title);

            if (res.status === 403 && data.error === 'NO_CREDITS') {
                setShowUpgrade(true);
                throw new Error("Sin créditos disponibles.");
            } else if (!res.ok) {
                throw new Error(data.error || 'Error generating ads');
            }

            // Handle Ads
            let finalAds = [];
            if (data.ads && Array.isArray(data.ads)) finalAds = data.ads;
            else if (data.output && Array.isArray(data.output)) finalAds = data.output;
            else finalAds = Array.isArray(data) ? data : [];

            // Fallback for empty ads (Demo Mode) - REMOVED: Do not show generic ads ever.
            // if (finalAds.length === 0) {
            //     finalAds = MOCK_ADS;
            // }
            if (data.credits !== undefined) setCredits(data.credits);
            setAds(finalAds);

            // Handle Scripts
            if (data.scripts && Array.isArray(data.scripts) && data.scripts.length > 0) {
                setScripts(data.scripts);
            } else {
                setScripts(MOCK_SCRIPTS); // This is fine for now, scripts are less annoying
            }

        } catch (err: any) {
            if (err.message !== "Sin créditos disponibles.") {
                setError(err.message);
                // Default to mock scripts so user sees something, BUT DO NOT SHOW GENERIC ADS
                setScripts(MOCK_SCRIPTS);
                // setAds(MOCK_ADS); // REMOVED: Never show generic ads on error
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-emerald-500/30 relative">

            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]"></div>
            </div>

            <div className="max-w-6xl mx-auto space-y-8 pb-20 relative z-10">

                {/* Header */}
                <header className="flex justify-between items-center py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 p-2">
                            <img src="/adsniper_logo.svg" alt="AdSniper Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold tracking-tight">
                                AdSniper <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">AI</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${plan === 'free' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                    PLAN {plan}
                                </span>
                                {credits !== null && (
                                    <span className="text-[10px] text-slate-500 font-medium">
                                        <FaBolt className="inline w-2 h-2 mr-1 text-yellow-500" />
                                        {credits} Créditos
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {credits === 0 && plan === 'free' && (
                            <button
                                onClick={() => setShowUpgrade(true)}
                                className="hidden md:flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg hover:brightness-110 transition-all"
                            >
                                <FaBolt /> UPGRADE
                            </button>
                        )}
                        {brand && (
                            <button
                                onClick={() => setView('setup')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
                            >
                                <FaCog className="w-3 h-3" />
                                {brand.name}
                            </button>
                        )}
                        <UserButton />
                    </div>
                </header>

                {view === 'setup' ? (
                    <BrandSetup onSave={handleBrandSave} existingData={brand} />
                ) : (
                    <main className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* Hero / Input */}
                        <div className="text-center space-y-6">
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                                Genera Campañas para <br />
                                <span className="text-emerald-400">{brand?.name || 'Tu Marca'}</span> en Segundos
                            </h2>
                            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                                Pega tu producto y nuestra IA creará anuncios con el tono <span className="text-white font-medium">{brand?.tone || 'Profesional'}</span>.
                            </p>

                            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl max-w-3xl mx-auto relative group focus-within:ring-2 focus-within:ring-emerald-500/50 transition-all duration-300 mt-8">
                                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>

                                {/* INPUT MODE TABS */}
                                <div className="flex justify-center mb-6 relative z-10">
                                    <div className="bg-slate-950 p-1 rounded-xl inline-flex border border-slate-800">
                                        <button
                                            onClick={() => setInputMode('link')}
                                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'link' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            <FaExternalLinkAlt className="w-3 h-3" /> Link Shopify
                                        </button>
                                        <button
                                            onClick={() => setInputMode('manual')}
                                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'manual' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            <FaPen className="w-3 h-3" /> Modo Manual
                                        </button>
                                    </div>
                                </div>

                                <div className="relative flex flex-col gap-4 bg-slate-950 rounded-2xl p-4">

                                    {/* LINK MODE INPUT */}
                                    {inputMode === 'link' && (
                                        <div className="w-full relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                                                <FaExternalLinkAlt className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="text"
                                                value={url}
                                                onChange={(e) => setUrl(e.target.value)}
                                                placeholder="Pega la URL del Producto aquí..."
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-lg focus:ring-0 outline-none text-white placeholder:text-slate-600 font-medium transition-colors focus:border-emerald-500/50"
                                            />
                                        </div>
                                    )}

                                    {/* MANUAL MODE INPUTS */}
                                    {inputMode === 'manual' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block">Nombre del Producto</label>
                                                <input
                                                    type="text"
                                                    value={manualTitle}
                                                    onChange={(e) => setManualTitle(e.target.value)}
                                                    placeholder="Ej: Zapatillas FlyRunner X"
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block">Descripción / Puntos de Venta</label>
                                                <textarea
                                                    value={manualDesc}
                                                    onChange={(e) => setManualDesc(e.target.value)}
                                                    placeholder="Describe los beneficios, características y público objetivo..."
                                                    rows={3}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none transition-colors resize-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block flex items-center gap-2"><FaMagic className="text-purple-400" /> Estilo Visual (Director Creativo)</label>
                                                <input
                                                    type="text"
                                                    value={manualVisual}
                                                    onChange={(e) => setManualVisual(e.target.value)}
                                                    placeholder="Ej: Minimalista, fondo neon, lujo, 8k..."
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-purple-500/50 outline-none transition-colors"
                                                />
                                            </div>

                                            {/* IMAGE UPLOAD FALLBACK */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block flex items-center gap-2"><FaCloudUploadAlt className="text-blue-400" /> Subir Imagen de Producto (Opcional)</label>

                                                {!manualImageBase64 ? (
                                                    <div className="relative border-2 border-dashed border-slate-700 rounded-xl hover:border-blue-500/50 transition-colors group">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    if (file.size > 5 * 1024 * 1024) {
                                                                        alert("El archivo es demasiado grande (Máx 5MB)");
                                                                        return;
                                                                    }
                                                                    const reader = new FileReader();
                                                                    reader.onloadend = () => setManualImageBase64(reader.result as string);
                                                                    reader.readAsDataURL(file);
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                        />
                                                        <div className="flex flex-col items-center justify-center py-6 text-slate-500 group-hover:text-blue-400 transition-colors">
                                                            <FaCloudUploadAlt className="w-8 h-8 mb-2" />
                                                            <span className="text-sm font-medium">Click para subir foto (JPG/PNG)</span>
                                                            <span className="text-xs opacity-50">Se usará si la IA falla</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="relative rounded-xl overflow-hidden border border-slate-700 group">
                                                        <img src={manualImageBase64} alt="Preview" className="w-full h-32 object-cover object-center app-bg-checkerboard" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button
                                                                onClick={() => setManualImageBase64(null)}
                                                                className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 hover:bg-red-600 transition-colors"
                                                            >
                                                                <FaTrash /> Eliminar
                                                            </button>
                                                        </div>
                                                        <div className="absolute bottom-1 right-1 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                                                            IMAGEN CARGADA
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* QUANTITY SELECTOR */}
                                    <div className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <FaLayerGroup /> Cantidad de Variaciones
                                        </span>
                                        <div className="flex gap-2">
                                            {[1, 3, 5, 10].map(num => (
                                                <button
                                                    key={num}
                                                    onClick={() => setCount(num)}
                                                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${count === num ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-4 items-stretch mt-2">
                                        {/* Language Toggle */}
                                        <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2 border border-slate-800 h-[56px] justify-center md:justify-start">
                                            <FaGlobe className="w-4 h-4 text-slate-400" />
                                            <select
                                                value={language}
                                                onChange={(e) => setLanguage(e.target.value)}
                                                className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer w-full"
                                            >
                                                <option value="es">ES 🇪🇸</option>
                                                <option value="en">EN 🇺🇸</option>
                                            </select>
                                        </div>

                                        <button
                                            onClick={generateAds}
                                            disabled={loading || (inputMode === 'link' ? !url : (!manualTitle || !manualDesc))}
                                            className="flex-1 bg-white text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed font-bold px-8 py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap h-[56px]"
                                        >
                                            {loading ? (
                                                <> <FaSpinner className="animate-spin w-5 h-5" /> Creando... </>
                                            ) : (
                                                <> <FaStar className="w-5 h-5 text-emerald-600 md:text-inherit" /> {inputMode === 'manual' ? 'CREAR ADS' : 'GENERAR'} </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="max-w-3xl mx-auto mt-6 p-4 bg-red-950/30 border border-red-900/50 text-red-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 backdrop-blur-sm">
                                <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]"></div>
                                <span className="font-medium">Error:</span> {error}
                            </div>
                        )}

                        {/* Results Tabs */}
                        {(ads.length > 0 || scripts.length > 0) && (
                            <div className="flex justify-center mb-8">
                                <div className="bg-slate-900/80 p-1 rounded-xl flex gap-1 border border-slate-800">
                                    <button
                                        onClick={() => setActiveTab('ads')}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'ads' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                    >
                                        <FaImage className="w-4 h-4" /> Visual Ads
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('scripts')}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'scripts' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                    >
                                        <FaVideo className="w-4 h-4" /> Video Scripts
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Tab Content */}
                        {activeTab === 'scripts' && ads.length > 0 ? (
                            <VideoScriptViewer scripts={scripts} />
                        ) : ads.length > 0 ? (
                            <div className="grid md:grid-cols-3 gap-8 pt-2 px-2">
                                {ads.map((ad, i) => (
                                    <AdCard
                                        key={i}
                                        ad={ad}
                                        index={i}
                                        brand={brand}
                                        productImage={productImage}
                                        videosRemaining={videosRemaining}
                                        onVideoGenerated={(remaining: number) => setVideosRemaining(remaining)}
                                    />
                                ))}
                            </div>
                        ) : null}

                        {/* Placeholder State */}
                        {!loading && ads.length === 0 && !error && (
                            <div className="text-center py-20 opacity-30 mt-10 border-2 border-dashed border-slate-800 rounded-3xl mx-auto max-w-2xl">
                                <FaLayerGroup className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                <p className="text-xl font-bold text-slate-500">Esperando URL...</p>
                                <p className="text-sm">Pega un link de Shopify arriba para comenzar.</p>
                            </div>
                        )}
                    </main>
                )}

                <UpgradeModal
                    isOpen={showUpgrade}
                    onClose={() => setShowUpgrade(false)}
                    mpLink="https://mpago.la/2wZfbLt"
                    mpSubscriptionLink="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=068cba02015840e3b78121a6a1c6559f"
                    ppLink="https://www.paypal.com/ncp/payment/VJZDENGAEHZJJ"
                />
            </div>
        </div>
    );
}
