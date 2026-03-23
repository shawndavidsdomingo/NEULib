"use client";

import { useState, useMemo, useRef } from 'react';
import {
  Megaphone, Plus, Trash2, Eye, EyeOff, X, Check,
  Loader2, AlertTriangle, Info, ImageIcon, ExternalLink,
  Upload, Link as LinkIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { uploadToCloudinary, validateImageFile, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/cloudinary-upload';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export interface AnnouncementRecord {
  id:          string;
  title:       string;
  body:        string;
  type:        'info' | 'warning' | 'alert';
  imageUrl?:   string;      // final URL (uploaded or pasted)
  imagePath?:  string;      // Firebase Storage path — used for deletion
  branchId?:   string;
  startAt:     string;
  endAt:       string;
  createdBy:   string;
  createdAt:   string;
  isActive:    boolean;
}

const navy = 'hsl(221,72%,22%)';
const card: React.CSSProperties = {
  background:     'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(20px)',
  border:         '1px solid rgba(255,255,255,0.9)',
  boxShadow:      '0 4px 20px rgba(10,26,77,0.09)',
  borderRadius:   '1rem',
};

const TYPE_META = {
  info:    { label: 'Info',    icon: Info,          color: '#0284c7', bg: 'rgba(2,132,199,0.08)'  },
  warning: { label: 'Warning', icon: AlertTriangle,  color: '#d97706', bg: 'rgba(217,119,6,0.08)'  },
  alert:   { label: 'Alert',   icon: AlertTriangle,  color: '#dc2626', bg: 'rgba(220,38,38,0.08)'  },
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  live:      { bg: 'rgba(5,150,105,0.1)',  color: '#059669', label: 'Live on kiosk' },
  scheduled: { bg: `${navy}0d`,             color: navy,       label: 'Scheduled'     },
  expired:   { bg: 'rgba(100,116,139,0.1)', color: '#64748b', label: 'Expired'        },
  inactive:  { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', label: 'Hidden'         },
};

const MAX_MB = MAX_IMAGE_BYTES / 1024 / 1024;

interface Props { isSuperAdmin: boolean; }

export function KioskAnnouncements({ isSuperAdmin }: Props) {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [newTitle,  setNewTitle]  = useState('');
  const [newBody,   setNewBody]   = useState('');
  const [newType,   setNewType]   = useState<'info'|'warning'|'alert'>('info');
  const [newStart,  setNewStart]  = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newEnd,    setNewEnd]    = useState('');

  // ── Image state ───────────────────────────────────────────────────────────
  type ImageMode = 'upload' | 'url';
  const [imageMode,      setImageMode]      = useState<ImageMode>('upload');
  const [urlInput,       setUrlInput]       = useState('');
  const [urlError,       setUrlError]       = useState(false);
  const [uploadFile,     setUploadFile]     = useState<File | null>(null);
  const [uploadPreview,  setUploadPreview]  = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [previewAnn, setPreviewAnn] = useState<AnnouncementRecord | null>(null);

  const annRef = useMemoFirebase(() => collection(db, 'announcements'), [db]);
  const { data: announcements, isLoading } = useCollection<AnnouncementRecord>(annRef);

  const now = new Date();

  const sorted = useMemo(() => {
    if (!announcements) return [];
    return [...announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [announcements]);

  const getStatus = (a: AnnouncementRecord) => {
    if (!a.isActive) return 'inactive';
    if (isBefore(now, parseISO(a.startAt))) return 'scheduled';
    if (isAfter(now,  parseISO(a.endAt)))   return 'expired';
    return 'live';
  };

  // ── File picker ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { toast({ title: err, variant: 'destructive' }); return; }
    setUploadFile(file);
    setUploadProgress(null);
    setUploadPreview(URL.createObjectURL(file));
  };

  const clearFile = () => {
    setUploadFile(null);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload to Firebase Storage ────────────────────────────────────────────
  const uploadImage = async (file: File): Promise<{ url: string; path: string }> => {
    // Read env vars at call time (not module load time) to ensure they're available
    // Read at call time; fall back to known values from .env.local
    const cloudName    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    || 'dvaz64wcw';
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'neu-library';

    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', uploadPreset);
      form.append('folder', 'neu-library/announcements');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded/e.total)*100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, path: data.public_id });
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            const msg = errData?.error?.message || 'Upload failed';
            // Common Cloudinary errors with friendly guidance
            if (msg.includes('Upload preset') || msg.includes('upload_preset')) {
              reject(new Error(`Upload preset "${uploadPreset}" not found or not set to Unsigned. Go to Cloudinary → Settings → Upload → Upload presets and set signing mode to Unsigned.`));
            } else if (xhr.status === 401 || xhr.status === 403) {
              reject(new Error(`Cloudinary rejected the upload. Make sure the preset "${uploadPreset}" exists and is set to Unsigned mode.`));
            } else {
              reject(new Error(msg));
            }
          } catch {
            reject(new Error(`Upload failed (HTTP ${xhr.status}). Check Cloudinary preset settings.`));
          }
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newTitle.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    if (!newEnd)          { toast({ title: 'End date is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const id = `ann_${Date.now()}`;
      let imageUrl: string | undefined;
      let imagePath: string | undefined;

      if (imageMode === 'upload' && uploadFile) {
        const r = await uploadImage(uploadFile);
        imageUrl  = r.url;
        imagePath = r.path;
      } else if (imageMode === 'url' && urlInput.trim()) {
        imageUrl = urlInput.trim();
      }

      const data: Record<string, any> = {
        id, title: newTitle.trim(), body: newBody.trim(), type: newType,
        startAt:   new Date(newStart).toISOString(),
        endAt:     new Date(newEnd + 'T23:59:59').toISOString(),
        createdBy: user?.email || '',
        createdAt: new Date().toISOString(),
        isActive:  true,
      };
      if (imageUrl)  data.imageUrl  = imageUrl;
      if (imagePath) data.imagePath = imagePath;

      await setDoc(doc(db, 'announcements', id), data);

      setAdding(false);
      setNewTitle(''); setNewBody(''); setNewType('info'); setNewEnd('');
      setUrlInput(''); setUrlError(false); clearFile();

      toast({ title: 'Announcement published', description: 'Will appear on the kiosk during the specified dates.' });
    } catch (err: any) {
      toast({ title: 'Failed to publish', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (a: AnnouncementRecord) => {
    await updateDoc(doc(db, 'announcements', a.id), { isActive: !a.isActive });
    toast({ title: a.isActive ? 'Announcement hidden' : 'Announcement shown' });
  };

  const handleDelete = async (a: AnnouncementRecord) => {
    await deleteDoc(doc(db, 'announcements', a.id));
    // Note: Cloudinary images are not deleted automatically (requires server-side API key).
    // Images will remain in your Cloudinary media library — you can delete them manually there.
    toast({ title: 'Announcement deleted' });
  };

  const inputDate = {
    width: '100%', height: '36px', padding: '0 10px', borderRadius: '12px',
    border: '1px solid #e2e8f0', background: 'white', fontSize: '0.82rem',
    fontWeight: 600, color: '#1e293b', outline: 'none',
  } as React.CSSProperties;

  // ── Image input panel ─────────────────────────────────────────────────────
  const renderImageInput = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Event poster / image (optional)
        </p>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100">
          {([
            { id: 'upload' as const, icon: Upload,   label: 'Upload file' },
            { id: 'url'    as const, icon: LinkIcon, label: 'Paste URL'   },
          ]).map(m => (
            <button key={m.id}
              onClick={() => {
                if (m.id === imageMode) {
                  // Already in this mode — for upload, trigger file picker directly
                  if (m.id === 'upload') fileInputRef.current?.click();
                  return;
                }
                setImageMode(m.id);
                if (m.id === 'url') clearFile();        // switching to URL — clear any staged file
                if (m.id === 'upload') { setUrlInput(''); setUrlError(false); }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
              style={imageMode === m.id ? { background: navy, color: 'white' } : { color: '#64748b' }}>
              <m.icon size={11} /> {m.label}
            </button>
          ))}
        </div>
      </div>

      {imageMode === 'upload' ? (
        uploadFile ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {uploadPreview && (
              <div className="relative" style={{ background: '#f8fafc' }}>
                <img src={uploadPreview} alt="Preview"
                  className="w-full object-cover" style={{ maxHeight: 180 }} />
                <button onClick={clearFile}
                  className="absolute top-2 right-2 p-1.5 rounded-lg text-white"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="px-3 py-2 flex items-center justify-between gap-3"
              style={{ background: 'rgba(10,26,77,0.03)' }}>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">{uploadFile.name}</p>
                <p className="text-[11px] text-slate-400">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              {uploadProgress !== null && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${uploadProgress}%`, background: '#059669' }} />
                  </div>
                  <span className="text-xs font-bold text-emerald-600">{uploadProgress}%</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFileChange({ target: { files: e.dataTransfer.files } } as any);
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer transition-all hover:border-blue-300 hover:bg-blue-50/30"
            style={{ minHeight: 100 }}>
            <div className="p-3 rounded-xl" style={{ background: `${navy}0d` }}>
              <Upload size={20} style={{ color: navy }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-600">Click to upload or drag & drop</p>
              <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP, GIF — max {MAX_MB} MB</p>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(false); }}
                placeholder="https://i.imgur.com/… or any direct image link"
                className="h-9 pl-8 rounded-xl border-slate-200 bg-white text-sm" />
            </div>
            {urlInput.trim() && (
              <a href={urlInput.trim()} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                <ExternalLink size={12} /> Open
              </a>
            )}
          </div>
          {urlInput.trim() && !urlError && (
            <div className="rounded-xl overflow-hidden border border-slate-200" style={{ maxHeight: 160, background: '#f8fafc' }}>
              <img src={urlInput.trim()} alt="Preview"
                className="w-full object-cover" style={{ maxHeight: 160 }}
                onError={() => setUrlError(true)} />
            </div>
          )}
          {urlInput.trim() && urlError && (
            <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
              <AlertTriangle size={11} /> Could not load image — check the URL
            </p>
          )}
          <p className="text-xs text-slate-400 font-medium">
            Use a direct image URL ending in .jpg/.png/.webp. Imgur or Cloudinary work best.
          </p>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden" onChange={handleFileChange} />
    </div>
  );

  return (
    <>
      <div style={card}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-white" style={{ background: navy }}>
              <Megaphone size={17} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xl" style={{ fontFamily: "'Playfair Display',serif" }}>
                Kiosk Announcements
              </h3>
              <p className="text-slate-400 text-sm mt-0.5">Notices and event posters displayed on the kiosk</p>
            </div>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setAdding(a => !a)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border transition-all active:scale-95"
              style={adding
                ? { background: 'rgba(239,68,68,0.07)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }
                : { background: `${navy}0d`, color: navy, borderColor: `${navy}20` }}>
              {adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> New Announcement</>}
            </button>
          )}
        </div>

        {/* Form */}
        {adding && (
          <div className="px-5 py-5 border-b border-slate-100 space-y-4" style={{ background: 'rgba(10,26,77,0.02)' }}>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Title *</p>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Extended hours during exam week"
                className="h-9 rounded-xl border-slate-200 bg-white text-sm" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Message (optional)</p>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={2}
                placeholder="Additional details shown below the title on the kiosk…"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium resize-none outline-none focus:border-blue-400"
                style={{ lineHeight: '1.6' }} />
            </div>

            {renderImageInput()}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Type</p>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                  {(['info','warning','alert'] as const).map(t => (
                    <button key={t} onClick={() => setNewType(t)}
                      className="flex-1 py-1 rounded-lg text-xs font-bold transition-all capitalize"
                      style={newType === t ? { background: TYPE_META[t].color, color: 'white' } : { color: '#64748b' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Show from</p>
                <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} style={inputDate} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Show until</p>
                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} style={inputDate} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleAdd} disabled={saving}
                className="flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ background: '#059669' }}>
                {saving
                  ? <><Loader2 size={13} className="animate-spin" />
                      {uploadProgress !== null ? `Uploading ${uploadProgress}%…` : 'Publishing…'}</>
                  : <><Check size={13} /> Publish</>}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="p-5 space-y-3">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center gap-3 text-slate-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm font-medium">Loading…</span>
            </div>
          ) : !sorted.length ? (
            <div className="py-8 text-center">
              <Megaphone size={24} className="mx-auto text-slate-200 mb-2" />
              <p className="text-slate-400 text-sm font-medium">No announcements yet.</p>
            </div>
          ) : (
            sorted.map(a => {
              const meta   = TYPE_META[a.type];
              const status = getStatus(a);
              const ss     = STATUS_STYLE[status] || STATUS_STYLE.inactive;
              const Icon   = meta.icon;
              return (
                <div key={a.id}
                  className="rounded-2xl border overflow-hidden transition-all"
                  style={{
                    borderColor: status === 'live' ? `${meta.color}30` : '#e2e8f0',
                    opacity: status === 'expired' || status === 'inactive' ? 0.65 : 1,
                  }}>
                  {a.imageUrl && (
                    <div className="relative" style={{ background: '#0f172a' }}>
                      <img src={a.imageUrl} alt={a.title}
                        className="w-full object-cover"
                        style={{ maxHeight: 200, opacity: status === 'live' ? 1 : 0.55 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div className="absolute top-2.5 left-2.5">
                        <span className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wide shadow"
                          style={{ background: ss.bg, color: ss.color, backdropFilter: 'blur(8px)', border: `1px solid ${ss.color}30` }}>
                          {ss.label}
                        </span>
                      </div>
                      <a href={a.imageUrl} target="_blank" rel="noreferrer"
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg"
                        style={{ background: 'rgba(0,0,0,0.45)', color: 'white' }}
                        title="View full image">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  )}
                  <div className="p-4 flex items-start gap-3 flex-wrap"
                    style={{ background: status === 'live' && !a.imageUrl ? meta.bg : 'rgba(248,250,252,0.7)' }}>
                    {!a.imageUrl && (
                      <div className="p-2 rounded-xl flex-shrink-0"
                        style={{ background: `${meta.color}15`, color: meta.color }}>
                        <Icon size={15} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                        {!a.imageUrl && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                        )}
                        {a.imageUrl && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>
                            <ImageIcon size={9} />
                            {a.imagePath ? 'Uploaded' : 'Linked image'}
                          </span>
                        )}
                      </div>
                      {a.body && (
                        <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">{a.body}</p>
                      )}
                      <p className="text-xs text-slate-400 font-medium">
                        {format(parseISO(a.startAt), 'MMM d')} — {format(parseISO(a.endAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setPreviewAnn(a)}
                          title="Preview on kiosk"
                          className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleToggle(a)}
                          title={a.isActive ? 'Hide from kiosk' : 'Show on kiosk'}
                          className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-all">
                          {a.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => handleDelete(a)}
                          title="Delete"
                          className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewAnn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setPreviewAnn(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(160deg,hsl(225,70%,42%) 0%,hsl(221,72%,22%) 100%)' }}>
            <div className="px-6 pt-6 pb-3 text-center">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Kiosk Preview</p>
              <p className="text-white/70 text-xs font-semibold mt-0.5">How this appears on the kiosk screen</p>
            </div>
            <div className="mx-4 mb-6 rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              {previewAnn.imageUrl && (
                <img src={previewAnn.imageUrl} alt={previewAnn.title}
                  className="w-full object-cover" style={{ maxHeight: 220 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div className="p-4 flex items-start gap-3"
                style={{ background: TYPE_META[previewAnn.type].bg }}>
                {(() => {
                  const Icon = TYPE_META[previewAnn.type].icon;
                  return <Icon size={18} style={{ color: TYPE_META[previewAnn.type].color, flexShrink: 0, marginTop: 1 }} />;
                })()}
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.92rem', color: TYPE_META[previewAnn.type].color }}>
                    {previewAnn.title}
                  </p>
                  {previewAnn.body && (
                    <p style={{ fontSize: '0.8rem', color: TYPE_META[previewAnn.type].color, opacity: 0.8, marginTop: 3, fontWeight: 500, lineHeight: 1.5 }}>
                      {previewAnn.body}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="pb-5 text-center">
              <button onClick={() => setPreviewAnn(null)}
                className="text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest transition-all">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}