import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryPicksCached,
  fetchBootstrapCached,
  playerPhotoUrl,
  CHIP_LABELS,
  CHIP_NAMES,
} from '../_lib/fpl';

export const revalidate = 0;

const POSITION_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Widok całej ligi dla jednej kolejki: ile osób zagrało jaki chip + top-owned zawodnicy
// (z Effective Ownership uwzględniającym kapitanów). Korzysta z tego samego cache'owanego
// fetchEntryPicksCached co /api/squad — jeśli ktoś już wcześniej otworzył czyjś skład w tej
// kolejce, ten endpoint nic dodatkowego nie dociąga.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '1078207').trim();

  try {
    const bootstrap = await fetchBootstrapCached();
    const gwParam = searchParams.get('gw');
    const gw = gwParam ? Number(gwParam) : bootstrap.currentGw;
    if (!Number.isFinite(gw) || gw < 1 || gw > 38) {
      return NextResponse.json({ error: 'invalid_gw' }, { status: 400 });
    }

    const leagueEntries = await fetchLeagueEntries(leagueId);
    const allPicks = await Promise.all(leagueEntries.map(e => fetchEntryPicksCached(e.entry, gw)));
    const leagueSize = leagueEntries.length;

    // Użycie chipów w tej kolejce
    const chipCounts: Record<string, number> = { none: 0 };
    for (const p of allPicks) {
      const key = p.activeChip || 'none';
      chipCounts[key] = (chipCounts[key] || 0) + 1;
    }
    const chipUsage = Object.entries(chipCounts).map(([code, count]) => ({
      code,
      label: code === 'none' ? 'Brak' : (CHIP_LABELS[code] || code),
      name: code === 'none' ? 'Bez chipa' : (CHIP_NAMES[code] || code),
      count,
      pct: leagueSize ? Math.round((count / leagueSize) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // Ownership + Effective Ownership per zawodnik w całej lidze
    const ownedCount: Record<number, number> = {};
    const multiplierSum: Record<number, number> = {};
    const captainCount: Record<number, number> = {};
    for (const p of allPicks) {
      for (const pick of p.picks) {
        ownedCount[pick.element] = (ownedCount[pick.element] || 0) + 1;
        multiplierSum[pick.element] = (multiplierSum[pick.element] || 0) + pick.multiplier;
        if (pick.isCaptain) captainCount[pick.element] = (captainCount[pick.element] || 0) + 1;
      }
    }

    const topOwned = Object.entries(ownedCount)
      .map(([elementStr, count]) => {
        const element = Number(elementStr);
        const el = bootstrap.elementsById[element];
        const team = el ? bootstrap.teamsById[el.team] : undefined;
        return {
          element,
          name: el?.web_name ?? '—',
          team: team?.short_name ?? '',
          position: el ? POSITION_LABEL[el.element_type] ?? '' : '',
          photoUrl: el ? playerPhotoUrl(el.code) : '',
          ownedCount: count,
          ownedPct: leagueSize ? Math.round((count / leagueSize) * 100) : 0,
          captainCount: captainCount[element] || 0,
          eoPct: leagueSize ? Math.round(((multiplierSum[element] || 0) / leagueSize) * 100) : 0,
        };
      })
      .sort((a, b) => b.eoPct - a.eoPct || b.ownedCount - a.ownedCount)
      .slice(0, 12);

    return NextResponse.json({ gw, leagueSize, chipUsage, topOwned });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId },
      { status: 500 }
    );
  }
}
