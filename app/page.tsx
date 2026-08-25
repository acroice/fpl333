'use client';
import React from 'react';

type LeagueEntry = {
  entry: number;
  player_name: string; // Manager
  entry_name: string;  // Team
  total: number;
  rank: number;
  event_total: number;
  last_rank: number; // 0 = FPL nie ma jeszcze poprzedniej pozycji do porównania
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
  progress?: number; // 0–100, upływ czasu ćwiartki
};

type QuarterTopRow = {
  entry: number;
  player_name: string;
  entry_name: string;
  points: number;
};

type QuarterHitsRow = {
  entry: number;
  player_name: string;
  entry_name: string;
  hits: number; // pkt stracone na transferach ponad darmowy limit w tej ćwiartce
};

type GwPoint = { gw: number; pts: number };

type CaptainInfo = { element: number; name: string; photoUrl: string; points: number } | null;

type ChipInfo = { code: string; label: string; name?: string };

type SquadPlayer = {
  element: number;
  name: string;
  team: string;
  teamBadgeUrl: string;
  position: string;
  photoUrl: string;
  points: number;      // surowe punkty zawodnika w tej kolejce
  total: number;        // to, co faktycznie wliczyło się do wyniku (po ×kapitan)
  isCaptain: boolean;
  isViceCaptain: boolean;
  isBench: boolean;
  subbedIn: boolean;   // wszedł automatyczną zamianą (bo ktoś z podstawowej 11 nie zagrał)
  subbedOut: boolean;  // wypadł automatyczną zamianą (nie zagrał, mimo że był w podstawowej 11)
  multiplier: number;
  ownershipPct: number; // Effective Ownership % w naszej lidze (z uwzględnieniem ×kapitan)
};

type SquadData = {
  gw: number;
  entryId: number;
  playerName: string;
  entryName: string;
  activeChip: ChipInfo | null;
  entryHistory: {
    points: number; totalPoints: number;
    eventTransfers: number; eventTransfersCost: number;
    bank: number; value: number; pointsOnBench: number;
  };
  squad: SquadPlayer[];
  leagueSize: number;
  hasProjection: boolean;              // czy symulacja przewiduje realną zamianę/opaskę
  projectedSquad: SquadPlayer[] | null; // skład po symulowanych autosubach; null gdy hasProjection=false
  projectedTotal: number | null;
};

type Award = {
  entry: number; player_name: string; entry_name: string;
  points?: number; value?: number; chip?: ChipInfo | null; rankChange?: number;
  bonus?: number | null; // Chip Master: pkt zdobyte dzięki chipowi (BB/TC); null gdy nie da się policzyć (WC/FH)
  captainName?: string; captainPts?: number; templateCaptainName?: string; templateCaptainPts?: number; // Best Captain
} | null;

type Awards = {
  gw: number;
  topGun: Award; toughWeek: Award; chipMaster: Award;
  noChipWarrior: Award; valueKing: Award; rankCrasher: Award; bestCaptain: Award;
};

type ChipUsageRow = { code: string; label: string; name: string; count: number; pct: number };

type TopOwnedRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  ownedCount: number; ownedPct: number; captainCount: number;
};

type CaptaincyRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  points: number; captainCount: number; captainPct: number;
};

type DifferentialRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  points: number; ownedCount: number; ownedPct: number;
};

type LeagueOverview = {
  gw: number; leagueSize: number;
  chipUsage: ChipUsageRow[]; topOwned: TopOwnedRow[]; captaincy: CaptaincyRow[]; differentials: DifferentialRow[];
};

// ikonki chipów FPL do badge'y — czysto kosmetyczne, kod chipa i tak jest w tooltipie
const CHIP_ICON: Record<string, string> = {
  bboost: '🪑', wildcard: '🃏', freehit: '🎯', '3xc': '👑', manager: '👔',
};
function chipIcon(code: string) {
  return CHIP_ICON[code] || '🔹';
}

// medal/pozycja dla rankingów w kafelku ćwiartki (Top3, minusowe pkt)
function rankBadge(i: number) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
}

// klucz statusu ćwiartki do klas CSS (paska sezonu, pigułki statusu) — steruje kolorem kropki:
// trwa = zielona (live), wkrótce = żółta (pending), zakończona = czerwona (closed)
function quarterStatusKey(status: Quarter['status']) {
  return status === 'trwa' ? 'active' : status === 'zakończona' ? 'done' : 'upcoming';
}

