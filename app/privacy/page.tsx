import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function Privacy() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 p-8 font-sans">
            <div className="max-w-3xl mx-auto space-y-8">
                <Link href="/" className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
                    <FaArrowLeft /> Volver al Inicio
                </Link>

                <h1 className="text-4xl font-bold text-white">PolÃ­tica de Privacidad</h1>
                <p className="text-sm text-slate-500">Ãšltima actualizaciÃ³n: {new Date().toLocaleDateString()}</p>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">1. InformaciÃ³n que Recopilamos</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Datos de Cuenta:</strong> A travÃ©s de Clerk (Email, Nombre, Foto).</li>
                        <li><strong>Datos de Uso:</strong> Prompts, descripciones de productos y contenido generado.</li>
                        <li><strong>Datos TÃ©cnicos:</strong> Cookies, direcciÃ³n IP y logs del servidor para seguridad.</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">2. Uso de la InformaciÃ³n</h2>
                    <p>Utilizamos tus datos para:</p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Proveer y mantener el servicio AdSíntesis.</li>
                        <li>Procesar las generaciones con proveedores de IA (Groq, Pollinations). <strong>Nota:</strong> No enviamos tus datos personales a estos proveedores, solo el contenido del prompt.</li>
                        <li>Mejorar nuestros modelos y experiencia de usuario.</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">3. ComparticiÃ³n de Datos</h2>
                    <p>
                        No vendemos tus datos. Solo compartimos informaciÃ³n con:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Proveedores de Servicio:</strong> Alojamiento (Vercel), AutenticaciÃ³n (Clerk), Pagos (MercadoPago/PayPal).</li>
                        <li><strong>Requerimiento Legal:</strong> Si una autoridad judicial lo solicita.</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">4. Seguridad</h2>
                    <p>
                        Implementamos medidas de seguridad estÃ¡ndar de la industria. Sin embargo, ninguna transmisiÃ³n por internet es 100% segura.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">5. Tus Derechos</h2>
                    <p>
                        Puedes solicitar la eliminaciÃ³n de tu cuenta y datos en cualquier momento contactando a soporte@generarise.space.
                    </p>
                </section>
            </div>
        </div>
    );
}

