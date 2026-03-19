"use client";

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface SuccessCardProps {
  title: string;
  description?: string;
  /** Auto-close delay in ms. Default: 5000 */
  duration?: number;
  onClose: () => void;
  /** Optional extra content rendered below the description */
  children?: React.ReactNode;
  /** Icon override — defaults to CheckCircle2 */
  icon?: React.ReactNode;
  /** Color theme — default is emerald green */
  color?: 'green' | 'navy' | 'amber';
}

const COLORS = {
  green: { bg: 'rgba(5,150,105,0.1)', icon: '#059669', bar: '#059669' },
  navy:  { bg: 'rgba(10,26,77,0.08)', icon: 'hsl(221,72%,22%)', bar: 'hsl(221,72%,22%)' },
  amber: { bg: 'rgba(251,191,36,0.12)', icon: 'hsl(43,85%,42%)', bar: 'hsl(43,85%,50%)' },
};

export function SuccessCard({
  title, description, duration = 5000, onClose, children, icon, color = 'green',
}: SuccessCardProps) {
  const [progress, setProgress] = useState(100);
  const c = COLORS[color];

  useEffect(() => {
    const interval = 50; // update every 50ms
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress(p => {
        const next = p - step;
        if (next <= 0) { clearInterval(timer); onClose(); return 0; }
        return next;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [duration, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300"
        style={{ fontFamily: "'DM Sans',sans-serif" }}>

        {/* Progress bar — shrinks from full to 0 over `duration` ms */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className="h-1 transition-none"
            style={{ width: `${progress}%`, background: c.bar }} />
        </div>

        <div className="px-8 py-7 text-center space-y-4">

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: c.bg }}>
            {icon ?? <CheckCircle2 size={32} style={{ color: c.icon }} />}
          </div>

          {/* Text */}
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              {title}
            </h3>
            {description && (
              <p className="text-slate-500 text-sm font-medium leading-relaxed">{description}</p>
            )}
          </div>

          {children}

          {/* Dismiss button */}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))` }}>
            OK
          </button>

          <p className="text-slate-300 text-xs">Closes automatically in {Math.ceil((progress / 100) * (duration / 1000))}s</p>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
    </div>
  );
}
