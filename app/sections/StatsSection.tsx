'use client';
import React from 'react';
import type { LeagueOverview, GwPoint, ChipHistoryEntry, TeamInfo, TopCaptainPick, SeasonTransferRow } from '../lib/types';
import { PlayerAvatar, ClubBadge, chipIcon, rankBadge, StatModule, barPct, RankFill } from '../components/shared';

type Props = {
  active: boolean;
  loadOverview: () => void;
  overview: LeagueOverview | null;
  overviewLoading: boolean;
  overviewError: string | null;
  entryIndex: Record<number, { manager: string; team: string }>;
  gwPoints: Record<number, GwPoint[]>;
  chipHistory: Record<number, ChipHistoryEntry[]>;
  teamInfo: Record<number, TeamInfo>;
  topCaptainPick: TopCaptainPick;
  transfersHistory: Record<number, SeasonTransferRow[]>;
};

// "🧠 Statystyki" — 6 modułów, w tej kolejności: Captaincy, Ownership, Chips, Bench, Stabilność,
// Transfers. Captaincy i Ownership to dawny "Wgląd w ligę" (showOverview) przeniesiony 1:1, tylko
// rozbity na dwa moduły. Chips/Bench/Stabilność/Transfers są nowsze, liczone w całości z danych,
// które i tak już mamy na froncie (gwPoints wzbogacone, chipHistory, transfersHistory z
// quarter-wins) — zero dodatkowych zapytań z TEGO komponentu do FPL. Chips jest wyżej — bardziej
// angażująca treść (kto zagrał jaki chip) niż Bench/Stabilność/Transfers, więc wyżej w scrollu.
// Transfers (płatne/hity) świadomie na samym końcu — to najbardziej "księgowa"/najmniej
// angażująca treść z całej zakładki. Tam, gdzie danych faktycznie brakuje (historia kapitanów,
// ROI transferów, template ligi), jest jawna notka zamiast zmyślonych liczb.
// Paski tła (RankFill/barPct) w rankingach i wierszach zawodników to jedyna wizualna zmiana ponad
// samą treść — szybki skan "kto ile" bez czytania każdej liczby, w tym samym duchu co pasek
// postępu ćwiartki w Lidze.
export default function StatsSection({
  active, loadOverview, overview, overviewLoading, overviewError,
  entryIndex, gwPoints, chipHistory, teamInfo, topCaptainPick, transfersHistory,
}: Props) {
  React.useEffect(() => {
    if (active) loadOverview();
  }, [active, loadOverview]);

  // "delikatne" opcje rozwinięcia — domyślnie krótsze listy (mniej scrollowania), z możliwością
  // pokazania pełnego rankingu jednym kliknięciem. Najczęściej wybierani i Różnicowi: 6 → 11
  // (backend już zwraca top11, patrz league-overview/route.ts). Bench: 5 → cała liga (tu nic nie
  // ucinamy po stronie API, benchRows liczone niżej z gwPoints, które i tak mamy na froncie).
  const [showAllTopOwned, setShowAllTopOwned] = React.useState(false);
  const [showAllDifferentials, setShowAllDifferentials] = React.useState(false);
  const [showAllBench, setShowAllBench] = React.useState(false);
  const [showAllConsistency, setShowAllConsistency] = React.useState(false);
  // które wiersze w Transfers mają rozwiniętą listę "kto na kogo, w której GW" (per manager)
  const [expandedTransfers, setExpandedTransfers] = React.useState<Record<number, boolean>>({});

  // Transfers: suma minusowych pkt (koszt transferów ponad limit) w całym sezonie per manager
  const transferRows = React.useMemo(() => {
    return Object.entries(gwPoints)
      .map(([entryStr, rows]) => {
        const entry = Number(entryStr);
        const totalCost = rows.reduce((s, g) => s + g.cost, 0);
        return { entry, totalCost, thisGw: teamInfo[entry]?.transfers ?? 0 };
      })
      .filter(r => r.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [gwPoints, teamInfo]);
  const maxTransferCost = transferRows[0]?.totalCost ?? 0;

  // Bench: suma i średnia pkt zostawionych na ławce w sezonie per manager + rekord ligi
  const benchRows = React.useMemo(() => {
    return Object.entries(gwPoints)
      .map(([entryStr, rows]) => {
        const entry = Number(entryStr);
        const played = rows.filter(g => g.gw > 0);
        const total = played.reduce((s, g) => s + g.benchPoints, 0);
        const best = played.length ? Math.max(...played.map(g => g.benchPoints)) : 0;
        return { entry, total, avg: played.length ? total / played.length : 0, best };
      })
      .sort((a, b) => b.total - a.total);
  }, [gwPoints]);
  const maxBenchTotal = benchRows[0]?.total ?? 0;
  const benchRecord = React.useMemo(() => {
    let rec: { entry: number; gw: number; pts: number } | null = null;
    for (const [entryStr, rows] of Object.entries(gwPoints)) {
      for (const g of rows) {
        if (!rec || g.benchPoints > rec.pts) rec = { entry: Number(entryStr), gw: g.gw, pts: g.benchPoints };
      }
    }
    return rec;
  }, [gwPoints]);

  // Stabilność: odchylenie standardowe wyników GW per manager — kto punktuje wyrównanie kolejka
  // po kolejce, a kto jest rollercoasterem (wielkie GW na przemian z fatalnymi). Inna oś niż
  // "Rekordy sezonu" w Sezonie (tam pojedyncze ekstrema), tu cały rozkład wyników. Liczone w
  // całości z gwPoints — zero nowych zapytań. Wymaga min. 3 rozegranych kolejek na managera, żeby
  // odchylenie miało jakikolwiek sens (przy 1-2 GW to tylko szum).
  const consistencyRows = React.useMemo(() => {
    return Object.entries(gwPoints)
      .map(([entryStr, rows]) => {
        const entry = Number(entryStr);
        const played = rows.filter(g => g.gw > 0).map(g => g.pts);
        if (played.length < 3) return null;
        const avg = played.reduce((s, p) => s + p, 0) / played.length;
        const variance = played.reduce((s, p) => s + (p - avg) ** 2, 0) / played.length;
        return { entry, avg, stdDev: Math.sqrt(variance), gwCount: played.length };
      })
      .filter((r): r is { entry: number; avg: number; stdDev: number; gwCount: number } => r != null)
      .sort((a, b) => a.stdDev - b.stdDev);
  }, [gwPoints]);
  // max = ostatni na liście (posortowanej rosnąco po stdDev), czyli największy rollercoaster —
  // pasek jest tu miarą "wychylenia", nie "dobra/zła", stąd długość rośnie wraz z niestabilnością
  const maxStdDev = consistencyRows[consistencyRows.length - 1]?.stdDev ?? 0;

  // Chips: pogrupowane per typ chipa (osobny segment na BB/WC/FH/TC/AM). Dla BB/TC sortujemy
  // malejąco wg REALNEGO zysku z chipa (bonus z backendu — dla BB suma pkt z ławki, dla TC pkt
  // kapitana ponad zwykłe podwojenie; nie total kolejki). Dla WC/FH/AM taki "zysk" nie jest
  // dobrze zdefiniowany (to chipy transferowe/menedżerskie) — te segmenty zostają jako zwykła,
  // chronologiczna lista "kto kiedy zagrał", bez zmyślonego rankingu po fałszywej liczbie.
  const chipGroups = React.useMemo(() => {
    const byCode: Record<string, { entry: number; label: string; name: string; event: number; bonus: number | null }[]> = {};
    for (const [entryStr, chips] of Object.entries(chipHistory)) {
      const entry = Number(entryStr);
      for (const c of chips) {
        if (!byCode[c.code]) byCode[c.code] = [];
        byCode[c.code].push({ entry, label: c.label, name: c.name, event: c.event, bonus: c.bonus });
      }
    }
    for (const code in byCode) {
      byCode[code].sort((a, b) =>
        a.bonus != null && b.bonus != null ? b.bonus - a.bonus : a.event - b.event
      );
    }
    return byCode;
  }, [chipHistory]);
  const activeChipCodes = ['bboost', 'wildcard', 'freehit', '3xc', 'manager'].filter(code => (chipGroups[code]?.length ?? 0) > 0);

  // Transfers, pogrupowane po GW z kosztem hita W TEJ GW doczepionym z gwPoints — żeby przy
  // -{totalCost} dało się pokazać, KTÓRE kolejki (i jakie transfery w nich) się na to złożyły.
  // FPL nie mówi, który POJEDYNCZY transfer w danej GW był tym "ponad limit" (gdy ktoś robi kilka
  // naraz), ale poziom "cała GW" jest w 100% pewny — to właśnie ten koszt, nie zmyślony rozkład.
  const transferGwGroups = React.useMemo(() => {
    const result: Record<number, { event: number; cost: number; transfers: SeasonTransferRow[] }[]> = {};
    for (const [entryStr, transfers] of Object.entries(transfersHistory)) {
      const entry = Number(entryStr);
      const byEvent = new Map<number, SeasonTransferRow[]>();
      for (const t of transfers) {
        if (!byEvent.has(t.event)) byEvent.set(t.event, []);
        byEvent.get(t.event)!.push(t);
      }
      const costByGw = new Map((gwPoints[entry] ?? []).map(g => [g.gw, g.cost]));
      result[entry] = Array.from(byEvent.entries())
        .map(([event, list]) => ({ event, cost: costByGw.get(event) ?? 0, transfers: list }))
        .filter(g => g.cost > 0)
        .sort((a, b) => a.event - b.event);
    }
    return result;
  }, [transfersHistory, gwPoints]);

  return (
    <section className="card">
      <div className="headline">🧠 Statystyki</div>
      <div className="small" style={{ marginBottom: 16 }}>Szczegółowa analityka managerów naszej ligi.</div>

      <StatModule icon="🏆" tone="special" title="Captaincy" subtitle="Kto i jak często nosi opaskę w naszej lidze">
        {topCaptainPick && (
          <div className="statchip statchip--special" style={{ marginBottom: 10 }}>
            <PlayerAvatar src={topCaptainPick.photoUrl} alt={topCaptainPick.name} />
            <span className="statchip-text">
              <span className="statchip-label">🏆 Najlepszy kapitan w lidze (OBECNY GW)</span>
              <span className="statchip-value">
                {topCaptainPick.name} · <b>{topCaptainPick.points} pkt</b>
                {' — '}
                {topCaptainPick.managers.length === 1
                  ? topCaptainPick.managers[0].player_name
                  : `${topCaptainPick.managers.length} managerów`}
              </span>
            </span>
          </div>
        )}
        {overviewLoading ? (
          <div className="small">Ładowanie…</div>
        ) : overviewError ? (
          <div className="small" style={{ color: '#ff9b9b' }}>{overviewError}</div>
        ) : !overview ? (
          <div className="small">Brak danych</div>
        ) : (
          <div className="small">
            {overview.captaincy.map(p => (
              <div key={p.element} className="squadplayer squadplayer--viz">
                <RankFill pct={p.captainPct} tone="special" />
                <span className="squadplayer-name">
                  <PlayerAvatar src={p.photoUrl} alt={p.name} />
                  <span className="pill">{p.position}</span>
                  {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
                </span>
                <span>{p.points} pkt · {p.captainPct}% C · {p.captainCount}/{overview.leagueSize}</span>
              </div>
            ))}
          </div>
        )}
        <div className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
          Wkrótce: historia wyborów kapitana przez cały sezon.
        </div>
      </StatModule>

      <StatModule icon="👥" tone="neutral" title="Ownership" subtitle="Kogo najczęściej wybierają, a kto jest różnicowym strzałem">
        {overview && (
          <div className="small">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Najczęściej wybierani:</div>
            {(showAllTopOwned ? overview.topOwned : overview.topOwned.slice(0, 6)).map(p => (
              <div key={p.element} className="squadplayer squadplayer--viz">
                <RankFill pct={p.ownedPct} tone="neutral" />
                <span className="squadplayer-name">
                  <PlayerAvatar src={p.photoUrl} alt={p.name} />
                  <span className="pill">{p.position}</span>
                  {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
                  {p.captainCount > 0 && ` — C: ${p.captainCount}`}
                </span>
                <span>{p.ownedPct}% · {p.ownedCount}/{overview.leagueSize}</span>
              </div>
            ))}
            {overview.topOwned.length > 6 && (
              <button className="showmore-btn" onClick={() => setShowAllTopOwned(v => !v)}>
                {showAllTopOwned ? '↑ Pokaż mniej' : `↓ Pokaż więcej (top ${overview.topOwned.length})`}
              </button>
            )}

            <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>🎯 Różnicowi zawodnicy (nisko obstawiani, wysokie pkt):</div>
            {overview.differentials.length === 0 ? (
              <div>Brak — nikt nisko obstawiany nie wystrzelił w tej kolejce</div>
            ) : (
              <>
                {(showAllDifferentials ? overview.differentials : overview.differentials.slice(0, 6)).map(p => (
                  <div key={p.element} className="squadplayer squadplayer--viz">
                    <RankFill pct={p.ownedPct} tone="neutral" />
                    <span className="squadplayer-name">
                      <PlayerAvatar src={p.photoUrl} alt={p.name} />
                      <span className="pill">{p.position}</span>
                      {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
                    </span>
                    <span>{p.points} pkt · {p.ownedCount}/{overview.leagueSize}</span>
                  </div>
                ))}
                {overview.differentials.length > 6 && (
                  <button className="showmore-btn" onClick={() => setShowAllDifferentials(v => !v)}>
                    {showAllDifferentials ? '↑ Pokaż mniej' : `↓ Pokaż więcej (top ${overview.differentials.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
          Wkrótce: template ligi (najczęściej wybierana XI).
        </div>
      </StatModule>

      <StatModule icon="🃏" tone="special" title="Chips" subtitle="Kto i kiedy zagrał jakiego chipa w tym sezonie">
        {overview && overview.chipUsage.length > 0 && (
          <div className="awardsrow" style={{ marginBottom: 12 }}>
            {overview.chipUsage.map(c => (
              <span key={c.code} className="awardpill" title={c.name}>
                {c.code !== 'none' && `${chipIcon(c.code)} `}{c.label}: {c.count} ({c.pct}%)
              </span>
            ))}
          </div>
        )}
        {activeChipCodes.length === 0 ? (
          <div className="small">Nikt jeszcze nie zagrał chipa w tym sezonie.</div>
        ) : (
          activeChipCodes.map(code => {
            const rows = chipGroups[code];
            const maxBonus = rows[0]?.bonus ?? 0;
            return (
              <div key={code} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {chipIcon(code)} {rows[0].name}
                </div>
                {rows.map((r, i) => (
                  <div key={`${r.entry}-${r.event}`} className={`rankbar${r.bonus != null ? ' rankbar--viz' : ''}`}>
                    {r.bonus != null && <RankFill pct={barPct(r.bonus, maxBonus)} tone="special" />}
                    <div className="rankbar-top">
                      <span className="rankbar-rank">{r.bonus != null ? rankBadge(i) : '•'}</span>
                      <span className="rankbar-name">
                        {entryIndex[r.entry]?.manager ?? '—'} <span className="small">({entryIndex[r.entry]?.team ?? '—'})</span>
                      </span>
                      <span className="rankbar-pts">{r.bonus != null ? `+${r.bonus} z chipa` : `GW${r.event}`}</span>
                    </div>
                    <div className="rankbar-gap">
                      {r.bonus != null ? `GW${r.event}` : 'brak zdefiniowanego zysku dla tego chipa'}
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </StatModule>

      <StatModule icon="🪑" tone="bad" title="Bench" subtitle="Punkty zostawione na ławce — im mniej, tym lepiej">
        {benchRecord && (
          <div className="small" style={{ marginBottom: 10 }}>
            🪑 Rekord ligi (najwięcej pkt zostawionych na ławce w jednej kolejce): <strong style={{ color: 'var(--text)' }}>{entryIndex[benchRecord.entry]?.manager ?? '—'}</strong> — {benchRecord.pts} pkt w GW{benchRecord.gw}
          </div>
        )}
        {/* bez medali (🥇🥈🥉) — to lista "łez na ławce" (stracone pkt), nie osiągnięcie do
            świętowania, więc zwykła numeracja zamiast rankBadge, który sugerowałby wygraną */}
        <div>
          {(showAllBench ? benchRows : benchRows.slice(0, 5)).map((r, i) => (
            <div key={r.entry} className="rankbar rankbar--viz">
              <RankFill pct={barPct(r.total, maxBenchTotal)} tone="bad" />
              <div className="rankbar-top">
                <span className="rankbar-rank">{i + 1}.</span>
                <span className="rankbar-name">
                  {entryIndex[r.entry]?.manager ?? '—'} <span className="small">({entryIndex[r.entry]?.team ?? '—'})</span>
                </span>
                <span className="rankbar-pts">{r.total} pkt</span>
              </div>
              <div className="rankbar-gap">śr. {r.avg.toFixed(1)}/GW · najwięcej naraz: {r.best} pkt</div>
            </div>
          ))}
          {benchRows.length > 5 && (
            <button className="showmore-btn" onClick={() => setShowAllBench(v => !v)}>
              {showAllBench ? '↑ Pokaż mniej' : `↓ Pokaż więcej (top ${benchRows.length})`}
            </button>
          )}
        </div>
      </StatModule>

      <StatModule icon="📊" tone="neutral" title="Stabilność" subtitle="Kto punktuje wyrównanie, a kto jest rollercoasterem">
        {consistencyRows.length < 2 ? (
          <div className="small" style={{ color: 'var(--muted)' }}>
            Wkrótce: staty stabilności pojawią się po rozegraniu kilku kolejek.
          </div>
        ) : (
          <>
            <div className="small" style={{ marginBottom: 8 }}>
              Odchylenie standardowe wyników GW — im dłuższy pasek, tym większe wahania z kolejki na kolejkę.
            </div>
            <div>
              {(showAllConsistency ? consistencyRows : consistencyRows.slice(0, 5)).map((r, i) => (
                <div key={r.entry} className="rankbar rankbar--viz">
                  <RankFill pct={barPct(r.stdDev, maxStdDev)} tone="neutral" />
                  <div className="rankbar-top">
                    <span className="rankbar-rank">
                      {i === 0 ? '🎯' : i === consistencyRows.length - 1 ? '🎢' : rankBadge(i)}
                    </span>
                    <span className="rankbar-name">
                      {entryIndex[r.entry]?.manager ?? '—'} <span className="small">({entryIndex[r.entry]?.team ?? '—'})</span>
                    </span>
                    <span className="rankbar-pts">± {r.stdDev.toFixed(1)}</span>
                  </div>
                  <div className="rankbar-gap">
                    śr. {r.avg.toFixed(1)} pkt/GW
                    {i === 0 && ' · najbardziej stabilny w lidze'}
                    {i === consistencyRows.length - 1 && consistencyRows.length > 1 && ' · rollercoaster sezonu'}
                  </div>
                </div>
              ))}
            </div>
            {consistencyRows.length > 5 && (
              <button className="showmore-btn" onClick={() => setShowAllConsistency(v => !v)}>
                {showAllConsistency ? '↑ Pokaż mniej' : `↓ Pokaż więcej (top ${consistencyRows.length})`}
              </button>
            )}
          </>
        )}
      </StatModule>

      {/* Transfers (płatne/hity) na samym końcu — nazwa i opis celowo jednoznaczne: to WYŁĄCZNIE
          koszt hita (pkt zapłaconych za transfer ponad darmowy limit), NIE różnica w formie
          kupionego względem sprzedanego zawodnika (to inna, osobna rzecz — patrz "Zysk z
          transferu" w banerze "GW wystartowała"). Bez medali (🥇🥈🥉) w rankingu, tak samo jak w
          Bench — to nie jest osiągnięcie do świętowania. */}
      <StatModule icon="💸" tone="bad" title="Transfers — płatne (hity)" subtitle="Koszt hitów (transferów ponad darmowy limit) w całym sezonie">
        {transferRows.length === 0 ? (
          <div className="small">Nikt jeszcze nie wziął hita w tym sezonie.</div>
        ) : (
          <div>
            <div className="small" style={{ color: 'var(--muted)', marginBottom: 8 }}>
              Suma punktów zapłaconych za transfery ponad darmowy limit (hity) w całym sezonie — sam koszt
              hita, nie różnica w formie kupionego względem sprzedanego zawodnika.
            </div>
            {transferRows.map((r, i) => {
              const groups = transferGwGroups[r.entry] ?? [];
              const expanded = expandedTransfers[r.entry] ?? false;
              return (
                <div key={r.entry} className="rankbar rankbar--viz">
                  <RankFill pct={barPct(r.totalCost, maxTransferCost)} tone="bad" />
                  <div className="rankbar-top">
                    <span className="rankbar-rank">{i + 1}.</span>
                    <span className="rankbar-name">
                      {entryIndex[r.entry]?.manager ?? '—'} <span className="small">({entryIndex[r.entry]?.team ?? '—'})</span>
                    </span>
                    <span className="rankbar-pts" style={{ color: '#ff9b9b' }}>-{r.totalCost}</span>
                  </div>
                  {groups.length > 0 && (
                    <>
                      <button
                        className="showmore-btn"
                        onClick={() => setExpandedTransfers(prev => ({ ...prev, [r.entry]: !expanded }))}
                      >
                        {expanded ? '↑ Ukryj' : `↓ Które GW? (${groups.length})`}
                      </button>
                      {expanded && (
                        <div className="small" style={{ marginTop: 2 }}>
                          {groups.map(g => (
                            <div key={g.event} style={{ marginBottom: 6 }}>
                              <strong style={{ color: 'var(--text)' }}>GW{g.event}</strong> · -{g.cost} pkt
                              {g.transfers.map((t, j) => (
                                <div key={j} style={{ marginLeft: 10 }}>{t.nameOut} → {t.nameIn}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
          Wkrótce: najlepszy/najgorszy transfer sezonu, transfer ROI.
        </div>
      </StatModule>
    </section>
  );
}
