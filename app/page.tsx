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

type QuarterTopRow = {
  entry: number;
  player_name: string;
  entry_name: string;
  points: number;
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

  // zwycięzcy zakończonych ćwiartek
  const [winnersByQuarter, setWinnersByQuarter] = React.useState<
    Record<string, { entry: number; points: number }[]>
  >({});

  // TOP3 w każdej ćwiartce
  const [quarterTop, setQuarterTop] = React.useState<
    Record<string, QuarterTopRow[]>
  >({});

  // który kafelek Q jest rozwinięty
  const [openQuarter, setOpenQuarter] = React.useState<string | null>(null);

  // retro easter egg UI
  const [showRetroBanner, setShowRetroBanner] = React.useState(false);

  // sortowanie tabeli
  const [sortKey, setSortKey] = React.useState<'rank' | 'total' | 'gw' | 'currentQ' | 'wins'>('rank');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  // helper do podglądu danych gracza po entryId
  const entryIndex = React.useMemo(() => {
    const map: Record<number, { manager: string; team: string }> = {};
    for (const e of league) map[e.entry] = { manager: e.player_name, team: e.entry_name };
    return map;
  }, [league]);

  // utilka do error handlingu fetcha
  async function resOrThrow(r: Response) {
    const js = await r.json();
    if (!r.ok) throw new Error(js?.error || 'fetch failed');
    return js;
  }

  // fetch danych
  React.useEffect(() => {
    async function load() {
      try {
        // league
        const res = await fetch('/api/league?leagueId=831753', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'league fetch failed');

        const entries: LeagueEntry[] = (data.entries || []).slice();
        const isPre = !!data.pre_season;
        setPreSeason(isPre);

        // sort bazowy
        if (isPre) {
          entries.sort((a, b) =>
            (a.player_name || '').localeCompare(
              b.player_name || '',
              'pl',
              { sensitivity: 'base' }
            )
          );
        } else {
          entries.sort((a, b) => a.rank - b.rank);
        }

        setLeague(entries);
        setParticipants(data.count || entries.length || 0);

        // quarters
        const qRes = await fetch('/api/quarters', { cache: 'no-store' });
        const qData = await resOrThrow(qRes);
        setQuarters(qData.quarters || []);
        setCurrentQuarterId(qData.current || 'Q1');

        // wins / bieżąca ćwiartka / top3
        const wRes = await fetch('/api/quarter-wins?leagueId=831753', { cache: 'no-store' });
        const wData = await resOrThrow(wRes);

        setQWins(wData.wins || {});
        setCurrentScores(wData.currentScores || {});
        if (wData.currentQuarter) setCurrentQuarterId(wData.currentQuarter);
        setWinnersByQuarter(wData.winnersByQuarter || {});
        setQuarterTop(wData.quarterTop || {});

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

  // 🔥 NOWE: po załadowaniu quarters automatycznie otwieramy tę ćwiartkę,
  // która ma status "trwa" (czyli aktualnie grana) - tylko jeśli jeszcze
  // nic nie jest otwarte.
  React.useEffect(() => {
    if (!openQuarter && quarters.length > 0) {
      const active = quarters.find(q => q.status === 'trwa');
      if (active) {
        setOpenQuarter(active.id);
      }
    }
  }, [quarters, openQuarter]);

  // Konami code → retro mode przez 10s
  React.useEffect(() => {
    const seq = [
      'ArrowUp','ArrowUp','ArrowDown','ArrowDown',
      'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'
    ];
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

  // klik nagłówka tabeli do sortowania
  function toggleSort(col: 'rank'|'total'|'gw'|'currentQ'|'wins') {
    if (sortKey === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      if (col === 'rank') {
        setSortDir('asc');
      } else {
        setSortDir('desc');
      }
    }
  }

  // tabela posortowana wg wyboru usera
  const sortedLeague = React.useMemo(() => {
    const arr = [...league];

    arr.sort((a, b) => {
      function val(e: LeagueEntry) {
        if (sortKey === 'rank') {
          return preSeason ? league.indexOf(e) + 1 : e.rank;
        }
        if (sortKey === 'total') {
          return e.total;
        }
        if (sortKey === 'gw') {
          return e.event_total;
        }
        if (sortKey === 'currentQ') {
          return currentScores[e.entry] ?? 0;
        }
        if (sortKey === 'wins') {
          return qWins[e.entry] ?? 0;
        }
        return 0;
      }

      const av = val(a);
      const bv = val(b);

      if (av === bv) return 0;
      if (sortDir === 'asc') {
        return av < bv ? -1 : 1;
      } else {
        return av > bv ? -1 : 1;
      }
    });

    return arr;
  }, [league, sortKey, sortDir, preSeason, currentScores, qWins]);

  // helper do strzałki sortowania w nagłówku
  function sortArrow(col: 'rank'|'total'|'gw'|'currentQ'|'wins') {
    if (sortKey !== col) return '';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  // kliknięcie kafelka ćwiartki
  function toggleQuarterOpen(id: string, isLocked: boolean) {
    if (isLocked) return; // ćwiartka "wkrótce" -> brak rozwinięcia
    setOpenQuarter(prev => (prev === id ? null : id));
  }

  // eksport CSV (zostawiam tak jak mamy)
  function downloadCsv() {
    const header = [
      '#',
      'Manager',
      'Team',
      'Total',
      'GW Pts',
      `${currentScoreLabel}`,
      'Quarter wins'
    ];

    const rows = sortedLeague.map((e, idx) => {
      const displayRank = preSeason ? (idx + 1) : e.rank;
      const wins = qWins[e.entry] ? '🏆'.repeat(qWins[e.entry]) : '';
      const currentQpts = currentScores[e.entry] ?? 0;

      return [
        displayRank,
        e.player_name,
        e.entry_name,
        e.total,
        e.event_total,
        currentQpts,
        wins
      ];
    });

    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      header.map(escapeCell).join(','),
      ...rows.map(r => r.map(escapeCell).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const now = new Date();
    const stamp = now.toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url;
    a.download = `fpl333_export_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {showRetroBanner && <div className="retro-banner">you unlocked retro fpl mode</div>}

      <div className="grid">
        <section className="card">
          <div
            className="headline"
            style={{
              display:'flex',
              flexWrap:'wrap',
              alignItems:'center',
              justifyContent:'space-between',
              rowGap:'8px',
              columnGap:'12px'
            }}
          >
            <div>
              Planowane składy{' '}
              <span className="small">uczestnicy: {participants}</span>
            </div>

            <button
              onClick={downloadCsv}
              style={{
                background:'#0f2029',
                border:'1px solid #16313f',
                borderRadius:'6px',
                color:'#9fd9ff',
                fontSize:'12px',
                padding:'6px 10px',
                cursor:'pointer'
              }}
            >
              Eksportuj CSV
            </button>
          </div>

          {loading ? (
            <div>Loading…</div>
          ) : error ? (
            <div className="small" style={{ color: '#ff9b9b' }}>{error}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th
                    style={{cursor:'pointer'}}
                    onClick={()=>toggleSort('rank')}
                  >
                    # {sortArrow('rank')}
                  </th>
                  <th>Manager</th>
                  <th>Team</th>
                  <th
                    style={{cursor:'pointer'}}
                    onClick={()=>toggleSort('total')}
                  >
                    Total {sortArrow('total')}
                  </th>
                  <th
                    style={{cursor:'pointer'}}
                    onClick={()=>toggleSort('gw')}
                  >
                    GW Pts {sortArrow('gw')}
                  </th>
                  <th
                    style={{cursor:'pointer'}}
                    onClick={()=>toggleSort('currentQ')}
                  >
                    {currentScoreLabel} {sortArrow('currentQ')}
                  </th>
                  <th
                    style={{cursor:'pointer'}}
                    onClick={()=>toggleSort('wins')}
                  >
                    Quarter wins {sortArrow('wins')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLeague.map((e, idx) => (
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

              const statusClass =
                q.status === 'trwa' ? 'qactive' :
                q.status === 'zakończona' ? 'qdone' : '';

              const isLocked = q.status === 'wkrótce';
              const isOpen = !isLocked && openQuarter === q.id;
              const topRows = isOpen ? (quarterTop[q.id] || []) : [];

              return (
                <div
                  key={q.id}
                  className={`card ${statusClass} qcard-clickable`}
                  style={{
                    padding: '12px',
                    cursor: isLocked ? 'default' : 'pointer',
                    opacity: isLocked ? 0.8 : 1
                  }}
                  onClick={()=>toggleQuarterOpen(q.id, isLocked)}
                >
                  <div className="qtitle" style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:'4px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                      <span>{q.id}</span>
                      <span className="pill">{q.gw_from}–{q.gw_to}</span>
                    </div>
                    <span className="qchevron">
                      {isLocked ? '' : (isOpen ? '▲' : '▼')}
                    </span>
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

                  {isOpen && (
                    <div
                      className="small"
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid #1c2430',
                        lineHeight: 1.4
                      }}
                    >
                      <div style={{fontWeight:600, marginBottom:4}}>
                        Top 3 {q.id}:
                      </div>
                      {topRows.length === 0 ? (
                        <div>Brak danych</div>
                      ) : (
                        topRows.map((row, i) => (
                          <div key={row.entry} style={{marginBottom:4}}>
                            {i+1}. {row.player_name} ({row.entry_name}) – {row.points} pkt
                          </div>
                        ))
                      )}
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
