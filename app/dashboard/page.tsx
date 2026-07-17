'use client';

import { useState, useEffect } from 'react';
import { FaStar, FaLayerGroup, FaBolt, FaFire, FaSpinner, FaArrowRight, FaExternalLinkAlt, FaHeart, FaComments, FaPaperPlane, FaBookmark, FaRegCopy, FaCheck, FaGlobe, FaImage, FaCog, FaVideo, FaPen, FaMagic, FaCloudUploadAlt, FaTrash, FaCrown, FaInfoCircle, FaDownload } from 'react-icons/fa';
import { UserButton, useUser } from "@clerk/nextjs";
import BrandSetup from './components/BrandSetup';
import VideoScriptViewer from './components/VideoScriptViewer';
import UpgradeModal from './components/UpgradeModal';

const MOCK_SCRIPTS = [
    {
        title: "POV: DescubrÃ­ esto",
        angle: "Storytelling",
        audio_suggestion: "Trending 'Oh No' remix",
        platform: "TikTok",
        sections: [
            { type: "Gancho", content: "POV: EstÃ¡s por descubrir algo que cambia todo.", duration: "3s" },
            { type: "Cuerpo", content: "(CÃ¡mara en mano) Miren lo que acabo de encontrar. La diferencia se nota desde el primer uso.", duration: "12s" },
            { type: "CTA", content: "Link en bio. Quedan pocas unidades.", duration: "4s" }
        ]
    },
    {
        title: "Tutorial Express",
        angle: "How-To",
        audio_suggestion: "Lo-fi study beats",
        platform: "Reels",
        sections: [
            { type: "Gancho", content: "3 formas de usarlo que no conocÃ­as ðŸ‘‡", duration: "3s" },
            { type: "Cuerpo", content: "Tip 1: Uso principal. Tip 2: Hack creativo. Tip 3: El secreto que nadie te cuenta.", duration: "15s" },
            { type: "CTA", content: "GuardÃ¡ este video y comprÃ¡ en el link de la bio.", duration: "3s" }
        ]
    },
    {
        title: "Antes vs DespuÃ©s",
        angle: "TransformaciÃ³n",
        audio_suggestion: "Dramatic reveal sound",
        platform: "TikTok",
        sections: [
            { type: "Gancho", content: "ANTES vs DESPUÃ‰S ðŸ˜±", duration: "3s" },
            { type: "Cuerpo", content: "(Split screen) El cambio es increÃ­ble. La transformaciÃ³n habla sola.", duration: "10s" },
            { type: "CTA", content: "ComentÃ¡ 'ðŸ”¥' y te mando el link.", duration: "3s" }
        ]
    },
    {
        title: "Cosas que no sabÃ­as",
        angle: "Educativo Viral",
        audio_suggestion: "Audio 'Cosas que no sabÃ­as'",
        platform: "Shorts",
        sections: [
            { type: "Gancho", content: "Cosas que no sabÃ­as sobre este producto:", duration: "2s" },
            { type: "Cuerpo", content: "1. Beneficio clave. 2. Lo usan profesionales. 3. Dato sorprendente. *Green screen*", duration: "12s" },
            { type: "CTA", content: "Seguime para mÃ¡s y link en bio.", duration: "3s" }
        ]
    }
];

const MOCK_ADS = [
    {
        type: "Viral Hook",
        headline: "Stop Wasting Money on Bad Ads",
        primary_text: "This simple tool saved me hours of work. The results are insane! ðŸš€ #GrowthHacking #Marketing",
        generated_image_url: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?auto=format&fit=crop&w=800&q=80"
    },
    {
        type: "Problem/Solution",
        headline: "Finally, a Solution That Works",
        primary_text: "Tired of complicated workflows? AdSíntesis makes it easy. Try it today and see the difference.",
        generated_image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80"
    },
    {
        type: "Social Proof",
        headline: "Everyone is Talking About This",
        primary_text: "Join thousands of satisfied users who have transformed their business. Don't miss out! â­â­â­â­â­",
        generated_image_url: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80"
    }
];

const FALLBACK_IMAGE = "https://placehold.co/800x800/101827/ffffff.png?text=Ad+Image"; // Simple, reliable placeholder

