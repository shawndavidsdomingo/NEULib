"use client";

import { useMemo } from 'react';
import { parseISO, getHours, getDay, format, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { LibraryLogRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6AM to 7PM

interface Props {
  logs: LibraryLogRecord[];
  title?: string;
}

export function OccupancyHeatmap({ logs, title = 'Peak hours heatmap' }: Props) {
  const matrix = useMemo(() => {
    // Build [day 0-5 (Mon-Sat)][hour 6-19] = count
    const m: number[][] = Array.from({ length: 6 }, () => Array(HOURS.length).fill(0));
    logs.forEach(l => {
      const d = parseISO(l.checkInTimestamp);
      const dow = (getDay(d) + 6) % 7; // 0=Mon…5=Sat, skip Sun
      if (dow === 6) return; // skip Sunday
      const h   = getHours(d);
      const hi  = HOURS.indexOf(h);
      if (hi !== -1 && dow < 6) m[dow][hi]++;
    });
    return m;
  }, [logs]);

  const maxVal = useMemo(() => Math.max(1, ...matrix.flat()), [matrix]);

  const getColor = (count: number) => {
    if (count === 0) return 'rgba(10,26,77,0.04)';
    const pct = count / maxVal;
    if (pct > 0.75) return `${navy}`;
    if (pct > 0.5)  return 'hsl(221,72%,35%)';
    if (pct > 0.25) return 'hsl(221,65%,55%)';
    return 'hsl(221,60%,75%)';
  };

  const getTextColor = (count: number) => {
    if (count === 0) return 'transparent';
    const pct = count / maxVal;
    return pct > 0.4 ? 'rgba(255,255,255,0.85)' : 'hsl(221,72%,25%)';
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 420 }}>
          {/* Hour labels */}
          <div className="flex items-center mb-1" style={{ paddingLeft: 36 }}>
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center"
                style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.03em' }}>
                {h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAYS.map((day, di) => (
            <div key={day} className="flex items-center mb-1">
              <div style={{ width: 30, fontSize: '10px', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>
                {day}
              </div>
              {HOURS.map((h, hi) => {
                const count = matrix[di][hi];
                return (
                  <div key={h} className="flex-1 mx-px rounded transition-all" title={`${day} ${h}:00 — ${count} visit${count !== 1 ? 's' : ''}`}
                    style={{ height: 28, background: getColor(count), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {count > 0 && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: getTextColor(count), lineHeight: 1 }}>
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3" style={{ paddingLeft: 36 }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Low</span>
            {['hsl(221,60%,75%)', 'hsl(221,65%,55%)', 'hsl(221,72%,35%)', navy].map((c, i) => (
              <div key={i} className="flex-1 h-2 rounded" style={{ background: c, maxWidth: 32 }} />
            ))}
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
