'use client';
import React from 'react';

type LeagueEntry = {
  entry: number;
  player_name: string;
  entry_name: string;
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
  status: 'trwa'|'zakończona'|'wkrótce';
  note: string;
};

export default function Home() {
  const [league, setLeague] = React.useState<LeagueEntry[]>([]);
  const [participants, setParticipants] = React.useState<number>(0);
  const [quarters, setQuarters] = React.useState<Quarter[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load(){
      try{
        const res = await fetch('/api/league?leagueId=831753', { cache: 'no-store' });
        const data = await res.json();
        setLeague((data.entries || []).sort((a:any,b:any)=>a.rank-b.rank));
        setParticipants(data.count || data.entries?.length || 0);

        const qRes = await fetch('/api/quarters', { cache: 'no-store' });
        const qData = await qRes.json();
        setQuarters(qData.quarters || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="grid">
      <section className="card">
        <div className="headline">League Table <span className="small">participants: {participants}</span></div>
        {loading ? <div>Loading…</div> : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Manager</th>
                <th>Team</th>
                <th>Total</th>
                <th>GW Pts</th>
              </tr>
            </thead>
            <tbody>
              {league.map((e:any)=>(
                <tr key={e.entry}>
                  <td>{e.rank}</td>
                  <td>{e.player_name}</td>
                  <td>{e.entry_name}</td>
                  <td>{e.total}</td>
                  <td>{e.event_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <aside className="card">
        <div className="headline">Quarter Rankings</div>
        <div className="qgrid">
          {quarters.map(q=> (
            <div key={q.id} className="card" style={{padding:'12px'}}>
              <div className="qtitle">{q.id} <span className="pill">{q.gw_from}–{q.gw_to}</span></div>
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
