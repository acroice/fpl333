'use client';
import React from 'react';

type LeagueEntry = {
  entry: number;
  player_name: string; // Manager
  entry_name: string;  // Team
  total: number;
  rank: number;
  event_total: number;
};

type Quarter = {
  id: string;
  gw_from: number;
  gw_to: number;
  games: number;
  from: string;
  to: string;
  status: 'trwa' | 'zakończona' | 'wkrótce';
  note: string;
  is_current?: boolean;
};

export default function Home() {
  const [league, setLeague] = React.useState<LeagueEntry[]>([]);
  const [participants, setParticipants] = React.useState<number>(0);
  const [quarters, setQuarters] = React.useState<Quarter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preSeason, setPreSeason] = React.useState<boolean>(false);

  const [qWins, setQWins] = React.useState<Record<number, number>>({});
  const [currentScores, setCurrentScores] = React.useState<Record<number, number>>({});
  const [currentQuarterId, setCurrentQuarterId] = React.useState<string>('Q1');

  // zwycięzcy per ćwiartka (dla zakończonych)
  const [winnersByQuarter, setWinnersByQuarter] = React.useState<
    Record<string, { entry: number; points: number }[]>
  >({});

  // retro easter egg UI
  const [showRetroBanner, setShowRetroBanner] = React.useState(false);

  // mapka do szybkiego lookupu nazwy manager/team po entryId
  const entryIndex = React.useMemo(() => {
    const map: Record<number, { manager: string; team: string }> = {};
    for (const e of league) map[e.entry] = { manager: e.player_name, team: e.entry_name };
    return map;
  }, [league]);

  React.useEffect(() => {
    async function load() {
      try {
        // --- league ---
        const res = await fetch('/api/league?leagueId=831753', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'league fetch failed');

        const entries: LeagueEntry[] = (data.entries || []).slice();
        const isPre = !!data.pre_season;
        setPreSeason(isPre);

        // sort: pre-season alfabetycznie po Manager, po starcie po rank
        if (isPre) {
          entries.sort((a, b) =>
            (a.player_name || '').localeCompare(b.player_name || '', 'pl', { sensitivity: 'base' })
          );
        } else {
          entries.sort((a, b) => a.rank - b.rank);
        }

        setLeague(entries);
        setParticipants(data.count || entries.length || 0);

        // --- quarters ---
        const qRes = await fetch('/api/quarters', { cache: 'no-store' });
        const qData = await qRes.json();
        if (!qRes.ok) throw new Error(qData?.error || 'quarters fetch failed');
        setQuarters(qData.quarters || []);
        setCurrentQuarterId(qData.current || 'Q1');

        // --- trophies & current-quarter scores ---
        const wRes = await fetch('/api/quarter-wins?leagueId=831753', { cache: 'no-store' });
        const wData = await wRes.json();
        if (wRes.ok) {
          setQWins(wData.wins || {});                 // puchary tylko z zakończonych ćwiartek
          setCurrentScores(wData.currentScores || {}); // bieżące punkty w aktualnej ćwiartce
          if (wData.currentQuarter) setCurrentQuarterId(wData.currentQuarter);
          setWinnersByQuarter(wData.winnersByQuarter || {}); // zwycięzcy tylko po zakończeniu
        } else {
          setQWins({});
          setCurrentScores({});
          setWinnersByQuarter({});
        }

        setError(null);
      } catch (err: any) {
        console.error('page load error:', err?.message);
        setError('nie udało się pobrać danych ligi (spróbuj odświeżyć za chwilę)');
        setLeague([]);
        setParticipants(0);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Konami code → retro mode przez 10s
  React.useEffect(() => {
    const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let idx = 0;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const want = seq[idx];
      if (key === want) {
        idx++;
        if (idx === seq.length) {
          document.body.classList.add('retro');
          setShowRetroBanner(true);
          setTimeout(() => {
            document.body.classList.remove('retro');
            setShowRetroBanner(false);
          }, 10000);
          idx = 0;
        }
      } else {
        idx = key === seq[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // etykieta kolumny z punktami bieżącej ćwiartki
  const currentScoreLabel = `${currentQuarterId} Score`;

  return (
    <>
      {showRetroBanner && <div className="retro-banner">you unlocked retro fpl mode</div>}
      <div className="grid">
        <section className="card">
          <div className="headline">
            Planowane składy <span className="small">uczestnicy: {participants}</span>
          </div>

          {loading ? (
            <div>Loading…</div>
          ) : error ? (
            <div className="small" style={{ color: '#ff9b9b' }}>{error}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Manager</th>
                  <th>Team</th>
                  <th>Total</th>
                  <th>GW Pts</th>
                  <th>{currentScoreLabel}</th>
                  <th>Quarter wins</th>
                </tr>
              </thead>
              <tbody>
                {league.map((e, idx) => (
                  <tr key={e.entry}>
                    <td>{preSeason ? idx + 1 : e.rank}</td>
                    <td>{e.player_name}</td>
                    <td>{e.entry_name}</td>
                    <td>{e.total}</td>
                    <td>{e.event_total}</td>
                    <td>{currentScores[e.entry] ?? 0}</td>
                    <td>{qWins[e.entry] ? '🏆'.repeat(qWins[e.entry]) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="card">
          <div className="headline">Quarter Rankings</div>
          <div className="qgrid">
            {quarters.map((q) => {
              const winners = winnersByQuarter[q.id] || [];
              const winnerLabel =
                q.status === 'zakończona' && winners.length
                  ? 'Zwycięzca: ' + winners.map(w => {
                      const who = entryIndex[w.entry];
                      const pts = w.points || 0;
                      return `${who?.manager ?? '—'} (${who?.team ?? '—'}) – ${pts} pkt`;
                    }).join(', ')
                  : '';

              // 🔸 status → klasa
              const statusClass =
                q.status === 'trwa' ? 'qactive' :
                q.status === 'zakończona' ? 'qdone' : '';

              return (
                <div
                  key={q.id}
                  className={`card ${statusClass}`}
                  style={{ padding: '12px' }}
                >
                  <div className="qtitle">
                    {q.id} <span className="pill">{q.gw_from}–{q.gw_to}</span>
                  </div>
                  <div className="small">Kolejki: {q.games}</div>
                  <div className="small">{q.from} → {q.to}</div>
                  <div className="status">Status: {q.status}</div>
                  <div className="small">{q.note}</div>
                  {winnerLabel && (
                    <div className="small" style={{ marginTop: 6 }}>
                      🏆 {winnerLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </>
  );
}
