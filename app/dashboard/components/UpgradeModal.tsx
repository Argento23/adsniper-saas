
import { FaLock, FaBolt, FaCheckCircle, FaStar, FaVideo, FaImage, FaRobot } from "react-icons/fa";

interface UpgradeModalProps {
    isOpen: boolean;
    onClose?: () => void;
    mpLink?: string; // MercadoPago Lifetime Link
    mpSubscriptionLink?: string; // MercadoPago Subscription Link
    ppLink?: string; // PayPal Link
}

export default function UpgradeModal({ isOpen, onClose, mpLink, mpSubscriptionLink, ppLink }: UpgradeModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Content */}
            <div className="relative bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">

                {/* Header Icon */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl rotate-3 flex items-center justify-center shadow-lg shadow-emerald-500/40 p-4">
                        <img src="/adsniper_logo.svg" alt="AdSniper Logo" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="mt-8 text-center space-y-4">
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                        Desbloquea <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Poder Ilimitado</span>
                    </h2>
                    <p className="text-slate-400">
                        Has usado tus créditos gratuitos. Elige tu plan para seguir dominando el mercado.
                    </p>

                    {/* What's Included */}
                    <div className="bg-slate-950/50 rounded-xl p-4 text-left space-y-3 border border-slate-800 my-6">
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Todos los planes incluyen:</p>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <FaImage className="text-emerald-500 shrink-0" />
                            <span>Imágenes AI de alta calidad (FLUX by Replicate)</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <FaRobot className="text-emerald-500 shrink-0" />
                            <span>Copy & Guiones de Video con AI (Groq)</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <FaCheckCircle className="text-emerald-500 shrink-0" />
                            <span>Generación ilimitada de Ads</span>
                        </div>
                    </div>

                    {/* Pro Plan Highlight */}
                    <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-4 text-left border border-purple-500/20 my-4">
                        <div className="flex items-center gap-2 mb-2">
                            <FaVideo className="text-purple-400" />
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider">Exclusivo Plan Pro</p>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-300">
                            <FaStar className="text-yellow-500 shrink-0" />
                            <span><strong className="text-white">5 Videos AI</strong> por mes (animación del producto)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">Powered by Stable Video Diffusion — videos profesionales de alta fidelidad</p>
                    </div>

                    {/* Pricing Actions */}
                    <div className="space-y-4">

                        {/* Option 1: Subscription (Recommended) */}
                        {mpSubscriptionLink && (
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-200"></div>
                                <a
                                    href={mpSubscriptionLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative block w-full py-4 rounded-xl bg-slate-900 border border-emerald-500/50 hover:bg-slate-800 text-white transition-all flex items-center justify-between px-6"
                                >
                                    <div className="text-left">
                                        <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                            <FaStar className="text-yellow-400" /> Recomendado
                                        </p>
                                        <p className="font-bold text-lg">Plan Pro Mensual</p>
                                        <p className="text-[10px] text-slate-400">Ads ilimitados + 5 Videos AI/mes</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold">$29.900 <span className="text-xs font-normal text-slate-400">/mes</span></p>
                                    </div>
                                    <FaBolt className="text-emerald-400 ml-2" />
                                </a>
                            </div>
                        )}

                        {/* Divider */}
                        <div className="relative flex items-center py-2">
                            <div className="flex-grow border-t border-slate-800"></div>
                            <span className="flex-shrink-0 mx-4 text-slate-600 text-xs uppercase">O Paga Una Sola Vez</span>
                            <div className="flex-grow border-t border-slate-800"></div>
                        </div>

                        {/* Option 2: Lifetime (One Time) */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* MercadoPago Lifetime */}
                            {mpLink ? (
                                <a
                                    href={mpLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#009EE3]/10 border border-[#009EE3]/30 hover:bg-[#009EE3]/20 transition-colors text-[#009EE3]"
                                >
                                    <span className="font-bold text-sm">MercadoPago</span>
                                    <span className="font-bold text-lg">$49.900</span>
                                    <span className="text-[10px] opacity-80">Lifetime + 10 Videos/mes</span>
                                </a>
                            ) : null}

                            {/* PayPal Lifetime */}
                            {ppLink ? (
                                <a
                                    href={ppLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#0070BA]/10 border border-[#0070BA]/30 hover:bg-[#0070BA]/20 transition-colors text-[#0070BA]"
                                >
                                    <span className="font-bold text-sm">PayPal</span>
                                    <span className="font-bold text-lg">USD $39</span>
                                    <span className="text-[10px] opacity-80">Lifetime + 10 Videos/mes</span>
                                </a>
                            ) : null}
                        </div>
                    </div>

                    <button onClick={onClose} className="text-slate-500 text-sm hover:text-white transition-colors mt-4">
                        No gracias, prefiero el plan gratuito
                    </button>
                </div>
            </div>
        </div>
    );
}


