import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryHistoryCached,
  fetchEntryPicksCached,
  fetchEventLiveCached,
  fetchEventMinutesCached,
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
    // sumy w każdej ćwiartce — przy 15 managerach to jeden "okrążony" czas oczekiwania zamiast 15
    const histories = await Promise.all(leagueEntries.map(plr => fetchEntryHistoryCached(plr.entry)));

    leagueEntries.forEach((plr, idx) => {
      const hist = histories[idx].current; // [{gw, pts, cost, value, overallRank, benchPoints}]

      for (const q of ranges){
        let sum = 0;
        let hitsSum = 0;
        for (const item of hist){
          if (item.gw >= q.fromGW && item.gw <= q.toGW){
            sum += item.pts;
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
    // front, który czyta tylko .pts, działa bez zmian.
    const gwPoints: Record<number, { gw: number; pts: number; cost: number; value: number; benchPoints: number }[]> = {};
    leagueEntries.forEach((plr, idx) => {
      gwPoints[plr.entry] = histories[idx].current
        .map(x => ({ gw: x.gw, pts: x.pts, cost: x.cost, value: x.value, benchPoints: x.benchPoints }))
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

    // Najświeższa kolejka, dla której mamy dane (max gw obecny w historii managerów) —
    // używana do badge'a chipa w tabeli głównej i do "Awards of the Week"
    let latestGw = 0;
    for (const h of histories) {
      for (const item of h.current) {
        if (item.gw > latestGw) latestGw = item.gw;
      }
    }

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
    const latestRows = leagueEntries.map((plr, idx) => {
      const cur = histories[idx].current.find(x => x.gw === latestGw);
      const prev = histories[idx].current.find(x => x.gw === latestGw - 1);
      return {
        entry: plr.entry,
        player_name: plr.player_name || '',
        entry_name: plr.entry_name || '',
        points: cur?.pts ?? 0,
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
    // tytułu tego chipa", a nie total GW. Policzalny dla BB (suma pkt zawodników z ławki, które
    // bez BB by się nie liczyły) i TC (dodatkowe punkty kapitana ponad zwykłe podwojenie) — oba
    // wymagają składu I punktów live z KONKRETNEJ kolejki, w której chip padł. Dla WC/FH/AM nie
    // ma dobrze zdefiniowanego "zysku z chipa" (to chipy transferowe/menedżerskie, nie
    // punktowe), więc dla nich bonus zostaje null.
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

    // dopełnij chipHistory o realny bonus per zagranie (WC/FH/AM zostają null)
    for (const entryStr in chipHistory) {
      chipHistory[Number(entryStr)] = chipHistory[Number(entryStr)].map(c => ({
        ...c,
        bonus: bonusableCodes.has(c.code)
          ? computeBonus(c.code, picksByEntryGw.get(`${entryStr}:${c.event}`), liveByGw[c.event])
          : null,
      }));
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

    // Transfery tej kolejki — kto najbardziej "przemeblował" skład przed tym gwizdkiem, licząc
    // samą liczbę transferów (niezależnie czy kosztowały punkty). Inna metryka niż Transfer
    // Tangle w GW Pulse (ten liczy koszt hita, nie samą aktywność) — ktoś mógł zrobić 4 transfery
    // za darmo (zaoszczędzone FT), więc to osobna, ciekawa historia.
    let mostTransfers: { entry: number; player_name: string; entry_name: string; transfers: number } | null = null;
    leagueEntries.forEach((plr, idx) => {
      const transfers = allPicksLatest[idx].entryHistory.eventTransfers;
      if (transfers > 0 && (!mostTransfers || transfers > mostTransfers.transfers)) {
        mostTransfers = { entry: plr.entry, player_name: plr.player_name || '', entry_name: plr.entry_name || '', transfers };
      }
    });

    const chipCountsThisRound: Record<string, number> = {};
    leagueEntries.forEach(plr => {
      const chip = latestChip[plr.entry];
      if (chip) chipCountsThisRound[chip.code] = (chipCountsThisRound[chip.code] || 0) + 1;
    });
    const chipUsageThisRound = Object.entries(chipCountsThisRound)
      .map(([code, count]) => ({ code, label: CHIP_LABELS[code] || code, count }))
      .sort((a, b) => b.count - a.count);
    // Wartość drużyny (TV) + transfery zagrane (FT) + ile ze "składu, który się liczy" faktycznie
    // zagrało (PLAYED) w latestGw — subtelny wgląd pod nazwą teamu w głównej tabeli. Skład, który
    // się liczy, to zwykle podstawowa 11 — ale przy Bench Boost liczy się cała 15, więc PLAYED
    // wtedy sprawdza wszystkich 15. Wszystko z danych, które i tak już mamy (allPicksLatest +
    // minuty z tej samej kolejki), zero dodatkowych zapytań poza jednym tanim fetchEventMinutesCached.
    const teamInfo: Record<number, {
      value: number; transfers: number; transfersCost: number;
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
    let transferTangle: { entry: number; player_name: string; entry_name: string; transfersCost: number } | null = null;
    leagueEntries.forEach(plr => {
      const cost = teamInfo[plr.entry]?.transfersCost ?? 0;
      if (cost > 0 && (!transferTangle || cost > transferTangle.transfersCost)) {
        transferTangle = { entry: plr.entry, player_name: plr.player_name || '', entry_name: plr.entry_name || '', transfersCost: cost };
      }
    });

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

    const topGun = topBy(latestRows, r => r.points);
    const toughWeek = bottomBy(latestRows, r => r.points);
    // Bench Tears: kto zostawił najwięcej punktów na ławce w tej GW — bardziej "bolesna" i
    // konkretna ciekawostka niż suchy najgorszy total (to i tak pokazuje GW Pulse "Worst GW").
    // Tylko gdy ktoś faktycznie coś zostawił (>0), inaczej nagroda się nie pojawia.
    const benchTearsRow = topBy(latestRows.filter(r => r.benchPoints > 0), r => r.benchPoints);
    const withComputableBonus = withChip.filter(r => chipBonus[r.entry] != null);
    // wybieramy po realnym zysku z chipa, jeśli da się go policzyć; inaczej fallback na total
    const chipMaster = withComputableBonus.length
      ? topBy(withComputableBonus, r => chipBonus[r.entry])
      : topBy(withChip, r => r.points);
    const chipMasterBonus = chipMaster ? (chipBonus[chipMaster.entry] ?? null) : null;
    const noChipWarrior = topBy(withoutChip, r => r.points);
    const valueKing = topBy(latestRows, r => r.value);
    const rankCrasher = topBy(rankFallers, r => r.rankChange);
    // Rank Riser: lustrzane odbicie Rank Crashera — największa POPRAWA rankingu ogólnego FPL vs
    // poprzednia GW (rankChange ujemne = ranking spadł liczbowo = awans). Ta sama, już policzona
    // lista (rankFallers), tylko szukamy minimum zamiast maksimum.
    const rankRiser = bottomBy(rankFallers, r => r.rankChange);
    const bestCaptain = topBy(differentialCaptains, r => r.captainPts);

    const awards = {
      gw: latestGw,
      topGun: mkAward(topGun, { points: topGun?.points }),
      toughWeek: mkAward(toughWeek, { points: toughWeek?.points }),
      chipMaster: mkAward(chipMaster, {
        points: chipMaster?.points,
        chip: chipMaster?.chip,
        bonus: chipMasterBonus, // pkt zdobyte DZIĘKI chipowi; null gdy nie da się policzyć (WC/FH)
      }),
      noChipWarrior: mkAward(noChipWarrior, { points: noChipWarrior?.points }),
      valueKing: mkAward(valueKing, { value: valueKing?.value }),
      rankCrasher: rankCrasher && rankCrasher.rankChange > 0
        ? mkAward(rankCrasher, { rankChange: rankCrasher.rankChange })
        : null, // brak sensownego spadku (albo brak danych z poprzedniej GW, np. GW1) -> ukryty na froncie
      rankRiser: rankRiser && rankRiser.rankChange < 0
        ? mkAward(rankRiser, { rankChange: rankRiser.rankChange })
        : null, // brak sensownej poprawy (albo brak danych z poprzedniej GW) -> ukryty na froncie
      bestCaptain: bestCaptain
        ? mkAward(bestCaptain, {
            captainName: bestCaptain.captainName,
            captainPts: bestCaptain.captainPts,
            templateCaptainName,
            templateCaptainPts,
          })
        : null, // nikt nie pobił template captaina inną kapitanką w tej kolejce -> ukryty na froncie
      benchTears: benchTearsRow ? mkAward(benchTearsRow, { benchPoints: benchTearsRow.benchPoints }) : null,
      // value tu = pkt straconych na hicie (nie wartość drużyny jak w valueKing — Award ma
      // generyczne pola reużywane per typ nagrody, patrz komentarz przy definicji transferTangle)
      transferTangle: transferTangle ? { entry: transferTangle.entry, player_name: transferTangle.player_name, entry_name: transferTangle.entry_name, value: transferTangle.transfersCost } : null,
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
      mostTransfers,         // {entry,player_name,entry_name,transfers} | null — najwięcej transferów w latestGw
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
