'use client';
import { useEffect, useState } from 'react';
import { supabase, type AgencyClient, type AgencyService, type AgencyTool, type ClientStatus } from '@/lib/supabase';

// ── Icons ────────────────────────────────────────────────────────────────────
const Icons = {
    Users: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    DollarSign: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Tool: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    Bell: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
    Plus: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
    X: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
};

const STATUS_COLORS: Record<ClientStatus, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    paused: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    expired: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

function daysUntil(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AgencyDashboard() {
    const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'billing' | 'tools' | 'alerts'>('overview');
    const [clients, setClients] = useState<AgencyClient[]>([]);
    const [services, setServices] = useState<AgencyService[]>([]);
    const [tools, setTools] = useState<AgencyTool[]>([]);
    const [loading, setLoading] = useState(true);
    const [dbReady, setDbReady] = useState(true);
    const [showAddClient, setShowAddClient] = useState(false);

    // Form state
    const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', company: '', status: 'active' as ClientStatus, notes: '' });

    useEffect(() => { fetchAll(); }, []);

    async function fetchAll() {
        setLoading(true);
        try {
            const [{ data: c, error: ce }, { data: s, error: se }, { data: t, error: te }] = await Promise.all([
                supabase.from('agency_clients').select('*').order('created_at', { ascending: false }),
                supabase.from('agency_services').select('*, client:agency_clients(name, email)').order('end_date', { ascending: true }),
                supabase.from('agency_tools').select('*').order('name'),
            ]);

            // If tables don't exist, Supabase returns error code 42P01
            if (ce?.code === '42P01' || te?.code === '42P01') {
                setDbReady(false);
                setLoading(false);
                return;
            }

            setClients(c || []);
            setServices(s || []);
            setTools(t || []);
            setDbReady(true);
        } catch (e) {
            setDbReady(false);
        } finally {
            setLoading(false);
        }
    }

    async function addClient() {
        if (!newClient.name) return;
        await supabase.from('agency_clients').insert(newClient);
        setNewClient({ name: '', email: '', phone: '', company: '', status: 'active', notes: '' });
        setShowAddClient(false);
        fetchAll();
    }

    async function deleteClient(id: string) {
        if (!confirm('¿Eliminar este cliente?')) return;
        await supabase.from('agency_clients').delete().eq('id', id);
        fetchAll();
    }

    async function updateTool(id: string, field: string, value: any) {
        await supabase.from('agency_tools').update({ [field]: value }).eq('id', id);
        fetchAll();
    }

    // ── Computed metrics ──────────────────────────────────────────────────────
    const totalMRR = services.filter(s => s.status === 'active').reduce((sum, s) => {
        const monthly = s.renewal_type === 'annual' ? s.amount / 12 : s.renewal_type === 'one-time' ? 0 : s.amount;
        return sum + (s.currency === 'ARS' ? monthly / 1200 : monthly);
    }, 0);

    const totalCosts = tools.reduce((sum, t) => sum + (t.monthly_cost_usd || 0), 0);

    const alerts = [
        ...services.filter(s => daysUntil(s.end_date) <= 7 && daysUntil(s.end_date) >= 0).map(s => ({
            type: 'warning' as const,
            message: `Servicio "${s.service_name}" vence en ${daysUntil(s.end_date)} días`,
            detail: (s.client as any)?.name || 'Cliente desconocido'
        })),
        ...services.filter(s => daysUntil(s.end_date) < 0 && s.status !== 'expired').map(s => ({
            type: 'error' as const,
            message: `Servicio "${s.service_name}" VENCIÓ`,
            detail: (s.client as any)?.name || 'Cliente desconocido'
        })),
        ...tools.filter(t => t.end_date && daysUntil(t.end_date) <= 7).map(t => ({
            type: 'warning' as const,
            message: `Herramienta "${t.name}" vence pronto`,
            detail: t.end_date ? `Vence: ${new Date(t.end_date).toLocaleDateString('es-AR')}` : ''
        })),
    ];

    if (loading) return (
        <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Conectando con Supabase...</p>
            </div>
        </div>
    );

    // ── DB NOT READY — Show setup instructions ────────────────────────────────
    if (!dbReady) return (
        <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-6">
            <div className="max-w-lg w-full p-8 rounded-2xl bg-white/3 border border-white/10 text-center">
                <div className="text-4xl mb-4">🗄️</div>
                <h2 className="text-lg font-bold text-white mb-2">Configuración inicial requerida</h2>
                <p className="text-slate-400 text-sm mb-6">Las tablas de la base de datos no existen todavía. Ejecutá el SQL en Supabase para activar el Agency Dashboard.</p>
                <div className="text-left bg-[#0d0d20] rounded-xl p-4 border border-white/10 mb-6">
                    <p className="text-xs text-slate-500 mb-2 font-mono">Pasos:</p>
                    <ol className="text-sm text-slate-300 space-y-2">
                        <li>1. Abrí <a href="https://supabase.com/dashboard/project/gjfsylpbxxfvponhgmhz/sql/new" target="_blank" className="text-purple-400 underline">Supabase → SQL Editor</a></li>
                        <li>2. Copiá el contenido de <code className="bg-white/10 px-1 rounded text-xs">adsniper-saas/supabase/schema.sql</code></li>
                        <li>3. Pegalo y hacé click en <strong className="text-white">Run</strong></li>
                        <li>4. <button onClick={() => fetchAll()} className="text-purple-400 underline">Hacé click acá para recargar</button></li>
                    </ol>
                </div>
                <button onClick={() => fetchAll()} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-xl transition-colors">
                    🔄 Reintentar conexión
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0a0a1a] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Header */}
            <div className="border-b border-white/5 bg-[#0d0d20]/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-sm">🏢</div>
                        <div>
                            <h1 className="text-base font-semibold text-white">Agency Dashboard</h1>
                            <p className="text-xs text-slate-500">GenerArise · Neurova</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                        {alerts.length > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                                <Icons.Bell />
                                {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
                            </span>
                        )}
                        <button onClick={() => window.location.href = '/dashboard'} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                            ← Dashboard
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Clientes activos', value: clients.filter(c => c.status === 'active').length, icon: '👥', color: 'emerald' },
                        { label: 'MRR (est.)', value: `$${totalMRR.toFixed(0)} USD`, icon: '💰', color: 'purple' },
                        { label: 'Costo APIs/mes', value: `$${totalCosts.toFixed(0)} USD`, icon: '🔧', color: 'blue' },
                        { label: 'Margen neto', value: `$${(totalMRR - totalCosts).toFixed(0)} USD`, icon: '📈', color: totalMRR > totalCosts ? 'emerald' : 'red' },
                    ].map(kpi => (
                        <div key={kpi.label} className="p-4 rounded-xl bg-white/3 border border-white/8 hover:border-white/15 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{kpi.icon}</span>
                                <span className="text-xs text-slate-500">{kpi.label}</span>
                            </div>
                            <div className="text-lg font-bold text-white">{kpi.value}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/3 rounded-xl border border-white/8 mb-6 w-fit">
                    {(['overview', 'clients', 'billing', 'tools', 'alerts'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all capitalize ${activeTab === tab ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white'}`}
                        >
                            {tab === 'overview' ? '🗂️ Resumen' : tab === 'clients' ? '👥 Clientes' : tab === 'billing' ? '💰 Facturación' : tab === 'tools' ? '🔧 Herramientas' : `🔔 Alertas ${alerts.length > 0 ? `(${alerts.length})` : ''}`}
                        </button>
                    ))}
                </div>

                {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Recent clients */}
                        <div className="p-5 rounded-xl bg-white/3 border border-white/8">
                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Icons.Users /> Clientes recientes</h3>
                            <div className="space-y-3">
                                {clients.slice(0, 5).map(c => (
                                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                        <div>
                                            <p className="text-sm text-white">{c.name}</p>
                                            <p className="text-xs text-slate-500">{c.email || c.company || '—'}</p>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                                    </div>
                                ))}
                                {clients.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Sin clientes aún — agrega el primero</p>}
                            </div>
                        </div>

                        {/* Upcoming expirations */}
                        <div className="p-5 rounded-xl bg-white/3 border border-white/8">
                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Icons.Bell /> Próximos vencimientos</h3>
                            <div className="space-y-3">
                                {services.slice(0, 5).map(s => {
                                    const days = daysUntil(s.end_date);
                                    return (
                                        <div key={s.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                            <div>
                                                <p className="text-sm text-white">{s.service_name}</p>
                                                <p className="text-xs text-slate-500">{(s.client as any)?.name || '—'}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${days <= 3 ? 'bg-red-500/20 text-red-400' : days <= 7 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                {days < 0 ? 'Vencido' : `${days}d`}
                                            </span>
                                        </div>
                                    );
                                })}
                                {services.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Sin servicios registrados</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── CLIENTS TAB ──────────────────────────────────────────── */}
                {activeTab === 'clients' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-white">Clientes ({clients.length})</h3>
                            <button onClick={() => setShowAddClient(!showAddClient)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors">
                                <Icons.Plus /> Agregar cliente
                            </button>
                        </div>

                        {showAddClient && (
                            <div className="mb-5 p-5 rounded-xl bg-white/5 border border-purple-500/30">
                                <h4 className="text-sm font-medium text-white mb-4">Nuevo cliente</h4>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    {(['name', 'email', 'phone', 'company'] as const).map(f => (
                                        <input
                                            key={f}
                                            placeholder={f === 'name' ? 'Nombre *' : f.charAt(0).toUpperCase() + f.slice(1)}
                                            value={newClient[f]}
                                            onChange={e => setNewClient(p => ({ ...p, [f]: e.target.value }))}
                                            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                        />
                                    ))}
                                </div>
                                <select
                                    value={newClient.status}
                                    onChange={e => setNewClient(p => ({ ...p, status: e.target.value as ClientStatus }))}
                                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white mb-3 w-full focus:outline-none focus:border-purple-500"
                                >
                                    <option value="active">Activo</option>
                                    <option value="pending">Pendiente</option>
                                    <option value="paused">Pausado</option>
                                    <option value="expired">Vencido</option>
                                </select>
                                <textarea
                                    placeholder="Notas..."
                                    value={newClient.notes}
                                    onChange={e => setNewClient(p => ({ ...p, notes: e.target.value }))}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-purple-500 mb-3"
                                />
                                <div className="flex gap-2">
                                    <button onClick={addClient} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors">Guardar</button>
                                    <button onClick={() => setShowAddClient(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-lg transition-colors">Cancelar</button>
                                </div>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                                        <th className="pb-3 font-medium">Cliente</th>
                                        <th className="pb-3 font-medium">Email</th>
                                        <th className="pb-3 font-medium">Empresa</th>
                                        <th className="pb-3 font-medium">Estado</th>
                                        <th className="pb-3 font-medium">Desde</th>
                                        <th className="pb-3 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {clients.map(c => (
                                        <tr key={c.id} className="hover:bg-white/2 transition-colors">
                                            <td className="py-3 font-medium text-white">{c.name}</td>
                                            <td className="py-3 text-slate-400">{c.email || '—'}</td>
                                            <td className="py-3 text-slate-400">{c.company || '—'}</td>
                                            <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                                            <td className="py-3 text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString('es-AR')}</td>
                                            <td className="py-3">
                                                <button onClick={() => deleteClient(c.id)} className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                                                    <Icons.X />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {clients.length === 0 && (
                                        <tr><td colSpan={6} className="py-12 text-center text-slate-500">Sin clientes — agrega el primero</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── BILLING TAB ──────────────────────────────────────────── */}
                {activeTab === 'billing' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-white">Servicios & Facturación ({services.length})</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                                        <th className="pb-3 font-medium">Cliente</th>
                                        <th className="pb-3 font-medium">Servicio</th>
                                        <th className="pb-3 font-medium">Monto</th>
                                        <th className="pb-3 font-medium">Renovación</th>
                                        <th className="pb-3 font-medium">Vence</th>
                                        <th className="pb-3 font-medium">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {services.map(s => {
                                        const days = daysUntil(s.end_date);
                                        return (
                                            <tr key={s.id} className="hover:bg-white/2 transition-colors">
                                                <td className="py-3 font-medium text-white">{(s.client as any)?.name || '—'}</td>
                                                <td className="py-3 text-slate-300">{s.service_name}</td>
                                                <td className="py-3 text-emerald-400 font-mono">{s.amount} {s.currency}</td>
                                                <td className="py-3 text-slate-400 text-xs capitalize">{s.renewal_type}</td>
                                                <td className="py-3">
                                                    <span className={`text-xs ${days < 0 ? 'text-red-400' : days <= 7 ? 'text-yellow-400' : 'text-slate-400'}`}>
                                                        {new Date(s.end_date).toLocaleDateString('es-AR')}
                                                        {days >= 0 && days <= 7 && ` (${days}d)`}
                                                        {days < 0 && ' ⚠️'}
                                                    </span>
                                                </td>
                                                <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status]}`}>{s.status}</span></td>
                                            </tr>
                                        );
                                    })}
                                    {services.length === 0 && (
                                        <tr><td colSpan={6} className="py-12 text-center text-slate-500">Sin servicios registrados — agrega desde cada cliente</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── TOOLS TAB ────────────────────────────────────────────── */}
                {activeTab === 'tools' && (
                    <div>
                        <h3 className="text-sm font-semibold text-white mb-4">APIs & Herramientas activas ({tools.length})</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {tools.map(tool => {
                                const isExpiringSoon = tool.end_date && daysUntil(tool.end_date) <= 7;
                                return (
                                    <div key={tool.id} className={`p-4 rounded-xl border transition-colors ${isExpiringSoon ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-white/3 border-white/8 hover:border-white/15'}`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <p className="text-sm font-medium text-white">{tool.name}</p>
                                                <p className="text-xs text-slate-500">{tool.category}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${tool.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {tool.status}
                                            </span>
                                        </div>
                                        {tool.notes && <p className="text-xs text-slate-500 mb-2">{tool.notes}</p>}
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                            <span className="text-xs text-slate-500">
                                                {tool.end_date ? `Vence: ${new Date(tool.end_date).toLocaleDateString('es-AR')}` : 'Sin vencimiento'}
                                            </span>
                                            <span className="text-xs font-mono text-emerald-400">
                                                ${tool.monthly_cost_usd || 0}/mes
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── ALERTS TAB ───────────────────────────────────────────── */}
                {activeTab === 'alerts' && (
                    <div>
                        <h3 className="text-sm font-semibold text-white mb-4">Alertas activas ({alerts.length})</h3>
                        {alerts.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-4xl mb-3">✅</div>
                                <p className="text-slate-400 text-sm">Todo en orden, sin alertas activas</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {alerts.map((alert, i) => (
                                    <div key={i} className={`p-4 rounded-xl border flex items-start gap-3 ${alert.type === 'error' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                                        <span className="text-lg">{alert.type === 'error' ? '🔴' : '⚠️'}</span>
                                        <div>
                                            <p className="text-sm font-medium text-white">{alert.message}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{alert.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
