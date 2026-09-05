'use client';
import React from 'react';
import type { LeagueEntry, GwPoint } from '../lib/types';
import SeasonChart, { type ChartSeries } from '../components/SeasonChart';
import { StatModule } from '../components/shared';

type Props = {
  league: LeagueEntry[];
  gwPoints: Record<number, GwPoint[]>;
  entryIndex: Record<number, { manager: string; team: string }>;
};

// "📊 Sezon" — całkowicie nowa sekcja. Wszystko liczone klient-side z gwPoints (już na froncie
// od pierwszego załadowania strony), zero nowych zapytań do FPL. Jeden SeasonChart obsługuje
// oba tryby (Ranking = bump chart pozycji w lidze, Punkty = cumulative total), bo wizualnie to
// ta sama siatka — różni się tylko to, co liczymy jako wartość Y (patrz komentarz przy chart).
// Oba bloki (wykres, rekordy) w StatModule — ten sam wizualny język co Statystyki (współdzielony
// z components/shared.tsx), żeby obie zakładki wyglądały jak część jednej, spójnej appki.
export default function SeasonSection({ league, gwPoints, entryIndex }: Props) {
  const [mode, setMode] = React.useState<'rank' | 'points'>('rank');
  const [filter, setFilter] = React.useState<'all' | 'top3' | 'manager'>('all');
  const [manualManager, setManualManager] = React.useState<number | null>(null);
  const [highlightEntry, setHighlightEntry] = React.useState<number | null>(null);

  const entries = React.useMemo(() => Object.keys(gwPoints).map(Number), [gwPoints]);

  // cumulative total points per manager per GW — baza dla obu trybów wykresu i rekordów
  const cumulative = React.useMemo(() => {
    const out: Record<number, { gw: number; value: number }[]> = {};
    for (const entry of entries) {
      let sum = 0;
      out[entry] = [...(gwPoints[entry] || [])]
        .sort((a, b) => a.gw - b.gw)
        .map(g => {
          sum += g.pts;
          return { gw: g.gw, value: sum };
        });
    }
    return out;
  }, [entries, gwPoints]);

  // ranking w LIDZE (nie ogólny FPL) na każdą kolejkę — wyprowadzony z cumulative: kto ma
  // wyższy total po danej GW, jest wyżej. To liczba, której FPL nie daje wprost dla mini-lig.
  const rankHistory = React.useMemo(() => {
    const out: Record<number, { gw: number; value: number }[]> = {};
    for (const entry of entries) out[entry] = [];
    const allGws = Array.from(new Set(entries.flatMap(e => cumulative[e].map(p => p.gw)))).sort((a, b) => a - b);
    for (const gw of allGws) {
      const rows = entries
        .map(entry => ({ entry, value: cumulative[entry].find(p => p.gw === gw)?.value }))
        .filter((r): r is { entry: number; value: number } => r.value != null)
        .sort((a, b) => b.value - a.value);
      rows.forEach((r, i) => out[r.entry].push({ gw, value: i + 1 }));
    }
    return out;
  }, [entries, cumulative]);

  const series: ChartSeries[] = React.useMemo(
    () => entries.map(entry => ({
      entry,
      name: entryIndex[entry]?.manager ?? '—',
      team: entryIndex[entry]?.team ?? '—',
      points: mode === 'rank' ? rankHistory[entry] : cumulative[entry],
    })),
    [entries, entryIndex, mode, rankHistory, cumulative]
  );

  const top3Entries = React.useMemo(
    () => [...league].sort((a, b) => a.rank - b.rank).slice(0, 3).map(e => e.entry),
    [league]
  );

  const visibleEntries = React.useMemo(() => {
    if (filter === 'top3') return new Set(top3Entries);
    if (filter === 'manager' && manualManager != null) return new Set([manualManager]);
    return new Set(entries);
  }, [filter, top3Entries, manualManager, entries]);

  // Rekordy sezonu (Hall of Fame) — z tych samych danych co wykres
  const records = React.useMemo(() => {
    let highest: { entry: number; gw: number; pts: number } | null = null;
    let lowest: { entry: number; gw: number; pts: number } | null = null;
    for (const entry of entries) {
      for (const g of gwPoints[entry] || []) {
        if (!highest || g.pts > highest.pts) highest = { entry, gw: g.gw, pts: g.pts };
        if (!lowest || g.pts < lowest.pts) lowest = { entry, gw: g.gw, pts: g.pts };
      }
    }

    let biggestClimb: { entry: number; gw: number; delta: number } | null = null;
    let biggestFall: { entry: number; gw: number; delta: number } | null = null;
    let longestStreak: { entry: number; length: number } | null = null;
    for (const entry of entries) {
      const rows = rankHistory[entry];
      let streak = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].value === 1) {
          streak++;
          if (!longestStreak || streak > longestStreak.length) longestStreak = { entry, length: streak };
        } else {
          streak = 0;
        }
        if (i > 0) {
          const delta = rows[i - 1].value - rows[i].value; // dodatnie = awans (mniejsza liczba = wyżej)
          if (!biggestClimb || delta > biggestClimb.delta) biggestClimb = { entry, gw: rows[i].gw, delta };
          if (!biggestFall || delta < biggestFall.delta) biggestFall = { entry, gw: rows[i].gw, delta };
        }
      }
    }

    // największa przewaga lidera nad 2. miejscem, w dowolnej kolejce
    let biggestGap: { gw: number; entry: number; gap: number } | null = null;
    const allGws = Array.from(new Set(entries.flatMap(e => cumulative[e].map(p => p.gw)))).sort((a, b) => a - b);
    for (const gw of allGws) {
      const rows = entries
        .map(entry => ({ entry, value: cumulative[entry].find(p => p.gw === gw)?.value }))
        .filter((r): r is { entry: number; value: number } => r.value != null)
        .sort((a, b) => b.value - a.value);
      if (rows.length >= 2) {
        const gap = rows[0].value - rows[1].value;
        if (!biggestGap || gap > biggestGap.gap) biggestGap = { gw, entry: rows[0].entry, gap };
      }
    }

    return { highest, lowest, biggestClimb, biggestFall, longestStreak, biggestGap };
  }, [entries, gwPoints, rankHistory, cumulative]);

  const name = (entry: number) => entryIndex[entry]?.manager ?? '—';

  return (
    <section className="card">
      <div className="headline">📊 Sezon</div>
      <div className="small" style={{ marginBottom: 16 }}>Jak rozwijała się sytuacja w lidze od początku sezonu.</div>

      <StatModule icon="📈" tone="neutral" title="Trend sezonu" subtitle="Ranking w lidze albo suma punktów, kolejka po kolejce">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span className="viewswitch" role="group" aria-label="Tryb wykresu">
            <span className="viewswitch-thumb" style={{ transform: mode === 'points' ? 'translateX(100%)' : 'translateX(0)' }} />
            <button className={`viewswitch-option${mode === 'rank' ? ' is-active' : ''}`} onClick={() => setMode('rank')}>Ranking</button>
            <button className={`viewswitch-option${mode === 'points' ? ' is-active' : ''}`} onClick={() => setMode('points')}>Punkty</button>
          </span>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`toggle-btn${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}><span className="dot" />Wszyscy</button>
            <button className={`toggle-btn${filter === 'top3' ? ' is-active' : ''}`} onClick={() => setFilter('top3')}><span className="dot" />Top 3</button>
            <select
              className={`compare-select${filter === 'manager' ? '' : ''}`}
              value={filter === 'manager' && manualManager != null ? manualManager : ''}
              onChange={e => {
                const v = e.target.value ? Number(e.target.value) : null;
                setManualManager(v);
                setFilter(v != null ? 'manager' : 'all');
              }}
            >
              <option value="">Manager…</option>
              {league.map(e => (
                <option key={e.entry} value={e.entry}>{e.player_name}</option>
              ))}
            </select>
          </div>
        </div>

        <SeasonChart
          series={series}
          mode={mode}
          visibleEntries={visibleEntries}
          rankCeiling={league.length}
          highlightEntry={highlightEntry}
          onToggleHighlight={setHighlightEntry}
        />
      </StatModule>

      <StatModule icon="🏅" tone="special" title="Rekordy sezonu" subtitle="Najlepsze i najgorsze momenty tego sezonu">
        <div className="records-grid">
          {records.highest && (
            <div className="record-item record-item--good">
              <span className="record-icon">🔥</span>
              <div className="record-body">
                <span className="record-label">Najwyższy wynik GW</span>
                <span className="record-value">{records.highest.pts} pkt</span>
                <span className="record-sub">{name(records.highest.entry)} · GW{records.highest.gw}</span>
              </div>
            </div>
          )}
          {records.lowest && (
            <div className="record-item record-item--bad">
              <span className="record-icon">💀</span>
              <div className="record-body">
                <span className="record-label">Najniższy wynik GW</span>
                <span className="record-value">{records.lowest.pts} pkt</span>
                <span className="record-sub">{name(records.lowest.entry)} · GW{records.lowest.gw}</span>
              </div>
            </div>
          )}
          {records.biggestClimb && records.biggestClimb.delta > 0 && (
            <div className="record-item record-item--good">
              <span className="record-icon">📈</span>
              <div className="record-body">
                <span className="record-label">Największy awans w GW</span>
                <span className="record-value">+{records.biggestClimb.delta}</span>
                <span className="record-sub">{name(records.biggestClimb.entry)} · GW{records.biggestClimb.gw}</span>
              </div>
            </div>
          )}
          {records.biggestFall && records.biggestFall.delta < 0 && (
            <div className="record-item record-item--bad">
              <span className="record-icon">📉</span>
              <div className="record-body">
                <span className="record-label">Największy spadek w GW</span>
                <span className="record-value">{records.biggestFall.delta}</span>
                <span className="record-sub">{name(records.biggestFall.entry)} · GW{records.biggestFall.gw}</span>
              </div>
            </div>
          )}
          {records.longestStreak && (
            <div className="record-item record-item--special">
              <span className="record-icon">👑</span>
              <div className="record-body">
                <span className="record-label">Najdłuższy streak na #1</span>
                <span className="record-value">{records.longestStreak.length} GW</span>
                <span className="record-sub">{name(records.longestStreak.entry)}</span>
              </div>
            </div>
          )}
          {records.biggestGap && (
            <div className="record-item record-item--special">
              <span className="record-icon">🚀</span>
              <div className="record-body">
                <span className="record-label">Największa przewaga lidera</span>
                <span className="record-value">{records.biggestGap.gap} pkt</span>
                <span className="record-sub">{name(records.biggestGap.entry)} · GW{records.biggestGap.gw}</span>
              </div>
            </div>
          )}
        </div>
      </StatModule>
    </section>
  );
}
