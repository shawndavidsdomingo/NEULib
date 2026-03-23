"use client";

import { useMemo, useState } from 'react';
import { Users, Flame, Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { format, parseISO, differenceInMinutes, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { LibraryLogRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';
const FREQUENT_THRESHOLD = 3;

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius: '1rem',
  overflow: 'hidden',
};

function fmtTime(iso: string) { return format(parseISO(iso), 'h:mm a'); }

function Avatar({ name, avatarUrl, isFrequent }: { name: string; avatarUrl?: string; isFrequent?: boolean; }) {
  const size = 34;
  const initials = name.split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
  const colors = [[navy,'rgba(10,26,77,0.12)'],['hsl(262,70%,50%)','hsl(262,70%,50%,0.12)'],['hsl(189,70%,35%)','hsl(189,70%,35%,0.12)'],['hsl(10,70%,48%)','hsl(10,70%,48%,0.12)'],['hsl(150,55%,38%)','hsl(150,55%,38%,0.12)']];
  const [fg,bg] = colors[(name.charCodeAt(0)||0) % colors.length];
  return (
    <div style={{position:'relative',width:size,height:size,flexShrink:0}}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',border:isFrequent?'2px solid hsl(25,90%,52%)':`2px solid ${fg}33`}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
        : <div style={{width:size,height:size,borderRadius:'50%',background:bg,border:isFrequent?'2px solid hsl(25,90%,52%)':`2px solid ${fg}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.33,fontWeight:700,color:fg}}>{initials}</div>
      }
      {isFrequent && <div style={{position:'absolute',bottom:-2,right:-2,background:'hsl(25,90%,52%)',borderRadius:'50%',width:13,height:13,display:'flex',alignItems:'center',justifyContent:'center',border:'1.5px solid white'}}><Flame size={7} color="white"/></div>}
    </div>
  );
}

type SortField = 'studentName'|'studentId'|'deptID'|'program'|'purpose'|'checkInTimestamp'|'duration'|'branch';
type StatusFilter = 'all'|'inside'|'completed';

export function CurrentVisitors({ branchId }: { branchId?: string | null }) {
  const db = useFirestore();
  const [search,        setSearch]        = useState('');
  const [deptFilter,    setDeptFilter]    = useState('All Colleges');
  const [purposeFilter, setPurposeFilter] = useState('All Purposes');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('inside');
  const [sortField,     setSortField]     = useState<SortField>('checkInTimestamp');
  const [sortDir,       setSortDir]       = useState<'asc'|'desc'>('desc');
  const [page,          setPage]          = useState(1);
  const [rpp,           setRpp]           = useState(25);

  const todayStart = useMemo(() => { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, []);

  const logsRef    = useMemoFirebase(() => query(collection(db,'library_logs'), where('checkInTimestamp','>=',todayStart), orderBy('checkInTimestamp','desc'), limit(500)), [db, todayStart]);
  const branchesRef= useMemoFirebase(() => collection(db,'branches'),       [db]);
  const deptsRef   = useMemoFirebase(() => collection(db,'departments'),    [db]);
  const purposesRef= useMemoFirebase(() => collection(db,'visit_purposes'), [db]);
  const allLogsRef = useMemoFirebase(() => collection(db,'library_logs'),   [db]);

  const { data: todayLogs, isLoading } = useCollection<LibraryLogRecord>(logsRef);
  const { data: allBranches }  = useCollection<{id:string;name:string}>(branchesRef);
  const { data: depts }        = useCollection<{deptID:string}>(deptsRef);
  const { data: purposeDocs }  = useCollection<{label:string}>(purposesRef);
  const { data: allLogs }      = useCollection<LibraryLogRecord>(allLogsRef);

  const branchNameMap = useMemo(() => Object.fromEntries((allBranches||[]).map(b=>[b.id,b.name])), [allBranches]);
  const weekStart = startOfWeek(new Date(),{weekStartsOn:1});
  const weekEnd   = endOfWeek(new Date(),  {weekStartsOn:1});
  const weeklyCount = useMemo(() => {
    const m:Record<string,number>={};
    (allLogs||[]).forEach(l => { if(isWithinInterval(parseISO(l.checkInTimestamp),{start:weekStart,end:weekEnd})) m[l.studentId]=(m[l.studentId]||0)+1; });
    return m;
  }, [allLogs]);
  const frequentIds = useMemo(() => new Set(Object.entries(weeklyCount).filter(([,n])=>n>=FREQUENT_THRESHOLD).map(([id])=>id)), [weeklyCount]);

  const branchFiltered = useMemo(() => (todayLogs||[]).filter(l => !branchId || (l as any).branchId===branchId || !(l as any).branchId), [todayLogs,branchId]);
  const insideCount    = useMemo(() => branchFiltered.filter(l=>!l.checkOutTimestamp).length, [branchFiltered]);
  const todayCount     = branchFiltered.length;
  const deptOptions    = useMemo(() => ['All Colleges',...(depts||[]).map(d=>d.deptID).sort()], [depts]);
  const purposeOptions = useMemo(() => ['All Purposes',...(purposeDocs||[]).map(p=>p.label).sort()], [purposeDocs]);

  const filtered = useMemo(() => {
    const base = branchFiltered.filter(l => {
      if (statusFilter==='inside'    &&  l.checkOutTimestamp) return false;
      if (statusFilter==='completed' && !l.checkOutTimestamp) return false;
      if (deptFilter   !=='All Colleges' && l.deptID !==deptFilter)   return false;
      if (purposeFilter!=='All Purposes' && l.purpose!==purposeFilter) return false;
      if (search.trim()) { const q=search.toLowerCase(); if(!l.studentName?.toLowerCase().includes(q)&&!l.studentId?.toLowerCase().includes(q)&&!l.deptID?.toLowerCase().includes(q)&&!l.purpose?.toLowerCase().includes(q)) return false; }
      return true;
    });
    return [...base].sort((a,b) => {
      if (sortField==='duration') {
        const da=differenceInMinutes(a.checkOutTimestamp?parseISO(a.checkOutTimestamp):new Date(),parseISO(a.checkInTimestamp));
        const db2=differenceInMinutes(b.checkOutTimestamp?parseISO(b.checkOutTimestamp):new Date(),parseISO(b.checkInTimestamp));
        return sortDir==='asc'?da-db2:db2-da;
      }
      const vals: Record<SortField,string> = {studentName:a.studentName||'',studentId:a.studentId||'',deptID:a.deptID||'',program:(a as any).program||'',purpose:a.purpose||'',checkInTimestamp:a.checkInTimestamp,duration:'',branch:branchNameMap[(a as any).branchId]||''};
      const valb: Record<SortField,string> = {studentName:b.studentName||'',studentId:b.studentId||'',deptID:b.deptID||'',program:(b as any).program||'',purpose:b.purpose||'',checkInTimestamp:b.checkInTimestamp,duration:'',branch:branchNameMap[(b as any).branchId]||''};
      const cmp = vals[sortField]<valb[sortField]?-1:vals[sortField]>valb[sortField]?1:0;
      return sortDir==='asc'?cmp:-cmp;
    });
  }, [branchFiltered,statusFilter,deptFilter,purposeFilter,search,sortField,sortDir,branchNameMap]);

  const toggleSort = (f: SortField) => { if(sortField!==f){setSortField(f);setSortDir('desc');setPage(1);}else if(sortDir==='desc'){setSortDir('asc');}else{setSortField('checkInTimestamp');setSortDir('desc');} };
  const SI = ({field}:{field:SortField}) => sortField!==field?<ArrowUpDown size={10} className="ml-1 opacity-30 inline"/>:sortDir==='asc'?<ArrowUp size={10} className="ml-1 inline" style={{color:navy}}/>:<ArrowDown size={10} className="ml-1 inline" style={{color:navy}}/>;
  const thCls = 'text-[10px] font-extrabold uppercase tracking-widest text-slate-400 bg-slate-50 px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap text-left';
  const showBranch = !branchId && (allBranches||[]).length > 1;
  const paged = filtered.slice((page-1)*rpp, page*rpp);
  const totalPages = Math.ceil(filtered.length/rpp);

  return (
    <div style={{...card, fontFamily: "'DM Sans',sans-serif"}}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{background:navy}}><Users size={17}/></div>
            <div>
              <h3 className="font-bold text-slate-900 text-xl" style={{fontFamily:"'Playfair Display',serif"}}>Library Presence</h3>
              <p className="text-slate-400 text-xs font-medium mt-0.5">Today's visitation log</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center"><p className="text-2xl font-extrabold text-slate-900">{insideCount}</p><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inside</p></div>
            <div className="text-center"><p className="text-2xl font-extrabold px-3 py-0.5 rounded-xl" style={{background:'rgba(5,150,105,0.1)',color:'#059669'}}>{todayCount}</p><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Today</p></div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{background:'rgba(239,68,68,0.08)',color:'#dc2626'}}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block"/>Live
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search name or ID…" className="w-full h-9 pl-8 pr-7 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-blue-300 transition-colors"/>
            {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={12}/></button>}
          </div>
          <select value={deptFilter} onChange={e=>{setDeptFilter(e.target.value);setPage(1);}} className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none cursor-pointer">
            {deptOptions.map(d=><option key={d}>{d}</option>)}
          </select>
          <select value={purposeFilter} onChange={e=>{setPurposeFilter(e.target.value);setPage(1);}} className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none cursor-pointer">
            {purposeOptions.map(p=><option key={p}>{p}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden text-xs font-bold">
            {(['all','inside','completed'] as StatusFilter[]).map(s=>(
              <button key={s} onClick={()=>{setStatusFilter(s);setPage(1);}} className="px-3 h-9 capitalize transition-all"
                style={statusFilter===s?{background:navy,color:'white'}:{background:'#f8fafc',color:'#64748b'}}>
                {s==='all'?'All':s==='inside'?'Inside':'Completed'}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-400 ml-auto">{filtered.length} records</span>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin"/>
          <span className="text-sm font-medium">Loading…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><Users size={28} className="mx-auto text-slate-200 mb-2"/><p className="text-slate-400 text-sm font-medium">No records match.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={`pl-5 ${thCls}`} onClick={()=>toggleSort('studentName')}>Student <SI field="studentName"/></th>
                <th className={thCls} onClick={()=>toggleSort('studentId')}>ID <SI field="studentId"/></th>
                <th className={thCls} onClick={()=>toggleSort('deptID')}>Dept <SI field="deptID"/></th>
                <th className={`hidden lg:table-cell ${thCls}`} onClick={()=>toggleSort('program')}>Program <SI field="program"/></th>
                <th className={`hidden md:table-cell ${thCls}`} onClick={()=>toggleSort('purpose')}>Purpose <SI field="purpose"/></th>
                {showBranch && <th className={`hidden lg:table-cell ${thCls}`} onClick={()=>toggleSort('branch')}>Branch <SI field="branch"/></th>}
                <th className={thCls} onClick={()=>toggleSort('checkInTimestamp')}>Time In <SI field="checkInTimestamp"/></th>
                <th className={thCls} onClick={()=>toggleSort('duration')}>Time Inside <SI field="duration"/></th>
                <th className={`text-right pr-5 ${thCls}`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(log => {
                const inside = !log.checkOutTimestamp;
                const logBranch = (log as any).branchId;
                const mins = inside
                  ? differenceInMinutes(new Date(), parseISO(log.checkInTimestamp))
                  : differenceInMinutes(parseISO(log.checkOutTimestamp!), parseISO(log.checkInTimestamp));
                const dur = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`;
                return (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors" style={{height:60}}>
                    <td className="pl-5 pr-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={log.studentName||log.studentId} avatarUrl={(log as any).avatarUrl} isFrequent={frequentIds.has(log.studentId)}/>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{log.studentName||'Student'}</p>
                          {frequentIds.has(log.studentId) && <span className="text-[10px] font-extrabold text-amber-600">{weeklyCount[log.studentId]}×/wk</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="font-mono text-xs font-bold px-2 py-1 rounded-lg" style={{background:'#f1f5f9',color:'#475569'}}>{log.studentId}</span></td>
                    <td className="px-3 py-3"><span className="text-xs font-bold px-2 py-1 rounded-lg font-mono" style={{background:`${navy}0d`,color:navy}}>{log.deptID}</span></td>
                    <td className="px-3 py-3 hidden lg:table-cell"><span className="text-xs font-semibold text-slate-500">{(log as any).program||'—'}</span></td>
                    <td className="px-3 py-3 hidden md:table-cell"><span className="text-xs font-semibold text-slate-600">{log.purpose||'—'}</span></td>
                    {showBranch && (
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {logBranch
                          ? <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:'rgba(5,150,105,0.08)',color:'#059669'}}>{branchNameMap[logBranch]??logBranch}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-3"><p className="text-sm font-medium text-slate-700">{fmtTime(log.checkInTimestamp)}</p></td>
                    <td className="px-3 py-3"><span className="text-sm font-bold" style={{color:inside?navy:'#64748b'}}>{dur}</span></td>
                    <td className="px-3 pr-5 py-3 text-right">
                      {inside
                        ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">● Inside</span>
                        : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Done</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-400">{(page-1)*rpp+1}–{Math.min(page*rpp,filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Rows per page:</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
                {([25,50,100] as const).map(n=>(
                  <button key={n} onClick={()=>{setRpp(n);setPage(1);}} className="px-2.5 py-1 rounded-md text-xs font-bold transition-all" style={rpp===n?{background:'hsl(43,85%,50%)',color:'white'}:{color:'#64748b'}}>{n}</button>
                ))}
                <button onClick={()=>{const v=parseInt(prompt('Rows (10-500):',String(rpp))||String(rpp));if(!isNaN(v)&&v>=10&&v<=500){setRpp(v);setPage(1);}}} className="px-2.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:bg-white transition-all">Custom</button>
              </div>
            </div>
          </div>
          {totalPages>1 && (
            <div className="flex items-center gap-1">
              <button onClick={()=>setPage(1)} disabled={page===1} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30">««</button>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30">‹</button>
              {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).reduce<(number|string)[]>((acc,p,i,a)=>{if(i>0&&(p as number)-(a[i-1] as number)>1)acc.push('…');acc.push(p);return acc;},[]).map((p,i)=>p==='…'?<span key={'e'+i} className="px-1 text-slate-400 text-xs">…</span>:<button key={p} onClick={()=>setPage(p as number)} className="h-7 w-7 rounded-lg text-xs font-bold border transition-all" style={page===p?{background:'hsl(43,85%,50%)',color:'white',border:'none'}:{borderColor:'#e2e8f0',color:'#64748b'}}>{p}</button>)}
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="h-7 px-2.5 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30">›</button>
              <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} className="h-7 px-2 rounded-lg text-xs font-bold border border-slate-200 disabled:opacity-30">»»</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}