"use client";

import { useMemo, useEffect, useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import { isAfter, isBefore, parseISO } from 'date-fns';
import { Info, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AnnouncementRecord } from '@/components/admin/KioskAnnouncements';

const ICON_MAP = {
  info:    Info,
  warning: AlertTriangle,
  alert:   AlertTriangle,
};

const COLOR_MAP = {
  info:    { bg: 'rgba(2,132,199,0.10)',  border: 'rgba(2,132,199,0.25)',  text: '#0369a1', icon: '#0284c7' },
  warning: { bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.25)', text: '#92400e', icon: '#d97706' },
  alert:   { bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.25)', text: '#991b1b', icon: '#dc2626' },
};

interface Props { branchId?: string; }

/**
 * Renders active announcements on the kiosk idle screen.
 * - Text-only announcements: compact banner with icon + text
 * - Image announcements: full-width poster card with image on top, text below
 * Multiple announcements rotate every 6 seconds.
 */
export function KioskAnnouncementBanner({ branchId }: Props) {
  const db = useFirestore();
  const { user: authUser } = useUser();

  // Only subscribe when user is authenticated (avoids permission errors during auth transitions)
  const annRef = useMemoFirebase(
    () => authUser ? collection(db, 'announcements') : null,
    [db, authUser]
  );
  const { data: all } = useCollection<AnnouncementRecord>(annRef);

  const now = useMemo(() => new Date(), []);

  const active = useMemo(() => {
    if (!all) return [];
    return all.filter(a => {
      if (!a.isActive) return false;
      if (isBefore(now, parseISO(a.startAt))) return false;
      if (isAfter(now,  parseISO(a.endAt)))   return false;
      if (branchId && a.branchId && a.branchId !== branchId) return false;
      return true;
    });
  }, [all, now, branchId]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (active.length <= 1) { setIdx(0); return; }
    const t = setInterval(() => setIdx(i => (i + 1) % active.length), 5000);
    return () => clearInterval(t);
  }, [active.length]);

  const goPrev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i - 1 + active.length) % active.length); };
  const goNext = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i + 1) % active.length); };

  if (!active.length) return null;

  const ann  = active[idx];
  const meta = COLOR_MAP[ann.type];
  const Icon = ICON_MAP[ann.type];

  // ── Image poster layout ──────────────────────────────────────────────────
  if (ann.imageUrl) {
    return (
      <div style={{
        margin: '0 0 20px 0',
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${meta.border}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        transition: 'all 0.4s ease',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        {/* Poster image */}
        <img
          src={ann.imageUrl}
          alt={ann.title}
          style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {/* Text below image */}
        <div style={{
          padding: '12px 16px',
          background: meta.bg,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <Icon size={17} style={{ color: meta.icon, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: meta.text, marginBottom: ann.body ? 3 : 0 }}>
              {ann.title}
            </p>
            {ann.body && (
              <p style={{ fontSize: '0.78rem', color: meta.text, opacity: 0.8, fontWeight: 500, lineHeight: 1.5 }}>
                {ann.body}
              </p>
            )}
          </div>
          {/* Navigation dots + prev/next */}
          {active.length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={goPrev}
                style={{ background: `${meta.icon}20`, border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: meta.icon, display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={14} />
              </button>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {active.map((_, i) => (
                  <div key={i} onClick={() => setIdx(i)}
                    style={{ width: i === idx ? 14 : 6, height: 6, borderRadius: 3,
                      background: meta.icon, opacity: i === idx ? 1 : 0.3,
                      transition: 'all 0.3s ease', cursor: 'pointer' }} />
                ))}
              </div>
              <button onClick={goNext}
                style={{ background: `${meta.icon}20`, border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: meta.icon, display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Text-only layout ─────────────────────────────────────────────────────
  return (
    <div style={{
      margin: '0 0 20px 0',
      padding: '12px 16px',
      borderRadius: 14,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      transition: 'all 0.4s ease',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <Icon size={18} style={{ color: meta.icon, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: '0.92rem', color: meta.text, marginBottom: ann.body ? 3 : 0 }}>
          {ann.title}
        </p>
        {ann.body && (
          <p style={{ fontSize: '0.82rem', color: meta.text, opacity: 0.8, fontWeight: 500, lineHeight: 1.5 }}>
            {ann.body}
          </p>
        )}
      </div>
      {active.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={goPrev}
            style={{ background: `${meta.icon}20`, border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: meta.icon, display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {active.map((_, i) => (
              <div key={i} onClick={() => setIdx(i)}
                style={{ width: i === idx ? 14 : 6, height: 6, borderRadius: 3,
                  background: meta.icon, opacity: i === idx ? 1 : 0.3,
                  transition: 'all 0.3s ease', cursor: 'pointer' }} />
            ))}
          </div>
          <button onClick={goNext}
            style={{ background: `${meta.icon}20`, border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: meta.icon, display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}