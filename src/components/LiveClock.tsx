"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface LiveClockProps {
  /** 'light' for white text (dark navbars), 'dark' for navy text (light cards) */
  variant?: 'light' | 'dark';
  className?: string;
}

export function LiveClock({ variant = 'light', className = '' }: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return null;

  const isLight = variant === 'light';
  const textColor     = isLight ? 'rgba(255,255,255,0.85)' : 'hsl(221,72%,22%)';
  const subTextColor  = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(10,26,77,0.45)';
  const borderColor   = isLight ? 'rgba(255,255,255,0.15)' : 'rgba(10,26,77,0.12)';
  const bgColor       = isLight ? 'rgba(255,255,255,0.10)' : 'rgba(10,26,77,0.05)';

  return (
    <div
      className={`flex flex-col items-end px-3 py-1.5 rounded-xl ${className}`}
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <span
        className="font-bold tabular-nums leading-tight"
        style={{ color: textColor, fontSize: '1rem', fontFamily: "'DM Mono',monospace" }}
      >
        {format(now, 'hh:mm:ss aa')}
      </span>
      <span
        className="font-semibold leading-tight"
        style={{ color: subTextColor, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        {format(now, 'EEE, MMM d yyyy')}
      </span>
    </div>
  );
}