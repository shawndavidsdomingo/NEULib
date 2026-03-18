"use client";

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { format, subDays, parseISO, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { Loader2, BarChart3 } from 'lucide-react';
import { LibraryLogRecord } from '@/lib/firebase-schema';

const chartConfig = { visits: { label: 'Visits', color: 'hsl(221,72%,22%)' } } satisfies ChartConfig;

const PRESETS = [
  { label: '7D',  days: 6 },
  { label: '14D', days: 13 },
  { label: '30D', days: 29 },
];

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

export function VisitorChart() {
  const db = useFirestore();
  const [activeDays, setActiveDays] = useState(6);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [endDate,   setEndDate]   = useState(format(new Date(), 'yyyy-MM-dd'));

  // FIX: Filter at Firestore level using date range — no more orderBy+limit(2000)+client filter
  const startISO = useMemo(() => startOfDay(parseISO(startDate)).toISOString(), [startDate]);
  const endISO   = useMemo(() => endOfDay(parseISO(endDate)).toISOString(),   [endDate]);

  const logsQuery = useMemoFirebase(
    () => query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', startISO),
      where('checkInTimestamp', '<=', endISO),
      orderBy('checkInTimestamp', 'asc')
    ),
    [db, startISO, endISO]
  );
  const { data: logs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  const applyPreset = (days: number) => {
    setActiveDays(days);
    setStartDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const chartData = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end   = endOfDay(parseISO(endDate));
    const days  = eachDayOfInterval({ start, end });
    const stats: Record<string, number> = {};
    // Exclude Sundays
    days.forEach(d => { if (format(d, 'EEE') !== 'Sun') stats[format(d, 'MMM dd')] = 0; });

    // Logs are already filtered by Firestore — just bucket them by day
    (logs ?? []).forEach(log => {
      const d = parseISO(log.checkInTimestamp);
      if (format(d, 'EEE') !== 'Sun') {
        const key = format(d, 'MMM dd');
        if (key in stats) stats[key]++;
      }
    });
    return Object.entries(stats).map(([name, visits]) => ({ name, visits }));
  }, [logs, startDate, endDate]);

  const totalVisits = chartData.reduce((s, d) => s + d.visits, 0);
  const peakDay     = chartData.reduce((a, b) => b.visits > a.visits ? b : a, { name: '—', visits: 0 });

  return (
    <div style={card}>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} style={{ color: 'hsl(221,72%,22%)' }} />
            <div>
              <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>Academic Attendance</h3>
              <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Traffic Volume</p>
            </div>
          </div>
          {/* Quick preset chips */}
          <div className="flex items-center gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.days)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 border"
                style={activeDays === p.days
                  ? { background: 'hsl(221,72%,22%)', color: 'white', borderColor: 'hsl(221,72%,22%)' }
                  : { background: 'white', color: 'hsl(221,40%,45%)', borderColor: 'rgba(10,26,77,0.12)' }
                }>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="font-semibold text-slate-400 mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Start</p>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActiveDays(-1); }}
              style={{ width:'100%', height:'34px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0',
                background:'#f8fafc', fontSize:'0.82rem', fontWeight:600, color:'#1e293b', cursor:'pointer', outline:'none' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-400 mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>End</p>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActiveDays(-1); }}
              style={{ width:'100%', height:'34px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0',
                background:'#f8fafc', fontSize:'0.82rem', fontWeight:600, color:'#1e293b', cursor:'pointer', outline:'none' }} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '12px 12px 8px 4px', height: '220px' }}>
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={18} />
            <p className="text-xs font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Loading...</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.07} />
              <XAxis dataKey="name" axisLine={false} tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} dy={6} />
              <YAxis tickLine={false} axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="visits" radius={[5, 5, 0, 0]} barSize={24}>
                {chartData.map((e, i) => (
                  <Cell key={i}
                    fill={e.visits > 0 ? 'hsl(221,72%,22%)' : 'hsl(220,20%,92%)'}
                    opacity={e.visits === peakDay.visits && e.visits > 0 ? 1 : e.visits > 0 ? 0.7 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>

      {/* Summary stats */}
      <div className="px-4 pb-4 pt-1 flex items-center gap-6 border-t border-slate-50">
        <div>
          <p className="font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.5rem' }}>{totalVisits}</p>
          <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Visits</p>
        </div>
        <div>
          <p className="font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.5rem' }}>{peakDay.visits}</p>
          <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Peak Day</p>
        </div>
        <div className="ml-auto">
          <p className="font-bold text-sm" style={{ color: 'hsl(221,72%,22%)' }}>{peakDay.name}</p>
          <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Busiest</p>
        </div>
      </div>
    </div>
  );
}