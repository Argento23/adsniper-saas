'use client';

import Link from 'next/link';
import {
    FaProjectDiagram,
    FaImages,
    FaPlus,
    FaFilm,
    FaDownload,
    FaShareAlt,
} from 'react-icons/fa';

interface NavItem {
    label: string;
    href?: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    badge?: string;
}

const creativeItems: NavItem[] = [
    { label: 'Proyectos', href: '/dashboard/studio', icon: FaProjectDiagram },
    { label: 'Assets', icon: FaImages, disabled: true, badge: 'Próximamente' },
];

const createItems: NavItem[] = [
    { label: 'Nuevo proyecto', href: '/dashboard/studio', icon: FaPlus },
];

const futureItems: NavItem[] = [
    { label: 'Timeline', icon: FaFilm, disabled: true, badge: 'Próximamente' },
    { label: 'Exportaciones', icon: FaDownload, disabled: true, badge: 'Próximamente' },
    { label: 'Publicaciones', icon: FaShareAlt, disabled: true, badge: 'Próximamente' },
];

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
    return (
        <div className="space-y-1">
            <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {title}
            </p>
            {items.map(item => {
                const Icon = item.icon;
                const body = (
                    <span
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                            item.disabled
                                ? 'text-slate-600 cursor-not-allowed'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                                {item.badge}
                            </span>
                        )}
                    </span>
                );
                if (item.disabled || !item.href) {
                    return <div key={item.label}>{body}</div>;
                }
                return (
                    <Link key={item.label} href={item.href}>
                        {body}
                    </Link>
                );
            })}
        </div>
    );
}

export default function StudioSidebar() {
    return (
        <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/5 bg-black/30 backdrop-blur-xl p-6 gap-8 sticky top-0 h-screen">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 p-2">
                    <span className="text-white font-black">S</span>
                </div>
                <div className="flex flex-col leading-tight">
                    <span className="text-base font-bold tracking-tight">Studio</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">v0.1 · Beta</span>
                </div>
            </div>

            <NavGroup title="Creative" items={creativeItems} />
            <NavGroup title="Create" items={createItems} />
            <NavGroup title="Future" items={futureItems} />
        </aside>
    );
}
