import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function Terms() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 p-8 font-sans">
            <div className="max-w-3xl mx-auto space-y-8">
                <Link href="/" className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
                    <FaArrowLeft /> Volver al Inicio
                </Link>

                <h1 className="text-4xl font-bold text-white">Términos y Condiciones de Uso</h1>
                <p className="text-sm text-slate-500">Última actualización: {new Date().toLocaleDateString()}</p>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">1. Aceptación de los Términos</h2>
                    <p>
                        Al acceder y utilizar AdSniper AI ("el Servicio"), aceptas cumplir con estos Términos y Condiciones. Si no estás de acuerdo con alguna parte, no debes usar el Servicio.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">2. Descripción del Servicio</h2>
                    <p>
                        AdSniper AI es una herramienta SaaS que utiliza Inteligencia Artificial (Groq, Llama 3, Flux.1) para generar contenido de marketing (textos e imágenes).
                    </p>
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                        <p className="font-bold text-emerald-400 mb-2">⚠ Descargo de Responsabilidad de IA:</p>
                        <p className="text-sm">
                            El contenido es generado por algoritmos y puede contener imprecisiones. Tú eres el único responsable de revisar, editar y aprobar cualquier anuncio antes de su publicación. AdSniper no se hace responsable por el rendimiento de los anuncios ni por infracciones de derechos de autor en imágenes generadas por IA.
                        </p>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">3. Cuentas y Pagos</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Debes proporcionar información real al registrarte.</li>
                        <li><strong>Suscripciones y Licencias:</strong> Los pagos son procesados por terceros (MercadoPago / PayPal).</li>
                        <li><strong>Reembolsos:</strong> Debido a la naturaleza digital del producto y los costos de computación incurridos, no ofrecemos reembolsos una vez utilizados los créditos, salvo obligación legal.</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">4. Propiedad Intelectual</h2>
                    <p>
                        Tú conservas los derechos sobre los inputs que introduces. AdSniper te otorga una licencia mundial y perpetua para usar el contenido generado para tus fines comerciales.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">5. Limitación de Responsabilidad</h2>
                    <p>
                        En ningún caso AdSniper ni sus creadores serán responsables por daños indirectos, incidentales o consecuentes (incluyendo pérdida de beneficios) derivados del uso del servicio.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">6. Contacto</h2>
                    <p>
                        Para soporte legal o dudas, contacta a: soporte@generarise.space
                    </p>
                </section>
            </div>
        </div>
    );
}
