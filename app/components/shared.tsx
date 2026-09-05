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

// siatka kafelków KPI — ten sam wizualny język co "GW Pulse" w Lidze (.gwpulse-grid/-item), tylko
// z auto-dopasowującą się liczbą kolumn (banery mają czasem 3, czasem 4 kafelki, w zależności od
// tego które fakty akurat mamy), więc reużywalne też poza samą Ligą (banery powiadomień, Statystyki)
export function StatTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="gwpulse-grid gwpulse-grid--auto">{children}</div>;
}

// pojedynczy kafelek — albo z emoji-ikoną, albo z fotą zawodnika (photoUrl ma pierwszeństwo),
// duża wartość na środku (liczba albo nazwisko), mały podpis, i uppercase label jak w GW Pulse.
// `tone` (opcjonalny) dokłada przytłumione, kolorowe obramowanie — ten sam podział good/bad/
// special/neutral co StatModule/RankFill, więc kafelek od razu sygnalizuje "to dobra wiadomość"
// czy "to zła wiadomość" (np. Worst GW na czerwono, Best GW na zielono), nie tylko sam tekst.
export function StatTile({
  icon, photoUrl, value, caption, label, tone,
}: {
  icon?: string; photoUrl?: string; value: React.ReactNode; caption?: React.ReactNode; label: string; tone?: Tone;
}) {
  return (
    <div className={`gwpulse-item${tone ? ` gwpulse-item--${tone}` : ''}`}>
      {photoUrl ? <PlayerAvatar src={photoUrl} alt={label} /> : icon && <span className="gwpulse-icon">{icon}</span>}
      <b>{value}</b>
      {caption && <span className="small">{caption}</span>}
      <span className="gwpulse-label">{label}</span>
    </div>
  );
}

// paleta "charakteru" treści (dobre/złe/specjalne/neutralne) — współdzielona przez StatModule,
// RankFill, .statchip i .wrapped-card, żeby kolor zawsze znaczył to samo w całej appce
export type Tone = 'good' | 'bad' | 'special' | 'neutral';

// Panel modułu — ten sam wizualny język co .wrapped-card w GW Wrapped i .statchip (kolorowe,
// przytłumione obramowanie dopasowane do "charakteru" treści). Reużywalne w każdej zakładce, która
// dzieli treść na tematyczne bloki (Statystyki, Sezon) — żeby całość spójnie wyglądała jak jedna
// appka, nie zbiór osobnych stylów per zakładka.
export function StatModule({
  icon, tone, title, subtitle, children,
}: {
  icon: string; tone: Tone; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className={`statmodule statmodule--${tone}`}>
      <div className="statmodule-header">
        <span className={`statmodule-icon statmodule-icon--${tone}`}>{icon}</span>
        <div>
          <div className="statmodule-title">{title}</div>
          <div className="statmodule-subtitle">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// Szerokość paska tła (%) proporcjonalna do wartości względem max w danej liście, z widoczną
// minimalną szerokością (4%) — żeby nawet najmniejsza wartość na liście była wizualnie zauważalna,
// ten sam zabieg co przy pasku postępu ćwiartki (.qheader-progressbar-fill).
export function barPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(Math.round((value / max) * 100), 4);
}

// pasek tła pod wierszem rankingu (.rankbar--viz/.squadplayer--viz) — patrz komentarz w globals.css
export function RankFill({ pct, tone }: { pct: number; tone: Tone }) {
  return <span className={`rankbar-fill rankbar-fill--${tone}`} style={{ width: `${pct}%` }} aria-hidden="true" />;
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
