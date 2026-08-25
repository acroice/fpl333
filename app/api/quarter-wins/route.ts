import { NextRequest, NextResponse } from 'next/server';
import { fetchLeagueEntries, fetchEntryHistoryCached, CHIP_LABELS } from '../_lib/fpl';

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

    // Chip zagrany przez każdego managera w latestGw (do badge'a w tabeli głównej)
    const latestChip: Record<number, { code: string; label: string } | null> = {};
    leagueEntries.forEach((plr, idx) => {
      const used = histories[idx].chips.find(c => c.event === latestGw);
      latestChip[plr.entry] = used ? { code: used.name, label: CHIP_LABELS[used.name] || used.name } : null;
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

    const mkAward = (r: typeof latestRows[number] | null, extra?: object) =>
      r ? { entry: r.entry, player_name: r.player_name, entry_name: r.entry_name, ...extra } : null;

    const topGun = topBy(latestRows, r => r.points);
    const toughWeek = bottomBy(latestRows, r => r.points);
    const chipMaster = topBy(withChip, r => r.points);
    const noChipWarrior = topBy(withoutChip, r => r.points);
    const valueKing = topBy(latestRows, r => r.value);
    const rankCrasher = topBy(rankFallers, r => r.rankChange);

    const awards = {
      gw: latestGw,
      topGun: mkAward(topGun, { points: topGun?.points }),
      toughWeek: mkAward(toughWeek, { points: toughWeek?.points }),
      chipMaster: mkAward(chipMaster, { points: chipMaster?.points, chip: chipMaster?.chip }),
      noChipWarrior: mkAward(noChipWarrior, { points: noChipWarrior?.points }),
      valueKing: mkAward(valueKing, { value: valueKing?.value }),
      rankCrasher: rankCrasher && rankCrasher.rankChange > 0
        ? mkAward(rankCrasher, { rankChange: rankCrasher.rankChange })
        : null, // brak sensownego spadku (albo brak danych z poprzedniej GW, np. GW1) -> ukryty na froncie
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
      awards                   // Awards of the Week dla latestGw
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
