'use client';
import React from 'react';
import type { LeagueEntry, GwPoint, TeamInfo, ChipInfo, SquadData, Awards, CaptainInfo, Quarter } from '../lib/types';
import { PlayerAvatar, ClubBadge, chipIcon, quarterStatusKey } from '../components/shared';

type SortKey = 'rank' | 'total' | 'gw';

const QUARTER_STATUS_LABEL: Record<Quarter['status'], string> = {
  trwa: 'LIVE', zakończona: 'ZAKOŃCZONA', wkrótce: 'WKRÓTCE',
};

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
  quarters: Quarter[];
  currentQuarterId: string;
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

// znajdź wszystkie wpisy remisujące o wartość ekstremalną (max/min) — GW Pulse nie może
// arbitralnie wybrać jednej osoby przy remisie
function extremeTied(rows: LeagueEntry[], key: (e: LeagueEntry) => number, mode: 'max' | 'min') {
  if (!rows.length) return { value: 0, entries: [] as LeagueEntry[] };
  const value = mode === 'max' ? Math.max(...rows.map(key)) : Math.min(...rows.map(key));
  return { value, entries: rows.filter(e => key(e) === value) };
}

function namesOf(entries: LeagueEntry[]) {
  return entries.map(e => e.player_name).join(' · ');
}

