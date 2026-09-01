'use client';
import React from 'react';
import type { LeagueOverview, GwPoint, ChipHistoryEntry, TeamInfo, TopCaptainPick } from '../lib/types';
import { PlayerAvatar, ClubBadge, chipIcon, rankBadge } from '../components/shared';

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
};

// "🧠 Statystyki" — 5 modułów. Captaincy i Ownership to dawny "Wgląd w ligę" (showOverview)
// przeniesiony 1:1, tylko rozbity na dwa moduły. Transfers/Bench/Chips są nowe, liczone w
// całości z danych, które i tak już mamy na froncie (gwPoints wzbogacone, chipHistory) — zero
// nowych zapytań do FPL. Tam, gdzie danych faktycznie brakuje (historia kapitanów, ROI
// transferów, template ligi), jest jawna notka zamiast zmyślonych liczb.
export default function StatsSection({
  active, loadOverview, overview, overviewLoading, overviewError,
  entryIndex, gwPoints, chipHistory, teamInfo, topCaptainPick,
}: Props) {
  React.useEffect(() => {
    if (active) loadOverview();
  }, [active, loadOverview]);

  // "delikatne" opcje rozwinięcia — domyślnie krótsze listy (mniej scrollowania), z możliwością
  // pokazania pełnego rankingu jednym kliknięciem. Różnicowi: 6 → 10 (backend już zwraca top10,
  // patrz league-overview/route.ts). Bench: 5 → cała liga (tu nic nie ucinamy po stronie API,
  // benchRows liczone niżej z gwPoints, które i tak mamy w całości na froncie).
  const [showAllDifferentials, setShowAllDifferentials] = React.useState(false);
  const [showAllBench, setShowAllBench] = React.useState(false);

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

  return (
    <section className="card">
      <div className="headline">🧠 Statystyki</div>
      <div className="small" style={{ marginBottom: 14 }}>Szczegółowa analityka managerów naszej ligi.</div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Captaincy</div>
      {topCaptainPick && (
        <div className="statchip statchip--special" style={{ marginBottom: 10 }}>
          <PlayerAvatar src={topCaptainPick.photoUrl} alt={topCaptainPick.name} />
          <span className="statchip-text">
            <span className="statchip-label">🏆 Najlepszy kapitan w lidze (ta GW)</span>
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
        <div className="small" style={{ marginBottom: 8 }}>
          {overview.captaincy.map(p => (
            <div key={p.element} className="squadplayer">
              <span className="squadplayer-name">
                <PlayerAvatar src={p.photoUrl} alt={p.name} />
                <span className="pill">{p.position}</span>
                {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
              </span>
              <span>{p.points} pkt · {p.captainPct}% C</span>
            </div>
          ))}
        </div>
      )}
      <div className="small" style={{ color: 'var(--muted)', marginBottom: 18 }}>
        Wkrótce: historia wyborów kapitana przez cały sezon.
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Ownership</div>
      {overview && (
        <div className="small" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Najczęściej wybierani, top 6:</div>
          {overview.topOwned.map(p => (
            <div key={p.element} className="squadplayer">
              <span className="squadplayer-name">
                <PlayerAvatar src={p.photoUrl} alt={p.name} />
                <span className="pill">{p.position}</span>
                {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
                {p.captainCount > 0 && ` — C: ${p.captainCount}`}
              </span>
              <span>{p.ownedPct}% · {p.ownedCount}/{overview.leagueSize}</span>
            </div>
          ))}

          <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>🎯 Różnicowi zawodnicy (nisko obstawiani, wysokie pkt):</div>
          {overview.differentials.length === 0 ? (
            <div>Brak — nikt nisko obstawiany nie wystrzelił w tej kolejce</div>
          ) : (
            <>
              {(showAllDifferentials ? overview.differentials : overview.differentials.slice(0, 6)).map(p => (
                <div key={p.element} className="squadplayer">
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
      <div className="small" style={{ color: 'var(--muted)', marginBottom: 18 }}>
        Wkrótce: template ligi (najczęściej wybierana XI).
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Transfers</div>
      {transferRows.length === 0 ? (
        <div className="small" style={{ marginBottom: 4 }}>Nikt jeszcze nie wziął hita w tym sezonie.</div>
      ) : (
        <div style={{ marginBottom: 4 }}>
          {transferRows.map((r, i) => (
            <div key={r.entry} className="rankbar">
              <div className="rankbar-top">
                <span className="rankbar-rank">{rankBadge(i)}</span>
                <span className="rankbar-name">
                  {entryIndex[r.entry]?.manager ?? '—'} <span className="small">({entryIndex[r.entry]?.team ?? '—'})</span>
                </span>
                <span className="rankbar-pts" style={{ color: '#ff9b9b' }}>-{r.totalCost}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="small" style={{ color: 'var(--muted)', marginBottom: 18 }}>
        Wkrótce: najlepszy/najgorszy transfer sezonu, transfer ROI.
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Bench</div>
      {benchRecord && (
        <div className="small" style={{ marginBottom: 8 }}>
          🪑 Rekord ligi: <strong style={{ color: 'var(--text)' }}>{entryIndex[benchRecord.entry]?.manager ?? '—'}</strong> — {benchRecord.pts} pkt na ławce w GW{benchRecord.gw}
        </div>
      )}
      <div style={{ marginBottom: 4 }}>
        {(showAllBench ? benchRows : benchRows.slice(0, 5)).map((r, i) => (
          <div key={r.entry} className="rankbar">
            <div className="rankbar-top">
              <span className="rankbar-rank">{rankBadge(i)}</span>
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

      <div style={{ fontWeight: 700, fontSize: 15, margin: '18px 0 8px' }}>Stabilność</div>
      {consistencyRows.length < 2 ? (
        <div className="small" style={{ color: 'var(--muted)', marginBottom: 18 }}>
          Wkrótce: staty stabilności pojawią się po rozegraniu kilku kolejek.
        </div>
      ) : (
        <>
          <div className="small" style={{ marginBottom: 8 }}>
            Odchylenie standardowe wyników GW — kto punktuje wyrównanie z kolejki na kolejkę, a kto jest rollercoasterem.
          </div>
          <div style={{ marginBottom: 4 }}>
            {consistencyRows.map((r, i) => (
              <div key={r.entry} className="rankbar">
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
        </>
      )}

      <div style={{ fontWeight: 700, fontSize: 15, margin: '18px 0 8px' }}>Chips</div>
      {overview && overview.chipUsage.length > 0 && (
        <div className="awardsrow" style={{ marginBottom: 10 }}>
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
          return (
            <div key={code} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {chipIcon(code)} {rows[0].name}
              </div>
              {rows.map((r, i) => (
                <div key={`${r.entry}-${r.event}`} className="rankbar">
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
    </section>
  );
}
