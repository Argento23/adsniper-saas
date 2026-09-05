'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    showToast: (type: ToastType, message: string, duration?: number) => void;
    hideToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
        const id = Math.random().toString(36).slice(2, 9);
        setToasts(prev => [...prev, { id, type, message, duration }]);
        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }
    }, []);

    const hideToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
            {children}
            <ToastContainer toasts={toasts} onHide={hideToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onHide }: { toasts: Toast[]; onHide: (id: string) => void }) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onHide={onHide} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onHide }: { toast: Toast; onHide: (id: string) => void }) {
    useEffect(() => {
        if (toast.duration && toast.duration > 0) {
            const timer = setTimeout(() => onHide(toast.id), toast.duration);
            return () => clearTimeout(timer);
        }
    }, [toast, onHide]);

    const icons = {
        success: <FaCheckCircle className="text-emerald-400" />,
        error: <FaExclamationCircle className="text-red-400" />,
        info: <FaInfoCircle className="text-cyan-400" />,
        warning: <FaExclamationCircle className="text-amber-400" />,
    };

    const bgColors = {
        success: 'bg-emerald-500/10 border-emerald-500/30',
        error: 'bg-red-500/10 border-red-500/30',
        info: 'bg-cyan-500/10 border-cyan-500/30',
        warning: 'bg-amber-500/10 border-amber-500/30',
    };

    return (
        <div
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-xl min-w-[280px] max-w-md animate-in slide-in-from-right duration-300 ${bgColors[toast.type]}`}
        >
            <div className="flex-shrink-0">{icons[toast.type]}</div>
            <p className="text-sm text-white flex-1">{toast.message}</p>
            <button
                onClick={() => onHide(toast.id)}
                className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
            >
                <FaTimes className="w-4 h-4" />
            </button>
        </div>
    );
}

export function useToast() {
    const context = React.useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

import React from 'react';