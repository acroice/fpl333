import { NextRequest, NextResponse } from 'next/server';
export const revalidate = 0;

const headers: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://fantasy.premierleague.com/',
};

// pobieramy klasyczne standings strona po stronie
async function fetchClassicStandings(leagueId: string) {
  let page = 1,
    results: any[] = [];
  let lastData: any = null;

  while (true) {
    const url = `https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/?page_standings=${page}&page_new_entries=1`;
    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) throw new Error(`classic ${res.status}`);

    const data = await res.json();
    lastData = data;

    const standings = data?.standings?.results ?? [];
    results = results.concat(standings);

    const hasNext = data?.standings?.has_next;
    if (hasNext) page += 1;
    else break;
  }

  // dorzucamy new_entries (przedsezonowe zapisy) z ostatniej strony
  const newEntries = lastData?.new_entries?.results ?? [];
  const mappedNew = newEntries.map((n: any, idx: number) => ({
    entry: n.entry,
    // manager = imię + nazwisko
    player_name: `${n.player_first_name || ''} ${n.player_last_name || ''}`.trim() || '—',
    // team = entry_name
    entry_name: n.entry_name || '—',
    total: 0,
    rank: 999999 + idx, // placeholder – żeby nie mieszał się z prawdziwym rankingiem
    event_total: 0,
  }));

  return results.concat(mappedNew);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '831753').trim();

  try {
    const raw = await fetchClassicStandings(leagueId);

    const entries = (raw || [])
      .map((r: any) => ({
        entry: r.entry,
        player_name: r.player_name ?? '—', // manager
        entry_name: r.entry_name ?? '—', // team
        total: Number(r.total ?? 0),
        rank: Number(r.rank ?? 999999),
        event_total: Number(r.event_total ?? 0),
      }))
      .sort((a: any, b: any) => a.rank - b.rank);

    const pre_season = entries.every((e) => e.total === 0);

    return NextResponse.json({
      leagueId,
      count: entries.length,
      pre_season,
      entries,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId },
      { status: 500 }
    );
  }
}
