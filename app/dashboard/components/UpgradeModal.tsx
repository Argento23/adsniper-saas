
import { FaBolt, FaCheckCircle, FaStar, FaVideo, FaImage, FaRobot, FaTimes, FaCrown, FaRocket } from "react-icons/fa";

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
            <div className="relative bg-slate-900 border border-slate-700/50 rounded-3xl p-6 md:p-8 max-w-4xl w-full shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors z-10">
                    <FaTimes className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 mx-auto mb-4 p-3">
                        <img src="/adsniper_logo.svg" alt="AdSniper Logo" className="w-full h-full object-contain" />
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                        Elige tu <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Plan</span>
                    </h2>
                    <p className="text-slate-400 mt-2 text-sm">
                        Desbloquea el poder completo de AdSniper AI
                    </p>
                </div>

                {/* Pricing Grid */}
                <div className="grid md:grid-cols-3 gap-4 md:gap-5">

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
                        {mpSubscriptionLink && (
                            <a
                                href={mpSubscriptionLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 block w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-sm font-bold text-center hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                            >
                                Subscribe Now
                            </a>
                        )}
                    </div>

                    {/* LIFETIME DEAL */}
                    <div className="bg-gradient-to-b from-purple-950/30 to-slate-950/60 border border-purple-500/20 rounded-2xl p-5 flex flex-col">
                        <div className="mb-4">
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                                <FaCrown className="w-3 h-3" /> Lifetime Deal
                            </p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <p className="text-3xl font-bold text-white">$49</p>
                                <span className="text-sm text-slate-400">one-time</span>
                            </div>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-300 flex-1">
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-purple-400 shrink-0 w-3 h-3" />
                                All Pro Features
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-purple-400 shrink-0 w-3 h-3" />
                                One-time payment
                            </li>
                            <li className="flex items-center gap-2">
                                <FaCheckCircle className="text-purple-400 shrink-0 w-3 h-3" />
                                Future updates included
                            </li>
                        </ul>
                        <div className="mt-5 space-y-2">
                            {mpLink && (
                                <a
                                    href={mpLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-2.5 rounded-xl bg-[#009EE3]/15 border border-[#009EE3]/30 text-[#009EE3] text-sm font-bold text-center hover:bg-[#009EE3]/25 transition-all"
                                >
                                    Pay with MercadoPago
                                </a>
                            )}
                            {ppLink && (
                                <a
                                    href={ppLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-2.5 rounded-xl bg-[#0070BA]/15 border border-[#0070BA]/30 text-[#0070BA] text-sm font-bold text-center hover:bg-[#0070BA]/25 transition-all"
                                >
                                    Pay with PayPal
                                </a>
                            )}
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
