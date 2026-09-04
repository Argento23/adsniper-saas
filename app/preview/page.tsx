'use client';

import { useState } from 'react';
import {
    FaFilm, FaShareAlt, FaDownload, FaArrowLeft, FaExpand,
} from 'react-icons/fa';
import EditorTimelinePro from '../dashboard/studio/components/EditorTimelinePro';
import ExportModal from '../dashboard/studio/components/ExportModal';
import PublishScreen from '../dashboard/studio/components/PublishScreen';

type Screen = 'editor' | 'publish';

/**
 * Preview / navigation page for the new UI surfaces.
 *
 * Renders one of the new screens at full viewport and lets you
 * toggle the Export modal on top of either. Useful for design
 * review without touching the real app flow.
 *
 * Visit: /preview
 *
 * Placed outside /dashboard/studio to bypass the Studio layout
 * (which renders Clerk's <UserButton /> and would require auth).
 */

export default function PreviewPage() {
    const [screen, setScreen] = useState<Screen>('editor');
    const [exportOpen, setExportOpen] = useState(false);

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#0F1115] text-white">
            {/* Active screen */}
            <div className="absolute inset-0 overflow-y-auto">
                {screen === 'editor' ? <EditorTimelinePro /> : <PublishScreen />}
         </div>

            {/* Export modal overlay */}
            <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />

            {/* ── Floating navigator ────────────────────────────────── */}
            <nav className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
                <div className="flex items-center gap-1 rounded-[16px] border border-white/10 bg-[#171A21]/95 p-1 shadow-2xl backdrop-blur-md">
                    <NavButton
                        icon={FaArrowLeft}
                        label="Volver"
                        onClick={() => window.history.back()}
                        small
                    />
                    <div className="mx-1 h-6 w-px bg-white/10" />
                    <NavButton
                        icon={FaFilm}
                        label="Editor timeline"
                        active={screen === 'editor'}
                        onClick={() => setScreen('editor')}
                    />
                    <NavButton
                        icon={FaShareAlt}
                        label="Publicar"
                        active={screen === 'publish'}
                        onClick={() => setScreen('publish')}
                    />
                    <div className="mx-1 h-6 w-px bg-white/10" />
                    <NavButton
                        icon={FaDownload}
                        label="Export modal"
                        accent
                        onClick={() => setExportOpen(true)}
                    />
                    <div className="mx-1 h-6 w-px bg-white/10" />
                    <NavButton
                        icon={FaExpand}
                        label="Full screen"
                        small
                        onClick={() => {
                            if (document.fullscreenElement) {
                                document.exitFullscreen();
                            } else {
                                document.documentElement.requestFullscreen();
                            }
                        }}
                    />
             </div>
         </nav>

            {/* Top-left badge */}
            <div className="fixed top-4 left-4 z-50 rounded-[10px] border border-white/10 bg-[#171A21]/95 px-3 py-1.5 text-[11px] text-slate-400 shadow-lg backdrop-blur-md">
                UI Preview · {screen === 'editor' ? 'Editor timeline' : 'Publish screen'}
                {exportOpen && ' + Export modal'}
         </div>
     </div>
    );
}

function NavButton({
    icon: Icon, label, onClick, active = false, accent = false, small = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    active?: boolean;
    accent?: boolean;
    small?: boolean;
}) {
    const base = active
        ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
        : accent
            ? 'text-slate-300 hover:bg-violet-500/15 hover:text-violet-300'
            : 'text-slate-300 hover:bg-white/5 hover:text-white';
    const size = small ? 'h-9 px-3' : 'h-10 px-4';

    return (
<button
    onClick={onClick}
    className={`flex items-center gap-2 rounded-[12px] text-xs font-medium transition ${base} ${size}`}
>
    <Icon className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
    {!small && <span>{label}</span>}
</button>
    );
}
