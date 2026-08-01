import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function Terms() {
    const lastUpdated = "Marzo 2026";
    const contactEmail = "soporte@generarise.space";
    const companyName = "GenerArise / Neurova Labs";
    const appName = "AdSíntesis AI";
    const website = "studio.generarise.space";

    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 p-8 font-sans">
            <div className="max-w-3xl mx-auto space-y-10 pb-20">
                <Link href="/" className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm">
                    <FaArrowLeft /> Volver al Inicio
                </Link>

                <div>
                    <h1 className="text-4xl font-bold text-white mb-2">Términos y Condiciones de Uso</h1>
                    <p className="text-sm text-slate-500">Última actualización: {lastUpdated} — {website}</p>
                </div>

                {/* --- SECCIÓN 1 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">1. Aceptación de los Términos</h2>
                    <p>Al acceder, registrarte o utilizar <strong className="text-white">{appName}</strong> (en adelante "el Servicio"), aceptás íntegramente estos Términos y Condiciones, así como nuestra Política de Privacidad. Si no estás de acuerdo con alguna parte, debés dejar de usar el Servicio inmediatamente.</p>
                    <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entran en vigencia al publicarse. El uso continuado del Servicio implica aceptación de las modificaciones.</p>
                </section>

                {/* --- SECCIÓN 2 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">2. Descripción del Servicio</h2>
                    <p>{appName} es una plataforma SaaS de generación de contenido publicitario mediante Inteligencia Artificial (incluyendo modelos de Groq, Llama 3, Flux.1, Replicate y otros). Permite generar textos, imágenes y videos para uso comercial.</p>
                    <div className="bg-yellow-950/30 border border-yellow-700/40 p-4 rounded-xl">
                        <p className="font-bold text-yellow-400 mb-2">⚠️ Descargo de Responsabilidad sobre Contenido de IA</p>
                        <p className="text-sm">El contenido es generado por algoritmos automatizados y puede contener imprecisiones, errores o similitudes no deseadas con obras de terceros. <strong className="text-white">Vos sos el único responsable</strong> de revisar, editar, aprobar y publicar cualquier contenido antes de su uso. {companyName} no garantiza ningún resultado comercial específico.</p>
                    </div>
                </section>

                {/* --- SECCIÓN 3 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">3. Cuentas de Usuario y Pagos</h2>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>Debés proporcionar información veraz y actualizada al registrarte.</li>
                        <li>Sos responsable de mantener la confidencialidad de tu contraseña y de todas las actividades en tu cuenta.</li>
                        <li>Los pagos son procesados de forma segura por <strong className="text-white">MercadoPago</strong> y <strong className="text-white">PayPal</strong>. No almacenamos datos de tarjetas de crédito.</li>
                        <li>Los precios están expresados en USD o ARS según el plan. Podemos modificar precios con un aviso previo de 30 días.</li>
                        <li>Las suscripciones se renuevan automáticamente hasta que el usuario las cancele.</li>
                    </ul>
                </section>

                {/* --- SECCIÓN 4 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">4. Política de Reembolsos</h2>
                    <p>Dada la naturaleza digital del producto y los costos computacionales incurridos en la generación de contenido mediante IA:</p>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li><strong className="text-white">No ofrecemos reembolsos</strong> una vez que se han utilizado créditos o generaciones.</li>
                        <li>En caso de falla técnica comprobada de nuestra plataforma por más de 24 horas continuas, ofreceremos extensión de plan o reembolso proporcional al tiempo de inactividad.</li>
                        <li>Para solicitar soporte, contactá a: <a href={`mailto:${contactEmail}`} className="text-emerald-400 underline">{contactEmail}</a></li>
                        <li>Cualquier disputa de cobro (chargeback) será respondida con evidencia de uso registrado en nuestros sistemas.</li>
                    </ul>
                </section>

                {/* --- SECCIÓN 5 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">5. Uso Prohibido</h2>
                    <p>Queda expresamente prohibido usar {appName} para:</p>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>Generar contenido que incite al odio, discriminación, violencia o actividades ilegales.</li>
                        <li>Crear imágenes de personas reales sin su consentimiento explícito (deepfakes).</li>
                        <li>Violar derechos de propiedad intelectual de terceros.</li>
                        <li>Envío masivo de spam publicitario no solicitado.</li>
                        <li>Intentar acceder a sistemas o datos de otros usuarios.</li>
                        <li>Revender el servicio sin autorización escrita.</li>
                    </ul>
                    <p className="text-sm">El incumplimiento de estas restricciones puede resultar en la suspensión inmediata de la cuenta sin reembolso.</p>
                </section>

                {/* --- SECCIÓN 6 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">6. Propiedad Intelectual</h2>
                    <p>Vos conservás los derechos sobre los inputs que introducís (textos, imágenes, URLs). {companyName} te otorga una <strong className="text-white">licencia mundial, no exclusiva y perpetua</strong> sobre el contenido generado a partir de tus inputs, para usos comerciales lícitos.</p>
                    <p>El código fuente, marca, diseño, modelos y tecnología de {appName} son propiedad exclusiva de {companyName} y están protegidos por leyes de propiedad intelectual. Queda prohibida su reproducción o ingeniería inversa.</p>
                </section>

                {/* --- SECCIÓN 7 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">7. Limitación de Responsabilidad</h2>
                    <p>En la máxima medida permitida por la ley aplicable:</p>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>{companyName} no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo pérdida de ganancias, datos o reputación.</li>
                        <li>La responsabilidad total máxima de {companyName} ante vos estará limitada al monto que pagaste por el Servicio en los últimos 3 meses.</li>
                        <li>No nos responsabilizamos por el rendimiento de los anuncios publicados, ni por infracciones de derechos de autor en contenido generado por IA.</li>
                        <li>El Servicio se provee "tal cual" (as-is) sin garantías de ningún tipo, expresas o implícitas.</li>
                    </ul>
                </section>

                {/* --- SECCIÓN 8 — PRIVACIDAD --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">8. Política de Privacidad y Protección de Datos</h2>
                    <p className="text-sm text-slate-400">Esta sección cumple con el GDPR (UE), CCPA (California), y la Ley 25.326 de Argentina.</p>

                    <h3 className="font-bold text-white">8.1 Datos que recolectamos</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li><strong className="text-white">Datos de cuenta:</strong> nombre, email, ID de autenticación (gestionado por Clerk.com).</li>
                        <li><strong className="text-white">Datos de uso:</strong> cantidad de generaciones, tipo de plan, créditos utilizados.</li>
                        <li><strong className="text-white">Datos técnicos:</strong> dirección IP, navegador, sistema operativo (para seguridad y diagnóstico).</li>
                        <li><strong className="text-white">Contenido generado:</strong> podemos almacenar temporalmente imágenes/textos generados para entrega y soporte.</li>
                    </ul>

                    <h3 className="font-bold text-white mt-4">8.2 Para qué usamos tus datos</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li>Proveer y mejorar el Servicio.</li>
                        <li>Gestionar pagos y facturación.</li>
                        <li>Comunicaciones de soporte y actualizaciones del servicio.</li>
                        <li>Cumplimiento legal y prevención de fraude.</li>
                    </ul>

                    <h3 className="font-bold text-white mt-4">8.3 Compartimos datos con:</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li><strong className="text-white">Clerk.com:</strong> gestión de autenticación y sesiones de usuario.</li>
                        <li><strong className="text-white">Groq / Replicate / Fal.ai:</strong> procesamiento de generación de IA (sin datos personales identificables).</li>
                        <li><strong className="text-white">MercadoPago / PayPal:</strong> procesamiento de pagos.</li>
                        <li><strong className="text-white">No vendemos</strong> tus datos personales a terceros bajo ninguna circunstancia.</li>
                    </ul>

                    <h3 className="font-bold text-white mt-4">8.4 Tus derechos (GDPR / CCPA)</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li>Acceder a tus datos personales almacenados.</li>
                        <li>Solicitar corrección de datos inexactos.</li>
                        <li>Solicitar eliminación de tu cuenta y datos ("derecho al olvido").</li>
                        <li>Oponerte al procesamiento o solicitar portabilidad de datos.</li>
                        <li>Presentar una queja ante la autoridad de protección de datos de tu país.</li>
                    </ul>
                    <p className="text-sm">Para ejercer estos derechos, contactá a: <a href={`mailto:${contactEmail}`} className="text-emerald-400 underline">{contactEmail}</a></p>

                    <h3 className="font-bold text-white mt-4">8.5 Cookies</h3>
                    <p className="text-sm">Utilizamos cookies esenciales para el funcionamiento de la autenticación y sesión. No utilizamos cookies de seguimiento publicitario de terceros. Podés deshabilitar las cookies en la configuración de tu navegador, pero esto puede afectar la funcionalidad del Servicio.</p>

                    <h3 className="font-bold text-white mt-4">8.6 Retención de datos</h3>
                    <p className="text-sm">Retenemos tus datos mientras tu cuenta esté activa. Al cancelar tu cuenta, los datos son eliminados dentro de los 30 días siguientes, excepto los registros de facturación que pueden conservarse por obligaciones fiscales (hasta 5 años).</p>
                </section>

                {/* --- SECCIÓN 9 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">9. Resolución de Disputas y Jurisdicción</h2>
                    <p>Ante cualquier disputa relacionada con este Servicio:</p>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>Las partes acuerdan intentar resolver la disputa de forma amigable en primera instancia, contactando a <a href={`mailto:${contactEmail}`} className="text-emerald-400 underline">{contactEmail}</a>.</li>
                        <li>Si no se llega a un acuerdo en 30 días, las disputas se resolverán mediante <strong className="text-white">arbitraje vinculante</strong> de forma individual. Queda expresamente excluida la participación en demandas colectivas (class actions).</li>
                        <li>Estos Términos se rigen por las leyes de la <strong className="text-white">República Argentina</strong>. Para disputas con usuarios de la UE, se aplicará el GDPR y legislación europea de protección al consumidor según corresponda.</li>
                    </ul>
                </section>

                {/* --- SECCIÓN 10 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">10. Cancelación del Servicio</h2>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>Podés cancelar tu suscripción en cualquier momento desde la configuración de tu cuenta o contactando a soporte.</li>
                        <li>Al cancelar, mantendrás acceso hasta el final del período facturado.</li>
                        <li>Nos reservamos el derecho de suspender o cancelar cuentas que violen estos Términos, sin reembolso.</li>
                    </ul>
                </section>

                {/* --- SECCIÓN 11 --- */}
                <section className="space-y-3">
                    <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">11. Contacto</h2>
                    <p>Para consultas legales, de privacidad o soporte:</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li>Email: <a href={`mailto:${contactEmail}`} className="text-emerald-400 underline">{contactEmail}</a></li>
                        <li>Web: <span className="text-emerald-400">{website}</span></li>
                        <li>Empresa: {companyName}</li>
                    </ul>
                </section>

                <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
                    © 2026 {companyName}. Todos los derechos reservados. — {website}
                </div>
            </div>
        </div>
    );
}