// "🏠 Liga" — League Center. Landing page odpowiadający w kilka sekund: kto prowadzi, ile
// tracę, kto wygrał GW, kto najbardziej awansował/spadł, jak ciasna jest liga. Tabela zostaje
// najważniejszym elementem (desktop: tabela; mobile: kompaktowe karty rankingu — nie ta sama
// tabela ściśnięta, oba warianty w DOM, CSS/media query przełącza jak w Nav).
export default function LeagueSection({
  leagueName, participants, league, sortedLeague, preSeason, loading, error,
  sortKey, sortDir, toggleSort, sortArrow,
  quarters, currentQuarterId, latestChip, captainInfo, teamInfo, gwPoints,
  openManagerEntry, toggleManager, squadCache, squadLoading, squadErrors,
  useProjection, setUseProjection, downloadCsv, awards,
}: Props) {
  const ready = !loading && !error && !preSeason && league.length > 0;

  // status w headerze liczony z ĆWIARTKI (daty — wiarygodne), nie z FPL "finished" na GW: to
  // pole potrafi zostać false jeszcze długo po tym, jak wszystkie mecze kolejki się skończyły
  // (FPL czeka na potwierdzenie bonusów), więc "GW X LIVE" bywało mylące mimo zakończonej GW
  const currentQuarter = React.useMemo(
    () => quarters.find(q => q.id === currentQuarterId) ?? null,
    [quarters, currentQuarterId]
  );

  // lider (rank #1 wg oficjalnych danych FPL, nie kolejność w sortedLeague — ta może być
  // przesortowana przez usera) — punkt odniesienia dla Gap
  const leader = React.useMemo(() => league.find(e => e.rank === 1) ?? null, [league]);
  const leaderTotal = leader?.total ?? 0;

  // GW Pulse — 4 KPI, wszystkie z tie-aware liczeniem (żeby nie wybierać arbitralnie 1 osoby)
  const pulse = React.useMemo(() => {
    if (!ready) return null;
    const best = extremeTied(league, e => e.event_total, 'max');
    const worst = extremeTied(league, e => e.event_total, 'min');
    const risers = league.filter(e => e.last_rank > 0).map(e => ({ e, delta: e.last_rank - e.rank }));
    const maxDelta = risers.length ? Math.max(...risers.map(r => r.delta)) : 0;
    const bestRise = maxDelta > 0 ? risers.filter(r => r.delta === maxDelta).map(r => r.e) : [];
    const avg = league.reduce((s, e) => s + e.event_total, 0) / league.length;
    return { best, worst, bestRise, riseDelta: maxDelta, avg };
  }, [ready, league]);

  // League Insight — jedna, deterministyczna, priorytetowa reguła. Zero AI, zero losowości.
  // Jeśli żadna reguła nie "strzeli", sekcja się nie renderuje (nie generujemy sztucznych treści).
  const insight = React.useMemo(() => {
    if (!ready) return null;
    const byRank = [...league].sort((a, b) => a.rank - b.rank);
    const cur = byRank[0];

    // 1) zmiana lidera względem poprzedniej GW
    if (cur && cur.last_rank > 1) {
      const prevLeader = league.find(e => e.last_rank === 1);
      const from = prevLeader && prevLeader.entry !== cur.entry ? ` od ${prevLeader.player_name}` : '';
      return { icon: '👑', text: `${cur.player_name} przejmuje prowadzenie${from}` };
    }

    // 2) streak zwycięstw GW: kto miał najlepszy wynik i w tej, i w poprzedniej kolejce
    const prevGw = (awards?.gw ?? 0) - 1;
    if (prevGw >= 1) {
      const prevScores = league
        .map(e => ({ entry: e.entry, pts: gwPoints[e.entry]?.find(g => g.gw === prevGw)?.pts }))
        .filter((r): r is { entry: number; pts: number } => r.pts != null);
      if (prevScores.length) {
        const maxPrev = Math.max(...prevScores.map(r => r.pts));
        const prevWinners = new Set(prevScores.filter(r => r.pts === maxPrev).map(r => r.entry));
        const thisGwTop = extremeTied(league, e => e.event_total, 'max');
        if (thisGwTop.entries.length === 1 && prevWinners.size === 1 && prevWinners.has(thisGwTop.entries[0].entry)) {
          return { icon: '🔥', text: `${thisGwTop.entries[0].player_name} wygrywa drugą kolejkę z rzędu` };
        }
      }
    }

    // 3) duży, jednoznaczny awans (≥3 pozycje, bez remisu na szczycie)
    const risers = league.filter(e => e.last_rank > 0).map(e => ({ e, delta: e.last_rank - e.rank })).filter(r => r.delta >= 3);
    if (risers.length) {
      const top = risers.reduce((b, r) => (r.delta > b.delta ? r : b));
      if (risers.filter(r => r.delta === top.delta).length === 1) {
        return { icon: '📈', text: `${top.e.player_name} awansował z #${top.e.last_rank} na #${top.e.rank}` };
      }
    }

    // 4) ciasna czołówka
    if (byRank.length >= 3) {
      const gap = byRank[0].total - byRank[2].total;
      if (gap > 0 && gap <= 10) {
        return { icon: '⚔️', text: `Tylko ${gap} pkt dzieli TOP3` };
      }
    }

    return null;
  }, [ready, league, gwPoints, awards]);

  const renderDelta = (e: LeagueEntry) => {
    if (preSeason || e.last_rank <= 0 || e.last_rank === e.rank) {
      return <span className="deltarank deltarank--flat">—</span>;
    }
    return e.rank < e.last_rank
      ? <span className="deltarank deltarank--up">↑{e.last_rank - e.rank}</span>
      : <span className="deltarank deltarank--down">↓{e.rank - e.last_rank}</span>;
  };

  const renderGap = (e: LeagueEntry) => {
    if (e.rank === 1) return <span className="gapcell gapcell--leader">LEADER</span>;
    const gap = e.total - leaderTotal; // ≤0
    return <span className="gapcell">{gap}</span>;
  };

  return (
    <section className="card">
      {/* Header: kontekst GW + lider — mały, funkcjonalny, bez hero section */}
      <div className="leaguectx">
        <div className="leaguectx-left">
          <span className="leaguectx-name">{leagueName || 'Planowane składy'}</span>
          <span className="small">uczestnicy: {participants}</span>
        </div>
        {ready && (
          <div className="leaguectx-right">
            {currentQuarter && (
              <span className={`qstatuspill qstatuspill--${quarterStatusKey(currentQuarter.status)}`} title={`${currentQuarter.from} → ${currentQuarter.to}`}>
                <span className="qstatusdot" />
                {currentQuarter.id} · {QUARTER_STATUS_LABEL[currentQuarter.status]}
              </span>
            )}
            {awards?.gw != null && <span className="small">GW {awards.gw}</span>}
            {leader && (
              <span className="small">Lider: <strong style={{ color: 'var(--text)' }}>{leader.player_name}</strong> · {leader.total} pkt</span>
            )}
          </div>
        )}
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
      ) : preSeason ? (
        <div className="small">Sezon jeszcze się nie zaczął — tabela pojawi się po pierwszej kolejce.</div>
      ) : (
        <>
          {/* --- Desktop: tabela --- */}
          <div className="table-scroll leaguetable-desktop">
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('rank')}># {sortArrow('rank')}</th>
                  <th>Manager</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('gw')}>GW {sortArrow('gw')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('total')}>Total {sortArrow('total')}</th>
                  <th title="Zmiana pozycji względem poprzedniej zakończonej GW">Δ Rank</th>
                  <th title="Strata do aktualnego lidera">Gap</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeague.map((e) => {
                  const isOpenManager = openManagerEntry === e.entry;
                  const chip = latestChip[e.entry];
                  const captain = captainInfo[e.entry];
                  const squad = squadCache[e.entry];

                  return (
                    <React.Fragment key={e.entry}>
                      <tr onClick={() => toggleManager(e.entry)} style={{ cursor: 'pointer' }} title="Kliknij, żeby zobaczyć skład w bieżącej kolejce">
                        <td>{e.rank}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {e.player_name}
                            <span className="qchevron">{isOpenManager ? '▲' : '▼'}</span>
                            {chip && (
                              <span className="chipbadge" title={chip.name || chip.label}>
                                {chipIcon(chip.code)} {chip.label}
                              </span>
                            )}
                          </div>
                          <div className="small teaminfo-line">
                            {e.entry_name}
                            {captain && (
                              <span className="small"> · <PlayerAvatar src={captain.photoUrl} alt={captain.name} /> {captain.name}</span>
                            )}
                            {teamInfo[e.entry] && (
                              <span className="teaminfo"> · FT {teamInfo[e.entry].transfers} · TV £{(teamInfo[e.entry].value / 10).toFixed(1)}m · PLD {teamInfo[e.entry].played}/{teamInfo[e.entry].playedTotal}</span>
                            )}
                          </div>
                        </td>
                        <td>{e.event_total}</td>
                        <td><strong>{e.total}</strong></td>
                        <td>{renderDelta(e)}</td>
                        <td>{renderGap(e)}</td>
                      </tr>
                      {isOpenManager && (
                        <tr>
                          <td colSpan={6} style={{ background: 'rgba(255,255,255,0.015)' }}>
                            <SquadDrilldown
                              entry={e.entry}
                              squad={squad}
                              loading={squadLoading[e.entry]}
                              errorMsg={squadErrors[e.entry]}
                              useProjection={useProjection}
                              setUseProjection={setUseProjection}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* --- Mobile: kompaktowe karty rankingu (nie ta sama tabela ściśnięta) --- */}
          <div className="leaguetable-mobile">
            {sortedLeague.map((e) => {
              const isOpenManager = openManagerEntry === e.entry;
              const chip = latestChip[e.entry];
              const captain = captainInfo[e.entry];
              const squad = squadCache[e.entry];

              return (
                <div key={e.entry} className="leaguecard" onClick={() => toggleManager(e.entry)}>
                  <div className="leaguecard-row1">
                    <span className="leaguecard-rank">{e.rank}</span>
                    <span className="leaguecard-manager">
                      {e.player_name}
                      {chip && <span className="chipbadge" title={chip.name || chip.label}>{chipIcon(chip.code)}</span>}
                    </span>
                    <span className="leaguecard-total">{e.total}</span>
                  </div>
                  {captain && (
                    <div className="leaguecard-captain" title={`Kapitan: ${captain.name} — ${captain.points} pkt`}>
                      <PlayerAvatar src={captain.photoUrl} alt={captain.name} />
                      <span>{captain.name}</span>
                    </div>
                  )}
                  <div className="leaguecard-row2">
                    <span>{renderDelta(e)} · GW {e.event_total}</span>
                    <span>{renderGap(e)}</span>
                  </div>
                  {isOpenManager && (
                    <div className="leaguecard-drill" onClick={ev => ev.stopPropagation()}>
                      <SquadDrilldown
                        entry={e.entry}
                        squad={squad}
                        loading={squadLoading[e.entry]}
                        errorMsg={squadErrors[e.entry]}
                        useProjection={useProjection}
                        setUseProjection={setUseProjection}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* GW Pulse — max 4 KPI, tie-aware, 2×2 na mobile */}
      {pulse && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #1c2430' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>GW Pulse</div>
          <div className="gwpulse-grid">
            <div className="gwpulse-item">
              <span className="gwpulse-icon">🔥</span>
              <b>{pulse.best.value}</b>
              <span className="small">{namesOf(pulse.best.entries)}</span>
              <span className="gwpulse-label">Best GW</span>
            </div>
            <div className="gwpulse-item">
              <span className="gwpulse-icon">💀</span>
              <b>{pulse.worst.value}</b>
              <span className="small">{namesOf(pulse.worst.entries)}</span>
              <span className="gwpulse-label">Worst GW</span>
            </div>
            <div className="gwpulse-item">
              <span className="gwpulse-icon">📈</span>
              <b>{pulse.riseDelta > 0 ? `+${pulse.riseDelta}` : '—'}</b>
              <span className="small">{pulse.bestRise.length ? namesOf(pulse.bestRise) : 'brak danych'}</span>
              <span className="gwpulse-label">Biggest Rise</span>
            </div>
            <div className="gwpulse-item">
              <span className="gwpulse-icon">⚡</span>
              <b>{pulse.avg.toFixed(1)}</b>
              <span className="small">pts</span>
              <span className="gwpulse-label">League Average</span>
            </div>
          </div>
        </div>
      )}

      {/* League Insight — jeden deterministyczny wniosek, albo nic */}
      {insight && (
        <div className="insight-banner">
          <span>{insight.icon}</span> {insight.text}
        </div>
      )}

      {/* GW Awards — odchudzone o Top Gun/Tough Week (duplikat GW Pulse Best/Worst) */}
      {awards && (awards.chipMaster || awards.noChipWarrior || awards.valueKing || awards.rankCrasher || awards.bestCaptain) && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #1c2430' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>GW Awards</div>
          <div className="awardsrow">
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
        </div>
      )}
    </section>
  );
}

// Drill-down składu — wydzielony, bo renderuje się identycznie w wersji desktop (wiersz tabeli)
// i mobile (karta). Logika bez zmian względem poprzedniej wersji.
function SquadDrilldown({
  entry, squad, loading, errorMsg, useProjection, setUseProjection,
}: {
  entry: number;
  squad: SquadData | undefined;
  loading: boolean;
  errorMsg: string | null | undefined;
  useProjection: Record<number, boolean>;
  setUseProjection: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}) {
  if (loading) return <div className="small">Ładowanie składu…</div>;
  if (errorMsg) return <div className="small" style={{ color: '#ff9b9b' }}>{errorMsg}</div>;
  if (!squad) return <div className="small">Brak danych</div>;

  const showingProjected = squad.hasProjection && (useProjection[entry] ?? true);
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
            <button onClick={() => setUseProjection(prev => ({ ...prev, [entry]: false }))} className={`viewswitch-option${!showingProjected ? ' is-active' : ''}`}>Wybrany</button>
            <button onClick={() => setUseProjection(prev => ({ ...prev, [entry]: true }))} className={`viewswitch-option${showingProjected ? ' is-active' : ''}`}>🔮 Projekcja</button>
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
}
