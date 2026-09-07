import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryHistoryCached,
  fetchEntryPicksCached,
  fetchEntryTransfersCached,
  collapseTransferChain,
  effectiveMultiplierAfterSubs,
  computeFreeTransfersAvailable,
  fetchEventLiveCached,
  fetchEventMinutesCached,
  fetchFinishedTeamsCached,
  simulateAutosubs,
  fetchBootstrapCached,
  fetchClassicStandingsCached,
  estimateLiveOverallRank,
  fetchGwCompletionCached,
  playerPhotoUrl,
  CHIP_LABELS,
  CHIP_NAMES,
  type PicksData,
} from '../_lib/fpl';

export const revalidate = 0;

// Typ pomocniczy dla kwart
type QuarterRange = {
  id: string;
  fromGW: number;
  toGW: number;
  fromDate: Date;
  toDate: Date;
};

// starty GW – kopiujemy z naszej logiki sezonu
function buildQuarterRanges(): QuarterRange[] {
  // Dane GW start (dzień startu kolejki PL) – sezon 2026/27, z /api/bootstrap-static/
  const gwDays   = [21,28,4,12,18,10,17,23,31,7,21,28,2,5,12,19,26,30,2,6,16,23,30,6,10,20,27,3,13,20,10,17,24,1,8,15,23,30];
  const gwMonths = [8,8,9,9,9,10,10,10,10,11,11,11,12,12,12,12,12,12,1,1,1,1,1,2,2,2,2,3,3,3,4,4,4,5,5,5,5,5]; // 1-index months
  const gwYears  = [2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027];

  // Zbuduj daty startu każdej GW jako Date (początek dnia w PL potraktowany jako północ UTC)
  const starts: Date[] = [];
  for (let i=0;i<38;i++){
    starts.push(new Date(Date.UTC(gwYears[i], gwMonths[i]-1, gwDays[i], 0,0,0)));
  }

  // Konfiguracja ćwiartek
  const base = [
    { id: 'Q1', fromGW: 1,  toGW: 10 },
    { id: 'Q2', fromGW: 11, toGW: 19 },
    { id: 'Q3', fromGW: 20, toGW: 28 },
    { id: 'Q4', fromGW: 29, toGW: 38 },
  ];

  // koniec Q4 -> koniec sezonu = 30.05.2027 (start GW38)
  const seasonEnd = new Date(Date.UTC(2027, 4, 30, 23,59,59));

  const ranges: QuarterRange[] = base.map(r => {
    const fromDate = starts[r.fromGW-1];
    const toDate =
      r.id === 'Q4'
        ? seasonEnd
        : new Date(starts[r.toGW].getTime() - 24*3600*1000); // dzień przed kolejną GW
    return { ...r, fromDate, toDate };
  });

  return ranges;
}

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '1078207').trim();

  try {
    const ranges = buildQuarterRanges();
    const now = new Date();

    // Uczestnicy ligi (entryId + nazwy)
    const leagueEntries = await fetchLeagueEntries(leagueId);

    // Przygotowanie struktur:
    // - winsCount[entryId] = ile pucharów (wygranych ćwiartek zakończonych)
    // - currentScores[entryId] = wynik w aktualnej ćwiartce (tej która trwa)
    // - currentHits[entryId] = ile pkt stracił na hitach (transferach ponad darmowy limit)
    //   w aktualnej ćwiartce — punkty w currentScores są już NETTO (FPL sam je odejmuje),
    //   to pole to tylko wgląd "ile to kosztowało", nie wpływa na wynik
    // - quarterScores[q.id] = [{entry, player_name, entry_name, points, hits}] dla danej ćwiartki
    const winsCount: Record<number, number> = {};
    const currentScores: Record<number, number> = {};
    const currentHits: Record<number, number> = {};
    const quarterScores: Record<string, {entry:number; player_name:string; entry_name:string; points:number; hits:number}[]> = {};

    // znajdź bieżącą ćwiartkę
    const currentQuarter = (() => {
      // jeśli jesteśmy przed sezonem => current = Q1
      const beforeSeason = now < ranges[0].fromDate;
      if (beforeSeason) return ranges[0];
      // w trakcie której ćwiartki?
      for (const q of ranges){
        if (now >= q.fromDate && now <= q.toDate) return q;
      }
      // po sezonie => ostatnia
      return ranges[ranges.length-1];
    })();

    // dla każdego gracza: pobierz jego historię punktową (RÓWNOLEGLE, nie po kolei) i policz
    // sumy w każdej ćwiartce — przy 15 managerach to jeden "okrążony" czas oczekiwania zamiast 15.
    // Równolegle dociągamy live standings ligi (i tak cache'owane, patrz fetchLeagueEntries wyżej —
    // to praktycznie darmowy odczyt z cache) po LIVE event_total: /entry/{id}/history/ dla
    // TRWAJĄCEJ/świeżo zamkniętej (ale jeszcze nie potwierdzonej bonusami) kolejki potrafi zostawać
    // w tyle o dokładnie tyle punktów, ile jeszcze nie doliczono bonusów — sprawdzone: ta sama GW
    // pokazywała 50 pkt z historii, a 53 pkt (już z bonusami) w live standings Ligi. Efekt: Ćwiartki
    // liczyły bieżącą kolejkę na innych (starszych) liczbach niż to, co widać w Lidze/GW Pulse — te
    // "dwie różne informacje". Standings to JEDYNE źródło z faktycznie live event_total (patrz
    // komentarz przy estimateLiveOverallRank niżej) — dla latestGw używamy go zamiast historii, dla
    // wszystkich wcześniejszych (już zamkniętych, bonusy dawno potwierdzone) historia jest w 100%
    // wiarygodna i tam jej nie ruszamy.
    const [histories, liveStandings] = await Promise.all([
      Promise.all(leagueEntries.map(plr => fetchEntryHistoryCached(plr.entry))),
      fetchClassicStandingsCached(leagueId),
    ]);
    const liveEventTotalByEntry = new Map<number, number>(
      liveStandings.results.map((r: any) => [r.entry, Number(r.event_total ?? 0)])
    );

    // Najświeższa kolejka, dla której mamy dane (max gw obecny w historii managerów) — potrzebna
    // już tutaj (żeby wiedzieć, którą kolejkę zastąpić live wartością), a dalej też do badge'a
    // chipa w tabeli głównej i do "Awards of the Week".
    let latestGw = 0;
    for (const h of histories) {
      for (const item of h.current) {
        if (item.gw > latestGw) latestGw = item.gw;
      }
    }

    leagueEntries.forEach((plr, idx) => {
      const hist = histories[idx].current; // [{gw, pts, cost, value, overallRank, benchPoints}]
      const livePts = liveEventTotalByEntry.get(plr.entry);

      for (const q of ranges){
        let sum = 0;
        let hitsSum = 0;
        for (const item of hist){
          if (item.gw >= q.fromGW && item.gw <= q.toGW){
            sum += (item.gw === latestGw && livePts != null) ? livePts : item.pts;
            hitsSum += item.cost;
          }
        }
        // zapisz do quarterScores
        if (!quarterScores[q.id]) quarterScores[q.id] = [];
        quarterScores[q.id].push({
          entry: plr.entry,
          player_name: plr.player_name || '',
          entry_name: plr.entry_name || '',
          points: sum,
          hits: hitsSum
        });

        // jeśli to aktualna ćwiartka -> to jest currentScores / currentHits
        if (q.id === currentQuarter.id){
          currentScores[plr.entry] = sum;
          currentHits[plr.entry] = hitsSum;
        }
      }
    });

    // historia GW-po-GW per manager (posortowana) — do sparkline'a formy w tabeli (pts), ale
    // też do sekcji Sezon/Statystyki (cost/value/benchPoints), z danych które już mamy w
    // pamięci z powyższej pętli, zero dodatkowych zapytań. Addytywne wzbogacenie — istniejący
    // front, który czyta tylko .pts, działa bez zmian. latestGw dostaje tę samą korektę na live
    // event_total co quarterScores wyżej — inaczej wykres w Sezonie i rankingi w Statystykach
    // pokazywałyby dla bieżącej kolejki inną liczbę niż Liga/GW Pulse.
    const gwPoints: Record<number, { gw: number; pts: number; cost: number; value: number; benchPoints: number }[]> = {};
    leagueEntries.forEach((plr, idx) => {
      const livePts = liveEventTotalByEntry.get(plr.entry);
      gwPoints[plr.entry] = histories[idx].current
        .map(x => ({
          gw: x.gw,
          pts: (x.gw === latestGw && livePts != null) ? livePts : x.pts,
          cost: x.cost, value: x.value, benchPoints: x.benchPoints,
        }))
        .sort((a, b) => a.gw - b.gw);
    });

    // pełna historia chipów w sezonie per manager (nie tylko latestGw) — do modułu Chips
    // w Statystykach. Też już mamy w pamięci (histories[idx].chips), zero nowych zapytań.
    // Pole `bonus` (zysk PUNKTOWY z tytułu samego chipa, nie total kolejki) jest tu na razie
    // null — dopełniane niżej, po tym jak dociągniemy skład+live z kolejek, w których chipy
    // faktycznie padły (patrz sekcja "Bonus z chipa dla całej historii" poniżej).
    const chipHistory: Record<number, { code: string; label: string; name: string; event: number; bonus: number | null }[]> = {};
    leagueEntries.forEach((plr, idx) => {
      chipHistory[plr.entry] = histories[idx].chips
        .map(c => ({
          code: c.name,
          label: CHIP_LABELS[c.name] || c.name,
          name: CHIP_NAMES[c.name] || c.name,
          event: c.event,
          bonus: null as number | null,
        }))
        .sort((a, b) => a.event - b.event);
    });

    // teraz z quarterScores możemy ustalić zwycięzców zakończonych ćwiartek,
    // oraz trofea
    const winnersByQuarter: Record<string, { entry:number; points:number }[]> = {};

    for (const q of ranges){
      const list = quarterScores[q.id] || [];
      // posortuj malejąco po punktach
      list.sort((a,b)=>b.points - a.points);

      // jeżeli ćwiartka zakończona (now > q.toDate), ustal zwycięzców
      if (now > q.toDate && list.length){
        const bestPoints = list[0].points;
        const winners = list.filter(x=>x.points === bestPoints)
                            .map(x=>({ entry: x.entry, points: x.points }));
        winnersByQuarter[q.id] = winners;

        // nalicz trofea
        for (const w of winners){
          winsCount[w.entry] = (winsCount[w.entry] || 0) + 1;
        }
      }
    }

    // Teraz dorsyłamy jeszcze TOP3 każdej ćwiartki do frontu
    // quarterTop[q.id] = top3 [{entry, player_name, entry_name, points}]
    const quarterTop: Record<string, {entry:number; player_name:string; entry_name:string; points:number}[]> = {};
    for (const q of ranges){
      const list = quarterScores[q.id] || [];
      // posortowane już powyżej, ale upewnijmy się że posortowane:
      list.sort((a,b)=>b.points - a.points);
      quarterTop[q.id] = list.slice(0,3);
    }

    // Ranking hitów per ćwiartka — kto stracił najwięcej punktów na transferach ponad darmowy
    // limit. Kompaktowy, opcjonalny wgląd na froncie (nie wpływa na wyniki, punkty są już netto).
    // Tylko gracze z hits>0, top5, żeby nie zaśmiecać widoku zerami.
    const quarterHitsTop: Record<string, {entry:number; player_name:string; entry_name:string; hits:number}[]> = {};
    for (const q of ranges){
      const list = (quarterScores[q.id] || []).filter(x => x.hits > 0);
      list.sort((a,b)=>b.hits - a.hits);
      quarterHitsTop[q.id] = list.slice(0,5).map(x => ({
        entry: x.entry, player_name: x.player_name, entry_name: x.entry_name, hits: x.hits
      }));
    }

    // latestGw policzone już wyżej (potrzebne wcześniej do korekty gwPoints/quarterScores na live
    // event_total) — tu tylko dalej używane do badge'a chipa w tabeli głównej i "Awards of the Week".

    // Czy pokazać powiadomienie "Podsumowanie GW" — aktywne przez 24h od (estymowanego) końca
    // ostatniego meczu latestGw, licząc DOPIERO od completion.allFinished (bonusy potwierdzone na
    // każdym meczu — to samo co pokazuje oficjalna appka), a nie od finished_provisional (mecz
    // fizycznie skończony, ale bonusy jeszcze doliczane). Świadomie później niż dawniej: GW
    // Wrapped/Podsumowanie pokazują konkretne liczby (bonus z chipa, pkt kapitana), które przy
    // finished_provisional bywały jeszcze tymczasowe. Front dodatkowo pamięta odrzucenie w
    // localStorage per GW.
    //
    // Oraz "kolejka wystartowała" — drugi baner, symetryczny w drugą stronę: aktywny od 10 min po
    // PIERWSZYM gwizdku tej GW, dopóki runda trwa (nie wszystkie mecze finished_provisional).
    // Ten nadal opiera się o finished_provisional (nie allFinished) — tu zależy nam na wykryciu
    // "runda się jeszcze toczy", nie na potwierdzonych bonusach.
    // fetchBootstrapCached jest cache'owany, więc przeniesienie tego fetcha wyżej (był dalej,
    // przy pobieraniu picks/live dla bonusu z chipa) nie kosztuje dodatkowego zapytania — potrzebny
    // tu już do wyznaczenia gwStatus (bootstrap.eventFinished[latestGw])
    const bootstrap = await fetchBootstrapCached();
    let gwSummaryActive = false;
    let kickoffFactsActive = false;
    // Bez okna czasowego (w przeciwieństwie do gwSummaryActive, które gaśnie po 24h) — to jest
    // czysty fakt "czy latestGw jest już definitywnie skończona (bonusy potwierdzone na każdym
    // meczu)", do triggera "GW Wrapped": ten ma się pokazać przy PIERWSZYM wejściu po realnym
    // zakończeniu GW, niezależnie kiedy to nastąpi, więc nie może zależeć od tego samego okresu
    // ważności co lekki baner.
    let gwFullyFinished = false;
    // Status życia latestGw do dynamicznej pigułki w nagłówku Ligi (zastępuje dawne "Q1 · LIVE",
    // które mówiło o ĆWIARTCE, nie o samej kolejce). Cztery stany, od najmniej do najbardziej
    // pewnych danych: 'wkrótce' (mecze się jeszcze nie zaczęły) → 'trwa' (mecze live, wynik
    // realnie się zmienia) → 'szacowana' (finished_provisional — wszystkie mecze skończone, ale
    // FPL jeszcze dolicza bonusy) → 'zakończona' (fixture.finished na KAŻDYM meczu — bonusy
    // potwierdzone, to samo co pokazuje oficjalna appka). CELOWO nie bootstrap.eventFinished —
    // sprawdzone na żywo, że ten flag potrafi zostać false długo po tym, jak każdy fixture ma już
    // finished:true (patrz komentarz przy GwCompletionInfo.allFinished w _lib/fpl.ts).
    let gwStatus: 'wkrótce' | 'trwa' | 'szacowana' | 'zakończona' = 'wkrótce';
    if (latestGw > 0) {
      const completion = await fetchGwCompletionCached(latestGw);
      gwFullyFinished = completion.allFinished;
      if (completion.allFinished && completion.estimatedEndTime) {
        const windowEnd = new Date(completion.estimatedEndTime).getTime() + 24 * 3600_000;
        gwSummaryActive = Date.now() <= windowEnd;
      }
      if (completion.firstKickoff && !completion.allFinishedProvisional) {
        const kickoffThreshold = new Date(completion.firstKickoff).getTime() + 10 * 60_000;
        kickoffFactsActive = Date.now() >= kickoffThreshold;
      }

      if (completion.allFinished) {
        gwStatus = 'zakończona';
      } else if (completion.allFinishedProvisional) {
        gwStatus = 'szacowana';
      } else if (completion.firstKickoff && Date.now() >= new Date(completion.firstKickoff).getTime()) {
        gwStatus = 'trwa';
      } else {
        gwStatus = 'wkrótce';
      }
    }

    // Chip zagrany przez każdego managera w latestGw (do badge'a w tabeli głównej)
    const latestChip: Record<number, { code: string; label: string } | null> = {};
    leagueEntries.forEach((plr, idx) => {
      const used = histories[idx].chips.find(c => c.event === latestGw);
      latestChip[plr.entry] = used ? { code: used.name, label: CHIP_LABELS[used.name] || used.name } : null;
    });

    // Ranking ogólny FPL (spośród WSZYSTKICH graczy w grze, nie naszej ligi) w latestGw — FPL
    // aktualizuje overall_rank na bieżąco w trakcie trwającej kolejki (nie dopiero po jej
    // zamknięciu), więc to jest realnie "live". Źródło to ten sam entry/history, który już i tak
    // pobieramy dla każdego managera (histories) — zero dodatkowych zapytań. prevRank (z
    // poprzedniej GW) pozwala frontowi pokazać strzałkę ruchu, tak jak przy Δ Rank w naszej lidze.
    const overallRank: Record<number, { rank: number; prevRank: number | null } | null> = {};
    leagueEntries.forEach((plr, idx) => {
      const hist = histories[idx].current;
      const cur = hist.find(x => x.gw === latestGw);
      const prev = hist.find(x => x.gw === latestGw - 1);
      overallRank[plr.entry] = cur && cur.overallRank > 0
        ? { rank: cur.overallRank, prevRank: prev && prev.overallRank > 0 ? prev.overallRank : null }
        : null;
    });

    // Awards of the Week — kompaktowe wyróżnienia dla latestGw, liczone z danych, które i tak
    // już mamy (historia per manager), bez dodatkowych zapytań do FPL.
    // `points` bierze live event_total (liveEventTotalByEntry, patrz komentarz przy quarterScores
    // wyżej), NIE cur?.pts z /history/ — to ten sam bug, co naprawiony tam: dla świeżo zamkniętej
    // latestGw /history/ zostaje w tyle, dopóki bonusy nie są potwierdzone na każdym meczu. To pole
    // zasila topGun/toughWeek/noChipWarrior w "Podsumowaniu GW" i "GW Wrapped" — bez tej poprawki
    // te bannery pokazywały inne (starsze) liczby niż Liga/Ćwiartki, które już mają fix.
    // benchPoints zostaje na razie z historii — dopełniane niżej z live, gdy mamy już picks (patrz
    // benchPointsLiveByEntry).
    const latestRows = leagueEntries.map((plr, idx) => {
      const cur = histories[idx].current.find(x => x.gw === latestGw);
      const prev = histories[idx].current.find(x => x.gw === latestGw - 1);
      return {
        entry: plr.entry,
        player_name: plr.player_name || '',
        entry_name: plr.entry_name || '',
        points: liveEventTotalByEntry.get(plr.entry) ?? cur?.pts ?? 0,
        value: cur?.value ?? 0,
        overallRank: cur?.overallRank ?? 0,
        prevOverallRank: prev?.overallRank ?? null,
        chip: latestChip[plr.entry],
        benchPoints: cur?.benchPoints ?? 0,
      };
    }).filter(r => r.points > 0 || r.value > 0); // pomiń graczy bez danych dla latestGw

    function topBy<T>(rows: T[], key: (r: T) => number): T | null {
      if (!rows.length) return null;
      return rows.reduce((best, r) => (key(r) > key(best) ? r : best));
    }
    function bottomBy<T>(rows: T[], key: (r: T) => number): T | null {
      if (!rows.length) return null;
      return rows.reduce((worst, r) => (key(r) < key(worst) ? r : worst));
    }
    // Wszyscy remisujący o wartość ekstremalną (max/min) danego klucza — ten sam duch co
    // extremeTied we froncie (GW Pulse w LeagueSection.tsx), tylko po stronie backendu, dla nagród
    // liczonych z danych, których front nie ma (bonus z chipa, wartość drużyny, zmiana rankingu).
    // topBy/bottomBy wyżej zwracają tylko PIERWSZEGO napotkanego przy remisie — używane nadal do
    // wyłonienia "głównego" wpisu nagrody, ale lista remisujących z tej funkcji trafia do
    // tiedEntries, żeby front mógł wymienić WSZYSTKICH, a nie arbitralnie jednego.
    function allTiedBy<T>(rows: T[], key: (r: T) => number, mode: 'max' | 'min'): T[] {
      if (!rows.length) return [];
      const extreme = mode === 'max' ? Math.max(...rows.map(key)) : Math.min(...rows.map(key));
      return rows.filter(r => key(r) === extreme);
    }
    // tiedEntries dla mkAward — undefined (nie pusta tablica), gdy tylko jedna osoba, żeby front
    // (awardNames w shared.tsx) mógł po prostu sprawdzić `tiedEntries?.length` i spaść na
    // player_name pojedynczego zwycięzcy bez żadnej dodatkowej logiki.
    const tiedNames = <T extends { entry: number; player_name: string }>(rows: T[]) =>
      rows.length > 1 ? rows.map(r => ({ entry: r.entry, player_name: r.player_name })) : undefined;

    const withChip = latestRows.filter(r => r.chip);
    const withoutChip = latestRows.filter(r => !r.chip);
    // spadek rankingu ogólnego FPL = overallRank rośnie (większa liczba = gorzej); tylko gdy mamy
    // dane z poprzedniej kolejki (nie da się policzyć dla GW1)
    const rankFallers = latestRows.filter(r => r.prevOverallRank != null)
      .map(r => ({ ...r, rankChange: r.overallRank - (r.prevOverallRank as number) }));

    // Picks + punkty na żywo dla latestGw, dla CAŁEJ ligi — potrzebne do bonusu z chipa (BB/TC)
    // i do analizy kapitanów (Best Captain). Jedno pobranie, cache'owane per entry+gw — jeśli
    // ktoś już zaglądał w /api/squad albo /api/league-overview w tej kolejce, nic się nie dubluje.
    const [allPicksLatest, live, minutes] = await Promise.all([
      Promise.all(leagueEntries.map(plr => fetchEntryPicksCached(plr.entry, latestGw))),
      fetchEventLiveCached(latestGw),
      fetchEventMinutesCached(latestGw),
    ]);

    // Punkty zostawione na ławce w latestGw, liczone z live (jak benchRawPoints w squad/route.ts),
    // NIE z cur.benchPoints w latestRows (to pole z /history/ — ten sam bug co points wyżej: dla
    // świeżo zamkniętej kolejki zostaje w tyle, dopóki bonusy nie są potwierdzone). Zasila
    // "Łzy na ławce" w Podsumowaniu GW/GW Wrapped, więc musi być tak samo świeże jak reszta.
    const benchPointsLiveByEntry = new Map<number, number>();
    leagueEntries.forEach((plr, idx) => {
      const picks = allPicksLatest[idx];
      // klasyfikacja ławka/podstawa po automatic_subs, ten sam duch co buildSquad w squad/route.ts:
      // kto wszedł z ławki liczy się jako podstawa, kto wypadł (nie zagrał) — jako ławka.
      const subbedIn = new Set(picks.automaticSubs.map(s => s.elementIn));
      const subbedOut = new Set(picks.automaticSubs.map(s => s.elementOut));
      const benchPts = picks.picks
        .filter(p => (subbedIn.has(p.element) ? false : subbedOut.has(p.element) ? true : p.position > 11))
        .reduce((sum, p) => sum + (live[p.element] ?? 0), 0);
      benchPointsLiveByEntry.set(plr.entry, benchPts);
    });
    // Ta sama korekta trafia też do gwPoints (Sezon/Statystyki — ranking Bench/Stabilność), żeby
    // latestGw nie pokazywała tam innej liczby niż w Podsumowaniu GW.
    leagueEntries.forEach(plr => {
      const row = gwPoints[plr.entry]?.find(r => r.gw === latestGw);
      if (row) row.benchPoints = benchPointsLiveByEntry.get(plr.entry) ?? row.benchPoints;
    });

    // Estymata LIVE rankingu ogólnego (patrz komentarz przy estimateLiveOverallRank w fpl.ts) —
    // podmienia overallRank[x].rank na świeższą wartość znalezioną przeszukaniem ligi Overall (314)
    // po żywym totalu managera. `total` z classic standings naszej ligi jest tym samym, faktycznie
    // live pipeline'em (zweryfikowane), więc to jest wiarygodny punkt wejścia. Hint (punkt startowy
    // przeszukania) to opóźniona wartość z entry/history, którą już mamy — jeśli estymacja się nie
    // powiedzie (np. przejściowy błąd FPL), overallRank zostaje przy tej opóźnionej wartości, więc
    // front zawsze coś pokazuje, tylko czasem mniej świeże.
    const standingsForEstimate = await fetchClassicStandingsCached(leagueId);
    const liveTotalByEntry = new Map<number, number>();
    for (const r of standingsForEstimate.results) liveTotalByEntry.set(r.entry, Number(r.total));

    await Promise.all(leagueEntries.map(async (plr) => {
      const liveTotal = liveTotalByEntry.get(plr.entry);
      if (liveTotal == null) return;
      const hint = overallRank[plr.entry]?.rank;
      const estimated = await estimateLiveOverallRank(liveTotal, bootstrap.totalPlayers, hint);
      if (estimated != null && overallRank[plr.entry]) {
        overallRank[plr.entry] = { rank: estimated, prevRank: overallRank[plr.entry]!.prevRank };
      }
    }));

    // Bonus punktowy DOSŁOWNIE z chipa (nie total z kolejki) — dla KAŻDEGO zagrania chipa w
    // całym sezonie (nie tylko latestGw), żeby moduł Chips w Statystykach mógł pokazać "ile z
    // tytułu tego chipa", a nie total GW. Policzalny wprost z picks+live dla BB (suma pkt
    // zawodników z ławki, które bez BB by się nie liczyły) i TC (dodatkowe punkty kapitana ponad
    // zwykłe podwojenie). Free Hit ma osobną, bardziej złożoną ścieżkę niżej (wymaga też składu
    // SPRZED chipa) — patrz komentarz przy freeHitPlays. Dla Wildcard/Assistant Manager nadal nie
    // ma dobrze zdefiniowanego "zysku z chipa" (WC to trwała przebudowa składu na przyszłość, nie
    // punktowy efekt jednej kolejki, więc nie ma z czym uczciwie porównać; AM to inny mechanizm —
    // bonusy menedżerskie niezwiązane z punktami XI, nieobsługiwany w ogóle), więc dla nich bonus
    // zostaje null.
    const bonusableCodes = new Set(['bboost', '3xc']);
    const bonusablePlays: { entry: number; code: string; event: number }[] = [];
    for (const [entryStr, chips] of Object.entries(chipHistory)) {
      const entry = Number(entryStr);
      for (const c of chips) {
        if (bonusableCodes.has(c.code)) bonusablePlays.push({ entry, code: c.code, event: c.event });
      }
    }
    // latestGw mamy już w pamięci (live + allPicksLatest); dociągamy TYLKO to, czego faktycznie
    // brakuje — jedno picks-zapytanie na parę (manager, kolejka) i jedno live-zapytanie na
    // unikalną wcześniejszą kolejkę, oba cache'owane w fpl.ts (nic się nie dubluje przy kolejnych
    // odświeżeniach). Wcześnie w sezonie to zwykle 0 dodatkowych zapytań (chipy dopiero zaczynają
    // padać w bieżącej kolejce).
    const extraPlays = bonusablePlays.filter(p => p.event !== latestGw);
    const extraGws = Array.from(new Set(extraPlays.map(p => p.event)));
    const [extraLiveList, extraPicksList] = await Promise.all([
      Promise.all(extraGws.map(gw => fetchEventLiveCached(gw))),
      Promise.all(extraPlays.map(p => fetchEntryPicksCached(p.entry, p.event))),
    ]);
    const liveByGw: Record<number, Record<number, number>> = { [latestGw]: live };
    extraGws.forEach((gw, i) => { liveByGw[gw] = extraLiveList[i]; });
    const picksByEntryGw = new Map<string, PicksData>();
    allPicksLatest.forEach((picks, idx) => {
      picksByEntryGw.set(`${leagueEntries[idx].entry}:${latestGw}`, picks);
    });
    extraPlays.forEach((p, i) => {
      picksByEntryGw.set(`${p.entry}:${p.event}`, extraPicksList[i]);
    });

    function computeBonus(code: string, picks: PicksData | undefined, liveMap: Record<number, number> | undefined): number | null {
      if (!picks || !liveMap) return null;
      if (code === 'bboost') {
        return picks.picks.filter(p => p.position > 11).reduce((sum, p) => sum + (liveMap[p.element] ?? 0), 0);
      }
      if (code === '3xc') {
        const captainPick = picks.picks.find(p => p.isCaptain);
        return captainPick ? (liveMap[captainPick.element] ?? 0) : 0;
      }
      return null;
    }

    // dopełnij chipHistory o realny bonus per zagranie (WC/AM zostają null, FH dopełniany niżej)
    for (const entryStr in chipHistory) {
      chipHistory[Number(entryStr)] = chipHistory[Number(entryStr)].map(c => ({
        ...c,
        bonus: bonusableCodes.has(c.code)
          ? computeBonus(c.code, picksByEntryGw.get(`${entryStr}:${c.event}`), liveByGw[c.event])
          : null,
      }));
    }

    // Free Hit: w przeciwieństwie do Wildcard skład wraca po tej JEDNEJ kolejce do stanu sprzed
    // chipa, więc — inaczej niż WC — da się uczciwie policzyć zysk: różnica między realnym
    // wynikiem składu z FH a tym, ile faktycznie zdobyłby skład SPRZED FH, tymi samymi live-
    // -punktami tej samej kolejki (czyli identyczne mecze, identyczne bonusy — jedyna zmienna to
    // SKŁAD). Skład "sprzed FH" nigdy sam nie zagrał tej kolejki (FPL nie ma dla niego oficjalnych
    // automatic_subs), więc jego ewentualne zamiany ławka→podstawa symulujemy sami —
    // simulateAutosubs() na PEŁNYCH, już rozliczonych minutach tej kolejki (ta sama funkcja co
    // projekcja w squad/route.ts, tu deterministyczna, bo GW jest zamknięta). GW1 pomijamy — nie
    // ma składu "sprzed", bo GW1 to sam dobór wyjściowego składu.
    const freeHitPlays: { entry: number; event: number }[] = [];
    for (const [entryStr, chips] of Object.entries(chipHistory)) {
      const entry = Number(entryStr);
      for (const c of chips) {
        if (c.code === 'freehit' && c.event > 1) freeHitPlays.push({ entry, event: c.event });
      }
    }
    if (freeHitPlays.length) {
      const fhGws = Array.from(new Set(freeHitPlays.map(p => p.event)));
      const [fhMinutesList, fhFinishedList, fhPicksBeforeList] = await Promise.all([
        Promise.all(fhGws.map(gw => fetchEventMinutesCached(gw))),
        Promise.all(fhGws.map(gw => fetchFinishedTeamsCached(gw))),
        Promise.all(freeHitPlays.map(p => fetchEntryPicksCached(p.entry, p.event - 1))),
      ]);
      const fhMinutesByGw = new Map(fhGws.map((gw, i) => [gw, fhMinutesList[i]]));
      const fhFinishedByGw = new Map(fhGws.map((gw, i) => [gw, fhFinishedList[i]]));

      // skład NA FH — większość już mamy w picksByEntryGw (latestGw + extraPlays z BB/TC), ale
      // dociągamy to, czego jeszcze brakuje (rzadkie — FH bez BB/TC tej samej kolejki)
      const fhAtEventMissing = freeHitPlays.filter(p => !picksByEntryGw.has(`${p.entry}:${p.event}`));
      const fhAtEventFetched = await Promise.all(fhAtEventMissing.map(p => fetchEntryPicksCached(p.entry, p.event)));
      fhAtEventMissing.forEach((p, i) => picksByEntryGw.set(`${p.entry}:${p.event}`, fhAtEventFetched[i]));

      const fhBonusByKey = new Map<string, number>();
      freeHitPlays.forEach((p, i) => {
        const atEvent = picksByEntryGw.get(`${p.entry}:${p.event}`);
        const before = fhPicksBeforeList[i];
        const liveMap = liveByGw[p.event];
        const minutesMap = fhMinutesByGw.get(p.event);
        const finishedTeams = fhFinishedByGw.get(p.event);
        if (!atEvent || !before || !liveMap || !minutesMap || !finishedTeams) return;

        // realny wynik z FH: dla latestGw liczymy z live+mnożnik (entry_history.points dla
        // TRWAJĄCEJ/świeżo zamkniętej kolejki bywa nieaktualny, ten sam bug co gdzie indziej w tym
        // pliku — patrz liveEventTotalByEntry wyżej); dla dawno zamkniętych GW entry_history.points
        // jest już w 100% wiarygodne i prostsze niż przeliczanie samemu.
        const actualScore = p.event === latestGw
          ? (() => {
              const mult = effectiveMultiplierAfterSubs(atEvent.picks, atEvent.automaticSubs);
              return atEvent.picks.reduce((sum, pk) => sum + (liveMap[pk.element] ?? 0) * (mult[pk.element] ?? 0), 0);
            })()
          : atEvent.entryHistory.points;

        const sim = simulateAutosubs(before.picks, minutesMap, finishedTeams, bootstrap.elementsById);
        const hypotheticalScore = before.picks.reduce(
          (sum, pk) => sum + (liveMap[pk.element] ?? 0) * (sim.effectiveMultiplier[pk.element] ?? 0),
          0
        );
        fhBonusByKey.set(`${p.entry}:${p.event}`, actualScore - hypotheticalScore);
      });

      for (const entryStr in chipHistory) {
        chipHistory[Number(entryStr)] = chipHistory[Number(entryStr)].map(c =>
          c.code === 'freehit' && fhBonusByKey.has(`${entryStr}:${c.event}`)
            ? { ...c, bonus: fhBonusByKey.get(`${entryStr}:${c.event}`)! }
            : c
        );
      }
    }

    // chipBonus per manager DLA latestGw konkretnie — to jest to, czego nadal potrzebuje
    // istniejący Chip Master award poniżej (jedno zagranie na managera w bieżącej kolejce)
    const chipBonus: Record<number, number> = {};
    leagueEntries.forEach((plr) => {
      const chip = latestChip[plr.entry];
      if (!chip) return;
      const b = computeBonus(chip.code, picksByEntryGw.get(`${plr.entry}:${latestGw}`), live);
      if (b != null) chipBonus[plr.entry] = b;
    });

    // Best Captain: kto zagrał INNEGO kapitana niż większość ligi (tzw. "template") i zdobył nim
    // więcej punktów, niż dał template captain. Nagradza trafną, różnicującą decyzję kapitańską —
    // nie po prostu "kto ma najwyższy total tej kolejki" (bo to mogłaby być cała grupa, która
    // kapitanowała to samo, co wszyscy).
    const captainCounts: Record<number, number> = {};
    const captainByEntry: Record<number, number | null> = {};
    leagueEntries.forEach((plr, idx) => {
      const cap = allPicksLatest[idx].picks.find(p => p.isCaptain);
      captainByEntry[plr.entry] = cap ? cap.element : null;
      if (cap) captainCounts[cap.element] = (captainCounts[cap.element] || 0) + 1;
    });

    // Ciekawostki do banera "kolejka wystartowała" — rozkład kapitanów, kontrastowy "odważny"
    // kapitan, transfery i użycie chipów w TEJ rundzie. Wszystko z danych, które i tak już mamy
    // (captainCounts, allPicksLatest, latestChip) — zero dodatkowych zapytań do FPL.
    const leagueSize = leagueEntries.length;
    const captainBreakdown = Object.entries(captainCounts)
      .map(([elStr, count]) => {
        const el = bootstrap.elementsById[Number(elStr)];
        return {
          element: Number(elStr),
          name: el?.web_name ?? '—',
          photoUrl: el ? playerPhotoUrl(el.code) : '',
          count,
          pct: leagueSize ? Math.round((count / leagueSize) * 100) : 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // "Odważny wybór" — najmniej obstawiany kapitan w tej kolejce w całej lidze, kontrast do
    // "Kapitana tłumu". Zastępuje dawny "Najpopularniejszy pick": ten w praktyce niemal zawsze
    // pokazywał tego samego zawodnika co Kapitan tłumu (najpopularniejszy pick w składzie = z
    // reguły też najpopularniejszy kapitan), więc dwa kafelki obok siebie były tym samym faktem.
    // Pokazujemy tylko, gdy realnie ktoś odstaje od reszty (min < max) — inaczej cała liga
    // kapitanuje to samo i nie ma kontrastu do pokazania.
    const captainCountsSorted = Object.entries(captainCounts).sort((a, b) => a[1] - b[1]);
    const topCaptainCount = captainBreakdown[0]?.count ?? 0;
    const differentialCaptain = (captainCountsSorted.length > 1 && captainCountsSorted[0][1] < topCaptainCount)
      ? (() => {
          const [elStr, count] = captainCountsSorted[0];
          const element = Number(elStr);
          const el = bootstrap.elementsById[element];
          const managers = leagueEntries.filter(plr => captainByEntry[plr.entry] === element);
          return {
            element,
            name: el?.web_name ?? '—',
            photoUrl: el ? playerPhotoUrl(el.code) : '',
            count,
            managers: managers.map(m => ({ entry: m.entry, player_name: m.player_name || '' })),
          };
        })()
      : null;

    // Pełna historia transferów sezonu, per manager — "kto na kogo i w której GW" do sekcji
    // Transfers w Statystykach i do małego podglądu w głównym wierszu Ligi. Jeden dodatkowy
    // request na managera (te same co allPicksLatest itd.), cache'owany per entryId w _lib/fpl.
    // Grupujemy per GW i przepuszczamy przez collapseTransferChain — surowy log FPL zawiera też
    // cofnięte ruchy (patrz komentarz przy tej funkcji w _lib/fpl.ts), bez redukcji liczba
    // transferów i lista "kto na kogo" potrafiły być mocno zawyżone/zaśmiecone przy dużych
    // przebudowach składu (WC/FH). pointsOut/pointsIn/delta liczone TYLKO dla latestGw (jedyna GW,
    // dla której mamy już live stats w pamięci) — null dla starszych, Statystyki i tak ich nie
    // potrzebują (liczą tylko koszt hita per GW). Gdy wchodzący wylądował na ławce (benchedIn,
    // sprawdzone przez effectiveMultiplier w składzie TEJ GW) delta = 0 — ten ruch w praktyce NIE
    // wpłynął na wynik managera w tej GW, więc nie liczymy go jako "stratę" mimo że wychodzący
    // zawodnik mógł gdzieś tam zdobyć swoje punkty (patrz komentarz przy buildTransferRows w
    // squad/route.ts, ta sama logika).
    const allTransfers = await Promise.all(leagueEntries.map(e => fetchEntryTransfersCached(e.entry)));
    const transfersHistory: Record<number, { event: number; elementOut: number; nameOut: string; elementIn: number; nameIn: string; pointsOut: number | null; pointsIn: number | null; benchedIn: boolean | null; delta: number | null }[]> = {};
    leagueEntries.forEach((plr, idx) => {
      const sorted = allTransfers[idx].slice().sort((a, b) => a.time.localeCompare(b.time));
      const byEvent = new Map<number, typeof sorted>();
      for (const t of sorted) {
        if (!byEvent.has(t.event)) byEvent.set(t.event, []);
        byEvent.get(t.event)!.push(t);
      }
      const latestMultiplier = effectiveMultiplierAfterSubs(allPicksLatest[idx].picks, allPicksLatest[idx].automaticSubs);
      const rows: typeof transfersHistory[number] = [];
      for (const [event, group] of byEvent.entries()) {
        const isLatest = event === latestGw;
        for (const t of collapseTransferChain(group)) {
          const pointsOut = isLatest ? (live[t.elementOut] ?? 0) : null;
          const pointsIn = isLatest ? (live[t.elementIn] ?? 0) : null;
          const benchedIn = isLatest ? (latestMultiplier[t.elementIn] ?? 0) === 0 : null;
          rows.push({
            event,
            elementOut: t.elementOut,
            nameOut: bootstrap.elementsById[t.elementOut]?.web_name ?? '—',
            elementIn: t.elementIn,
            nameIn: bootstrap.elementsById[t.elementIn]?.web_name ?? '—',
            pointsOut,
            pointsIn,
            benchedIn,
            delta: isLatest ? (benchedIn ? 0 : pointsIn! - pointsOut!) : null,
          });
        }
      }
      rows.sort((a, b) => a.event - b.event);
      transfersHistory[plr.entry] = rows;
    });

    // Zysk z transferu tej kolejki — realny efekt punktowy transferów zagranych z PULI DARMOWYCH
    // transferów przed tym gwizdkiem: suma (pkt wchodzącego − pkt wychodzącego) w latestGw, po
    // wszystkich transferach danego managera. Pomija wildcard/freehit (to przebudowa całego składu,
    // nie punktowa decyzja "kogo na kogo") — reużywa transfersHistory (już po redukcji cofniętych
    // ruchów), zero dodatkowych zapytań. Kafelek w GW Pulse (Liga) pokazuje managera z największym
    // zyskiem (liczba może wyjść ujemna — to wtedy "kto najbardziej przestrzelił", nadal ciekawe).
    const nonChipTransfersThisRound = leagueEntries
      .map((plr) => {
        const chip = latestChip[plr.entry];
        if (chip && (chip.code === 'wildcard' || chip.code === 'freehit')) return null;
        const thisRound = (transfersHistory[plr.entry] ?? []).filter(t => t.event === latestGw);
        if (thisRound.length === 0) return null;
        const gain = thisRound.reduce((sum, t) => sum + (t.delta ?? 0), 0);
        return { entry: plr.entry, player_name: plr.player_name || '', transfers: thisRound.length, gain };
      })
      .filter((r): r is { entry: number; player_name: string; transfers: number; gain: number } => r != null);
    const topTransferGain = [...nonChipTransfersThisRound].sort((a, b) => b.gain - a.gain)[0] ?? null;

    // Ilu managerów w ogóle ruszyło coś z puli darmowych transferów w tej rundzie (bez WC/FH) —
    // do kafelka w banerze "GW wystartowała". Samo "ilu ludzi coś zmieniło" jest ciekawsze niż
    // wybieranie jednego "zwycięzcy" (to już robi Zysk z transferu w GW Pulse) — nie wymaga
    // czekania na punkty, więc ma sens od razu po deadlinie, zanim ktokolwiek zdobędzie pkt.
    const playersWithTransfersThisRound = nonChipTransfersThisRound.length;

    const chipCountsThisRound: Record<string, number> = {};
    leagueEntries.forEach(plr => {
      const chip = latestChip[plr.entry];
      if (chip) chipCountsThisRound[chip.code] = (chipCountsThisRound[chip.code] || 0) + 1;
    });
    const chipUsageThisRound = Object.entries(chipCountsThisRound)
      .map(([code, count]) => ({ code, label: CHIP_LABELS[code] || code, count }))
      .sort((a, b) => b.count - a.count);
    // Wartość drużyny (TV) + transfery zagrane w tej GW + FT (wolne transfery, które manager ma
    // TERAZ do dyspozycji na najbliższe okno transferowe, PO doliczeniu latestGw — patrz
    // computeFreeTransfersAvailable w _lib/fpl.ts) + ile ze "składu, który się liczy" faktycznie
    // zagrało (PLAYED) w latestGw — subtelny wgląd pod nazwą teamu w głównej tabeli. FT jest tu
    // bardziej użyteczne niż "ile transferów zagrał" (to drugie i tak widać osobno w plakietce
    // transferów w tym samym wierszu) — mówi, z iloma FT manager wchodzi w kolejne decyzje, więc
    // np. gdy oszczędził transfer w latestGw, to od razu widać 2 (nie 1). Skład, który się liczy,
    // to zwykle podstawowa 11 — ale przy Bench Boost liczy się cała 15, więc PLAYED wtedy sprawdza
    // wszystkich 15. Wszystko z danych, które i tak już mamy (allPicksLatest + minuty z tej samej
    // kolejki + histories z pętli quarterScores wyżej), zero dodatkowych zapytań poza jednym tanim
    // fetchEventMinutesCached.
    const teamInfo: Record<number, {
      value: number; transfers: number; transfersCost: number; freeTransfers: number;
      played: number; playedTotal: number;
    }> = {};
    leagueEntries.forEach((plr, idx) => {
      const eh = allPicksLatest[idx].entryHistory;
      const picks = allPicksLatest[idx].picks;
      const chip = latestChip[plr.entry];
      const playedTotal = chip?.code === 'bboost' ? 15 : 11;
      const played = picks
        .filter(p => p.position <= playedTotal)
        .filter(p => (minutes[p.element] ?? 0) > 0)
        .length;
      teamInfo[plr.entry] = {
        value: eh.value,
        transfers: eh.eventTransfers,
        transfersCost: eh.eventTransfersCost,
        freeTransfers: computeFreeTransfersAvailable(histories[idx].current, histories[idx].chips, latestGw),
        played,
        playedTotal,
      };
    });

    // Transfer Tangle: kto wziął w tej GW największego hita (pkt straconych na transferach ponad
    // darmowy limit). Realna, prosta metryka z danych, które już mamy (teamInfo.transfersCost) —
    // celowo NIE próbujemy liczyć "impaktu"/ROI konkretnego transferu (który zawodnik wszedł, ile
    // dał punktów vs kogo zastąpił) — nie da się tego wiarygodnie policzyć z obecnego API bez
    // śledzenia który zawodnik został wpuszczony w miejsce którego, więc taka metryka byłaby
    // zmyślona. To, co tu liczymy, jest w 100% pewne: sam koszt hita w punktach.
    const transferTangleCandidates = leagueEntries
      .map(plr => ({ entry: plr.entry, player_name: plr.player_name || '', entry_name: plr.entry_name || '', transfersCost: teamInfo[plr.entry]?.transfersCost ?? 0 }))
      .filter(r => r.transfersCost > 0);
    const transferTangleTied = allTiedBy(transferTangleCandidates, r => r.transfersCost, 'max');
    const transferTangle = transferTangleTied[0] ?? null;

    // Kapitan każdego managera w latestGw (do kolumny "Kapitan" w głównej tabeli) — nazwa,
    // zdjęcie, punkty na żywo. Ta sama informacja co powyżej (captainByEntry), tylko wzbogacona
    // o dane do wyświetlenia, bez dodatkowych zapytań do FPL.
    const captainInfo: Record<number, { element: number; name: string; photoUrl: string; points: number } | null> = {};
    leagueEntries.forEach(plr => {
      const capElement = captainByEntry[plr.entry];
      if (capElement == null) {
        captainInfo[plr.entry] = null;
        return;
      }
      const el = bootstrap.elementsById[capElement];
      captainInfo[plr.entry] = {
        element: capElement,
        name: el?.web_name ?? '—',
        photoUrl: el ? playerPhotoUrl(el.code) : '',
        points: live[capElement] ?? 0,
      };
    });

    // Najlepszy kapitan w lidze — kto grał TEGO kapitana, który w tej GW zdobył najwięcej punktów,
    // niezależnie czy to był popularny "template", czy różnicowy wybór. To inne pytanie niż
    // bestCaptain niżej (ten nagradza konkretnie POBICIE template'a różnicowym wyborem) — tu
    // liczy się goła "kto miał najlepszego kapitana w całej lidze w tej kolejce", uniwersalnie
    // satysfakcjonujące niezależnie od tego, czy to była odważna decyzja czy poszli z tłumem.
    const captainPicksByElement = new Map<number, { entry: number; player_name: string }[]>();
    leagueEntries.forEach(plr => {
      const capElement = captainByEntry[plr.entry];
      if (capElement == null) return;
      if (!captainPicksByElement.has(capElement)) captainPicksByElement.set(capElement, []);
      captainPicksByElement.get(capElement)!.push({ entry: plr.entry, player_name: plr.player_name || '' });
    });
    let topCaptainPick: {
      element: number; name: string; photoUrl: string; points: number;
      managers: { entry: number; player_name: string }[];
    } | null = null;
    for (const [element, managers] of captainPicksByElement.entries()) {
      const pts = live[element] ?? 0;
      if (!topCaptainPick || pts > topCaptainPick.points) {
        const el = bootstrap.elementsById[element];
        topCaptainPick = {
          element,
          name: el?.web_name ?? '—',
          photoUrl: el ? playerPhotoUrl(el.code) : '',
          points: pts,
          managers,
        };
      }
    }

    const templateCaptainEntry = Object.entries(captainCounts).sort((a, b) => b[1] - a[1])[0];
    const templateCaptainElement = templateCaptainEntry ? Number(templateCaptainEntry[0]) : null;
    const templateCaptainPts = templateCaptainElement != null ? (live[templateCaptainElement] ?? 0) : 0;
    const templateCaptainName = templateCaptainElement != null
      ? (bootstrap.elementsById[templateCaptainElement]?.web_name ?? '—')
      : '—';

    const differentialCaptains = latestRows
      .map(r => {
        const capElement = captainByEntry[r.entry];
        if (capElement == null || capElement === templateCaptainElement) return null;
        return {
          ...r,
          captainElement: capElement,
          captainPts: live[capElement] ?? 0,
          captainName: bootstrap.elementsById[capElement]?.web_name ?? '—',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null && r.captainPts > templateCaptainPts);

    const mkAward = (r: typeof latestRows[number] | null, extra?: object) =>
      r ? { entry: r.entry, player_name: r.player_name, entry_name: r.entry_name, ...extra } : null;

    // Każda nagroda niżej liczy WSZYSTKICH remisujących (allTiedBy), nie tylko pierwszego z topBy/
    // bottomBy — przy remisie (np. dwóch managerów z tym samym wynikiem GW) nagroda ma wymienić
    // obu, nie arbitralnie jednego. `xTied[0]` zostaje "głównym" wpisem (encja/nazwa w polach
    // entry/player_name Award, jak dotychczas), a pełna lista trafia do tiedEntries niżej.
    const topGunTied = allTiedBy(latestRows, r => r.points, 'max');
    const topGun = topGunTied[0] ?? null;
    const toughWeekTied = allTiedBy(latestRows, r => r.points, 'min');
    const toughWeek = toughWeekTied[0] ?? null;
    // Bench Tears: kto zostawił najwięcej punktów na ławce w tej GW — bardziej "bolesna" i
    // konkretna ciekawostka niż suchy najgorszy total (to i tak pokazuje GW Pulse "Worst GW").
    // Tylko gdy ktoś faktycznie coś zostawił (>0), inaczej nagroda się nie pojawia. Liczone z
    // benchPointsLiveByEntry (live), nie z r.benchPoints (z /history/, patrz komentarz przy tej
    // mapie wyżej) — inaczej "Łzy na ławce" w Podsumowaniu GW/GW Wrapped pokazywałyby laggy liczbę.
    const benchTearsPool = latestRows.filter(r => (benchPointsLiveByEntry.get(r.entry) ?? 0) > 0);
    const benchTearsTied = allTiedBy(benchTearsPool, r => benchPointsLiveByEntry.get(r.entry) ?? 0, 'max');
    const benchTearsRow = benchTearsTied[0] ?? null;
    const withComputableBonus = withChip.filter(r => chipBonus[r.entry] != null);
    // wybieramy po realnym zysku z chipa, jeśli da się go policzyć; inaczej fallback na total
    const chipMasterPool = withComputableBonus.length ? withComputableBonus : withChip;
    const chipMasterKey = withComputableBonus.length
      ? (r: typeof latestRows[number]) => chipBonus[r.entry]
      : (r: typeof latestRows[number]) => r.points;
    const chipMasterTied = allTiedBy(chipMasterPool, chipMasterKey, 'max');
    const chipMaster = chipMasterTied[0] ?? null;
    const chipMasterBonus = chipMaster ? (chipBonus[chipMaster.entry] ?? null) : null;
    const noChipWarriorTied = allTiedBy(withoutChip, r => r.points, 'max');
    const noChipWarrior = noChipWarriorTied[0] ?? null;
    const valueKingTied = allTiedBy(latestRows, r => r.value, 'max');
    const valueKing = valueKingTied[0] ?? null;
    const rankCrasherTied = allTiedBy(rankFallers, r => r.rankChange, 'max');
    const rankCrasher = rankCrasherTied[0] ?? null;
    // Rank Riser: lustrzane odbicie Rank Crashera — największa POPRAWA rankingu ogólnego FPL vs
    // poprzednia GW (rankChange ujemne = ranking spadł liczbowo = awans). Ta sama, już policzona
    // lista (rankFallers), tylko szukamy minimum zamiast maksimum.
    const rankRiserTied = allTiedBy(rankFallers, r => r.rankChange, 'min');
    const rankRiser = rankRiserTied[0] ?? null;
    const bestCaptainTied = allTiedBy(differentialCaptains, r => r.captainPts, 'max');
    const bestCaptain = bestCaptainTied[0] ?? null;

    const awards = {
      gw: latestGw,
      topGun: mkAward(topGun, { points: topGun?.points, tiedEntries: tiedNames(topGunTied) }),
      toughWeek: mkAward(toughWeek, { points: toughWeek?.points, tiedEntries: tiedNames(toughWeekTied) }),
      chipMaster: mkAward(chipMaster, {
        points: chipMaster?.points,
        chip: chipMaster?.chip,
        bonus: chipMasterBonus, // pkt zdobyte DZIĘKI chipowi; null gdy nie da się policzyć (WC/FH)
        tiedEntries: tiedNames(chipMasterTied),
      }),
      noChipWarrior: mkAward(noChipWarrior, { points: noChipWarrior?.points, tiedEntries: tiedNames(noChipWarriorTied) }),
      valueKing: mkAward(valueKing, { value: valueKing?.value, tiedEntries: tiedNames(valueKingTied) }),
      rankCrasher: rankCrasher && rankCrasher.rankChange > 0
        ? mkAward(rankCrasher, { rankChange: rankCrasher.rankChange, tiedEntries: tiedNames(rankCrasherTied) })
        : null, // brak sensownego spadku (albo brak danych z poprzedniej GW, np. GW1) -> ukryty na froncie
      rankRiser: rankRiser && rankRiser.rankChange < 0
        ? mkAward(rankRiser, { rankChange: rankRiser.rankChange, tiedEntries: tiedNames(rankRiserTied) })
        : null, // brak sensownej poprawy (albo brak danych z poprzedniej GW) -> ukryty na froncie
      bestCaptain: bestCaptain
        ? mkAward(bestCaptain, {
            captainName: bestCaptain.captainName,
            captainPts: bestCaptain.captainPts,
            templateCaptainName,
            templateCaptainPts,
            tiedEntries: tiedNames(bestCaptainTied),
          })
        : null, // nikt nie pobił template captaina inną kapitanką w tej kolejce -> ukryty na froncie
      benchTears: benchTearsRow ? mkAward(benchTearsRow, { benchPoints: benchPointsLiveByEntry.get(benchTearsRow.entry) ?? 0, tiedEntries: tiedNames(benchTearsTied) }) : null,
      // value tu = pkt straconych na hicie (nie wartość drużyny jak w valueKing — Award ma
      // generyczne pola reużywane per typ nagrody, patrz komentarz przy definicji transferTangle)
      transferTangle: transferTangle
        ? { entry: transferTangle.entry, player_name: transferTangle.player_name, entry_name: transferTangle.entry_name, value: transferTangle.transfersCost, tiedEntries: tiedNames(transferTangleTied) }
        : null,
    };

    return NextResponse.json({
      currentQuarter: currentQuarter.id,
      currentRange: { fromGW: currentQuarter.fromGW, toGW: currentQuarter.toGW },
      currentScores,          // { entryId: points in current quarter }
      currentHits,            // { entryId: pkt stracone na hitach w bieżącej ćwiartce }
      wins: winsCount,        // { entryId: trophies }
      winnersByQuarter,       // { Q1:[{entry,points},...], ... } only finished
      quarterTop,             // { Q1:[{entry,player_name,entry_name,points}, ... up to 3], ...}
      quarterHitsTop,         // { Q1:[{entry,player_name,entry_name,hits}, ... up to 5, hits>0], ...}
      latestGw,                // numer ostatniej kolejki z danymi
      latestChip,              // { entryId: {code,label} | null } — chip zagrany w latestGw
      awards,                  // Awards of the Week dla latestGw
      gwPoints,                // { entryId: [{gw,pts}, ...] } — historia GW-po-GW, do sparkline/formy
      captainInfo,             // { entryId: {element,name,photoUrl,points} | null } — kapitan w latestGw
      overallRank,              // { entryId: {rank,prevRank} | null } — ranking ogólny FPL w latestGw, live
      teamInfo,                // { entryId: {value,transfers,transfersCost,played,playedTotal} } — TV/FT/PLAYED w latestGw
      chipHistory,              // { entryId: [{code,label,name,event}, ...] } — pełna historia chipów w sezonie
      gwFinished: bootstrap.eventFinished[latestGw] ?? null, // true/false/null (nie da się ustalić) — status LIVE vs ZAKOŃCZONA dla latestGw
      gwStatus,               // 'wkrótce' | 'trwa' | 'szacowana' | 'zakończona' — pigułka statusu latestGw w Lidze
      gwSummaryActive,       // czy pokazać powiadomienie "Podsumowanie GW" (24h od końca ostatniego meczu latestGw)
      gwFullyFinished,       // czy latestGw jest już definitywnie skończona (bez okna 24h) — trigger dla GW Wrapped
      kickoffFactsActive,    // czy pokazać powiadomienie "kolejka wystartowała" (10 min po pierwszym gwizdku, do końca rundy)
      captainBreakdown,      // [{element,name,photoUrl,count,pct}, ... top5] — rozkład kapitanów w latestGw
      differentialCaptain,   // {element,name,photoUrl,count,managers} | null — najmniej obstawiany kapitan w latestGw
      topTransferGain,       // {entry,player_name,transfers,gain} | null — największy zysk pkt z transferów (puli darmowej) w latestGw
      playersWithTransfersThisRound, // liczba managerów, którzy zrobili transfer z puli darmowej w latestGw (bez WC/FH)
      transfersHistory,      // { entryId: [{event,elementOut,nameOut,elementIn,nameIn}, ...] } — pełna historia transferów sezonu
      chipUsageThisRound,    // [{code,label,count}, ...] — ile osób zagrało jaki chip w latestGw
      leagueSize,            // liczba uczestników — do wyliczeń % w bannerach
      topCaptainPick,        // {element,name,photoUrl,points,managers} | null — najlepszy kapitan w lidze w latestGw
    });
  } catch (e: any) {
    // np. przejściowy błąd/timeout FPL w trakcie pobierania standings lub historii managerów —
    // zwracamy JSON zamiast wywalać nieobsłużony wyjątek (który front dostawałby jako HTML 500)
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId },
      { status: 500 }
    );
  }
}
