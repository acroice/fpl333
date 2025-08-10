import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

async function fetchAllPages(leagueId: string) {
  let page = 1;
  let results: any[] = [];
  while (true) {
    const url = `https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/?page_standings=${page}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) break;
    const data = await res.json();
    const chunk = data?.standings?.results || [];
    results = results.concat(chunk);
    if (data?.standings?.has_next) { page += 1; } else { break; }
  }
  return results;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get('leagueId') || '831753';

  try {
    const results = await fetchAllPages(leagueId);
    const entries = results.map((r:any)=>({
      entry: r.entry,
      player_name: r.player_name,
      entry_name: r.entry_name,
      total: r.total,
      rank: r.rank,
      event_total: r.event_total
    }));

    return NextResponse.json({ leagueId, count: entries.length, entries });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
