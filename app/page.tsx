'use client';
import React from 'react';
import type {
  LeagueEntry, Quarter, QuarterTopRow, QuarterHitsRow, GwPoint, CaptainInfo, TeamInfo,
  ChipInfo, SquadData, Awards, LeagueOverview, ChipHistoryEntry, SectionId, OverallRankInfo,
  CaptainBreakdownRow, TemplateOwnership, ChipRoundUsage,
} from './lib/types';
import Nav from './components/Nav';
import GwSummaryBanner from './components/GwSummaryBanner';
import KickoffFactsBanner from './components/KickoffFactsBanner';
import LeagueSection from './sections/LeagueSection';
import SeasonSection from './sections/SeasonSection';
import QuartersSection from './sections/QuartersSection';
import CompareSection from './sections/CompareSection';
import StatsSection from './sections/StatsSection';

export default function Home() {
  const [activeSection, setActiveSection] = React.useState<SectionId>('liga');

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
  // punktów wewnątrz kafelka ćwiartki (sekcja Ćwiartki).
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
  // pełna historia chipów w sezonie per manager (do modułu Chips w Statystykach)
  const [chipHistory, setChipHistory] = React.useState<Record<number, ChipHistoryEntry[]>>({});
  // Awards of the Week dla najświeższej kolejki
  const [awards, setAwards] = React.useState<Awards | null>(null);
  // historia GW-po-GW per manager (sparkline/forma w tabeli, wykresy i rekordy w Sezonie,
  // agregaty Transfers/Bench w Statystykach — jedno źródło danych dla wszystkiego)
  const [gwPoints, setGwPoints] = React.useState<Record<number, GwPoint[]>>({});
  // kapitan każdego managera w najświeższej kolejce (do kolumny "Kapitan" w tabeli)
  const [captainInfo, setCaptainInfo] = React.useState<Record<number, CaptainInfo>>({});
  // ranking ogólny FPL (spośród wszystkich graczy) każdego managera, live w trakcie kolejki —
  // pokazywany przy kapitanie w tabeli głównej
  const [overallRank, setOverallRank] = React.useState<Record<number, OverallRankInfo>>({});
  // wartość drużyny + transfery w najświeższej kolejce (subtelny wgląd pod nazwą teamu)
  const [teamInfo, setTeamInfo] = React.useState<Record<number, TeamInfo>>({});
  // status latestGw: true=zakończona, false=live, null=nie da się wiarygodnie ustalić (do
  // badge'a "GW X · LIVE/ZAKOŃCZONA" w Lidze) — z FPL bootstrap-static (już i tak pobierany)
  const [gwFinished, setGwFinished] = React.useState<boolean | null>(null);
  // czy pokazać powiadomienie "Podsumowanie GW" (aktywne 24h od końca ostatniego meczu latestGw —
  // patrz gwSummaryActive w /api/quarter-wins)
  const [gwSummaryActive, setGwSummaryActive] = React.useState<boolean>(false);
  // powiadomienie "kolejka wystartowała" (10 min po pierwszym gwizdku, do końca rundy) + jego treść
  const [kickoffFactsActive, setKickoffFactsActive] = React.useState<boolean>(false);
  const [captainBreakdown, setCaptainBreakdown] = React.useState<CaptainBreakdownRow[]>([]);
  const [templateOwnership, setTemplateOwnership] = React.useState<TemplateOwnership>(null);
  const [chipUsageThisRound, setChipUsageThisRound] = React.useState<ChipRoundUsage[]>([]);

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

  // przegląd całej ligi (chipy + top ownership) — lazy-load przy pierwszym wejściu w Statystyki
  const [overview, setOverview] = React.useState<LeagueOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);

  // porównywarka dwóch managerów — korzysta z tego samego squadCache co drill-down
  const [compareA, setCompareA] = React.useState<number | null>(null);
  const [compareB, setCompareB] = React.useState<number | null>(null);

  // retro easter egg UI
  const [showRetroBanner, setShowRetroBanner] = React.useState(false);

  // sortowanie tabeli
  const [sortKey, setSortKey] = React.useState<'rank' | 'total' | 'gw'>('rank');
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
        setChipHistory(wData.chipHistory || {});
        setAwards(wData.awards || null);
        setGwPoints(wData.gwPoints || {});
        setCaptainInfo(wData.captainInfo || {});
        setOverallRank(wData.overallRank || {});
        setTeamInfo(wData.teamInfo || {});
        setGwFinished(wData.gwFinished ?? null);
        setGwSummaryActive(!!wData.gwSummaryActive);
        setKickoffFactsActive(!!wData.kickoffFactsActive);
        setCaptainBreakdown(wData.captainBreakdown || []);
        setTemplateOwnership(wData.templateOwnership ?? null);
        setChipUsageThisRound(wData.chipUsageThisRound || []);
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
  function toggleSort(col: 'rank'|'total'|'gw') {
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
  }, [league, sortKey, sortDir, preSeason]);

  // helper do strzałki sortowania w nagłówku
  function sortArrow(col: 'rank'|'total'|'gw') {
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

  // lazy-load przeglądu ligi (chipy + top ownership) — wywoływane przez StatsSection przy
  // pierwszym wejściu w zakładkę Statystyki; idempotentne (bezpieczne do wywołania wielokrotnie)
  const overviewRequestedRef = React.useRef(false);
  const loadOverview = React.useCallback(async () => {
    if (overviewRequestedRef.current) return;
    overviewRequestedRef.current = true;

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
      overviewRequestedRef.current = false; // pozwól spróbować ponownie po błędzie
    } finally {
      setOverviewLoading(false);
    }
  }, []);

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

      <Nav active={activeSection} onChange={setActiveSection} />
      <KickoffFactsBanner
        gw={awards?.gw ?? 0}
        active={kickoffFactsActive}
        captainBreakdown={captainBreakdown}
        templateOwnership={templateOwnership}
        chipUsage={chipUsageThisRound}
        leagueSize={participants}
      />
      <GwSummaryBanner awards={awards} league={league} active={gwSummaryActive} />

      <div style={{ display: activeSection === 'liga' ? 'block' : 'none' }}>
        <LeagueSection
          leagueName={leagueName}
          participants={participants}
          league={league}
          sortedLeague={sortedLeague}
          preSeason={preSeason}
          loading={loading}
          error={error}
          sortKey={sortKey}
          sortDir={sortDir}
          toggleSort={toggleSort}
          sortArrow={sortArrow}
          quarters={quarters}
          currentQuarterId={currentQuarterId}
          latestChip={latestChip}
          chipHistory={chipHistory}
          captainInfo={captainInfo}
          overallRank={overallRank}
          teamInfo={teamInfo}
          gwPoints={gwPoints}
          openManagerEntry={openManagerEntry}
          toggleManager={toggleManager}
          squadCache={squadCache}
          squadLoading={squadLoading}
          squadErrors={squadErrors}
          useProjection={useProjection}
          setUseProjection={setUseProjection}
          downloadCsv={downloadCsv}
          awards={awards}
        />
      </div>

      <div style={{ display: activeSection === 'sezon' ? 'block' : 'none' }}>
        <SeasonSection league={league} gwPoints={gwPoints} entryIndex={entryIndex} />
      </div>

      <div style={{ display: activeSection === 'cwiartki' ? 'block' : 'none' }}>
        <QuartersSection
          quarters={quarters}
          sideError={sideError}
          entryIndex={entryIndex}
          winnersByQuarter={winnersByQuarter}
          quarterTop={quarterTop}
          quarterHitsTop={quarterHitsTop}
          showHits={showHits}
          setShowHits={setShowHits}
        />
      </div>

      <div style={{ display: activeSection === 'porownaj' ? 'block' : 'none' }}>
        <CompareSection
          league={league}
          gwPoints={gwPoints}
          squadCache={squadCache}
          squadLoading={squadLoading}
          squadErrors={squadErrors}
          compareA={compareA}
          compareB={compareB}
          selectCompare={selectCompare}
        />
      </div>

      <div style={{ display: activeSection === 'statystyki' ? 'block' : 'none' }}>
        <StatsSection
          active={activeSection === 'statystyki'}
          loadOverview={loadOverview}
          overview={overview}
          overviewLoading={overviewLoading}
          overviewError={overviewError}
          entryIndex={entryIndex}
          gwPoints={gwPoints}
          chipHistory={chipHistory}
          teamInfo={teamInfo}
        />
      </div>
    </>
  );
}