// --- AD CARD COMPONENT (Fixes Shared State Bug) ---
const AdCard = ({ ad, index, premiumCredits, onPremiumVideoGenerated, isAdmin, brand, videosRemaining, onVideoGenerated, applyLogo, applyText }: { ad: any, index: number, premiumCredits: number, onPremiumVideoGenerated: (url: string) => void, isAdmin: boolean, brand: any, videosRemaining: number, onVideoGenerated: (remaining: number) => void, applyLogo: boolean, applyText: boolean }) => {
    const { user } = useUser();
    const isAdminUser = isAdmin || user?.emailAddresses?.some((e: any) => e.emailAddress.toLowerCase().trim() === 'gustavodornhofer@gmail.com');
    const [imgSrc, setImgSrc] = useState(ad.generated_image_url || ad.product_image_fallback || FALLBACK_IMAGE);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [generatingVideo, setGeneratingVideo] = useState(false);
    const [generatingPremiumVideo, setGeneratingPremiumVideo] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);
    const [suggestedScript, setSuggestedScript] = useState<string | null>(null);
    const [generatingScript, setGeneratingScript] = useState(false);

    useEffect(() => {
        const newSrc = ad.generated_image_url || ad.product_image_fallback || FALLBACK_IMAGE;
        setImgSrc(newSrc);
        setVideoUrl(null); // Reset video on ad change
        setHasError(false);
    }, [ad]);

    const handleGenerateVideo = async () => {
        if (videosRemaining <= 0 && !isAdminUser) {
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

    const handleGeneratePremiumVideo = async () => {
        if (premiumCredits <= 0 && !isAdminUser) {
            alert("Necesitás créditos Studio Pro para generar videos premium ultra-reales.");
            return;
        }

        if (!imgSrc) return;

        // Get the custom prompt if it exists (for Studio Mode)
        const customPromptElement = document.getElementById(`video-prompt-${index}`) as HTMLTextAreaElement;
        const customPrompt = customPromptElement?.value || ad.primary_text || "Professional advertising showcase";

        setGeneratingPremiumVideo(true);
        try {
            const resp = await fetch('/api/generate-premium-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: imgSrc,
                    prompt: customPrompt,
                    aspectRatio: "1:1"
                })
            });
            const data = await resp.json();

            if (resp.status === 403) {
                alert("Sin créditos Premium suficientes. Mejorá tu suscripción.");
                return;
            }

            if (data.videoUrl) {
                setVideoUrl(data.videoUrl);
                if (onPremiumVideoGenerated) {
                    onPremiumVideoGenerated(data.videoUrl); // Pass the URL
                }
            } else {
                alert(data.error || "Error al generar video premium");
            }
        } catch (err) {
            console.error(err);
            alert("Error de conexión al generar video premium");
        } finally {
            setGeneratingPremiumVideo(false);
        }
    };

    const handleGenerateScript = async () => {
        setGeneratingScript(true);
        try {
            const resp = await fetch('/api/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productInfo: ad.headline || ad.primary_text })
            });
            const data = await resp.json();
            if (data.script) setSuggestedScript(data.script);
        } catch (err) {
            console.error(err);
        } finally {
            setGeneratingScript(false);
        }
    };

    const handleImageError = (e: any) => {
        console.error(`Ad #${index} Image Load Error for SRC:`, e.currentTarget.src);
        if (imgSrc === ad.generated_image_url && ad.product_image_fallback) {
            setImgSrc(ad.product_image_fallback);
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

    const [downloading, setDownloading] = useState(false);

    // DOWNLOAD AD: exporta el composit (imagen + tipografía + thumbnail del producto) como PNG 1080x1080
    const handleDownloadImage = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            const SIZE = 1080;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2D context');

            // 1. BACKGROUND IMAGE: convertir URL -> Image.
            // Si pasa por /api/proxy-image, ya viene como data URL o URL externa.
            const sourceUrl = ad.generated_image_url || imgSrc;
            const bgImg = new Image();
            bgImg.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
                bgImg.onload = () => resolve();
                bgImg.onerror = () => reject(new Error('Image load failed'));
                bgImg.src = sourceUrl;
            });

            // "object-cover" emulation: centra y cropea al cuadrado
            const srcRatio = bgImg.width / bgImg.height;
            let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
            if (srcRatio > 1) {
                sw = bgImg.height;
                sx = (bgImg.width - sw) / 2;
            } else if (srcRatio < 1) {
                sh = bgImg.width;
                sy = (bgImg.height - sh) / 2;
            }
            ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, SIZE, SIZE);

            // 2. GRADIENTE NEGRO DE FONDO para legibilidad del texto (solo si applyText)
            if (applyText) {
                const grad = ctx.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
                grad.addColorStop(1, 'rgba(0,0,0,0.92)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, SIZE, SIZE);
            }

            // 3. TIPOGRAFÍA: headline + subcopy en el 75% inferior izquierdo (solo si applyText)
            if (applyText && ad.headline) {
                const textMaxWidth = SIZE * 0.72;
                const paddingX = 36;
                let y = SIZE - 36 - 16;

                // HEADLINE (font-weight 900, 2 líneas máx)
                ctx.fillStyle = '#ffffff';
                ctx.font = '900 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'rgba(0,0,0,0.85)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetY = 3;

                const headlineLines = wrapText(ctx, ad.headline, textMaxWidth - paddingX * 2, 2);
                for (let i = headlineLines.length - 1; i >= 0; i--) {
                    ctx.fillText(headlineLines[i], paddingX, y);
                    y -= 66;
                }

                // SUBCOPY (subtítulo, font-weight 500)
                if (ad.primary_text) {
                    y -= 8;
                    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.88)';
                    ctx.shadowBlur = 10;
                    const subLines = ad.primary_text.split('\n').slice(0, 2).join(' · ');
                    const subWrapped = wrapText(ctx, subLines, textMaxWidth - paddingX * 2, 2);
                    for (let i = subWrapped.length - 1; i >= 0; i--) {
                        ctx.fillText(subWrapped[i], paddingX, y);
                        y -= 28;
                    }
                }
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;
            }

            // 4. PRODUCT THUMBNAIL en la esquina inferior derecha (si existe)
            const showThumb = applyLogo && ad.product_image_fallback && !ad.product_image_fallback.includes('placehold.co');
            if (showThumb) {
                const thumbImg = new Image();
                thumbImg.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    thumbImg.onload = () => resolve();
                    thumbImg.onerror = () => reject(new Error('Thumb load failed'));
                    thumbImg.src = ad.product_image_fallback!;
                }).catch(() => { /* skip silently */ });

                if (thumbImg.complete && thumbImg.naturalWidth > 0) {
                    const thumbSize = 220;
                    const pad = 36;
                    const x = SIZE - thumbSize - pad;
                    const y = SIZE - thumbSize - pad - 20;

                    // glassmorphism: rounded white-tinted bg
                    ctx.save();
                    ctx.beginPath();
                    roundRect(ctx, x, y, thumbSize, thumbSize, 24);
                    ctx.fillStyle = 'rgba(255,255,255,0.12)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // padding interno
                    const inner = 18;
                    ctx.drawImage(thumbImg, x + inner, y + inner, thumbSize - inner * 2, thumbSize - inner * 2);
                    ctx.restore();
                }
            }

            // 5. EXPORTAR a PNG y descargar
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
            if (!blob) throw new Error('Canvas toBlob failed');

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AdSintesis-anuncio-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
            // Fallback: abrir la imagen cruda como descarga
            const link = document.createElement('a');
            link.href = ad.generated_image_url || imgSrc;
            link.download = `AdSintesis-anuncio-${Date.now()}.png`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            setDownloading(false);
        }
    };

    // Helpers: word-wrap y rounded rect
    function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
        const words = text.split(' ');
        const lines: string[] = [];
        let current = '';
        for (const word of words) {
            const test = current ? `${current} ${word}` : word;
            if (ctx.measureText(test).width <= maxWidth || !current) {
                current = test;
            } else {
                lines.push(current);
                current = word;
                if (lines.length >= maxLines) break;
            }
            if (lines.length >= maxLines) break;
        }
        if (current && lines.length < maxLines) lines.push(current);
        return lines.slice(0, maxLines);
    }

    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

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
                        <>
                            <img
                                src={imgSrc}
                                alt="Ad Creative"
                                className={`w-full h-full object-cover transition-all duration-1000 group-hover:scale-105 ${imgSrc.includes('pollinations') || imgSrc.includes('data:') ? 'animate-in fade-in fill-mode-both' : ''}`}
                                loading="eager"
                                onError={handleImageError}
                            />
                            {/* OVERLAY DE PRODUCTO: Marca de agua elegante (Glassmorphism) en la esquina inferior derecha */}
                            {applyLogo && ad.product_image_fallback && !ad.product_image_fallback.includes('placehold.co') && imgSrc !== ad.product_image_fallback && (
                                <div className="absolute bottom-[44px] right-4 z-30 pointer-events-none transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1">
                                    <div className="w-16 h-16 md:w-20 md:h-20 bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/20 shadow-[-5px_5px_15px_rgba(0,0,0,0.5)] flex items-center justify-center">
                                        <img
                                            src={ad.product_image_fallback}
                                            alt="Overlay de Producto"
                                            className="w-full h-full object-contain filter drop-shadow-md"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* TYPOGRAPHY OVERLAY (post-process): Headline + Subcopy renderizados con HTML/CSS.
                                Funciona tanto en modo texto como en Studio Pro. El background es ahora la imagen,
                                así que el texto se superpone con gradiente para legibilidad.
                                Cubre hasta 75% del ancho para no chocar con el thumbnail de producto en bottom-right.
                                Solo se muestra si applyText está activo.
                                Para Studio Pro (inpainting 8K) NO se muestra porque ya viene integrado en la imagen. */}
                            {applyText && ad.headline && !ad.type?.includes('Studio') && (
                                <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none">
                                    {/* Gradiente de fondo para legibilidad (cubre 75% del ancho) */}
                                    <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-black/90 via-black/65 to-transparent"></div>
                                    <div className="relative px-4 pb-5 pt-12 w-3/4">
                                        <h3 className="text-white font-black text-lg md:text-xl leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] tracking-tight line-clamp-2">
                                            {ad.headline}
                                        </h3>
                                        {ad.primary_text && (
                                            <p className="text-white/85 text-[11px] md:text-xs leading-snug mt-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] line-clamp-2 whitespace-pre-wrap">
                                                {ad.primary_text.split('\n').slice(0, 2).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
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
                    {(generatingVideo || generatingPremiumVideo) && (
                        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 transition-all">
                            <FaSpinner className={`w-10 h-10 ${generatingPremiumVideo ? 'text-purple-500' : 'text-emerald-500'} animate-spin mb-4`} />
                            <p className="text-white font-bold text-sm animate-pulse uppercase tracking-widest">
                                {generatingPremiumVideo ? 'Renderizando Hollywood...' : 'Creando Movimiento...'}
                            </p>
                            <p className="text-slate-400 text-[10px] mt-1 px-8 text-center">
                                {generatingPremiumVideo ? 'Kling AI está animando cada píxel (hasta 60s)' : 'Esto puede tardar hasta 30 segundos'}
                            </p>
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
                            <div className="flex-1 flex items-center justify-center overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
                                {/* Contenedor cuadrado para mantener la proporción de superposición idéntica a la tarjeta */}
                                <div className="relative max-w-full max-h-full aspect-square flex items-center justify-center bg-black rounded-lg shadow-2xl overflow-hidden">
                                    <img
                                        src={ad.generated_image_url || imgSrc}
                                        alt="Fondo Generado"
                                        className="w-full h-full object-contain"
                                    />

                                    {/* MISMO OVERLAY DE PRODUCTO PARA EL MODAL (ESQUINA INFERIOR DERECHA) */}
                                    {applyLogo && ad.product_image_fallback && !ad.product_image_fallback.includes('placehold.co') && imgSrc !== ad.product_image_fallback && (
                                        <div className="absolute bottom-10 right-10 z-30 pointer-events-none">
                                            <div className="w-24 h-24 md:w-32 md:h-32 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 shadow-[-10px_10px_30px_rgba(0,0,0,0.8)] flex items-center justify-center">
                                                <img
                                                    src={ad.product_image_fallback}
                                                    alt="Overlay de Producto Fullscreen"
                                                    className="w-full h-full object-contain filter drop-shadow-md"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* TYPOGRAPHY OVERLAY EN EL MODAL (mismo overlay HTML/CSS). Excluir Studio Pro. */}
                                    {applyText && ad.headline && !ad.type?.includes('Studio') && (
                                        <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none">
                                            <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-black/90 via-black/65 to-transparent"></div>
                                            <div className="relative px-8 pb-8 pt-16 w-3/4">
                                                <h3 className="text-white font-black text-3xl md:text-5xl leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] tracking-tight">
                                                    {ad.headline}
                                                </h3>
                                                {ad.primary_text && (
                                                    <p className="text-white/85 text-base md:text-lg leading-snug mt-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] whitespace-pre-wrap">
                                                        {ad.primary_text.split('\n').slice(0, 3).join('\n')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadImage}
                            disabled={downloading || hasError || imgSrc.includes('placehold.co')}
                            title="Descargar anuncio como PNG 1080x1080"
                            className={`w-6 h-6 flex items-center justify-center transition-colors ${downloading || hasError ? 'text-slate-300' : 'text-slate-800 hover:text-emerald-600'} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {downloading ? <FaSpinner className="w-5 h-5 animate-spin" /> : <FaDownload className="w-5 h-5" />}
                        </button>
                        <FaBookmark className="w-6 h-6 hover:text-slate-600 transition-colors cursor-pointer" />
                    </div>
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
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={copyToClipboard}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                        >
                            {copied ? <FaCheck className="w-4 h-4" /> : <FaRegCopy className="w-4 h-4" />}
                            {copied ? 'Copiado!' : 'Copiar Texto'}
                        </button>
                        {!videoUrl && (() => {
                            const isStudioAd = ad.type === "Studio Inpainting 8K" || ad.type.includes('Studio');

                            return (
                                <div className="flex gap-2 flex-1">
                                    <button
                                        onClick={handleGenerateVideo}
                                        disabled={generatingVideo || generatingPremiumVideo || hasError || imgSrc.includes('placehold.co') || (videosRemaining <= 0 && !isAdminUser)}
                                        title={isAdminUser ? 'Admin: video ilimitado' : `${videosRemaining} videos restantes`}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${(generatingVideo || generatingPremiumVideo || hasError || imgSrc.includes('placehold.co') || (videosRemaining <= 0 && !isAdminUser))
                                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                                            : 'bg-slate-800 text-white hover:bg-slate-700'
                                            }`}
                                    >
                                        {generatingVideo ? <FaSpinner className="animate-spin" /> : <FaVideo />}
                                        {generatingVideo ? 'Generando...' : 'Animar Ad 🎬'}
                                    </button>

                                    {isStudioAd && (
                                        <button
                                            onClick={handleGeneratePremiumVideo}
                                            disabled={generatingVideo || generatingPremiumVideo || hasError || imgSrc.includes('placehold.co') || (premiumCredits <= 0 && !isAdminUser)}
                                            title={isAdminUser ? 'Admin: Video Premium Ilimitado' : `${premiumCredits} créditos premium`}
                                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${(generatingVideo || generatingPremiumVideo || hasError || (premiumCredits <= 0 && !isAdminUser))
                                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                                                : 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white hover:brightness-110 shadow-lg shadow-purple-900/20'
                                                }`}
                                        >
                                            {generatingPremiumVideo ? <FaSpinner className="animate-spin" /> : <><FaCrown className="text-yellow-400 animate-pulse" /> <span className="absolute -top-2 -right-2 bg-emerald-500 text-[8px] px-1 rounded-full animate-bounce">BETA ✨</span></>}
                                            {generatingPremiumVideo ? 'Renderizando...' : 'Adsíntesis Premium ✨'}
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Custom Prompt for Studio Video */}
                    {!videoUrl && ad.type.includes('Studio') && (
                        <div className="w-full animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="mt-4 p-3 bg-purple-900/10 border border-purple-500/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                                    <FaMagic /> 🎬 Prompt para Video — describe el ambiente y movimiento (humo, luces, cámara, partículas)
                                </label>
                                <textarea
                                    id={`video-prompt-${index}`}
                                    placeholder="Ej: cámara lenta orbitando el producto, humo suave, luz cálida pulsante, destellos dorados de fondo"
                                    className="w-full bg-slate-900 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-purple-500 outline-none transition-all"
                                    rows={2}
                                />
                            </div>
                        </div>
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
                                        a.download = `AdSíntesis-video-${Date.now()}.mp4`;
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
                                            const file = new File([blob], 'AdSíntesis-video.mp4', { type: 'video/mp4' });
                                            await navigator.share({ files: [file], title: 'Ad Video - AdSíntesis' });
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
    const { user } = useUser();
    // Brand & Usage State
    const [brand, setBrand] = useState<any>(null);
    const [credits, setCredits] = useState<number | null>(null);
    const [plan, setPlan] = useState<string>('free');
    const [videosRemaining, setVideosRemaining] = useState<number>(0);
    const [videoLimit, setVideoLimit] = useState<number>(0);
    const [view, setView] = useState<'setup' | 'generator'>('setup');
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [premiumCredits, setPremiumCredits] = useState<number>(0);

    // Generator State
    const [inputMode, setInputMode] = useState<'link' | 'manual' | 'studio'>('link'); // 'link', 'manual', 'studio'
    const [url, setUrl] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [manualDesc, setManualDesc] = useState('');
    const [manualVisual, setManualVisual] = useState('');
    const [manualImageBase64, setManualImageBase64] = useState<string | null>(null);

    const [language, setLanguage] = useState('es');
    const [count, setCount] = useState(3);
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [activeTab, setActiveTab] = useState<'ads' | 'scripts'>('ads');
    const [applyLogo, setApplyLogo] = useState(true);
    const [applyText, setApplyText] = useState(true);

    // Admin Helper
    const isLocalAdmin = user?.emailAddresses?.some((e: any) => e.emailAddress.toLowerCase().trim() === 'gustavodornhofer@gmail.com') || plan === 'Infinity';

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
        if (!user) return;

        console.log('🚀 Dashboard: User loaded:', user?.primaryEmailAddress?.emailAddress);

        // Load Brand
        try {
            const savedBrand = localStorage.getItem('AdSíntesisBrand');
            if (savedBrand) {
                setBrand(JSON.parse(savedBrand));
                setView('generator');
            }
        } catch (err) {
            console.error('❌ Error loading brand:', err);
        }

        fetchCredits();
    }, [user]);

    const fetchCredits = async () => {
        if (!user) return;
        try {
            console.log('📡 Dashboard: Fetching credits...');
            const res = await fetch('/api/credits');
            const data = await res.json();

            const userEmails = user.emailAddresses.map((e: any) => e.emailAddress.toLowerCase().trim());
            const isAdmin = userEmails.includes('gustavodornhofer@gmail.com');

            if (data.credits !== undefined) {
                setCredits(isAdmin ? 9999 : data.credits);
                setPlan(isAdmin ? 'Infinity' : data.plan);
            }
            if (data.videosRemaining !== undefined) {
                setVideosRemaining(isAdmin ? 9999 : data.videosRemaining);
                setVideoLimit(isAdmin ? 9999 : (data.videoLimit || 0));
            }
            if (data.premiumStudioCredits !== undefined) {
                setPremiumCredits(isAdmin ? 9999 : data.premiumStudioCredits);
            }
        } catch (err) {
            console.error("Error fetching credits:", err);
        }
    };

    // v41.10: Client-side Image Resizer (The Shield)
    const resizeImage = (file: File, maxWidth: number = 1024): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxWidth) {
                        if (width > height) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxWidth) / height);
                            height = maxWidth;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    // v48: Explicitly clear canvas to preserve transparency
                    ctx?.clearRect(0, 0, width, height);
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/png'));
                };
            };
        });
    };

    const handleBrandSave = (data: any) => {
        console.log('✅ Dashboard: Brand saved');
        setBrand(data);
        setView('generator');
    };
    const generateStudioAds = async () => {
        if (!manualImageBase64 || !manualVisual) {
            alert("Sube una imagen cruda y describe la escena 8K.");
            return;
        }
        if (premiumCredits <= 0 && !isLocalAdmin) {
            setShowUpgrade(true);
            return;
        }

        setLoading(true);
        setLoadingStatus('🚀 Iniciando motor...');
        setError('');
        setAds([]);
        setScripts([]);

        try {
            // STEP 1: Notify status and START fetch
            setLoadingStatus('🏗️ Generando escena AI (40-60s)...');
            const res = await fetch('/api/generate-premium', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: manualImageBase64,
                    scene_prompt: manualVisual,
                    product_name: brand?.name || "premium product"
                }),
            });

            // STEP 2: Start polling/waiting status
            setLoadingStatus('🏗️ Generando base estructural (40s)...');
            
            const data = await res.json();

            if (res.status === 403 && data.error === 'NO_PREMIUM_CREDITS') {
                setShowUpgrade(true);
                throw new Error("Sin créditos Studio Pro disponibles.");
            } else if (!res.ok) {
                throw new Error(data.error || 'Error en Inpainting Studio');
            }

            setLoadingStatus('🎨 Puliendo detalles finales...');
            
                        // Successfully generated Premium Image
            fetchCredits(); 

            setAds([{
                type: "Studio Inpainting 8K",
                headline: "",  // Vacío: el Studio Pro NO muestra texto en la imagen
                primary_text: data.prompt_used,  // Solo para el detalle interno
                generated_image_url: data.final_composition,
                product_image_fallback: manualImageBase64
            }]);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
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
                            <img src="/adsniper_logo.svg" alt="AdSíntesis Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold tracking-tight">
                                AdSíntesis <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">AI</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${plan === 'free' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                    PLAN {plan}
                                </span>
                                {plan === 'Infinity' && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1 animate-pulse">
                                        <FaCrown className="w-2 h-2" /> ADMIN ACCESS
                                    </span>
                                )}
                                {credits !== null && (
                                    <span className="text-[10px] text-slate-500 font-medium">
                                        <FaBolt className="inline w-2 h-2 mr-1 text-yellow-500" />
                                        {plan === 'Infinity' ? 'Unlimited' : `${credits} Créditos`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Publicar Ads Button */}
                        <button
                            onClick={() => {
                                setView('generator');
                                if (scripts.length > 0) setActiveTab('scripts');
                                // Scroll to results if they exist
                                if (ads.length > 0) {
                                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                                } else {
                                    alert("Genera una campaña primero para ver tus guiones de publicación.");
                                }
                            }}
                            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg hover:brightness-110 transition-all border border-purple-400/30"
                        >
                            <FaVideo className="w-3 h-3" /> 🚀 PUBLICAR ADS
                        </button>

                        {credits === 0 && plan === 'free' && !isLocalAdmin && (
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
                                        <button
                                            onClick={() => {
                                                const isAdmin = user?.emailAddresses?.some((e: any) => e.emailAddress.toLowerCase().trim() === 'gustavodornhofer@gmail.com');
                                                if (premiumCredits <= 0 && !isAdmin && plan !== 'Infinity') {
                                                    setShowUpgrade(true);
                                                } else {
                                                    setInputMode('studio');
                                                }
                                            }}
                                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all relative overflow-hidden ${inputMode === 'studio' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/50' : 'text-purple-300/60 hover:text-purple-300'}`}
                                        >
                                            <FaFire className="w-3 h-3 text-orange-400" /> Studio Pro
                                            {(plan === 'Infinity' || (user?.emailAddresses?.some((e: any) => e.emailAddress.toLowerCase().trim() === 'gustavodornhofer@gmail.com'))) ? (
                                                <span className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg">
                                                    Admin
                                                </span>
                                            ) : premiumCredits > 0 ? (
                                                <span className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg">
                                                    {premiumCredits}
                                                </span>
                                            ) : (
                                                <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg">
                                                    Locked
                                                </span>
                                            )}
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
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block flex items-center gap-2"><FaMagic className="text-purple-400" /> Escena deseada (IA genera fondo, iluminación, objetos alrededor de tu producto)</label>
                                                <textarea
                                                    value={manualVisual}
                                                    onChange={(e) => setManualVisual(e.target.value)}
                                                    placeholder="Ej: sobre mesada de mármol con luz natural, planta a la izquierda, taza de café, fondo borroso cocina moderna, 8k"
                                                    rows={2}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-purple-500/50 outline-none transition-colors resize-none"
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
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    setLoading(true);
                                                                    setLoadingStatus('📦 Optimizando imagen...');
                                                                    const optimized = await resizeImage(file);
                                                                    setManualImageBase64(optimized);
                                                                    setLoading(false);
                                                                    setLoadingStatus('');
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

                                    {/* STUDIO PRO MODE INPUTS */}
                                    {inputMode === 'studio' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 border-2 border-purple-500/20 rounded-xl p-4 bg-purple-900/5 relative overflow-hidden mt-4">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 opacity-50"></div>

                                            {premiumCredits <= 0 && !isLocalAdmin && (
                                                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center border border-purple-500/30 rounded-xl">
                                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
                                                        <FaStar className="w-8 h-8 text-white" />
                                                    </div>
                                                    <h3 className="text-xl font-bold text-white mb-2">Desbloquea Studio Pro</h3>
                                                    <p className="text-slate-300 text-sm mb-6 max-w-sm">
                                                        Inpainting 8K real. La IA respetará tu producto al 100% integrándolo a un escenario hiperrealista.
                                                    </p>
                                                    <button onClick={() => setShowUpgrade(true)} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-lg">
                                                        Desbloquear Studio Pro
                                                    </button>
                                                </div>
                                            )}

                                            <div>
                                                <label className="text-xs font-bold text-purple-300 uppercase ml-2 mb-1 block flex items-center gap-2">
                                                    <FaImage /> 1. Sube tu Producto (Un recorte transparente es ideal)
                                                </label>
                                                {!manualImageBase64 ? (
                                                    <div className="relative border-2 border-dashed border-purple-500/30 rounded-xl hover:border-purple-400 transition-colors group bg-purple-900/10">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    setLoading(true);
                                                                    setLoadingStatus('📦 Optimizando imagen...');
                                                                    const optimized = await resizeImage(file);
                                                                    setManualImageBase64(optimized);
                                                                    setLoading(false);
                                                                    setLoadingStatus('');
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                        />
                                                        <div className="flex flex-col items-center justify-center py-8 text-purple-400/60 group-hover:text-purple-300 transition-colors cursor-pointer">
                                                            <FaCloudUploadAlt className="w-8 h-8 mb-2" />
                                                            <span className="text-sm font-bold">Subir foto cruda del producto</span>
                                                            <span className="text-xs font-medium bg-purple-500/20 px-2 py-1 rounded text-purple-300 mt-2">Nuestra IA borrará el fondo</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="relative rounded-xl overflow-hidden border border-purple-500 group h-40 bg-slate-900">
                                                        <img src={manualImageBase64} alt="Preview" className="w-full h-full object-contain p-2 app-bg-checkerboard" />
                                                        <button onClick={() => setManualImageBase64(null)} className="absolute top-2 right-2 bg-red-500 p-2 rounded-full text-white z-20 hover:scale-110 transition-transform shadow-lg">
                                                            <FaTrash className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-purple-300 uppercase ml-2 mb-1 block flex items-center gap-2">
                                                    <FaMagic /> 2. Escenario Deseado
                                                </label>
                                                <input
                                                    type="text"
                                                    value={manualVisual}
                                                    onChange={(e) => setManualVisual(e.target.value)}
                                                    placeholder="Ej: Apoyado en una roca cubierta de musgo en un bosque lluvioso..."
                                                    className="w-full bg-slate-950 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-purple-400 outline-none transition-colors"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* OPCIONES AVANZADAS: LOGO Y CANTIDAD */}
                                    <div className="flex flex-col md:flex-row gap-4 mt-2">

                                        {/* Logo Toggle */}
                                        <div className="flex-1 flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800 focus-within:border-emerald-500/50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                                                    <FaStar className={applyLogo ? "text-emerald-400" : "text-slate-600"} />
                                                    Aplicar Marca de Agua (Logo)
                                                </span>
                                                <span className="text-[10px] text-slate-500 mt-0.5">Muestra u oculta la firma de tu marca</span>
                                            </div>

                                            <button
                                                onClick={() => setApplyLogo(!applyLogo)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${applyLogo ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                            >
                                                <span className={`${applyLogo ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                            </button>
                                        </div>

                                        {/* Text Overlay Toggle */}
                                        <div className="flex-1 flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800 focus-within:border-emerald-500/50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                                                    <FaPen className={applyText ? "text-emerald-400" : "text-slate-600"} />
                                                    Texto en la imagen
                                                </span>
                                                <span className="text-[10px] text-slate-500 mt-0.5">Solo imagen o imagen + texto</span>
                                            </div>

                                            <button
                                                onClick={() => setApplyText(!applyText)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${applyText ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                            >
                                                <span className={`${applyText ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                            </button>
                                        </div>

                                        {/* QUANTITY SELECTOR */}
                                        <div className="flex-1 flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
                                            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                                <FaLayerGroup /> Cantidad de Generaciones
                                            </span>
                                            <div className="flex gap-1.5 md:gap-2">
                                                {[1, 3, 5, 10].map(num => (
                                                    <button
                                                        key={num}
                                                        onClick={() => setCount(num)}
                                                        className={`w-8 h-8 md:w-10 md:h-10 rounded-lg text-sm font-bold transition-all ${count === num ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Language Toggle */}
                                    <div className="flex flex-col flex-1 gap-2">
                                        {error && inputMode === 'studio' && (
                                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-xs p-3 rounded-xl animate-in shake duration-500 mb-2">
                                                <strong>Error en Studio:</strong> {error}
                                            </div>
                                        )}
                                        <div className="flex flex-col md:flex-row gap-4 items-stretch">
                                            <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2 border border-slate-800 h-[56px] justify-center md:justify-start">
                                                <FaGlobe className="w-4 h-4 text-slate-400" />
                                                <select
                                                    value={language}
                                                    onChange={(e) => setLanguage(e.target.value)}
                                                    className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer w-full"
                                                >
                                                    <option value="es">Español</option>
                                                    <option value="en">English</option>
                                                    <option value="de">Deutsch</option>
                                                </select>
                                            </div>

                                            <button
                                                onClick={inputMode === 'studio' ? generateStudioAds : generateAds}
                                                disabled={loading || (inputMode === 'studio' ? (!manualImageBase64 || !manualVisual) : (inputMode === 'link' ? !url : (!manualTitle || !manualDesc)))}
                                                className={`flex-1 text-slate-950 font-bold px-8 py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap h-[56px] disabled:opacity-50 disabled:cursor-not-allowed ${inputMode === 'studio' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:opacity-90 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'bg-white hover:bg-emerald-400'}`}
                                            >
                                                {loading ? (
                                                    <> <FaSpinner className="animate-spin w-5 h-5" /> {loadingStatus || (inputMode === 'studio' ? 'Enviando a fal.ai...' : 'Creando...')} </>
                                                ) : (
                                                    <> <FaStar className={`w-5 h-5 ${inputMode === 'studio' ? 'text-orange-400' : 'text-emerald-600 md:text-inherit'}`} /> {inputMode === 'studio' ? 'GENERAR STUDIO 8K' : (inputMode === 'manual' ? 'CREAR ADS' : 'GENERAR')} </>
                                                )}
                                            </button>
                                        </div>
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
                                        premiumCredits={premiumCredits}
                                        onVideoGenerated={(remaining: number) => setVideosRemaining(remaining)}
                                        onPremiumVideoGenerated={(remaining: number) => setPremiumCredits(remaining)}
                                        applyLogo={applyLogo}
                                        applyText={applyText}
                                        user={user}
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
                    mpSubscriptionLink="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=068cba02015840e3b78121a6a1c6559f"
                    ppLink="https://www.paypal.com/ncp/payment/TX7KQ53SNHCHC"
                    mpStudioLink="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=46da776618c14cfe9c0ff45a84fb2724"
                    ppStudioLink="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-71899749GE094751SNGWE3XI"
                />
            </div>
        </div>
    );
}

