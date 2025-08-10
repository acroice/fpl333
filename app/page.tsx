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

        // --- trophies and current-quarter scores ---
        const wRes = await fetch('/api/quarter-wins?leagueId=831753', { cache: 'no-store' });
        const wData = await wRes.json();
        if (wRes.ok) {
          setQWins(wData.wins || {});
          setCurrentScores(wData.currentScores || {});
          if (wData.currentQuarter) setCurrentQuarterId(wData.currentQuarter);
        } else {
          // fallback: pre-season → jeden puchar
          setQWins({});
          setCurrentScores({});
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

  // label dynamicznej kolumny ze score aktualnej ćwiartki
  const currentScoreLabel = `${currentQuarterId} Score`;

  return (
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
                  <td>{currentScores[e.entry] ?? (preSeason ? 0 : 0)}</td>
                  <td>{preSeason ? '🏆' : (qWins[e.entry] ? '🏆'.repeat(qWins[e.entry]) : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <aside className="card">
        <div className="headline">Quarter Rankings</div>
        <div className="qgrid">
          {quarters.map((q) => (
            <div
              key={q.id}
              className={`card ${q.is_current ? 'qcurrent' : ''}`}
              style={{ padding: '12px' }}
            >
              <div className="qtitle">
                {q.id} <span className="pill">{q.gw_from}–{q.gw_to}</span>
              </div>
              <div className="small">Kolejki: {q.games}</div>
              <div className="small">{q.from} → {q.to}</div>
              <div className="status">Status: {q.status}</div>
              <div className="small">{q.note}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
