'use client';
import React from 'react';
import type { LeagueEntry, GwPoint, SquadData, SquadPlayer, LeagueOverview } from '../lib/types';
import { PlayerAvatar, ClubBadge } from '../components/shared';

type Props = {
  active: boolean;
  league: LeagueEntry[];
  gwPoints: Record<number, GwPoint[]>;
  squadCache: Record<number, SquadData>;
  squadLoading: Record<number, boolean>;
  squadErrors: Record<number, string | null>;
  compareA: number | null;
  compareB: number | null;
  selectCompare: (slot: 'A' | 'B', entry: number | null) => void;
  loadOverview: () => void;
  overview: LeagueOverview | null;
};

// punkty, które faktycznie się liczą (po mnożniku) — a dla ławki (multiplier=0) surowe punkty,
// które i tak zdobyli, tak jak w drilldownie składu w Lidze
function pointsFor(p: SquadPlayer) {
  return p.multiplier > 0 ? p.total : p.points;
}

// "⚔️ Porównaj" — dawny showCompare panel z page.tsx przeniesiony 1:1 (wybór managerów, diff
// składów, suma różnic — logika bez zmian), plus nowy pasek statystyk obok siebie, sekcja H2H i
// posortowany leaderboard różnicowych zawodników z % obstawy w lidze (z tego samego overview co
// Statystyki — lazy-load przy wejściu w tę zakładkę, idempotentne, więc jeśli ktoś już był w
// Statystykach, nic się nie dubluje).
export default function CompareSection({
  active, league, gwPoints, squadCache, squadLoading, squadErrors, compareA, compareB, selectCompare,
  loadOverview, overview,
}: Props) {
  React.useEffect(() => {
    if (active) loadOverview();
  }, [active, loadOverview]);

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

              // leaderboard różnicowych: obie listy scalone w jedną, posortowane wg realnego wkładu
              // (liczy się/nie liczy uwzględnione przez pointsFor), z tagiem właściciela i — jeśli
              // overview już się doładował (Statystyki albo ta zakładka) — % obstawy w CAŁEJ lidze,
              // nie tylko binarne "ma/nie ma" u porównywanych dwóch
              const differentials = [
                ...onlyA.map(p => ({ ...p, owner: 'A' as const })),
                ...onlyB.map(p => ({ ...p, owner: 'B' as const })),
              ].sort((a, b) => pointsFor(b) - pointsFor(a));

              const renderSquad = (rows: SquadPlayer[], otherElements: Set<number>) =>
                [...rows]
                  .sort((a, b) => b.total - a.total)
                  .map(p => {
                    const isDiff = !otherElements.has(p.element);
                    const counted = p.multiplier > 0;
                    const displayPts = pointsFor(p);
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

                  {differentials.length > 0 && (
                    <div className="diffheadline">
                      <span aria-hidden="true">🎯</span> Różnicowi: <strong>{onlyA.length}</strong> u {sqA.playerName} vs <strong>{onlyB.length}</strong> u {sqB.playerName}
                      {diffSwing !== 0 ? (
                        <span className="leadbadge" style={{ marginLeft: 8 }}>
                          {diffSwing > 0 ? sqA.playerName : sqB.playerName} +{Math.abs(diffSwing)} pkt z różnic
                        </span>
                      ) : (
                        <span className="leadbadge leadbadge--neutral" style={{ marginLeft: 8 }}>bez przewagi z różnic</span>
                      )}
                    </div>
                  )}

                  {differentials.length > 0 && (
                    <div className="diffboard">
                      {differentials.map(p => {
                        const ownerName = p.owner === 'A' ? sqA.playerName : sqB.playerName;
                        const pct = overview?.ownershipPct?.[p.element];
                        const counted = p.multiplier > 0;
                        return (
                          <div key={`${p.owner}-${p.element}`} className="diffboard-row">
                            <span className={`diffboard-owner diffboard-owner--${p.owner.toLowerCase()}`} title={ownerName}>{p.owner}</span>
                            <span className="squadplayer-name">
                              <PlayerAvatar src={p.photoUrl} alt={p.name} />
                              <span className="pill">{p.position}</span>
                              {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} /> ({p.team})
                              {p.isCaptain && ' (C)'}
                            </span>
                            <span className="diffboard-pts">
                              {pointsFor(p)} pkt
                              <span className={`countmark ${counted ? 'countmark--on' : 'countmark--off'}`} title={counted ? 'Liczy się do wyniku' : 'Nie liczy się do wyniku (ławka)'}>
                                {counted ? '✓' : '–'}
                              </span>
                            </span>
                            <span className="diffboard-pct small">{pct != null ? `${pct}% ligi` : '…'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 12, marginBottom: 6 }}>
                    Ławka: <strong>{sqA.playerName}</strong>: {benchSumA} pkt
                    {' '}vs{' '}
                    <strong>{sqB.playerName}</strong>: {benchSumB} pkt
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    Kapitan: <strong>{sqA.playerName}</strong>: {capA ? `${capA.name} · ${capA.total} pkt` : '—'}
                    {' '}vs{' '}
                    <strong>{sqB.playerName}</strong>: {capB ? `${capB.name} · ${capB.total} pkt` : '—'}
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: '16px 0 10px' }}>
                    Pełne składy
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

                  <div style={{ marginTop: 10, color: 'var(--muted)' }}>
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
