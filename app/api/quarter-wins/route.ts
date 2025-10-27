import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

// Stałe nagłówki żeby FPL API nas lubiło
const headers: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://fantasy.premierleague.com/',
};

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
  // Dane GW start (dzień startu kolejki PL) – to co mieliśmy już wcześniej
  const gwDays   = [15,22,29,13,20,27,4,18,25,1,8,22,29,3,6,13,20,27,30,3,7,17,24,31,7,11,21,28,4,14,21,11,18,25,2,9,17,24];
  const gwMonths = [8,8,8,9,9,9,10,10,10,11,11,11,11,12,12,12,12,12,12,1,1,1,1,1,2,2,2,2,3,3,3,4,4,4,5,5,5,5]; // 1-index months
  const gwYears  = [2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026];

  // Zbuduj daty startu każdej GW jako Date (początek dnia w PL potraktowany jako północ UTC)
  const starts: Date[] = [];
  for (let i=0;i<38;i++){
    starts.push(new Date(Date.UTC(gwYears[i], gwMonths[i]-1, gwDays[i], 0,0,0)));
  }

  // Konfiguracja ćwiartek
  const base = [
    { id: 'Q1', fromGW: 1,  toGW: 6  },
    { id: 'Q2', fromGW: 7,  toGW: 13 },
    { id: 'Q3', fromGW: 14, toGW: 19 },
    { id: 'Q4', fromGW: 20, toGW: 26 },
    { id: 'Q5', fromGW: 27, toGW: 32 },
    { id: 'Q6', fromGW: 33, toGW: 38 },
  ];

  // koniec Q6 -> koniec sezonu = 24.05.2026
  const seasonEnd = new Date(Date.UTC(2026, 4, 24, 23,59,59));

  const ranges: QuarterRange[] = base.map(r => {
    const fromDate = starts[r.fromGW-1];
    const toDate =
      r.id === 'Q6'
        ? seasonEnd
        : new Date(starts[r.toGW].getTime() - 24*3600*1000); // dzień przed kolejną GW
    return { ...r, fromDate, toDate };
  });

  return ranges;
}

// pobierz wszystkich uczestników ligi
async function fetchLeagueEntries(leagueId: string) {
  let page = 1;
  let results: any[] = [];
  let lastData: any = null;

  while (true) {
    const url = `https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/?page_standings=${page}&page_new_entries=1`;
    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) throw new Error(`classic ${res.status}`);
    const data = await res.json();
    lastData = data;
    results = results.concat(data?.standings?.results ?? []);
    if (data?.standings?.has_next) {
      page += 1;
    } else {
      break;
    }
  }

  const newEntries = lastData?.new_entries?.results ?? [];
  const mappedNew = newEntries.map((n:any)=>({ entry:n.entry, player_name: n.player_first_name + ' ' + n.player_last_name, entry_name: n.entry_name }));

  // map klasycznych wyników
  const mappedStandings = results.map((r:any)=>({
    entry: r.entry,
    player_name: r.player_name,
    entry_name: r.entry_name
  }));

  // sklej, deduplikuj po entry
  const merged = [...mappedStandings, ...mappedNew];
  const seen = new Map<number, {player_name:string, entry_name:string}>();
  for (const row of merged){
    if (!seen.has(row.entry)) {
      seen.set(row.entry, {player_name: row.player_name, entry_name: row.entry_name});
    }
  }

  // zwróć listę unikalnych entry + metadata
  return Array.from(seen.entries()).map(([entry, info]) => ({
    entry,
    player_name: info.player_name,
    entry_name: info.entry_name
  }));
}

// historia konkretnego gracza
async function fetchEntryHistory(entryId: number) {
  const url = `https://fantasy.premierleague.com/api/entry/${entryId}/history/`;
  const res = await fetch(url, { cache: 'no-store', headers });
  if (!res.ok) return [];
  const data = await res.json();
  // data.current: [{ event, points, total_points, ... }]
  return (data?.current ?? []).map((e:any)=>({ gw: e.event, pts: e.points }));
}

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '831753').trim();

  const ranges = buildQuarterRanges();
  const now = new Date();

  // Uczestnicy ligi (entryId + nazwy)
  const leagueEntries = await fetchLeagueEntries(leagueId);

  // Przygotowanie struktur:
  // - winsCount[entryId] = ile pucharów (wygranych ćwiartek zakończonych)
  // - currentScores[entryId] = wynik w aktualnej ćwiartce (tej która trwa)
  // - quarterScores[q.id] = [{entry, player_name, entry_name, pointsSum}] dla danej ćwiartki
  const winsCount: Record<number, number> = {};
  const currentScores: Record<number, number> = {};
  const quarterScores: Record<string, {entry:number; player_name:string; entry_name:string; points:number}[]> = {};

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

  // dla każdego gracza: pobierz jego historię punktową i policz sumy w każdej ćwiartce
  for (const plr of leagueEntries){
    const hist = await fetchEntryHistory(plr.entry); // [{gw, pts}]

    for (const q of ranges){
      let sum = 0;
      for (const item of hist){
        if (item.gw >= q.fromGW && item.gw <= q.toGW){
          sum += item.pts;
        }
      }
      // zapisz do quarterScores
      if (!quarterScores[q.id]) quarterScores[q.id] = [];
      quarterScores[q.id].push({
        entry: plr.entry,
        player_name: plr.player_name || '',
        entry_name: plr.entry_name || '',
        points: sum
      });

      // jeśli to aktualna ćwiartka -> to jest currentScores
      if (q.id === currentQuarter.id){
        currentScores[plr.entry] = sum;
      }
    }
  }

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

  return NextResponse.json({
    currentQuarter: currentQuarter.id,
    currentRange: { fromGW: currentQuarter.fromGW, toGW: currentQuarter.toGW },
    currentScores,          // { entryId: points in current quarter }
    wins: winsCount,        // { entryId: trophies }
    winnersByQuarter,       // { Q1:[{entry,points},...], ... } only finished
    quarterTop              // { Q1:[{entry,player_name,entry_name,points}, ... up to 3], ...}
  });
}
