'use client';
import React from 'react';
import type { Quarter } from '../lib/types';

// klucz statusu ćwiartki do klas CSS (paska sezonu, pigułki statusu) — steruje kolorem kropki:
// trwa = zielona (live), wkrótce = żółta (pending), zakończona = czerwona (closed)
export function quarterStatusKey(status: Quarter['status']) {
  return status === 'trwa' ? 'active' : status === 'zakończona' ? 'done' : 'upcoming';
}

// ikonki chipów FPL do badge'y — czysto kosmetyczne, kod chipa i tak jest w tooltipie
const CHIP_ICON: Record<string, string> = {
  bboost: '🪑', wildcard: '🃏', freehit: '🎯', '3xc': '👑', manager: '👔',
};
export function chipIcon(code: string) {
  return CHIP_ICON[code] || '🔹';
}

// medal/pozycja dla rankingów (Top3 w ćwiartkach, itd.)
export function rankBadge(i: number) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
}

// zwarty zapis dużej liczby (ranking ogólny FPL bywa w milionach) — "76,3k" / "1,2M" — żeby
// zmieścić się przy kapitanie w wąskiej karcie mobile; pełna liczba i tak jest w tooltipie
export function formatCompactRank(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return String(n);
}

// trend formy: średnia z ostatnich kolejek vs średnia z tych wcześniejszych. Potrzebuje min.
// 2 rozegranych GW (czyli realnie ruszy od GW2/3) — przy mniejszej ilości danych zwraca null,
// żeby front mógł to po prostu schować zamiast pokazywać mylący wynik na jednej kolejce.
export function computeForm(points: number[]): 'up' | 'down' | 'flat' | null {
  if (points.length < 2) return null;
  const recentN = Math.min(3, points.length - 1);
  const recent = points.slice(points.length - recentN);
  const prior = points.slice(0, points.length - recentN);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(recent) - avg(prior);
  if (diff > 2) return 'up';
  if (diff < -2) return 'down';
  return 'flat';
}

// mały okrągły awatar zawodnika (oficjalne zdjęcie z CDN Premier League) — jeśli się nie
// załaduje (np. zawodnik bez zdjęcia), po prostu znika, żeby nie zostawiać "złamanej" ikonki
export function PlayerAvatar({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return <span className="playeravatar playeravatar--fallback" aria-hidden="true">{alt.slice(0, 1)}</span>;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="playeravatar"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

// mały herb klubu — jeśli się nie załaduje, po prostu znika (sam skrót klubu w tekście wystarczy)
export function ClubBadge({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={alt} className="clubbadge" loading="lazy" onError={() => setBroken(true)} />;
}

// kompaktowy sparkline (SVG, bez zależności) — trend punktów managera z rozegranych kolejek
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 56, h = 18, pad = 2;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = pad + (points.length - 1) * stepX;
  const lastY = h - pad - ((points[points.length - 1] - min) / range) * (h - pad * 2);
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden="true">
      <polyline points={coords} fill="none" stroke="#5ee1a2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.8" fill="#5ee1a2" />
    </svg>
  );
}
