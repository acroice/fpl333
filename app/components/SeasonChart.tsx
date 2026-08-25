'use client';
import React from 'react';

export type ChartSeries = {
  entry: number;
  name: string;
  team: string;
  points: { gw: number; value: number }[];
};

type Props = {
  series: ChartSeries[];
  mode: 'rank' | 'points';
  visibleEntries: Set<number>;
  rankCeiling?: number; // liczba managerów w lidze — dla trybu 'rank', żeby oś zawsze pokazywała 1..N
  highlightEntry: number | null;
  onToggleHighlight: (entry: number | null) => void;
};

// Hand-rolled SVG line/bump chart — bez zewnętrznej biblioteki wykresów (ten sam wzorzec co
// istniejący Sparkline). Jeden komponent obsługuje oba tryby z Sezonu: 'rank' (bump chart,
// miejsce 1 na górze) i 'points' (cumulative total points), bo wizualnie to ta sama siatka
// linii — różni się tylko kierunek osi Y i formatowanie etykiet.
export default function SeasonChart({ series, mode, visibleEntries, rankCeiling, highlightEntry, onToggleHighlight }: Props) {
  const W = 640, H = 300, padL = 32, padR = 10, padT = 14, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const visible = series.filter(s => visibleEntries.has(s.entry) && s.points.length > 0);
  const allGws = Array.from(new Set(visible.flatMap(s => s.points.map(p => p.gw)))).sort((a, b) => a - b);

  if (allGws.length === 0 || visible.length === 0) {
    return <div className="small">Brak danych do wykresu.</div>;
  }

  const minGw = allGws[0];
  const maxGw = allGws[allGws.length - 1];

  const allValues = visible.flatMap(s => s.points.map(p => p.value));
  let minV = mode === 'rank' ? 1 : Math.min(...allValues);
  let maxV = mode === 'rank' ? Math.max(rankCeiling ?? 1, ...allValues) : Math.max(...allValues);
  if (minV === maxV) { minV -= 1; maxV += 1; }

  const x = (gw: number) => padL + ((gw - minGw) / Math.max(maxGw - minGw, 1)) * plotW;
  const y = (v: number) => {
    const t = (v - minV) / Math.max(maxV - minV, 1); // 0..1
    const ty = mode === 'rank' ? t : 1 - t; // rank: 1 (najlepszy) blisko 0 -> góra; points: wyższy wynik -> góra
    return padT + ty * plotH;
  };

  const colorFor = (i: number) => `hsl(${Math.round((i * 360) / Math.max(series.length, 1)) % 360}, 68%, 62%)`;

  // etykiety osi X — GW co ~5, zawsze pierwsza i ostatnia rozegrana kolejka
  const xTicks = allGws.filter(gw => gw === minGw || gw === maxGw || gw % 5 === 0);

  // etykiety osi Y — dla rank pełny zakres 1..N (albo co drugi, jeśli dużo managerów), dla
  // punktów kilka równo rozłożonych wartości
  const yTicks =
    mode === 'rank'
      ? Array.from({ length: Math.round(maxV) }, (_, i) => i + 1).filter(r => r === 1 || r === Math.round(maxV) || r % (Math.round(maxV) > 10 ? 2 : 1) === 0)
      : [minV, (minV + maxV) / 2, maxV];

  return (
    <div className="seasonchart">
      <svg viewBox={`0 0 ${W} ${H}`} className="seasonchart-svg" role="img" aria-label={mode === 'rank' ? 'Historia rankingu w lidze' : 'Historia punktów w sezonie'}>
        {/* siatka pozioma */}
        {yTicks.map(v => (
          <line key={`gy-${v}`} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="seasonchart-grid" />
        ))}
        {/* etykiety Y */}
        {yTicks.map(v => (
          <text key={`ly-${v}`} x={padL - 6} y={y(v)} className="seasonchart-axis" textAnchor="end" dominantBaseline="middle">
            {mode === 'rank' ? Math.round(v) : Math.round(v)}
          </text>
        ))}
        {/* etykiety X */}
        {xTicks.map(gw => (
          <text key={`lx-${gw}`} x={x(gw)} y={H - padB + 16} className="seasonchart-axis" textAnchor="middle">
            GW{gw}
          </text>
        ))}

        {/* linie managerów — nieaktywne (gdy jest highlight na kimś innym) wygaszone */}
        {visible.map(s => {
          const idx = series.findIndex(o => o.entry === s.entry);
          const faded = highlightEntry != null && highlightEntry !== s.entry;
          const pts = [...s.points].sort((a, b) => a.gw - b.gw);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.gw).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
          const color = colorFor(idx);
          const last = pts[pts.length - 1];
          return (
            <g
              key={s.entry}
              className="seasonchart-series"
              style={{ opacity: faded ? 0.15 : 1 }}
              onClick={() => onToggleHighlight(highlightEntry === s.entry ? null : s.entry)}
            >
              {/* szeroka niewidzialna ścieżka pod spodem — łatwiejsze trafienie palcem na mobile */}
              <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
              <path d={d} fill="none" stroke={color} strokeWidth={highlightEntry === s.entry ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
              {last && <circle cx={x(last.gw)} cy={y(last.value)} r={highlightEntry === s.entry ? 4 : 3} fill={color} />}
            </g>
          );
        })}
      </svg>

      {/* legenda pod wykresem — tappable, główny sposób wyróżnienia managera na telefonie
          (linie na wykresie też reagują na tap, ale legenda to pewniejszy, większy cel dotyku) */}
      <div className="seasonchart-legend">
        {visible.map(s => {
          const idx = series.findIndex(o => o.entry === s.entry);
          const isHighlighted = highlightEntry === s.entry;
          return (
            <button
              key={s.entry}
              type="button"
              className={`seasonchart-legend-item${isHighlighted ? ' is-active' : ''}`}
              onClick={() => onToggleHighlight(isHighlighted ? null : s.entry)}
            >
              <span className="seasonchart-legend-dot" style={{ background: colorFor(idx) }} />
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
