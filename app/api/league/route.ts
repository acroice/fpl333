import { NextRequest, NextResponse } from 'next/server';
import { fetchClassicStandingsCached } from '../_lib/fpl';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '1078207').trim();

  try {
    const { results, newEntries, leagueName } = await fetchClassicStandingsCached(leagueId);

    // dorzucamy new_entries (przedsezonowe zapisy) z ostatniej strony
    const mappedNew = newEntries.map((n: any, idx: number) => ({
      entry: n.entry,
      // manager = imię + nazwisko
      player_name: `${n.player_first_name || ''} ${n.player_last_name || ''}`.trim() || '—',
      // team = entry_name
      entry_name: n.entry_name || '—',
      total: 0,
      rank: 999999 + idx, // placeholder – żeby nie mieszał się z prawdziwym rankingiem
      event_total: 0,
      last_rank: 0,
    }));

    const raw = results.concat(mappedNew);

    const entries = (raw || [])
      .map((r: any) => ({
        entry: r.entry,
        player_name: r.player_name ?? '—', // manager
        entry_name: r.entry_name ?? '—', // team
        total: Number(r.total ?? 0),
        rank: Number(r.rank ?? 999999),
        event_total: Number(r.event_total ?? 0),
        last_rank: Number(r.last_rank ?? 0), // 0 = FPL nie ma jeszcze poprzedniej pozycji do porównania
      }))
      .sort((a: any, b: any) => a.rank - b.rank);

    const pre_season = entries.every((e) => e.total === 0);

    return NextResponse.json({
      leagueId,
      leagueName,
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
