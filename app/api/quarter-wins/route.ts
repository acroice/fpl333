import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

const headers: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://fantasy.premierleague.com/',
};

type QuarterRange = { id: string; fromGW: number; toGW: number; toDate: Date; fromDate: Date };

function buildQuarterRanges(): QuarterRange[] {
  const gwDays = [15,22,29,13,20,27,4,18,25,1,8,22,29,3,6,13,20,27,30,3,7,17,24,31,7,11,21,28,4,14,21,11,18,25,2,9,17,24];
  const months = [7,7,7,8,8,8,9,9,9,10,10,10,10,11,11,11,11,11,11,0,0,0,0,0,1,1,1,1,2,2,2,3,3,3,4,4,4,4];
  const years  = [2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026];
  const starts: Date[] = [];
  for (let i=0;i<38;i++) starts.push(new Date(Date.UTC(years[i], months[i], gwDays[i])));

  const seasonEnd = new Date(Date.UTC(2026, 4, 24)); // 24.05.2026

  const base = [
    { id: 'Q1', fromGW: 1,  toGW: 6  },
    { id: 'Q2', fromGW: 7,  toGW: 13 },
    { id: 'Q3', fromGW: 14, toGW: 19 },
    { id: 'Q4', fromGW: 20, toGW: 26 },
    { id: 'Q5', fromGW: 27, toGW: 32 },
    { id: 'Q6', fromGW: 33, toGW: 38 },
  ];

  return base.map(r => {
    const fromDate = starts[r.fromGW-1];
    const toDate = r.id === 'Q6' ? seasonEnd : new Date(starts[r.toGW].getTime() - 24*3600*1000);
    return { ...r, fromDate, toDate };
  });
}

async function fetchLeagueEntries(leagueId: string) {
  let page = 1, results: any[] = [], lastData: any = null;
  while (true) {
    const url = `https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/?page_standings=${page}&page_new_entries=1`;
    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) throw new Error(`classic ${res.status}`);
    const data = await res.json();
    lastData = data;
    results = results.concat(data?.standings?.results ?? []);
    if (data?.standings?.has_next) page += 1; else break;
  }
  const newEntries = lastData?.new_entries?.results ?? [];
  const mappedNew = newEntries.map((n:any)=>({ entry:n.entry }));
  const ids = results.map((r:any)=>({ entry:r.entry })).concat(mappedNew);
  // dedupe
  const seen = new Set<number>();
  return ids.filter(x => (seen.has(x.entry) ? false : (seen.add(x.entry), true)));
}

async function fetchEntryPoints(entryId: number) {
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
  const current = (now < ranges[0].fromDate)
    ? ranges[0]
    : (ranges.find(r => now >= r.fromDate && now <= r.toDate) || ranges[ranges.length-1]);

  // 1) list of entries in the league
  const entries = await fetchLeagueEntries(leagueId);

  // 2) per-entry history and sums per-quarter
  const winsCount: Record<number, number> = {};
  const currentScores: Record<number, number> = {};

  // Sum points per quarter for finished quarters, and for current quarter
  for (const e of entries){
    const hist = await fetchEntryPoints(e.entry); // [{gw, pts}]
    let scoreCurrent = 0;
    // current quarter sum
    for (const item of hist){
      if (item.gw >= current.fromGW && item.gw <= current.toGW){
        scoreCurrent += item.pts;
      }
    }
    currentScores[e.entry] = scoreCurrent;
  }

  // winners for finished quarters
  for (const q of ranges){
    if (now <= q.toDate) continue; // tylko zakończone
    let best = -1, winners: number[] = [];
    for (const e of entries){
      const hist = await fetchEntryPoints(e.entry);
      let sum = 0;
      for (const item of hist){
        if (item.gw >= q.fromGW && item.gw <= q.toGW) sum += item.pts;
      }
      if (sum > best){
        best = sum; winners = [e.entry];
      } else if (sum === best){
        winners.push(e.entry);
      }
    }
    for (const w of winners){
      winsCount[w] = (winsCount[w] || 0) + 1;
    }
  }

  return NextResponse.json({
    currentQuarter: current.id,
    currentRange: { fromGW: current.fromGW, toGW: current.toGW },
    wins: winsCount,              // { entryId: trophies }
    currentScores                 // { entryId: points in current quarter }
  });
}
