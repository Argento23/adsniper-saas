
import { FaBolt, FaCheckCircle, FaStar, FaVideo, FaImage, FaRobot, FaTimes, FaCrown, FaRocket } from "react-icons/fa";

interface UpgradeModalProps {
    isOpen: boolean;
    onClose?: () => void;
    mpSubscriptionLink?: string; // MercadoPago Pro Link
    ppLink?: string; // PayPal Pro Link
    mpStudioLink?: string; // MercadoPago Studio Link
    ppStudioLink?: string; // PayPal Studio Link
}

export default function UpgradeModal({ isOpen, onClose, mpSubscriptionLink, ppLink, mpStudioLink, ppStudioLink }: UpgradeModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Content */}
            <div className="relative bg-slate-900 border border-slate-700/50 rounded-3xl p-6 md:p-8 max-w-5xl w-full shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors z-10">
                    <FaTimes className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 mx-auto mb-4 p-3">
                        <img src="/AdSíntesis_logo.svg" alt="AdSíntesis Logo" className="w-full h-full object-contain" />
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                        Elige tu <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Plan</span>
                    </h2>
                    <p className="text-slate-400 mt-2 text-sm">
                        Desbloquea el poder completo de AdSíntesis AI
                    </p>
                </div>

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto px-2">

                    {/* STARTER - Free */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 flex flex-col">
                        <div className="mb-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Starter</p>
                            <p className="text-3xl font-bold text-white mt-1">$0</p>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-400 flex-1">
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-slate-600 shrink-0 w-3 h-3" />
                                3 Free AI Credits
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-slate-600 shrink-0 w-3 h-3" />
                                Basic Ad Copy
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-slate-600 shrink-0 w-3 h-3" />
                                Standard Images
                            </li>
                        </ul>
                        <button
                            onClick={onClose}
                            className="mt-5 w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold hover:bg-slate-700 hover:text-white transition-all"
                        >
                            Try for Free
                        </button>
                    </div>

                    {/* PRO MONTHLY - Recommended */}
                    <div className="relative bg-gradient-to-b from-emerald-950/40 to-slate-950/60 border border-emerald-500/30 rounded-2xl p-5 flex flex-col shadow-lg shadow-emerald-500/5">
                        {/* Badge */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full shadow-lg">
                                Most Popular
                            </span>
                        </div>
                        <div className="mb-4 mt-2">
                            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                <FaRocket className="w-3 h-3" /> Pro Monthly
                            </p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <p className="text-3xl font-bold text-white">$29</p>
                                <span className="text-sm text-slate-400">/mo</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">Or $29.900 ARS</p>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-300 flex-1">
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-emerald-500 shrink-0 w-3 h-3" />
                                <strong className="text-white">Unlimited</strong>&nbsp;Credits
                            </li>
                            <li className="flex items-center gap-2">
                                <FaImage className="text-emerald-500 shrink-0 w-3 h-3" />
                                Premium Flux.1 Images
                            </li>
                            <li className="flex items-center gap-2">
                                <FaVideo className="text-emerald-500 shrink-0 w-3 h-3" />
                                Viral TikTok Scripts
                            </li>
                            <li className="flex items-center gap-2">
                                <FaStar className="text-emerald-500 shrink-0 w-3 h-3" />
                                Priority Support
                            </li>
                        </ul>
                        <div className="mt-5 space-y-2">
                            {mpSubscriptionLink && (
                                <a
                                    href={mpSubscriptionLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-sm font-bold text-center hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                                >
                                    Suscribirse con MercadoPago
                                </a>
                            )}
                            {ppLink && (
                                <a
                                    href={ppLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-2.5 rounded-xl bg-[#0070BA]/15 border border-[#0070BA]/30 text-[#0070BA] text-sm font-bold text-center hover:bg-[#0070BA]/25 transition-all"
                                >
                                    Pay with PayPal ($29/mo)
                                </a>
                            )}
                        </div>
                    </div>

                    {/* STUDIO PRO - Inpainting */}
                    <div className="relative bg-gradient-to-b from-purple-950/40 to-slate-950/60 border border-purple-500/30 rounded-2xl p-5 flex flex-col shadow-lg shadow-purple-500/5">
                        <div className="absolute -top-3 right-4">
                            <span className="bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
                                <FaCrown className="w-2.5 h-2.5" /> 8K
                            </span>
                        </div>
                        <div className="mb-4 mt-2">
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                                <FaRobot className="w-3 h-3" /> Studio Pro
                            </p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <p className="text-3xl font-bold text-white">$49</p>
                                <span className="text-sm text-slate-400">/mo</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">Or $49.000 ARS</p>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-300 flex-1">
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-purple-500 shrink-0 w-3 h-3" />
                                Everything in Pro
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-purple-500 shrink-0 w-3 h-3" />
                                <strong className="text-white">100 Studio Credits</strong>
                            </li>
                            <li className="flex items-center gap-2 text-purple-200">
                                <FaImage className="text-purple-400 shrink-0 w-3 h-3" />
                                8K Product Inpainting
                            </li>
                            <li className="flex items-center gap-2">
                                <FaStar className="text-purple-500 shrink-0 w-3 h-3" />
                                Advanced Llama 3 Prompts
                            </li>
                        </ul>
                        <div className="mt-5 space-y-2">
                            {mpStudioLink && (
                                <a
                                    href={mpStudioLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold text-center hover:brightness-110 transition-all shadow-lg shadow-purple-500/20 active:scale-[0.98]"
                                >
                                    Suscribirse con MercadoPago
                                </a>
                            )}
                            {ppStudioLink && (
                                <a
                                    href={ppStudioLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-2.5 rounded-xl bg-purple-900/15 border border-purple-500/30 text-purple-300 text-sm font-bold text-center hover:bg-purple-900/25 transition-all"
                                >
                                    Pay with PayPal ($49/mo)
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Trust Badges */}
                <div className="mt-8 flex flex-col items-center justify-center gap-3">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                        <FaCheckCircle className="text-emerald-500 w-3 h-3" />
                        <span>Pago 100% Seguro Encriptado SSL (AES-256)</span>
                    </div>
                    <div className="flex items-center gap-4 opacity-70">
                        {/* MercadoPago SVG */}
                        <svg viewBox="0 0 1000 240" className="h-4 fill-slate-300">
                            <path d="M189.6,183.1c-14,0-25.5-11.4-25.5-25.5V59.4L137,70.5v120.3c0,29,23.6,52.6,52.6,52.6h38l-11.1-60.3H189.6z" />
                            <path d="M259.9,64.3c-11.6,0-21.1,9.4-21.1,21.1v97.7h29.5V85.4c0-3.9,3.2-7.1,7.1-7.1c3.9,0,7.1,3.2,7.1,7.1v97.7h29.5V85.4c0-3.9,3.2-7.1,7.1-7.1c3.9,0,7.1,3.2,7.1,7.1v97.7h29.5V85.4C355.8,73.8,346.3,64.3,334.7,64.3c-7.9,0-14.8,4.4-18.4,10.9c-3.6-6.5-10.5-10.9-18.4-10.9C289.9,64.3,283,68.7,279.4,75.2C275.8,68.7,268.9,64.3,259.9,64.3z" />
                            <path d="M410.6,183.1h29.5v-48.4c0-26.4-21.5-47.9-47.9-47.9c-16,0-30.1,7.9-38.6,20.1v-18.6h-29.5v94.8h29.5v-31.7c0-17.5,14.3-31.8,31.8-31.8c11.2,0,21.1,5.8,26.5,14.7v68.8H410.6z" />
                            <path d="M495.8,86.8c-26.4,0-47.9,21.5-47.9,47.9c0,26.4,21.5,47.9,47.9,47.9h12v-29.5h-12c-10.2,0-18.4-8.3-18.4-18.4c0-10.2,8.3-18.4,18.4-18.4h12V86.8H495.8z" />
                            <path d="M578.1,183.1v-15.6c-8.5,12.2-22.6,20.1-38.6,20.1c-26.4,0-47.9-21.5-47.9-47.9c0-26.4,21.5-47.9,47.9-47.9c16,0,30.1,7.9,38.6,20.1V86.8h29.5v96.3H578.1z M539.4,153c10.2,0,18.4-8.3,18.4-18.4c0-10.2-8.3-18.4-18.4-18.4c-10.2,0-18.4,8.3-18.4,18.4C521.1,144.8,529.3,153,539.4,153z" />
                            <path d="M684.3,62.3v39.5c0,10.2,8.3,18.4,18.4,18.4c10.2,0,18.4-8.3,18.4-18.4V62.3h29.5v39.5c0,26.4-21.5,47.9-47.9,47.9c-26.4,0-47.9-21.5-47.9-47.9V62.3H684.3z" />
                            <path d="M834.4,183.1h-29.5v-13.8c-8.5,12.2-22.6,20.1-38.6,20.1c-26.4,0-47.9-21.5-47.9-47.9c0-26.4,21.5-47.9,47.9-47.9c16,0,30.1,7.9,38.6,20.1v-51.5h29.5V183.1z M766.2,134.7c0,10.2,8.3,18.4,18.4,18.4c10.2,0,18.4-8.3,18.4-18.4c0-10.2-8.3-18.4-18.4-18.4C774.5,116.3,766.2,124.5,766.2,134.7z" />
                            <path d="M900.2,183.1c-26.4,0-47.9-21.5-47.9-47.9c0-26.4,21.5-47.9,47.9-47.9c26.4,0,47.9,21.5,47.9,47.9C948.1,161.6,926.6,183.1,900.2,183.1z M900.2,116.3c-10.2,0-18.4,8.3-18.4,18.4c0,10.2,8.3,18.4,18.4,18.4c10.2,0,18.4-8.3,18.4-18.4C918.6,124.5,910.4,116.3,900.2,116.3z" />
                        </svg>
                        {/* PayPal SVG Simple Text */}
                        <div className="text-[13px] font-bold tracking-tight text-slate-300 flex items-center gap-[2px]">
                            <span className="text-[#003087]">Pay</span><span className="text-[#0079C1]">Pal</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6">
                    <button onClick={onClose} className="text-slate-600 text-xs hover:text-slate-400 transition-colors">
                        No gracias, prefiero el plan gratuito
                    </button>
                </div>
            </div>
        </div>
    );
}


