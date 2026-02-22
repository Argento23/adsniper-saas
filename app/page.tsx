
import Link from 'next/link';
import { FaArrowRight, FaRobot, FaBullseye, FaBolt, FaChartLine, FaCheckCircle, FaShieldAlt, FaPlay } from 'react-icons/fa';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">

      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 left-0 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 p-2">
              <img src="/adsniper_logo.svg" alt="AdSniper Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">AdSniper</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Login</Link>
            <Link href="/sign-in" className="px-5 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-emerald-400 hover:scale-105 transition-all flex items-center gap-2">
              Launch App <FaArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] opacity-30 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] opacity-30 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold tracking-wider uppercase mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <FaBolt className="w-3 h-3" /> AI-Powered Ad Intelligence
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Stop Guessing. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Start Sniping.</span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Genera anuncios virales, guiones de TikTok y análisis de competencia en segundos.
            El "Cerebro Creativo" que tu marca necesita para escalar en 2026.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            <Link href="/sign-in" className="w-full md:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-bold rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/40 flex items-center justify-center gap-2">
              <FaRobot className="w-5 h-5" />
              Try AdSniper Free
            </Link>
            <button className="w-full md:w-auto px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-lg font-bold rounded-full transition-all flex items-center justify-center gap-2 backdrop-blur-sm">
              <FaPlay className="w-5 h-5" />
              Watch Demo
            </button>
          </div>

          {/* Dashboard Preview */}
          <div className="mt-24 relative mx-auto max-w-5xl rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500 group">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10"></div>
            <img
              src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1974&auto=format&fit=crop"
              alt="Dashboard Preview"
              className="w-full h-auto opacity-80 group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute bottom-10 left-10 right-10 z-20 text-left">
              <div className="inline-block px-4 py-2 bg-emerald-500 text-black font-bold rounded-lg text-sm mb-4">Live Analysis</div>
              <h3 className="text-2xl font-bold text-white mb-2">Real-time Competitor Tracking</h3>
              <p className="text-slate-300">Monitorea ads de la competencia y detecta patrones ganadores al instante.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-slate-950 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Built for Growth Hackers</h2>
            <p className="text-slate-400 text-lg">Todo lo que necesitas para lanzar campañas ganadoras.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-emerald-500/30 transition-all hover:bg-slate-900 group">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                <FaShieldAlt className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">Ad Intelligence</h3>
              <p className="text-slate-400 leading-relaxed">Espía legalmente a tu competencia. Descubre qué creativos están escalando y por qué.</p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-purple-500/30 transition-all hover:bg-slate-900 group">
              <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 text-purple-400 group-hover:scale-110 transition-transform">
                <FaRobot className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">AI Copywriter</h3>
              <p className="text-slate-400 leading-relaxed">Genera guiones de video y textos persuasivos basados en tu identidad de marca única.</p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 hover:border-cyan-500/30 transition-all hover:bg-slate-900 group">
              <div className="w-14 h-14 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 text-cyan-400 group-hover:scale-110 transition-transform">
                <FaChartLine className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">Viral Angles</h3>
              <p className="text-slate-400 leading-relaxed">Nuestro motor detecta tendencias virales y adapta tu producto a lo que funciona HOY.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-32 bg-black relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">From Zero to Viral in 3 Steps</h2>
            <p className="text-slate-400 text-lg">No marketing degree required.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div className="relative group">
              <div className="w-20 h-20 bg-slate-900 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-8 text-2xl font-bold group-hover:border-emerald-500/50 transition-colors shadow-xl">1</div>
              <h3 className="text-xl font-bold mb-4">Paste Product URL</h3>
              <p className="text-slate-400">Simply drop your Shopify or Amazon link. We scrape the details automatically.</p>
            </div>
            <div className="relative group">
              <div className="w-20 h-20 bg-slate-900 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-8 text-2xl font-bold group-hover:border-emerald-500/50 transition-colors shadow-xl">2</div>
              <h3 className="text-xl font-bold mb-4">AI Magic Happens</h3>
              <p className="text-slate-400">Our engine analyzes viral angles, writes copy, and generates premium visuals.</p>
            </div>
            <div className="relative group">
              <div className="w-20 h-20 bg-emerald-600 rounded-2xl border border-emerald-400 flex items-center justify-center mx-auto mb-8 text-2xl font-bold text-white shadow-xl shadow-emerald-500/20">3</div>
              <h3 className="text-xl font-bold mb-4">Launch & Profit</h3>
              <p className="text-slate-400">Copy the ads directly to Facebook/TikTok Ads Manager and watch the sales roll in.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-slate-950 relative border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Simple Pricing. High ROI.</h2>
            <p className="text-slate-400 text-lg">Choose the plan that fits your growth stage.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">

            {/* Free Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/30 border border-white/5 flex flex-col">
              <h3 className="text-xl font-bold text-slate-400 mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-6">$0</div>
              <ul className="space-y-4 mb-8 flex-1 text-slate-300 text-sm">
                <li className="flex items-center gap-2"><FaCheckCircle className="text-slate-600" /> 3 Free AI Credits</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-slate-600" /> Basic Ad Copy</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-slate-600" /> Standard Images</li>
              </ul>
              <Link href="/dashboard" className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-center font-bold transition-all">
                Try for Free
              </Link>
            </div>

            {/* Pro Subscription (Featured) */}
            <div className="p-8 rounded-3xl bg-slate-900 border border-emerald-500/50 relative flex flex-col transform md:-translate-y-4 shadow-2xl shadow-emerald-500/10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
              <h3 className="text-xl font-bold text-emerald-400 mb-2">Pro Monthly</h3>
              <div className="text-4xl font-bold mb-1">$29<span className="text-lg text-slate-500 font-normal">/mo</span></div>
              <p className="text-xs text-slate-500 mb-6">Or $29.900 ARS</p>

              <ul className="space-y-4 mb-8 flex-1 text-slate-200 text-sm">
                <li className="flex items-center gap-2"><FaCheckCircle className="text-emerald-500" /> <strong>Unlimited</strong> Credits</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-emerald-500" /> Premium Flux.1 Images</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-emerald-500" /> Viral TikTok Scripts</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-emerald-500" /> Priority Support</li>
              </ul>
              <a href="https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=068cba02015840e3b78121a6a1c6559f" target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-center font-bold transition-all shadow-lg shadow-emerald-500/20">
                Subscribe Now
              </a>
            </div>

            {/* Lifetime */}
            <div className="p-8 rounded-3xl bg-slate-900/30 border border-white/5 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Lifetime Deal</h3>
              <div className="text-4xl font-bold mb-6">$49<span className="text-lg text-slate-500 font-normal"> one-time</span></div>
              <ul className="space-y-4 mb-8 flex-1 text-slate-300 text-sm">
                <li className="flex items-center gap-2"><FaCheckCircle className="text-white" /> All Pro Features</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-white" /> One-time payment</li>
                <li className="flex items-center gap-2"><FaCheckCircle className="text-white" /> Future updates included</li>
              </ul>
              <div className="space-y-2">
                <a href="https://mpago.la/2wZfbLt" target="_blank" rel="noopener noreferrer" className="block w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-center font-bold transition-all text-sm">
                  Pay with MercadoPago
                </a>
                <a href="https://www.paypal.com/ncp/payment/VJZDENGAEHZJJ" target="_blank" rel="noopener noreferrer" className="block w-full py-3 rounded-xl bg-blue-600/10 border border-blue-600/30 text-blue-500 hover:bg-blue-600/20 text-center font-bold transition-all text-sm">
                  Pay with PayPal
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-emerald-950/20"></div>
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-8">Ready to dominate your niche?</h2>
          <p className="text-xl text-slate-400 mb-12">Join 1,000+ marketers using AdSniper to scale their brands.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-3 px-10 py-5 bg-white text-black text-xl font-bold rounded-full hover:bg-emerald-400 transition-all hover:scale-105 shadow-xl shadow-emerald-500/10">
            Start Free Trial <FaArrowRight className="w-6 h-6" />
          </Link>
          <div className="mt-8 flex items-center justify-center gap-6 text-slate-500 text-sm font-medium">
            <span className="flex items-center gap-2"><FaCheckCircle className="w-4 h-4 text-emerald-500" /> No credit card required</span>
            <span className="flex items-center gap-2"><FaCheckCircle className="w-4 h-4 text-emerald-500" /> 7-day free trial</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 bg-black">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <FaBullseye className="w-5 h-5" />
            <span className="font-bold">AdSniper SaaS</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link href="/terms" className="hover:text-white transition-colors">Términos y Condiciones</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Política de Privacidad</Link>
          </div>
          <p className="text-slate-600 text-sm">© 2026 AdSniper. Powered by GenerArise.</p>
        </div>
      </footer>
    </div>
  );
}
