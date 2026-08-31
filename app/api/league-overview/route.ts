import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryPicksCached,
  fetchEventLiveCached,
  fetchBootstrapCached,
  playerPhotoUrl,
  clubBadgeUrl,
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
    const [allPicks, live] = await Promise.all([
      Promise.all(leagueEntries.map(e => fetchEntryPicksCached(e.entry, gw))),
      fetchEventLiveCached(gw),
    ]);
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

    // Ownership per zawodnik w całej lidze (zwykły % obstawy, bez mnożnika za kapitana —
    // Effective Ownership potrafiła przekraczać 100% u często kapitanowanych graczy, co
    // wyglądało jak błąd, więc tu celowo zwykłe 0-100%)
    const ownedCount: Record<number, number> = {};
    const captainCount: Record<number, number> = {};
    for (const p of allPicks) {
      for (const pick of p.picks) {
        ownedCount[pick.element] = (ownedCount[pick.element] || 0) + 1;
        if (pick.isCaptain) captainCount[pick.element] = (captainCount[pick.element] || 0) + 1;
      }
    }

    const ownershipRows = Object.entries(ownedCount).map(([elementStr, count]) => {
      const element = Number(elementStr);
      const el = bootstrap.elementsById[element];
      const team = el ? bootstrap.teamsById[el.team] : undefined;
      return {
        element,
        name: el?.web_name ?? '—',
        team: team?.short_name ?? '',
        teamBadgeUrl: team ? clubBadgeUrl(team.code) : '',
        position: el ? POSITION_LABEL[el.element_type] ?? '' : '',
        photoUrl: el ? playerPhotoUrl(el.code) : '',
        points: live[element] ?? 0,
        ownedCount: count,
        ownedPct: leagueSize ? Math.round((count / leagueSize) * 100) : 0,
        captainCount: captainCount[element] || 0,
      };
    });

    const topOwned = [...ownershipRows]
      .sort((a, b) => b.ownedCount - a.ownedCount)
      .slice(0, 6);

    // Różnicowi zawodnicy: nisko obstawiani w lidze (≤20%), a mimo to dobrze punktujący w tej
    // kolejce — pokazuje, kto zyskał przewagę dzięki nietypowemu wyborowi. Top5 wg punktów.
    const differentials = [...ownershipRows]
      .filter(p => p.ownedPct <= 20 && p.points > 0)
      .sort((a, b) => b.points - a.points || a.ownedCount - b.ownedCount)
      .slice(0, 5);

    // Captaincy Stats — każdy wybór kapitana w lidze: kto go zagrał (%), ile dał punktów
    const captaincy = Object.entries(captainCount)
      .map(([elementStr, count]) => {
        const element = Number(elementStr);
        const el = bootstrap.elementsById[element];
        const team = el ? bootstrap.teamsById[el.team] : undefined;
        return {
          element,
          name: el?.web_name ?? '—',
          team: team?.short_name ?? '',
          teamBadgeUrl: team ? clubBadgeUrl(team.code) : '',
          position: el ? POSITION_LABEL[el.element_type] ?? '' : '',
          photoUrl: el ? playerPhotoUrl(el.code) : '',
          points: live[element] ?? 0,
          captainCount: count,
          captainPct: leagueSize ? Math.round((count / leagueSize) * 100) : 0,
        };
      })
      .sort((a, b) => b.captainCount - a.captainCount || b.points - a.points);

    // Pełna mapa % obstawy w lidze (element -> %), nie tylko top6/top5 z topOwned/differentials —
    // do wyszukiwania "ile % ligi ma tego zawodnika" dla DOWOLNEGO gracza, np. w Porównaj (leaderboard
    // różnicowych), gdzie chodzi o konkretną parę managerów, nie tylko o najpopularniejszych.
    const ownershipPct: Record<number, number> = {};
    for (const r of ownershipRows) ownershipPct[r.element] = r.ownedPct;

    return NextResponse.json({ gw, leagueSize, chipUsage, topOwned, captaincy, differentials, ownershipPct });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId },
      { status: 500 }
    );
  }
}
