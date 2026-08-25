'use client';
import React from 'react';
import type { LeagueEntry, GwPoint, CaptainInfo, TeamInfo, ChipInfo, SquadData, Awards } from '../lib/types';
import { PlayerAvatar, ClubBadge, Sparkline, chipIcon, computeForm } from '../components/shared';

type SortKey = 'rank' | 'total' | 'gw' | 'currentQ' | 'wins';

type Props = {
  leagueName: string;
  participants: number;
  league: LeagueEntry[];
  sortedLeague: LeagueEntry[];
  preSeason: boolean;
  loading: boolean;
  error: string | null;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  toggleSort: (col: SortKey) => void;
  sortArrow: (col: SortKey) => string;
  currentScoreLabel: string;
  currentScores: Record<number, number>;
  currentHits: Record<number, number>;
  qWins: Record<number, number>;
  latestChip: Record<number, ChipInfo | null>;
  captainInfo: Record<number, CaptainInfo>;
  teamInfo: Record<number, TeamInfo>;
  gwPoints: Record<number, GwPoint[]>;
  openManagerEntry: number | null;
  toggleManager: (entry: number) => void;
  squadCache: Record<number, SquadData>;
  squadLoading: Record<number, boolean>;
  squadErrors: Record<number, string | null>;
  useProjection: Record<number, boolean>;
  setUseProjection: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  downloadCsv: () => void;
  awards: Awards | null;
};

