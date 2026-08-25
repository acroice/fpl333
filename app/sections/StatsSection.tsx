'use client';
import React from 'react';
import type { LeagueOverview, GwPoint, ChipHistoryEntry, TeamInfo } from '../lib/types';
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
};

// "🧠 Statystyki" — 5 modułów. Captaincy i Ownership to dawny "Wgląd w ligę" (showOverview)
// przeniesiony 1:1, tylko rozbity na dwa moduły. Transfers/Bench/Chips są nowe, liczone w
// całości z danych, które i tak już mamy na froncie (gwPoints wzbogacone, chipHistory) — zero
// nowych zapytań do FPL. Tam, gdzie danych faktycznie brakuje (historia kapitanów, ROI
// transferów, template ligi), jest jawna notka zamiast zmyślonych liczb.
export default function StatsSection({
  active, loadOverview, overview, overviewLoading, overviewError,
  entryIndex, gwPoints, chipHistory, teamInfo,
}: Props) {
  React.useEffect(() => {
    if (active) loadOverview();
  }, [active, loadOverview]);

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

  // Chips: kto zagrał jaki chip i kiedy — tylko managerowie, którzy już coś zagrali
  const chipRows = React.useMemo(() => {
    return Object.entries(chipHistory)
      .map(([entryStr, chips]) => ({ entry: Number(entryStr), chips }))
      .filter(r => r.chips.length > 0);
  }, [chipHistory]);

  return (
    <section className="card">
      <div className="headline">🧠 Statystyki</div>
      <div className="small" style={{ marginBottom: 14 }}>Szczegółowa analityka managerów naszej ligi.</div>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Captaincy</div>
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
            overview.differentials.map(p => (
              <div key={p.element} className="squadplayer">
                <span className="squadplayer-name">
                  <PlayerAvatar src={p.photoUrl} alt={p.name} />
                  <span className="pill">{p.position}</span>
                  {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} />
                </span>
                <span>{p.points} pkt · {p.ownedCount}/{overview.leagueSize}</span>
              </div>
            ))
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
        {benchRows.map((r, i) => (
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
      </div>

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
      {chipRows.length === 0 ? (
        <div className="small">Nikt jeszcze nie zagrał chipa w tym sezonie.</div>
      ) : (
        chipRows.map(r => (
          <div key={r.entry} className="squadplayer">
            <span className="squadplayer-name">{entryIndex[r.entry]?.manager ?? '—'}</span>
            <span className="small">
              {r.chips.map(c => `${chipIcon(c.code)} ${c.label} (GW${c.event})`).join(' · ')}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
