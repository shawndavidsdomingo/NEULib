"use client";

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { LibraryLogRecord, DEPARTMENTS } from '@/lib/firebase-schema';
import { Loader2, PieChart as PieChartIcon, BarChart3, Filter } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, startOfWeek } from 'date-fns';

const COLORS = [
  'hsl(221,72%,22%)', 'hsl(221,55%,42%)', 'hsl(262,83%,58%)',
  'hsl(189,79%,38%)', 'hsl(43,85%,50%)',  'hsl(221,83%,68%)',
];

const chartConfig = {
  visits: { label: 'Visits',   color: 'hsl(221,72%,22%)' },
  value:  { label: 'Visitors', color: 'hsl(221,72%,22%)' },
} satisfies ChartConfig;

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
};

interface VisitPurpose {
  id: string;
  label: string;
  active: boolean;
}

export function AnalyticsBreakdown() {
  const db = useFirestore();
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate,   setEndDate]   = useState(format(new Date(), 'yyyy-MM-dd'));

  // FIX: Filter at Firestore level by start date — no more limit(5000) + client-side filter
  const startISO = useMemo(() => startOfDay(parseISO(startDate)).toISOString(), [startDate]);
  const endISO   = useMemo(() => endOfDay(parseISO(endDate)).toISOString(),   [endDate]);

  const logsQuery = useMemoFirebase(
    () => query(
      collection(db, 'library_logs'),
      where('checkInTimestamp', '>=', startISO),
      where('checkInTimestamp', '<=', endISO),
      orderBy('checkInTimestamp', 'desc')
    ),
    [db, startISO, endISO]
  );
  const { data: logs, isLoading } = useCollection<LibraryLogRecord>(logsQuery);

  // FIX: Load all purposes from Firestore — includes hidden ones for admin analytics
  const purposesRef = useMemoFirebase(() => collection(db, 'visit_purposes'), [db]);
  const { data: allPurposes } = useCollection<VisitPurpose>(purposesRef);

  // filteredLogs now equals logs since we filter at the query level
  const filteredLogs = logs ?? [];

  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLogs.forEach(l => {
      const code = l.deptID || 'N/A';
      counts[code] = (counts[code] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [filteredLogs]);

  // FIX: Build purpose data dynamically from all Firestore purposes (includes hidden)
  // This means new purposes admins add automatically appear in analytics
  const purposeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLogs.forEach(l => { counts[l.purpose] = (counts[l.purpose] || 0) + 1; });

    // If we have purpose docs, use them to ensure all known purposes appear (even with 0 visits)
    if (allPurposes && allPurposes.length > 0) {
      allPurposes.forEach(p => {
        if (!(p.label in counts)) counts[p.label] = 0;
      });
    }

    return Object.entries(counts)
      .filter(([, v]) => v > 0) // only show purposes with actual visits in range
      .sort((a, b) => b[1] - a[1])
      .map(([name, visits], i) => ({ name, visits, fill: COLORS[i % COLORS.length] }));
  }, [filteredLogs, allPurposes]);

  const FilterBar = () => (
    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl"
      style={{ background: 'rgba(10,26,77,0.04)', border: '1px solid rgba(10,26,77,0.07)' }}>
      <div className="flex items-center gap-1.5 font-bold text-xs flex-shrink-0"
        style={{ color: 'hsl(221,72%,22%)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        <Filter size={12} /> Filter
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          style={{ height:'34px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'white', fontSize:'0.82rem', fontWeight:600, color:'#1e293b', cursor:'pointer', outline:'none', width:'130px' }} />
        <span className="text-slate-300 text-xs font-bold">—</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          style={{ height:'34px', padding:'0 10px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'white', fontSize:'0.82rem', fontWeight:600, color:'#1e293b', cursor:'pointer', outline:'none', width:'130px' }} />
      </div>
      {!isLoading && (
        <span className="ml-auto text-slate-400 font-semibold" style={{ fontSize: '0.8rem' }}>
          {filteredLogs.length} records
        </span>
      )}
    </div>
  );

  const EmptyState = () => (
    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-8">
      <div className="text-3xl">📊</div>
      <p className="text-sm font-medium">No data for this period</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {[1, 2].map(i => (
          <div key={i} style={{ ...card, height: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" style={{ color: 'hsl(221,72%,22%)' }} size={22} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">

      {/* By Department */}
      <div style={card}>
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <PieChartIcon size={16} style={{ color: 'hsl(221,72%,22%)' }} />
            <div>
              <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>By Department</h3>
              <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Distribution</p>
            </div>
          </div>
          <FilterBar />
        </div>
        <div style={{ height: '260px', padding: '8px' }}>
          {deptData.length === 0 ? <EmptyState /> : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <PieChart>
                <Pie data={deptData} cx="50%" cy="44%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Legend verticalAlign="bottom" height={55} iconType="circle"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingTop: '6px' }} />
              </PieChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* By Purpose — now dynamic, shows all purposes including newly added ones */}
      <div style={card}>
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} style={{ color: 'hsl(221,72%,22%)' }} />
            <div>
              <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "'Playfair Display',serif" }}>By Visit Purpose</h3>
              <p className="font-semibold text-slate-400" style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Activities</p>
            </div>
          </div>
          <FilterBar />
        </div>
        <div style={{ height: '260px', padding: '8px 8px 8px 0' }}>
          {purposeData.length === 0 ? <EmptyState /> : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={purposeData} layout="vertical" margin={{ left: 12, right: 32, top: 8, bottom: 8 }}>
                <CartesianGrid horizontal={false} strokeOpacity={0.06} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={95}
                  tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="visits" radius={[0, 6, 6, 0]} barSize={22}>
                  {purposeData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

    </div>
  );
}