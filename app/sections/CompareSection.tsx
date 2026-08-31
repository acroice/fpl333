'use client';
import React from 'react';
import type { LeagueEntry, GwPoint, SquadData, SquadPlayer } from '../lib/types';
import { PlayerAvatar, ClubBadge } from '../components/shared';

type Props = {
  league: LeagueEntry[];
  gwPoints: Record<number, GwPoint[]>;
  squadCache: Record<number, SquadData>;
  squadLoading: Record<number, boolean>;
  squadErrors: Record<number, string | null>;
  compareA: number | null;
  compareB: number | null;
  selectCompare: (slot: 'A' | 'B', entry: number | null) => void;
};

// "⚔️ Porównaj" — dawny showCompare panel z page.tsx przeniesiony 1:1 (wybór managerów, diff
// składów, Top różnicowy, suma różnic — logika bez zmian), plus nowy pasek statystyk obok
// siebie i sekcja H2H. Oba dodatki liczone w całości z danych już na froncie (league, gwPoints
// wzbogacone o cost) — zero nowych zapytań do FPL.
export default function CompareSection({
  league, gwPoints, squadCache, squadLoading, squadErrors, compareA, compareB, selectCompare,
}: Props) {
  const entryA = compareA != null ? league.find(e => e.entry === compareA) : undefined;
  const entryB = compareB != null ? league.find(e => e.entry === compareB) : undefined;

  return (
    <section className="card">
      <div className="headline">⚔️ Porównaj</div>
      <div className="small" style={{ marginBottom: 14 }}>Wybierz dwóch managerów, żeby zobaczyć pełne porównanie.</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select
          value={compareA ?? ''}
          onChange={e => selectCompare('A', e.target.value ? Number(e.target.value) : null)}
          className="compare-select"
        >
          <option value="">Manager A…</option>
          {league.map(e => (
            <option key={e.entry} value={e.entry}>{e.player_name} ({e.entry_name})</option>
          ))}
        </select>
        <span style={{ color: 'var(--muted)' }}>vs</span>
        <select
          value={compareB ?? ''}
          onChange={e => selectCompare('B', e.target.value ? Number(e.target.value) : null)}
          className="compare-select"
        >
          <option value="">Manager B…</option>
          {league.map(e => (
            <option key={e.entry} value={e.entry}>{e.player_name} ({e.entry_name})</option>
          ))}
        </select>
      </div>

      {compareA == null || compareB == null ? (
        <div className="small">Wybierz dwóch managerów, żeby porównać ich statystyki i składy.</div>
      ) : compareA === compareB ? (
        <div className="small">Wybierz dwóch różnych managerów.</div>
      ) : !entryA || !entryB ? (
        <div className="small">Brak danych</div>
      ) : (() => {
        const gwA = gwPoints[compareA] || [];
        const gwB = gwPoints[compareB] || [];

        // pasek statystyk obok siebie — total/rank z league, reszta z gwPoints (już wzbogaconych
        // o cost przy okazji poprzedniej zmiany), więc żadnych dodatkowych zapytań
        const statsFor = (entry: LeagueEntry, gw: GwPoint[]) => {
          const played = gw.filter(g => g.gw > 0);
          const bestGw = played.length ? played.reduce((b, g) => (g.pts > b.pts ? g : b)) : null;
          const worstGw = played.length ? played.reduce((w, g) => (g.pts < w.pts ? g : w)) : null;
          const totalCost = played.reduce((s, g) => s + g.cost, 0);
          const avg = played.length ? played.reduce((s, g) => s + g.pts, 0) / played.length : 0;
          return {
            total: entry.total,
            rank: entry.rank,
            bestGw,
            worstGw,
            totalCost,
            avg,
          };
        };
        const statsA = statsFor(entryA, gwA);
        const statsB = statsFor(entryB, gwB);

        // H2H — każda rozegrana GW to bezpośredni pojedynek: kto zdobył więcej pkt tej GW,
        // wygrywa; remis punktowy = draw. Liczone tylko dla GW, które obaj rozegrali.
        const gwMapB = new Map(gwB.map(g => [g.gw, g]));
        const h2hRows = gwA
          .filter(g => gwMapB.has(g.gw))
          .map(g => {
            const b = gwMapB.get(g.gw)!;
            const diff = g.pts - b.pts;
            return { gw: g.gw, ptsA: g.pts, ptsB: b.pts, result: diff > 0 ? 'A' : diff < 0 ? 'B' : 'draw', diff };
          })
          .sort((x, y) => x.gw - y.gw);
        const winsA = h2hRows.filter(r => r.result === 'A').length;
        const winsB = h2hRows.filter(r => r.result === 'B').length;
        const draws = h2hRows.filter(r => r.result === 'draw').length;

        const totalA = statsA.total;
        const totalB = statsB.total;
        const totalDiff = totalA - totalB;

        const sqA = squadCache[compareA];
        const sqB = squadCache[compareB];

        return (
          <>
            {/* pasek statystyk obok siebie */}
            <div className="comparestats">
              <div className="comparestats-col">
                <div className="comparestats-name">{entryA.player_name}</div>
                <div className="comparestats-row"><span>Total</span><b>{statsA.total}</b></div>
                <div className="comparestats-row"><span>Rank</span><b>#{statsA.rank}</b></div>
                <div className="comparestats-row"><span>Best GW</span><b>{statsA.bestGw ? `${statsA.bestGw.pts} (GW${statsA.bestGw.gw})` : '—'}</b></div>
                <div className="comparestats-row"><span>Worst GW</span><b>{statsA.worstGw ? `${statsA.worstGw.pts} (GW${statsA.worstGw.gw})` : '—'}</b></div>
                <div className="comparestats-row"><span>Minusowe pkt</span><b>-{statsA.totalCost}</b></div>
                <div className="comparestats-row"><span>Śr. pkt/GW</span><b>{statsA.avg.toFixed(1)}</b></div>
              </div>
              <div className="comparestats-col">
                <div className="comparestats-name">{entryB.player_name}</div>
                <div className="comparestats-row"><span>Total</span><b>{statsB.total}</b></div>
                <div className="comparestats-row"><span>Rank</span><b>#{statsB.rank}</b></div>
                <div className="comparestats-row"><span>Best GW</span><b>{statsB.bestGw ? `${statsB.bestGw.pts} (GW${statsB.bestGw.gw})` : '—'}</b></div>
                <div className="comparestats-row"><span>Worst GW</span><b>{statsB.worstGw ? `${statsB.worstGw.pts} (GW${statsB.worstGw.gw})` : '—'}</b></div>
                <div className="comparestats-row"><span>Minusowe pkt</span><b>-{statsB.totalCost}</b></div>
                <div className="comparestats-row"><span>Śr. pkt/GW</span><b>{statsB.avg.toFixed(1)}</b></div>
              </div>
            </div>

            {totalDiff !== 0 ? (
              <div className="leadbadge" style={{ margin: '10px 0' }}>
                {totalDiff > 0 ? entryA.player_name : entryB.player_name} prowadzi o {Math.abs(totalDiff)} pkt
              </div>
            ) : (
              <div className="leadbadge leadbadge--neutral" style={{ margin: '10px 0' }}>remis w total</div>
            )}

            {/* H2H */}
            {h2hRows.length > 0 && (
              <div style={{ marginTop: 6, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>H2H</div>
                <div className="h2hscore">
                  <span>{entryA.player_name}</span>
                  <span className="h2hscore-num">{winsA} — {winsB}</span>
                  <span>{entryB.player_name}</span>
                </div>
                {draws > 0 && <div className="small" style={{ textAlign: 'center', marginTop: 2 }}>remisów: {draws}</div>}
                <div className="h2hlist">
                  {h2hRows.map(r => (
                    <div key={r.gw} className="h2hlist-row">
                      <span className="small">GW{r.gw}</span>
                      <span>
                        {r.result === 'draw'
                          ? `remis ${r.ptsA}–${r.ptsB}`
                          : r.result === 'A'
                            ? `${entryA.player_name} +${r.diff}`
                            : `${entryB.player_name} +${Math.abs(r.diff)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* diff składów w bieżącej kolejce — dawna logika, bez zmian */}
            {squadLoading[compareA] || squadLoading[compareB] ? (
              <div className="small">Ładowanie składów…</div>
            ) : squadErrors[compareA] || squadErrors[compareB] ? (
              <div className="small" style={{ color: '#ff9b9b' }}>{squadErrors[compareA] || squadErrors[compareB]}</div>
            ) : !sqA || !sqB ? (
              <div className="small">Brak danych składu w bieżącej kolejce</div>
            ) : (() => {
              const bElements = new Set(sqB.squad.map(p => p.element));
              const aElements = new Set(sqA.squad.map(p => p.element));

              const onlyA = sqA.squad.filter(p => !bElements.has(p.element)).sort((a, b) => b.total - a.total);
              const onlyB = sqB.squad.filter(p => !aElements.has(p.element)).sort((a, b) => b.total - a.total);
              const commonCount = sqA.squad.length - onlyA.length;
              const capA = sqA.squad.find(p => p.isCaptain);
              const capB = sqB.squad.find(p => p.isCaptain);

              const onlyASum = onlyA.reduce((sum, p) => sum + p.total, 0);
              const onlyBSum = onlyB.reduce((sum, p) => sum + p.total, 0);
              const diffSwing = onlyASum - onlyBSum;

              // suma RAW punktów zostawionych na ławce (multiplier===0, nie p.total — ten dla
              // ławki i tak jest zawsze 0) — czysto informacyjne, do porównania "kto lepiej trzymał
              // ławkę", tak jak "Ławka: X pkt" w drilldownie składu w Lidze
              const benchSumA = sqA.squad.filter(p => p.multiplier === 0).reduce((sum, p) => sum + p.points, 0);
              const benchSumB = sqB.squad.filter(p => p.multiplier === 0).reduce((sum, p) => sum + p.points, 0);

              const topDiff = [...onlyA, ...onlyB].sort((a, b) => b.total - a.total)[0] ?? null;
              const topDiffOwner = topDiff && onlyA.includes(topDiff) ? sqA.playerName : sqB.playerName;

              const renderSquad = (rows: SquadPlayer[], otherElements: Set<number>) =>
                [...rows]
                  .sort((a, b) => b.total - a.total)
                  .map(p => {
                    const isDiff = !otherElements.has(p.element);
                    // liczy się do wyniku, jeśli multiplier>0 — dla ławki (i wypadniętych z autosubu)
                    // p.total jest zawsze 0, więc pokazujemy RAW punkty (p.points), które faktycznie
                    // zdobyli, tylko oznaczone jako "nie liczy się" (jak w drilldownie w Lidze)
                    const counted = p.multiplier > 0;
                    const displayPts = counted ? p.total : p.points;
                    return (
                      <div key={p.element} className="squadplayer" style={isDiff ? undefined : { opacity: 0.4 }}>
                        <span className="squadplayer-name">
                          <PlayerAvatar src={p.photoUrl} alt={p.name} />
                          <span className="pill">{p.position}</span>
                          {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} /> ({p.team})
                          {p.isCaptain && ' (C)'}
                          {p.isBench && <span className="subbadge" title="Na ławce">ław.</span>}
                        </span>
                        <span>
                          {displayPts} pkt
                          <span className={`countmark ${counted ? 'countmark--on' : 'countmark--off'}`} title={counted ? 'Liczy się do wyniku' : 'Nie liczy się do wyniku (ławka)'}>
                            {counted ? '✓' : '–'}
                          </span>
                        </span>
                      </div>
                    );
                  });

              return (
                <div className="small">
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>
                    Skład w bieżącej kolejce (GW{sqA.gw})
                  </div>

                  {topDiff && (
                    <div className="statchip statchip--special" style={{ marginBottom: 10 }}>
                      <span className="statchip-icon">🎯</span>
                      <span className="statchip-text">
                        <span className="statchip-label">Top różnicowy</span>
                        <span className="statchip-value">
                          {topDiff.name} <span className="small">({topDiff.team})</span> · <b>{topDiff.total} pkt</b> — tylko u {topDiffOwner}
                        </span>
                      </span>
                    </div>
                  )}

                  <div style={{ marginBottom: 6 }}>
                    Ławka: <strong>{sqA.playerName}</strong>: {benchSumA} pkt
                    {' '}vs{' '}
                    <strong>{sqB.playerName}</strong>: {benchSumB} pkt
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    Kapitan: <strong>{sqA.playerName}</strong>: {capA ? `${capA.name} · ${capA.total} pkt` : '—'}
                    {' '}vs{' '}
                    <strong>{sqB.playerName}</strong>: {capB ? `${capB.name} · ${capB.total} pkt` : '—'}
                  </div>

                  <div className="qgrid">
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>
                        {sqA.playerName} — różnic: {onlyA.length} · suma: {onlyASum} pkt
                      </div>
                      {renderSquad(sqA.squad, bElements)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>
                        {sqB.playerName} — różnic: {onlyB.length} · suma: {onlyBSum} pkt
                      </div>
                      {renderSquad(sqB.squad, aElements)}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--muted)' }}>Różnica z różnic składu:</span>
                    {diffSwing !== 0 ? (
                      <span className="leadbadge">
                        {diffSwing > 0 ? sqA.playerName : sqB.playerName} +{Math.abs(diffSwing)} pkt
                      </span>
                    ) : (
                      <span className="leadbadge leadbadge--neutral">bez przewagi</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, color: 'var(--muted)' }}>
                    Wspólnych zawodników: {commonCount}
                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}
    </section>
  );
}