// "🏠 Liga" — landing page. Tabela ligi + drill-down to dawny główny widok page.tsx, przeniesiony
// 1:1 (logika sortowania/drill-downu bez zmian). GW Center jest nowy, ale liczony wyłącznie z
// `league` (rank/last_rank/event_total), które i tak mamy — zero nowych zapytań.
export default function LeagueSection({
  leagueName, participants, league, sortedLeague, preSeason, loading, error,
  sortKey, sortDir, toggleSort, sortArrow,
  currentScoreLabel, currentScores, currentHits, qWins,
  latestChip, captainInfo, teamInfo, gwPoints,
  openManagerEntry, toggleManager, squadCache, squadLoading, squadErrors,
  useProjection, setUseProjection, downloadCsv, awards,
}: Props) {
  // GW Center: best/worst już mamy z awards; awans/spadek w NASZEJ lidze i średnia liczone
  // z `league` (rank vs last_rank — to samo źródło co strzałki ▲▼ w tabeli)
  const gwCenter = React.useMemo(() => {
    if (!league.length) return null;
    const withDelta = league
      .filter(e => e.last_rank > 0 && e.last_rank !== e.rank)
      .map(e => ({ ...e, delta: e.last_rank - e.rank })); // dodatnie = awans
    const climber = withDelta.length ? withDelta.reduce((b, e) => (e.delta > b.delta ? e : b)) : null;
    const faller = withDelta.length ? withDelta.reduce((w, e) => (e.delta < w.delta ? e : w)) : null;
    const avg = league.reduce((s, e) => s + e.event_total, 0) / league.length;
    return { climber, faller, avg };
  }, [league]);

  return (
    <section className="card">
      <div
        className="headline"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: '8px', columnGap: '12px' }}
      >
        <div>
          {leagueName || 'Planowane składy'}{' '}
          <span className="small">uczestnicy: {participants}</span>
        </div>
        <button
          onClick={downloadCsv}
          style={{ background: '#0f2029', border: '1px solid #16313f', borderRadius: '6px', color: '#9fd9ff', fontSize: '12px', padding: '6px 10px', cursor: 'pointer' }}
        >
          Eksportuj CSV
        </button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div className="small" style={{ color: '#ff9b9b' }}>{error}</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('rank')}># {sortArrow('rank')}</th>
                <th>Manager</th>
                <th>Team</th>
                <th title="Kapitan w bieżącej kolejce">Kapitan</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('total')}>Total {sortArrow('total')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('gw')}>GW Pts {sortArrow('gw')}</th>
                <th title="Trend z rozegranych kolejek">Forma</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('currentQ')}>{currentScoreLabel} {sortArrow('currentQ')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('wins')}>Quarter wins {sortArrow('wins')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeague.map((e, idx) => {
                const isOpenManager = openManagerEntry === e.entry;
                const chip = latestChip[e.entry];
                const squad = squadCache[e.entry];
                const ptsHistory = (gwPoints[e.entry] || []).map(g => g.pts);
                const form = computeForm(ptsHistory);
                const captain = captainInfo[e.entry];

                return (
                  <React.Fragment key={e.entry}>
                    <tr onClick={() => toggleManager(e.entry)} style={{ cursor: 'pointer' }} title="Kliknij, żeby zobaczyć skład w bieżącej kolejce">
                      <td>
                        {preSeason ? idx + 1 : e.rank}
                        {!preSeason && e.last_rank > 0 && e.last_rank !== e.rank && (
                          e.rank < e.last_rank ? (
                            <span className="rankup" title={`Poprzednio: ${e.last_rank}`}> ▲{e.last_rank - e.rank}</span>
                          ) : (
                            <span className="rankdown" title={`Poprzednio: ${e.last_rank}`}> ▼{e.rank - e.last_rank}</span>
                          )
                        )}
                      </td>
                      <td>
                        {e.player_name}
                        <span className="qchevron">{isOpenManager ? '▲' : '▼'}</span>
                      </td>
                      <td>
                        {e.entry_name}
                        {chip && (
                          <span className="chipbadge" title={chip.name || chip.label}>
                            {chipIcon(chip.code)} {chip.label}
                          </span>
                        )}
                        {teamInfo[e.entry] && (
                          <div
                            className="small teaminfo"
                            title={
                              teamInfo[e.entry].transfersCost > 0
                                ? `FT: transfery w tej kolejce (-${teamInfo[e.entry].transfersCost} pkt) • TV: wartość drużyny • PLD: ilu z liczącego się składu (${teamInfo[e.entry].playedTotal}) faktycznie zagrało`
                                : `FT: transfery w tej kolejce • TV: wartość drużyny • PLD: ilu z liczącego się składu (${teamInfo[e.entry].playedTotal}) faktycznie zagrało`
                            }
                          >
                            FT {teamInfo[e.entry].transfers} · TV £{(teamInfo[e.entry].value / 10).toFixed(1)}m · PLD {teamInfo[e.entry].played}/{teamInfo[e.entry].playedTotal}
                          </div>
                        )}
                      </td>
                      <td>
                        {captain ? (
                          <span className="squadplayer-name" title={`${captain.name} — ${captain.points} pkt`}>
                            <PlayerAvatar src={captain.photoUrl} alt={captain.name} />
                            {captain.name}
                          </span>
                        ) : (
                          <span className="small">—</span>
                        )}
                      </td>
                      <td>{e.total}</td>
                      <td>{e.event_total}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Sparkline points={ptsHistory} />
                          {form === 'up' && <span className="formtrend formtrend--up" title="Forma w górę (ostatnie kolejki powyżej wcześniejszej średniej)">▲</span>}
                          {form === 'down' && <span className="formtrend formtrend--down" title="Forma w dół (ostatnie kolejki poniżej wcześniejszej średniej)">▼</span>}
                          {form === 'flat' && <span className="formtrend formtrend--flat" title="Stabilna forma">→</span>}
                        </span>
                      </td>
                      <td>
                        {currentScores[e.entry] ?? 0}
                        {(currentHits[e.entry] ?? 0) > 0 && (
                          <span className="hitbadge" title={`Minusowe pkt (transfery ponad darmowy limit) w ${currentScoreLabel}: -${currentHits[e.entry]} pkt (${currentHits[e.entry] / 4} × -4 za transfer ponad limit)`}>
                            ⚡-{currentHits[e.entry]}
                          </span>
                        )}
                      </td>
                      <td>{qWins[e.entry] ? '🏆'.repeat(qWins[e.entry]) : ''}</td>
                    </tr>

                    {isOpenManager && (
                      <tr>
                        <td colSpan={9} style={{ background: 'rgba(255,255,255,0.015)' }}>
                          {squadLoading[e.entry] ? (
                            <div className="small">Ładowanie składu…</div>
                          ) : squadErrors[e.entry] ? (
                            <div className="small" style={{ color: '#ff9b9b' }}>{squadErrors[e.entry]}</div>
                          ) : !squad ? (
                            <div className="small">Brak danych</div>
                          ) : (() => {
                            const showingProjected = squad.hasProjection && (useProjection[e.entry] ?? true);
                            const displaySquad = showingProjected && squad.projectedSquad ? squad.projectedSquad : squad.squad;
                            const displayTotal = showingProjected && squad.projectedTotal != null ? squad.projectedTotal : squad.entryHistory.points;
                            const benchRawPoints = displaySquad.filter(p => p.isBench).reduce((sum, p) => sum + p.points, 0);

                            return (
                              <div className="small" style={{ lineHeight: 1.5 }}>
                                <div style={{ marginBottom: 8 }}>
                                  GW{squad.gw} • Total: <strong>{displayTotal} pkt</strong>
                                  {showingProjected && <span className="chipbadge" title="Projekcja na podstawie danych live — FPL policzy to oficjalnie po zamknięciu kolejki">🔮 projekcja</span>}
                                  {' • '}Transfery: {squad.entryHistory.eventTransfers}
                                  {squad.entryHistory.eventTransfersCost > 0 && ` (-${squad.entryHistory.eventTransfersCost} pkt)`}
                                  {' • '}Ławka: {benchRawPoints} pkt
                                  {' • '}Wartość: £{(squad.entryHistory.value / 10).toFixed(1)}m
                                  {squad.activeChip && (
                                    <span className="chipbadge" title={squad.activeChip.name}>
                                      {chipIcon(squad.activeChip.code)} {squad.activeChip.label}
                                    </span>
                                  )}
                                  {squad.hasProjection && (
                                    <span className="viewswitch" role="group" aria-label="Widok składu: jak wybrany czy z projekcją autosubów" title="Ktoś w tym składzie na pewno nie zagrał (mecz się skończył) — przełącz między projekcją autosubów a surowym wyborem">
                                      <span className="viewswitch-thumb" style={{ transform: showingProjected ? 'translateX(100%)' : 'translateX(0)' }} />
                                      <button onClick={() => setUseProjection(prev => ({ ...prev, [e.entry]: false }))} className={`viewswitch-option${!showingProjected ? ' is-active' : ''}`}>Wybrany</button>
                                      <button onClick={() => setUseProjection(prev => ({ ...prev, [e.entry]: true }))} className={`viewswitch-option${showingProjected ? ' is-active' : ''}`}>🔮 Projekcja</button>
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontWeight: 600, marginBottom: 4 }}>Podstawowy skład:</div>
                                {displaySquad.filter(p => !p.isBench).map(p => (
                                  <div key={p.element} className="squadplayer">
                                    <span className="squadplayer-name">
                                      <PlayerAvatar src={p.photoUrl} alt={p.name} />
                                      <span className="pill">{p.position}</span>
                                      {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} /> ({p.team})
                                      {p.isCaptain && ' (C)'}
                                      {p.isViceCaptain && ' (VC)'}
                                      {p.subbedIn && <span className="subbadge" title="Wszedł automatyczną zamianą">↑ wszedł</span>}
                                    </span>
                                    <span>{p.total} pkt · {p.ownershipPct}% EO</span>
                                  </div>
                                ))}

                                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>Ławka:</div>
                                {displaySquad.filter(p => p.isBench).map(p => (
                                  <div key={p.element} className="squadplayer" style={{ opacity: p.multiplier > 0 ? 1 : 0.65 }}>
                                    <span className="squadplayer-name">
                                      <PlayerAvatar src={p.photoUrl} alt={p.name} />
                                      <span className="pill">{p.position}</span>
                                      {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} /> ({p.team})
                                      {p.subbedOut && <span className="subbadge" title="Wypadł automatyczną zamianą (nie zagrał)">↓ wypadł</span>}
                                    </span>
                                    <span>
                                      {p.points} pkt
                                      <span className={`countmark ${p.multiplier > 0 ? 'countmark--on' : 'countmark--off'}`} title={p.multiplier > 0 ? 'Liczy się do wyniku' : 'Nie liczy się do wyniku (ławka)'}>
                                        {p.multiplier > 0 ? '✓' : '–'}
                                      </span>
                                      {' · '}{p.ownershipPct}% EO
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gwCenter && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #1c2430' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>GW Center</div>
          <div className="gwcenter-grid">
            {awards?.topGun && (
              <div className="record-item">🔥 Best<b>{awards.topGun.points} pkt</b><span className="small">{awards.topGun.player_name}</span></div>
            )}
            {awards?.toughWeek && (
              <div className="record-item">💀 Worst<b>{awards.toughWeek.points} pkt</b><span className="small">{awards.toughWeek.player_name}</span></div>
            )}
            {gwCenter.climber && (
              <div className="record-item">📈 Biggest climber<b>+{gwCenter.climber.delta}</b><span className="small">{gwCenter.climber.player_name}</span></div>
            )}
            {gwCenter.faller && (
              <div className="record-item">📉 Biggest fall<b>{gwCenter.faller.delta}</b><span className="small">{gwCenter.faller.player_name}</span></div>
            )}
            <div className="record-item">⚖️ Średnia ligi<b>{gwCenter.avg.toFixed(1)} pkt</b><span className="small">GW{awards?.gw ?? ''}</span></div>
          </div>
        </div>
      )}

      {awards && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #1c2430' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Ostatnie Awards</div>
          <div className="awardsrow">
            {awards.topGun && (
              <span className="statchip statchip--good" title="Najwyższy wynik w tej kolejce">
                <span className="statchip-icon">🏆</span>
                <span className="statchip-text"><span className="statchip-label">Top Gun</span><span className="statchip-value">{awards.topGun.player_name} · <b>{awards.topGun.points}</b></span></span>
              </span>
            )}
            {awards.toughWeek && (
              <span className="statchip statchip--bad" title="Najniższy wynik w tej kolejce">
                <span className="statchip-icon">📉</span>
                <span className="statchip-text"><span className="statchip-label">Tough Week</span><span className="statchip-value">{awards.toughWeek.player_name} · <b>{awards.toughWeek.points}</b></span></span>
              </span>
            )}
            {awards.chipMaster && (
              <span className="statchip statchip--special" title={awards.chipMaster.bonus != null ? `Punkty zdobyte dzięki chipowi ${awards.chipMaster.chip?.label} (nie total z kolejki)` : 'Najlepszy wynik z zagranym chipem (dla tego chipa nie da się policzyć samego zysku)'}>
                <span className="statchip-icon">🏅</span>
                <span className="statchip-text">
                  <span className="statchip-label">Chip Master · {awards.chipMaster.chip?.label}</span>
                  <span className="statchip-value">{awards.chipMaster.player_name} · <b>{awards.chipMaster.bonus != null ? `+${awards.chipMaster.bonus} z chipa` : `${awards.chipMaster.points} pkt`}</b></span>
                </span>
              </span>
            )}
            {awards.noChipWarrior && (
              <span className="statchip statchip--neutral" title="Najlepszy wynik bez chipa">
                <span className="statchip-icon">🛡️</span>
                <span className="statchip-text"><span className="statchip-label">No-Chip Warrior</span><span className="statchip-value">{awards.noChipWarrior.player_name} · <b>{awards.noChipWarrior.points}</b></span></span>
              </span>
            )}
            {awards.valueKing && (
              <span className="statchip statchip--special" title="Najwyższa wartość drużyny">
                <span className="statchip-icon">💰</span>
                <span className="statchip-text"><span className="statchip-label">Value King</span><span className="statchip-value">{awards.valueKing.player_name} · <b>£{((awards.valueKing.value ?? 0) / 10).toFixed(1)}m</b></span></span>
              </span>
            )}
            {awards.rankCrasher && (
              <span className="statchip statchip--bad" title="Największy spadek w rankingu ogólnym FPL vs poprzednia kolejka">
                <span className="statchip-icon">🔻</span>
                <span className="statchip-text"><span className="statchip-label">Rank Crasher</span><span className="statchip-value">{awards.rankCrasher.player_name} · <b>-{awards.rankCrasher.rankChange?.toLocaleString('pl')}</b></span></span>
              </span>
            )}
            {awards.bestCaptain && (
              <span className="statchip statchip--good" title={`Zagrał innego kapitana niż większość ligi (${awards.bestCaptain.templateCaptainName}, ${awards.bestCaptain.templateCaptainPts} pkt) i wygrał`}>
                <span className="statchip-icon">🧠</span>
                <span className="statchip-text"><span className="statchip-label">Best Captain</span><span className="statchip-value">{awards.bestCaptain.player_name} · <b>{awards.bestCaptain.captainName} {awards.bestCaptain.captainPts}</b></span></span>
              </span>
            )}
          </div>
          <div className="small" style={{ color: 'var(--muted)', marginTop: 10 }}>
            Wkrótce: Manager GW, Bench Disaster, Captain Masterclass, Transfer of the Week, Fraud of the Week.
          </div>
        </div>
      )}
    </section>
  );
}
