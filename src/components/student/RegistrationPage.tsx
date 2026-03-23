"use client";

import { useState, useEffect, useRef } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Loader2, UserCircle2, IdCard, GraduationCap, Building2, CheckCircle2, ArrowLeft, Camera, X } from 'lucide-react';
import { uploadToCloudinary, validateImageFile, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/cloudinary-upload';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserRecord, ProgramRecord } from '@/lib/firebase-schema';

const navy = 'hsl(221,72%,22%)';

interface Props {
  onSubmitted: (user: UserRecord) => void;
  onBack: () => void;
}

export default function RegistrationPage({ onSubmitted, onBack }: Props) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [nameMode,     setNameMode]     = useState<'email' | 'manual' | null>(null);
  const [firstName,    setFirstName]    = useState('');
  const [middleName,   setMiddleName]   = useState('');
  const [lastName,     setLastName]     = useState('');
  const [studentId,    setStudentId]    = useState('');
  const [deptId,       setDeptId]       = useState('');
  const [program,      setProgram]      = useState('');
  const [error,        setError]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);

  // Avatar upload state
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadPct,     setUploadPct]     = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [allDepts,     setAllDepts]     = useState<{ deptID: string; departmentName: string }[]>([]);
  const [programs,     setPrograms]     = useState<ProgramRecord[]>([]);
  const [loadingProgs, setLoadingProgs] = useState(false);

  // Load departments
  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => {
        const depts = snap.docs.map(d => d.data() as { deptID: string; departmentName: string });
        const sortedDepts = depts.sort((a, b) => {
          const aPrio = a.deptID === 'LIBRARY' ? 0 : 1;
          const bPrio = b.deptID === 'LIBRARY' ? 0 : 1;
          if (aPrio !== bPrio) return aPrio - bPrio;
          return a.deptID.localeCompare(b.deptID);
        });
        setAllDepts(sortedDepts);
      });
  }, [db]);

  // Load programs when dept changes
  useEffect(() => {
    if (!deptId) { setPrograms([]); return; }
    setLoadingProgs(true);
    setProgram('');
    getDocs(query(collection(db, 'programs'), where('deptID', '==', deptId)))
      .then(snap => {
        const progs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramRecord));
        const sortedProgs = progs.sort((a, b) => {
          const aIsStaff = a.code.toUpperCase().includes('STAFF') ? 0 : 1;
          const bIsStaff = b.code.toUpperCase().includes('STAFF') ? 0 : 1;
          if (aIsStaff !== bIsStaff) return aIsStaff - bIsStaff;
          return a.name.localeCompare(b.name);
        });
        setPrograms(sortedProgs);
      })
      .finally(() => setLoadingProgs(false));
  }, [deptId, db]);

  // When user picks "use email name", pre-fill from Google display name
  useEffect(() => {
    if (nameMode === 'email' && user?.displayName) {
      const parts = user.displayName.trim().split(' ');
      setFirstName(parts.slice(0, -1).join(' ') || parts[0] || '');
      setLastName(parts.length > 1 ? parts[parts.length - 1] : '');
      setMiddleName('');
    }
    if (nameMode === 'manual') {
      setFirstName(''); setMiddleName(''); setLastName('');
    }
  }, [nameMode, user?.displayName]);

  const handleIdChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 10);
    let out = digits;
    if (digits.length > 2) out = digits.slice(0, 2) + '-' + digits.slice(2);
    if (digits.length > 7) out = digits.slice(0, 2) + '-' + digits.slice(2, 7) + '-' + digits.slice(7);
    setStudentId(out);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    if (!nameMode) { setError('Please choose your name source.'); return; }
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return; }
    if (!studentId.trim()) { setError('Student ID is required.'); return; }
    if (!/^\d{2}-\d{5}-\d{3}$/.test(studentId.trim())) {
      setError('Student ID format: YY-XXXXX-ZZZ'); return;
    }
    if (!deptId) { setError('Please select your department.'); return; }
    if (!user?.email) return;

    setSubmitting(true);
    try {
      // Check if ID already registered
      const directDoc = await getDoc(doc(db, 'users', studentId.trim()));
      if (directDoc.exists() && directDoc.data().email !== user.email) {
        setError('This Student ID is already registered to another account. Please double-check your ID card.');
        setSubmitting(false); return;
      }
      if (!directDoc.exists()) {
        const fieldQuery = await getDocs(query(collection(db, 'users'), where('id', '==', studentId.trim()), limit(1)));
        if (!fieldQuery.empty && fieldQuery.docs[0].data().email !== user.email) {
          setError('This Student ID is already registered to another account. Please double-check your ID card.');
          setSubmitting(false); return;
        }
      }

      // ── Store Google avatar URL if available ─────────────────────────────
      // If user selected a file, upload to Cloudinary first
      let avatarUrl: string | null = null;
      if (avatarFile) {
        setUploadPct(0);
        try {
          const result = await uploadToCloudinary(avatarFile, {
            folder: 'neu-library/avatars',
            onProgress: setUploadPct,
          });
          avatarUrl = result.url;
        } catch (e: any) {
          setError('Image upload failed: ' + e.message);
          setSubmitting(false);
          return;
        }
        setUploadPct(null);
      } else {
        // Fall back to Google photo if no file selected
        avatarUrl = user.photoURL || null;
      }

      const newData: UserRecord & { avatarUrl?: string | null } = {
        id:         studentId.trim(),
        firstName:  firstName.trim(),
        middleName: middleName.trim(),
        lastName:   lastName.trim(),
        email:      user.email!,
        role:       'visitor',
        status:     'pending',
        deptID:     deptId,
        program:    program || '',
        addedAt:    new Date().toISOString(),
        ...(avatarUrl ? { avatarUrl } : {}),
      };

      await setDoc(doc(db, 'users', studentId.trim()), newData, { merge: false });

      const savedUser: UserRecord = { ...newData, id: studentId.trim() };
      setDone(true);

      setTimeout(() => {
        onSubmitted(savedUser);
      }, 3000);

    } catch (e: any) {
      setError(e.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
        <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md text-center space-y-6 animate-in zoom-in duration-500" style={{ border: '1px solid #e2e8f0' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(5,150,105,0.1)' }}>
            <CheckCircle2 size={40} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display',serif" }}>
              Registration Submitted!
            </h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              Your account is pending admin verification. You will be redirected shortly.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
            <Loader2 size={12} className="animate-spin" /> Redirecting…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <div className="w-full max-w-md space-y-4">

        {/* ── Header ── */}
        <div className="text-center space-y-1 pb-1">
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>
            Complete Registration
          </h1>
          <p className="text-white/55 text-sm font-medium">{user?.email}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden"
          style={{ border: '1px solid #e2e8f0' }}>

          {/* ── GROUP 1: Identity ── */}
          <div className="px-6 pt-6 pb-5 space-y-4">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.14em]">
              Personal Information
            </p>

            {/* Avatar + name source row */}
            <div className="flex items-start gap-4">

              {/* Avatar */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className="relative">
                  {avatarPreview || user?.photoURL ? (
                    <img
                      src={avatarPreview || user?.photoURL || ''}
                      alt="Profile"
                      className="w-16 h-16 rounded-2xl object-cover"
                      style={{ border: `2px solid ${navy}18`, boxShadow: '0 2px 10px rgba(10,26,77,0.1)' }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: `${navy}08`, border: `1.5px dashed ${navy}22` }}>
                      <UserCircle2 size={26} style={{ color: `${navy}45` }} />
                    </div>
                  )}
                  {uploadPct !== null && (
                    <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.52)' }}>
                      <span className="text-white text-[10px] font-extrabold">{uploadPct}%</span>
                    </div>
                  )}
                </div>
                {/* Change photo text link */}
                <button type="button"
                  onClick={() => avatarFile
                    ? (setAvatarFile(null), setAvatarPreview(null), setUploadPct(null))
                    : fileRef.current?.click()}
                  className="text-[10px] font-bold transition-colors"
                  style={{ color: avatarFile ? '#dc2626' : navy }}>
                  {avatarFile ? 'Remove' : (avatarPreview || user?.photoURL) ? 'Change photo' : 'Add photo'}
                </button>
                <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const err = validateImageFile(f);
                    if (err) { setError(err); return; }
                    setAvatarFile(f);
                    setAvatarPreview(URL.createObjectURL(f));
                    setError('');
                  }} />
              </div>

              {/* Name source — segmented control style */}
              <div className="flex-1 space-y-2">
                <p className="text-xs font-bold text-slate-500">Name source</p>
                <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100">
                  {([
                    { id: 'email'  as const, label: 'From email' },
                    { id: 'manual' as const, label: 'Enter myself' },
                  ]).map(opt => (
                    <button key={opt.id} onClick={() => setNameMode(opt.id)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={nameMode === opt.id
                        ? { background: navy, color: 'white', boxShadow: '0 1px 4px rgba(10,26,77,0.2)' }
                        : { color: '#64748b' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* Name preview when email mode selected */}
                {nameMode === 'email' && user?.displayName && (
                  <p className="text-xs text-slate-500 font-medium px-1">
                    Using: <span className="font-bold text-slate-700">{user.displayName}</span>
                  </p>
                )}
                {!nameMode && (
                  <p className="text-[11px] text-slate-400 px-1">
                    Choose how we fill in your name below
                  </p>
                )}
              </div>
            </div>

            {/* Name fields — only shown after mode selected */}
            {nameMode && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">First Name *</label>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)}
                      placeholder="Juan" readOnly={nameMode === 'email'}
                      className={`h-10 rounded-xl text-sm ${nameMode === 'email' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50'}`} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Middle</label>
                    <Input value={middleName} onChange={e => setMiddleName(e.target.value)}
                      placeholder="Santos"
                      className="h-10 rounded-xl bg-slate-50 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Last Name *</label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)}
                    placeholder="Dela Cruz" readOnly={nameMode === 'email'}
                    className={`h-10 rounded-xl text-sm ${nameMode === 'email' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50'}`} />
                </div>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="mx-6 border-t border-slate-100" />

          {/* ── GROUP 2: Academic ── */}
          <div className="px-6 pt-5 pb-6 space-y-4">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.14em]">
              Academic Information
            </p>

            {/* Student ID — narrower, fixed format */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                <IdCard size={10} /> Student ID *
              </label>
              <div className="flex items-center gap-3">
                <Input
                  value={studentId}
                  onChange={e => handleIdChange(e.target.value)}
                  placeholder="YY-XXXXX-ZZZ"
                  className="h-11 rounded-xl bg-slate-50 font-mono font-bold text-base tracking-widest text-center"
                  style={{ maxWidth: 180 }}
                />
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Format: <span className="font-mono font-bold text-slate-500">YY-XXXXX-ZZZ</span><br />
                  Dashes added automatically
                </p>
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                <Building2 size={10} /> College / Department *
              </label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50 font-semibold text-sm">
                  <SelectValue placeholder="Select your college" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {allDepts.map(d => (
                    <SelectItem key={d.deptID} value={d.deptID} className="font-semibold text-sm">
                      <span className="font-bold mr-2 text-xs" style={{ color: navy }}>[{d.deptID}]</span>
                      {d.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                <GraduationCap size={10} /> Academic Program
              </label>
              <Select value={program} onValueChange={setProgram} disabled={!deptId || loadingProgs}>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50 font-semibold text-sm disabled:opacity-50">
                  <SelectValue placeholder={!deptId ? 'Select department first' : loadingProgs ? 'Loading…' : 'Select program'} />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {programs.map(p => (
                    <SelectItem key={p.code} value={p.code} className="font-semibold text-sm">
                      <span className="font-bold mr-2 text-xs font-mono" style={{ color: navy }}>{p.code}</span>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
                <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-xs font-semibold text-red-600">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={onBack}
                className="flex-1 h-11 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(10,26,77,0.06)', color: navy }}>
                <ArrowLeft size={14} /> Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-[2] h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                style={{ background: `linear-gradient(135deg,${navy},hsl(221,60%,32%))` }}>
                {submitting
                  ? <><Loader2 size={15} className="animate-spin" /> {uploadPct !== null ? `Uploading ${uploadPct}%…` : 'Submitting…'}</>
                  : 'Submit Registration'}
              </button>
            </div>

            {/* Info tip — styled as soft alert */}
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
              style={{ background: 'rgba(2,132,199,0.07)', border: '1px solid rgba(2,132,199,0.15)' }}>
              <span style={{ color: '#0284c7', fontSize: 14, flexShrink: 0 }}>ℹ</span>
              <p className="text-xs font-medium leading-relaxed" style={{ color: '#0369a1' }}>
                Your account will be reviewed by a library administrator before activation. You may proceed to enter the library in the meantime.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}