// mały okrągły awatar zawodnika (oficjalne zdjęcie z CDN Premier League) — jeśli się nie
// załaduje (np. zawodnik bez zdjęcia), po prostu znika, żeby nie zostawiać "złamanej" ikonki
function PlayerAvatar({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return <span className="playeravatar playeravatar--fallback" aria-hidden="true">{alt.slice(0, 1)}</span>;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="playeravatar"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

// mały herb klubu — jeśli się nie załaduje, po prostu znika (sam skrót klubu w tekście wystarczy)
function ClubBadge({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={alt} className="clubbadge" loading="lazy" onError={() => setBroken(true)} />;
}

// trend formy: średnia z ostatnich kolejek vs średnia z tych wcześniejszych. Potrzebuje min.
// 2 rozegranych GW (czyli realnie ruszy od GW2/3) — przy mniejszej ilości danych zwraca null,
// żeby front mógł to po prostu schować zamiast pokazywać mylący wynik na jednej kolejce.
function computeForm(points: number[]): 'up' | 'down' | 'flat' | null {
  if (points.length < 2) return null;
  const recentN = Math.min(3, points.length - 1);
  const recent = points.slice(points.length - recentN);
  const prior = points.slice(0, points.length - recentN);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(recent) - avg(prior);
  if (diff > 2) return 'up';
  if (diff < -2) return 'down';
  return 'flat';
}

// kompaktowy sparkline (SVG, bez zależności) — trend punktów managera z rozegranych kolejek
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 56, h = 18, pad = 2;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = pad + (points.length - 1) * stepX;
  const lastY = h - pad - ((points[points.length - 1] - min) / range) * (h - pad * 2);
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden="true">
      <polyline points={coords} fill="none" stroke="#5ee1a2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.8" fill="#5ee1a2" />
    </svg>
  );
}

export default function Home() {
  const [league, setLeague] = React.useState<LeagueEntry[]>([]);
  const [leagueName, setLeagueName] = React.useState<string>('');
  const [participants, setParticipants] = React.useState<number>(0);
  const [quarters, setQuarters] = React.useState<Quarter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // błąd sekcji ćwiartek (quarters/quarter-wins) — osobny od błędu tabeli ligi, żeby
  // przejściowa awaria jednego z nich nie kasowała już poprawnie wczytanej tabeli
  const [sideError, setSideError] = React.useState<string | null>(null);
  const [preSeason, setPreSeason] = React.useState<boolean>(false);

  const [qWins, setQWins] = React.useState<Record<number, number>>({});
  const [currentScores, setCurrentScores] = React.useState<Record<number, number>>({});
  const [currentQuarterId, setCurrentQuarterId] = React.useState<string>('Q1');

  // minusowe pkt (transfery ponad darmowy limit) w bieżącej ćwiartce, per manager — czysto
  // informacyjne: currentScores jest już netto, to tylko pokazuje "ile to kosztowało". Badge
  // w głównej tabeli jest zawsze widoczny; ten toggle steruje tylko rankingiem minusowych
  // punktów wewnątrz rozwiniętego kafelka ćwiartki (Quarter Rankings, na dole strony).
  const [currentHits, setCurrentHits] = React.useState<Record<number, number>>({});
  const [showHits, setShowHits] = React.useState(false);

  // zwycięzcy zakończonych ćwiartek
  const [winnersByQuarter, setWinnersByQuarter] = React.useState<
    Record<string, { entry: number; points: number }[]>
  >({});

  // TOP3 w każdej ćwiartce
  const [quarterTop, setQuarterTop] = React.useState<
    Record<string, QuarterTopRow[]>
  >({});

  // ranking "hit-takerów" (top5, tylko hits>0) w każdej ćwiartce
  const [quarterHitsTop, setQuarterHitsTop] = React.useState<
    Record<string, QuarterHitsRow[]>
  >({});

  // chip zagrany przez każdego managera w najświeższej kolejce (BB/WC/FH/TC), do badge'a w tabeli
  const [latestChip, setLatestChip] = React.useState<Record<number, ChipInfo | null>>({});
  // Awards of the Week dla najświeższej kolejki
  const [awards, setAwards] = React.useState<Awards | null>(null);
  // historia GW-po-GW per manager (do sparkline'a i wskaźnika formy w tabeli)
  const [gwPoints, setGwPoints] = React.useState<Record<number, GwPoint[]>>({});
  // kapitan każdego managera w najświeższej kolejce (do kolumny "Kapitan" w tabeli)
  const [captainInfo, setCaptainInfo] = React.useState<Record<number, CaptainInfo>>({});

  // drill-down składu: który manager jest rozwinięty, cache składów (per entryId) i stany ładowania.
  // Ładowanie/błędy trzymane per-entry (Record), bo drill-down w tabeli i porównywarka mogą
  // ładować różne składy równolegle.
  const [openManagerEntry, setOpenManagerEntry] = React.useState<number | null>(null);
  const [squadCache, setSquadCache] = React.useState<Record<number, SquadData>>({});
  const [squadLoading, setSquadLoading] = React.useState<Record<number, boolean>>({});
  const [squadErrors, setSquadErrors] = React.useState<Record<number, string | null>>({});
  // czy pokazywać projekcję autosubów zamiast "jak wybrany" skład — domyślnie włączona, gdy
  // dostępna (żeby od razu widzieć realny wynik, bez czekania aż FPL to oficjalnie policzy)
  const [useProjection, setUseProjection] = React.useState<Record<number, boolean>>({});

  // przegląd całej ligi (chipy + top ownership) — opcjonalny, ładowany na żądanie po kliknięciu
  const [showOverview, setShowOverview] = React.useState(false);
  const [overview, setOverview] = React.useState<LeagueOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);

  // porównywarka dwóch managerów — opcjonalna, korzysta z tego samego squadCache co drill-down
  const [showCompare, setShowCompare] = React.useState(false);
  const [compareA, setCompareA] = React.useState<number | null>(null);
  const [compareB, setCompareB] = React.useState<number | null>(null);

  // sekcja "Ćwiartki" (przeniesiona na dół strony) — domyślnie widoczna, chowana kafelkiem
  const [showQuarters, setShowQuarters] = React.useState(true);

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
      // 1) tabela ligi — jeśli padnie, tylko ta sekcja pokazuje błąd
      try {
        const res = await fetch('/api/league?leagueId=1078207', { cache: 'no-store' });
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
        setLeagueName(data.leagueName || '');
        setError(null);
      } catch (err: any) {
        console.error('league load error:', err?.message);
        setError('nie udało się pobrać danych ligi (spróbuj odświeżyć za chwilę)');
        setLeague([]);
        setParticipants(0);
      } finally {
        setLoading(false);
      }

      // 2) ćwiartki + wygrane — niezależne od tabeli ligi: jeśli któreś z tego padnie,
      // już wczytana tabela ligi zostaje na ekranie, a błąd pokazujemy tylko w tej sekcji
      try {
        const qRes = await fetch('/api/quarters', { cache: 'no-store' });
        const qData = await resOrThrow(qRes);
        setQuarters(qData.quarters || []);
        setCurrentQuarterId(qData.current || 'Q1');

        const wRes = await fetch('/api/quarter-wins?leagueId=1078207', { cache: 'no-store' });
        const wData = await resOrThrow(wRes);

        setQWins(wData.wins || {});
        setCurrentScores(wData.currentScores || {});
        setCurrentHits(wData.currentHits || {});
        if (wData.currentQuarter) setCurrentQuarterId(wData.currentQuarter);
        setWinnersByQuarter(wData.winnersByQuarter || {});
        setQuarterTop(wData.quarterTop || {});
        setQuarterHitsTop(wData.quarterHitsTop || {});
        setLatestChip(wData.latestChip || {});
        setAwards(wData.awards || null);
        setGwPoints(wData.gwPoints || {});
        setCaptainInfo(wData.captainInfo || {});
        setSideError(null);
      } catch (err: any) {
        console.error('quarters/wins load error:', err?.message);
        setSideError('nie udało się pobrać danych ćwiartek (spróbuj odświeżyć za chwilę)');
      }
    }
    load();
  }, []);

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

  // pobiera skład managera (bieżąca kolejka) i wrzuca do wspólnego cache, jeśli jeszcze go nie ma.
  // Współdzielone przez drill-down w tabeli i porównywarkę — ten sam manager kliknięty w obu
  // miejscach nie dociąga danych drugi raz.
  async function ensureSquadLoaded(entry: number) {
    if (squadCache[entry]) return; // już mamy w cache

    setSquadLoading(prev => ({ ...prev, [entry]: true }));
    setSquadErrors(prev => ({ ...prev, [entry]: null }));
    try {
      const res = await fetch(`/api/squad?leagueId=1078207&entryId=${entry}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'squad fetch failed');
      setSquadCache(prev => ({ ...prev, [entry]: data }));
    } catch (err: any) {
      console.error('squad load error:', err?.message);
      setSquadErrors(prev => ({ ...prev, [entry]: 'nie udało się pobrać składu (spróbuj ponownie)' }));
    } finally {
      setSquadLoading(prev => ({ ...prev, [entry]: false }));
    }
  }

  // kliknięcie wiersza managera w tabeli — rozwija/zwija drill-down składu
  function toggleManager(entry: number) {
    if (openManagerEntry === entry) {
      setOpenManagerEntry(null);
      return;
    }
    setOpenManagerEntry(entry);
    ensureSquadLoaded(entry);
  }

  // przełącznik przeglądu ligi (chipy + top ownership) — ładowany leniwie przy pierwszym otwarciu
  async function toggleOverview() {
    const next = !showOverview;
    setShowOverview(next);
    if (!next || overview) return; // zwijamy, albo już mamy dane

    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch('/api/league-overview?leagueId=1078207', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'overview fetch failed');
      setOverview(data);
    } catch (err: any) {
      console.error('overview load error:', err?.message);
      setOverviewError('nie udało się pobrać przeglądu ligi (spróbuj ponownie)');
    } finally {
      setOverviewLoading(false);
    }
  }

  // wybór managera do porównywarki (slot A lub B) — od razu doładowuje jego skład
  function selectCompare(slot: 'A' | 'B', entry: number | null) {
    if (slot === 'A') setCompareA(entry); else setCompareB(entry);
    if (entry != null) ensureSquadLoaded(entry);
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
      `${currentQuarterId} Minusowe pkt`,
      'Quarter wins'
    ];

    const rows = sortedLeague.map((e, idx) => {
      const displayRank = preSeason ? (idx + 1) : e.rank;
      const wins = qWins[e.entry] ? '🏆'.repeat(qWins[e.entry]) : '';
      const currentQpts = currentScores[e.entry] ?? 0;
      const currentQhits = currentHits[e.entry] ?? 0;

      return [
        displayRank,
        e.player_name,
        e.entry_name,
        e.total,
        e.event_total,
        currentQpts,
        currentQhits,
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

      <div className="grid grid--single">
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
              {leagueName || 'Planowane składy'}{' '}
              <span className="small">uczestnicy: {participants}</span>
            </div>

            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button
                onClick={() => setShowQuarters(v => !v)}
                title="Podsumowanie ćwiartek sezonu (Q1–Q4) — na dole strony"
                className={`toggle-btn${showQuarters ? ' is-active' : ''}`}
              >
                <span className="dot" />
                Ćwiartki
              </button>
              <button
                onClick={toggleOverview}
                title="Chipy i ownership w całej lidze dla bieżącej kolejki"
                className={`toggle-btn${showOverview ? ' is-active' : ''}`}
              >
                <span className="dot" />
                Wgląd w ligę
              </button>
              <button
                onClick={() => setShowCompare(v => !v)}
                title="Porównaj składy dwóch managerów w bieżącej kolejce"
                className={`toggle-btn${showCompare ? ' is-active' : ''}`}
              >
                <span className="dot" />
                Porównaj
              </button>
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
          </div>

          {awards && (
            <div className="awardsrow">
              {awards.topGun && (
                <span className="statchip statchip--good" title="Najwyższy wynik w tej kolejce">
                  <span className="statchip-icon">🏆</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Top Gun</span>
                    <span className="statchip-value">{awards.topGun.player_name} · <b>{awards.topGun.points}</b></span>
                  </span>
                </span>
              )}
              {awards.toughWeek && (
                <span className="statchip statchip--bad" title="Najniższy wynik w tej kolejce">
                  <span className="statchip-icon">📉</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Tough Week</span>
                    <span className="statchip-value">{awards.toughWeek.player_name} · <b>{awards.toughWeek.points}</b></span>
                  </span>
                </span>
              )}
              {awards.chipMaster && (
                <span
                  className="statchip statchip--special"
                  title={
                    awards.chipMaster.bonus != null
                      ? `Punkty zdobyte dzięki chipowi ${awards.chipMaster.chip?.label} (nie total z kolejki)`
                      : 'Najlepszy wynik z zagranym chipem (dla tego chipa nie da się policzyć samego zysku)'
                  }
                >
                  <span className="statchip-icon">🏅</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Chip Master · {awards.chipMaster.chip?.label}</span>
                    <span className="statchip-value">
                      {awards.chipMaster.player_name} ·{' '}
                      <b>
                        {awards.chipMaster.bonus != null
                          ? `+${awards.chipMaster.bonus} z chipa`
                          : `${awards.chipMaster.points} pkt`}
                      </b>
                    </span>
                  </span>
                </span>
              )}
              {awards.noChipWarrior && (
                <span className="statchip statchip--neutral" title="Najlepszy wynik bez chipa">
                  <span className="statchip-icon">🛡️</span>
                  <span className="statchip-text">
                    <span className="statchip-label">No-Chip Warrior</span>
                    <span className="statchip-value">{awards.noChipWarrior.player_name} · <b>{awards.noChipWarrior.points}</b></span>
                  </span>
                </span>
              )}
              {awards.valueKing && (
                <span className="statchip statchip--special" title="Najwyższa wartość drużyny">
                  <span className="statchip-icon">💰</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Value King</span>
                    <span className="statchip-value">{awards.valueKing.player_name} · <b>£{((awards.valueKing.value ?? 0) / 10).toFixed(1)}m</b></span>
                  </span>
                </span>
              )}
              {awards.rankCrasher && (
                <span className="statchip statchip--bad" title="Największy spadek w rankingu ogólnym FPL vs poprzednia kolejka">
                  <span className="statchip-icon">🔻</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Rank Crasher</span>
                    <span className="statchip-value">{awards.rankCrasher.player_name} · <b>-{awards.rankCrasher.rankChange?.toLocaleString('pl')}</b></span>
                  </span>
                </span>
              )}
              {awards.bestCaptain && (
                <span
                  className="statchip statchip--good"
                  title={`Zagrał innego kapitana niż większość ligi (${awards.bestCaptain.templateCaptainName}, ${awards.bestCaptain.templateCaptainPts} pkt) i wygrał`}
                >
                  <span className="statchip-icon">🧠</span>
                  <span className="statchip-text">
                    <span className="statchip-label">Best Captain</span>
                    <span className="statchip-value">
                      {awards.bestCaptain.player_name} · <b>{awards.bestCaptain.captainName} {awards.bestCaptain.captainPts}</b>
                    </span>
                  </span>
                </span>
              )}
            </div>
          )}

          {showOverview && (
            <div className="small" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #1c2430' }}>
              {overviewLoading ? (
                <div>Ładowanie przeglądu ligi…</div>
              ) : overviewError ? (
                <div style={{ color: '#ff9b9b' }}>{overviewError}</div>
              ) : !overview ? (
                <div>Brak danych</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Chipy w GW{overview.gw} (cała liga):
                  </div>
                  <div className="awardsrow" style={{ marginBottom: 12 }}>
                    {overview.chipUsage.map(c => (
                      <span key={c.code} className="awardpill" title={c.name}>
                        {c.code !== 'none' && `${chipIcon(c.code)} `}{c.label}: {c.count} ({c.pct}%)
                      </span>
                    ))}
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Captaincy Stats:
                  </div>
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

                  <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>
                    Najczęściej wybierani, top 6:
                  </div>
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

                  <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>
                    🎯 Różnicowi zawodnicy (nisko obstawiani, wysokie pkt):
                  </div>
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
                </>
              )}
            </div>
          )}

          {showCompare && (
            <div className="small" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #1c2430' }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom: 12 }}>
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
                <div>Wybierz dwóch managerów, żeby porównać ich składy w bieżącej kolejce.</div>
              ) : compareA === compareB ? (
                <div>Wybierz dwóch różnych managerów.</div>
              ) : squadLoading[compareA] || squadLoading[compareB] ? (
                <div>Ładowanie składów…</div>
              ) : squadErrors[compareA] || squadErrors[compareB] ? (
                <div style={{ color: '#ff9b9b' }}>{squadErrors[compareA] || squadErrors[compareB]}</div>
              ) : !squadCache[compareA] || !squadCache[compareB] ? (
                <div>Brak danych</div>
              ) : (() => {
                const sqA = squadCache[compareA];
                const sqB = squadCache[compareB];
                const bElements = new Set(sqB.squad.map(p => p.element));
                const aElements = new Set(sqA.squad.map(p => p.element));

                // różnice składu (differentials) — posortowane wg wpływu na wynik (najwięcej pkt na górze),
                // żeby od razu było widać, który różnicowy zawodnik realnie decyduje o przewadze
                const onlyA = sqA.squad.filter(p => !bElements.has(p.element)).sort((a, b) => b.total - a.total);
                const onlyB = sqB.squad.filter(p => !aElements.has(p.element)).sort((a, b) => b.total - a.total);
                const commonCount = sqA.squad.length - onlyA.length;
                const capA = sqA.squad.find(p => p.isCaptain);
                const capB = sqB.squad.find(p => p.isCaptain);

                const totalA = sqA.entryHistory.points;
                const totalB = sqB.entryHistory.points;
                const totalDiff = totalA - totalB;

                // suma punktów, które faktycznie wniosły różnicowi zawodnicy (po ×kapitan) — to jest
                // "ile ci różni zawodnicy realnie zmienili w wyniku", a nie tylko lista nazwisk
                const onlyASum = onlyA.reduce((sum, p) => sum + p.total, 0);
                const onlyBSum = onlyB.reduce((sum, p) => sum + p.total, 0);
                const diffSwing = onlyASum - onlyBSum;

                // Top różnicowy: zawodnik z największym wpływem na wynik spośród wszystkich
                // różnic (obu stron łącznie) — ten jeden pick, który najbardziej rozjeżdża wyniki
                const topDiff = [...onlyA, ...onlyB].sort((a, b) => b.total - a.total)[0] ?? null;
                const topDiffOwner = topDiff && onlyA.includes(topDiff) ? sqA.playerName : sqB.playerName;

                // pełny skład jednej strony, posortowany wg wpływu na wynik — różnicowi zawodnicy
                // (ci, których nie ma u przeciwnika) renderują się normalnie, wspólni są wyblakli,
                // żeby różnice od razu rzucały się w oczy zamiast ginąć w 15-osobowej liście
                const renderSquad = (rows: SquadPlayer[], otherElements: Set<number>) =>
                  [...rows]
                    .sort((a, b) => b.total - a.total)
                    .map(p => {
                      const isDiff = !otherElements.has(p.element);
                      return (
                        <div
                          key={p.element}
                          className="squadplayer"
                          style={isDiff ? undefined : { opacity: 0.4 }}
                        >
                          <span className="squadplayer-name">
                            <PlayerAvatar src={p.photoUrl} alt={p.name} />
                            <span className="pill">{p.position}</span>
                            {p.name} <ClubBadge src={p.teamBadgeUrl} alt={p.team} /> ({p.team})
                            {p.isCaptain && ' (C)'}
                            {p.isBench && <span className="subbadge" title="Na ławce">ław.</span>}
                          </span>
                          <span>{p.total} pkt</span>
                        </div>
                      );
                    });

                return (
                  <>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                        gap: 10, marginBottom: 10
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                        {sqA.playerName}: {totalA} pkt
                      </span>
                      <span style={{ color: 'var(--muted)' }}>vs</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                        {sqB.playerName}: {totalB} pkt
                      </span>
                      {totalDiff !== 0 ? (
                        <span className="leadbadge">
                          {totalDiff > 0 ? sqA.playerName : sqB.playerName} prowadzi o {Math.abs(totalDiff)} pkt
                        </span>
                      ) : (
                        <span className="leadbadge leadbadge--neutral">remis</span>
                      )}
                    </div>

                    {topDiff && (
                      <div className="statchip statchip--special" style={{ marginBottom: 10 }}>
                        <span className="statchip-icon">🎯</span>
                        <span className="statchip-text">
                          <span className="statchip-label">Top różnicowy</span>
                          <span className="statchip-value">
                            {topDiff.name} <span className="small">({topDiff.team})</span> · <b>{topDiff.total} pkt</b> — tylko u {topDiffOwner}
                          </span>
                        </span>
                      </div>
                    )}

                    <div style={{ marginBottom: 10 }}>
                      Kapitan: <strong>{sqA.playerName}</strong>: {capA ? `${capA.name} · ${capA.total} pkt` : '—'}
                      {' '}vs{' '}
                      <strong>{sqB.playerName}</strong>: {capB ? `${capB.name} · ${capB.total} pkt` : '—'}
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

                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--muted)' }}>Różnica z różnic składu:</span>
                      {diffSwing !== 0 ? (
                        <span className="leadbadge">
                          {diffSwing > 0 ? sqA.playerName : sqB.playerName} +{Math.abs(diffSwing)} pkt
                        </span>
                      ) : (
                        <span className="leadbadge leadbadge--neutral">bez przewagi</span>
                      )}
                    </div>
                    <div style={{ marginTop: 6, color: 'var(--muted)' }}>
                      Wspólnych zawodników: {commonCount}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {loading ? (
            <div>Loading…</div>
          ) : error ? (
            <div className="small" style={{ color: '#ff9b9b' }}>{error}</div>
          ) : (
            <div className="table-scroll">
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
                  <th title="Kapitan w bieżącej kolejce">Kapitan</th>
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
                  <th title="Trend z rozegranych kolejek">Forma</th>
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
                {sortedLeague.map((e, idx) => {
                  const isOpenManager = openManagerEntry === e.entry;
                  const chip = latestChip[e.entry];
                  const squad = squadCache[e.entry];
                  const ptsHistory = (gwPoints[e.entry] || []).map(g => g.pts);
                  const form = computeForm(ptsHistory);
                  const captain = captainInfo[e.entry];

                  return (
                    <React.Fragment key={e.entry}>
                      <tr
                        onClick={() => toggleManager(e.entry)}
                        style={{ cursor: 'pointer' }}
                        title="Kliknij, żeby zobaczyć skład w bieżącej kolejce"
                      >
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
                          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            <Sparkline points={ptsHistory} />
                            {form === 'up' && <span className="formtrend formtrend--up" title="Forma w górę (ostatnie kolejki powyżej wcześniejszej średniej)">▲</span>}
                            {form === 'down' && <span className="formtrend formtrend--down" title="Forma w dół (ostatnie kolejki poniżej wcześniejszej średniej)">▼</span>}
                            {form === 'flat' && <span className="formtrend formtrend--flat" title="Stabilna forma">→</span>}
                          </span>
                        </td>
                        <td>
                          {currentScores[e.entry] ?? 0}
                          {(currentHits[e.entry] ?? 0) > 0 && (
                            <span
                              className="hitbadge"
                              title={`Minusowe pkt (transfery ponad darmowy limit) w ${currentScoreLabel}: -${currentHits[e.entry]} pkt (${currentHits[e.entry] / 4} × -4 za transfer ponad limit)`}
                            >
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

                              // punkty ławki liczone z samego składu (nie z FPL entryHistory.pointsOnBench,
                              // które przy Bench Boost pokazuje 0 — bo nic się "nie zmarnowało", a nie że
                              // ławka nie zdobyła punktów). Czy się liczą, widać już przy graczach niżej
                              // (✓/– obok punktów), więc tu tylko surowa suma.
                              const benchRawPoints = displaySquad
                                .filter(p => p.isBench)
                                .reduce((sum, p) => sum + p.points, 0);

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
                                    <span
                                      className="viewswitch"
                                      role="group"
                                      aria-label="Widok składu: jak wybrany czy z projekcją autosubów"
                                      title="Ktoś w tym składzie na pewno nie zagrał (mecz się skończył) — przełącz między projekcją autosubów a surowym wyborem"
                                    >
                                      <span className="viewswitch-thumb" style={{ transform: showingProjected ? 'translateX(100%)' : 'translateX(0)' }} />
                                      <button
                                        onClick={() => setUseProjection(prev => ({ ...prev, [e.entry]: false }))}
                                        className={`viewswitch-option${!showingProjected ? ' is-active' : ''}`}
                                      >
                                        Wybrany
                                      </button>
                                      <button
                                        onClick={() => setUseProjection(prev => ({ ...prev, [e.entry]: true }))}
                                        className={`viewswitch-option${showingProjected ? ' is-active' : ''}`}
                                      >
                                        🔮 Projekcja
                                      </button>
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
                                      <span
                                        className={`countmark ${p.multiplier > 0 ? 'countmark--on' : 'countmark--off'}`}
                                        title={p.multiplier > 0 ? 'Liczy się do wyniku' : 'Nie liczy się do wyniku (ławka)'}
                                      >
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
        </section>
      </div>

      {showQuarters && (
        <section className="card" style={{ marginTop: 16 }}>
          <div
            className="headline"
            style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', rowGap:'8px', columnGap:'12px' }}
          >
            <div>Podsumowanie ćwiartek</div>
            <button
              onClick={() => setShowHits(v => !v)}
              title="Pokaż ranking minusowych punktów (transfery ponad darmowy limit) w rozwiniętej ćwiartce"
              className={`toggle-btn${showHits ? ' is-active' : ''}`}
            >
              <span className="dot" />
              Minusowe pkt
            </button>
          </div>

          {sideError ? (
            <div className="small" style={{ color: '#ff9b9b' }}>{sideError}</div>
          ) : (
          <>
            {/* pasek sezonu: 4 segmenty proporcjonalne do liczby kolejek w ćwiartce (10/9/9/10),
                z paskiem postępu wewnątrz tej, która aktualnie trwa — jednym spojrzeniem widać,
                gdzie w sezonie jesteśmy. Czysto informacyjny (bez klikania — kafelki niżej i tak
                zawsze pokazują swoje Top3, więc nie ma czego "otwierać"). */}
            <div className="seasonbar" role="img" aria-label="Postęp sezonu wg ćwiartek">
              {quarters.map(q => {
                const key = quarterStatusKey(q.status);
                return (
                  <div
                    key={q.id}
                    className={`seasonbar-seg seasonbar-seg--${key}`}
                    style={{ flexGrow: q.games }}
                    title={`${q.id} • GW${q.gw_from}–${q.gw_to} • ${q.status}`}
                  >
                    {key === 'active' && (
                      <span className="seasonbar-fill" style={{ width: `${q.progress ?? 0}%` }} />
                    )}
                    <span className="seasonbar-label">{q.id}</span>
                  </div>
                );
              })}
            </div>

            <div className="quartersgrid">
            {quarters.map((q) => {
              const winners = winnersByQuarter[q.id] || [];
              const winnerLabel =
                q.status === 'zakończona' && winners.length
                  ? winners.map(w => {
                      const who = entryIndex[w.entry];
                      const pts = w.points || 0;
                      return `${who?.manager ?? '—'} (${who?.team ?? '—'}) – ${pts} pkt`;
                    }).join(', ')
                  : '';

              const statusClass =
                q.status === 'trwa' ? 'qactive' :
                q.status === 'zakończona' ? 'qdone' : '';
              const statusKey = quarterStatusKey(q.status);

              const isLocked = q.status === 'wkrótce';
              const topRows = quarterTop[q.id] || [];
              const hitsRows = showHits ? (quarterHitsTop[q.id] || []) : [];
              // wartość lidera każdej listy (obie są już posortowane malejąco z API) — używana
              // do subtelnego "X pkt do lidera" przy pozostałych wierszach zamiast paska postępu
              const maxTopPts = topRows[0]?.points ?? 0;
              const maxHitPts = hitsRows[0]?.hits ?? 0;

              return (
                <div
                  key={q.id}
                  className={`card qcard ${statusClass}`}
                  style={{ opacity: isLocked ? 0.85 : 1 }}
                >
                  <div className="qtitle" style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'6px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                      <span className="qcard-id">{q.id}</span>
                      <span className="pill">GW {q.gw_from}–{q.gw_to}</span>
                    </div>
                    <span className={`qstatuspill qstatuspill--${statusKey}`}>
                      <span className="qstatusdot" />
                      {q.status}
                    </span>
                  </div>

                  <div className="small" style={{ marginTop: 6 }}>
                    {q.games} kolejek • {q.from} → {q.to}
                  </div>
                  <div className="small">{q.note}</div>

                  {/* Pasek postępu trwającej ćwiartki — realny % upływu czasu z API */}
                  {q.status === 'trwa' && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                      <div className="qprogress" style={{ flex: 1 }}>
                        <div className="qprogress-fill" style={{ width: `${q.progress ?? 0}%` }} />
                      </div>
                      <span className="small" style={{ flexShrink: 0 }}>{q.progress ?? 0}%</span>
                    </div>
                  )}

                  {winnerLabel && (
                    <div className="small" style={{ marginTop: 8 }}>
                      🏆 <strong style={{ color: 'var(--text)' }}>Zwycięzca:</strong> {winnerLabel}
                    </div>
                  )}

                  <div
                    className="small"
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid #1c2430',
                      lineHeight: 1.4
                    }}
                  >
                    {isLocked ? (
                      <div>Ćwiartka jeszcze się nie zaczęła — brak wyników</div>
                    ) : (
                      <>
                        <div style={{fontWeight:600, marginBottom:6}}>
                          Top 3 {q.id}
                        </div>
                        {topRows.length === 0 ? (
                          <div>Brak danych</div>
                        ) : (
                          topRows.map((row, i) => (
                            <div key={row.entry} className="rankbar">
                              <div className="rankbar-top">
                                <span className="rankbar-rank">{rankBadge(i)}</span>
                                <span className="rankbar-name">
                                  {row.player_name} <span className="small">({row.entry_name})</span>
                                </span>
                                <span className="rankbar-pts">{row.points}</span>
                              </div>
                              {i > 0 && (
                                <div className="rankbar-gap">-{maxTopPts - row.points} pkt do lidera</div>
                              )}
                            </div>
                          ))
                        )}

                        {showHits && (
                          <>
                            <div style={{fontWeight:600, marginTop:12, marginBottom:6}}>
                              ⚡ Minusowe pkt {q.id}
                            </div>
                            {hitsRows.length === 0 ? (
                              <div>Nikt nie miał minusowych punktów w tej ćwiartce</div>
                            ) : (
                              hitsRows.map((row, i) => (
                                <div key={row.entry} className="rankbar">
                                  <div className="rankbar-top">
                                    <span className="rankbar-rank">{i + 1}.</span>
                                    <span className="rankbar-name">
                                      {row.player_name} <span className="small">({row.entry_name})</span>
                                    </span>
                                    <span className="rankbar-pts" style={{ color:'#ff9b9b' }}>-{row.hits}</span>
                                  </div>
                                  {i > 0 && (
                                    <div className="rankbar-gap">-{maxHitPts - row.hits} pkt mniej niż lider</div>
                                  )}
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </>
          )}
        </section>
      )}
    </>
  );
}
