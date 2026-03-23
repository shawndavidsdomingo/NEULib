"use client";

import { useState } from 'react';

interface StudentAvatarProps {
  name:       string;
  avatarUrl?: string | null;
  size?:      number;       // px, default 32
  radius?:    string;       // border-radius, default '8px'
  fallbackBg?: string;      // fallback gradient/color
}

/**
 * StudentAvatar — shows Google/uploaded photo if available,
 * falls back to initials with a gradient background.
 * Used across LogHistory, LiveFeed, Registry, Reports, etc.
 */
export function StudentAvatar({
  name,
  avatarUrl,
  size = 32,
  radius = '8px',
  fallbackBg = 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,35%))',
}: StudentAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // Build initials from "LAST, First" or "First Last"
  const initials = (() => {
    const clean = (name || '').trim();
    if (!clean) return 'S';
    // Handle "DELA CRUZ, Juan" format
    if (clean.includes(',')) {
      const [last, first] = clean.split(',').map(s => s.trim());
      return `${(first?.[0] || '')}${(last?.[0] || '')}`.toUpperCase() || 'S';
    }
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  })();

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        style={{
          width: size, height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius,
      background: fallbackBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white',
      fontWeight: 700,
      fontSize: Math.max(10, size * 0.35),
      flexShrink: 0,
      letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}
