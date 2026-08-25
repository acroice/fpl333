import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryPicksCached,
  fetchEventLiveCached,
  fetchBootstrapCached,
  playerPhotoUrl,
  CHIP_LABELS,
  CHIP_NAMES,
} from '../_lib/fpl';

export const revalidate = 0;

const POSITION_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Skład jednego managera w konkretnej kolejce: 15 zawodników z punktami zdobytymi w tej
// kolejce, kapitanem/wicekapitanem, informacją czy grał w podstawowym składzie czy na ławce,
// oraz % ownership w TEJ lidze (ilu innych managerów też go miało w składzie).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = (searchParams.get('leagueId') || '1078207').trim();
  const entryIdParam = searchParams.get('entryId');
  const entryId = Number(entryIdParam);

  if (!entryIdParam || !Number.isFinite(entryId)) {
    return NextResponse.json({ error: 'missing_or_invalid_entryId' }, { status: 400 });
  }

  try {
    const bootstrap = await fetchBootstrapCached();
    const gwParam = searchParams.get('gw');
    const gw = gwParam ? Number(gwParam) : bootstrap.currentGw;
    if (!Number.isFinite(gw) || gw < 1 || gw > 38) {
      return NextResponse.json({ error: 'invalid_gw' }, { status: 400 });
    }

    const leagueEntries = await fetchLeagueEntries(leagueId);
    const target = leagueEntries.find(e => e.entry === entryId);
    if (!target) {
      return NextResponse.json({ error: 'entry_not_in_league', leagueId, entryId }, { status: 404 });
    }

    // Składy WSZYSTKICH managerów w tej kolejce — potrzebne do policzenia % ownership w lidze.
    // Cache'owane per entry+gw, więc kolejne kliknięcia w tej samej kolejce już nic nie dociągają.
    const [allPicks, live] = await Promise.all([
      Promise.all(leagueEntries.map(e => fetchEntryPicksCached(e.entry, gw))),
      fetchEventLiveCached(gw),
    ]);

    const targetIdx = leagueEntries.findIndex(e => e.entry === entryId);
    const targetPicks = allPicks[targetIdx];

    // Effective Ownership: suma mnożników (0/1/2/3) każdego managera dla danego zawodnika,
    // podzielona przez wielkość ligi — dokładnie tak liczy to livefpl (u kapitana wchodzącego
    // z podwójnymi punktami % rośnie o dodatkowe 100% jego ownership, u TC o dodatkowe 200%).
    const multiplierSum: Record<number, number> = {};
    for (const p of allPicks) {
      for (const pick of p.picks) {
        multiplierSum[pick.element] = (multiplierSum[pick.element] || 0) + pick.multiplier;
      }
    }
    const leagueSize = leagueEntries.length;

    // Automatyczne zamiany FPL (patrz komentarz w _lib/fpl.ts) — jeśli już są dostępne,
    // stosujemy je, żeby podstawowy skład/ławka i punkty per zawodnik odzwierciedlały to, co
    // faktycznie się liczyło, a nie tylko selekcję sprzed kolejki.
    const subOutToIn = new Map(targetPicks.automaticSubs.map(s => [s.elementOut, s.elementIn]));
    const subInToOut = new Map(targetPicks.automaticSubs.map(s => [s.elementIn, s.elementOut]));
    const picksByElement = new Map(targetPicks.picks.map(p => [p.element, p]));

    const squad = targetPicks.picks
      .map(p => {
        const el = bootstrap.elementsById[p.element];
        const team = el ? bootstrap.teamsById[el.team] : undefined;
        const rawPoints = live[p.element] ?? 0;

        const subbedOut = subOutToIn.has(p.element);
        const subbedIn = subInToOut.has(p.element);

        let effectiveMultiplier = p.multiplier;
        let effectiveIsBench = p.position > 11;
        if (subbedOut) {
          effectiveMultiplier = 0;      // nie wliczał się do wyniku
          effectiveIsBench = true;      // efektywnie "nie zagrał" -> traktujemy jak ławkę
        } else if (subbedIn) {
          const outElement = subInToOut.get(p.element)!;
          const outPick = picksByElement.get(outElement);
          effectiveMultiplier = outPick ? outPick.multiplier : 1; // przejmuje mnożnik zmienianego
          effectiveIsBench = false;     // efektywnie w podstawowym składzie
        }

        return {
          element: p.element,
          name: el?.web_name ?? '—',
          team: team?.short_name ?? '',
          position: el ? POSITION_LABEL[el.element_type] ?? '' : '',
          photoUrl: el ? playerPhotoUrl(el.code) : '',
          points: rawPoints,                              // surowe punkty zawodnika w tej kolejce
          total: rawPoints * effectiveMultiplier,          // to, co faktycznie wliczyło się do wyniku
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
          isBench: effectiveIsBench,
          subbedIn,
          subbedOut,
          multiplier: effectiveMultiplier,
          ownershipPct: leagueSize ? Math.round(((multiplierSum[p.element] || 0) / leagueSize) * 100) : 0,
          slot: p.position,
        };
      })
      .sort((a, b) => a.slot - b.slot);

    const chip = targetPicks.activeChip
      ? { code: targetPicks.activeChip, label: CHIP_LABELS[targetPicks.activeChip] || targetPicks.activeChip, name: CHIP_NAMES[targetPicks.activeChip] || targetPicks.activeChip }
      : null;

    return NextResponse.json({
      gw,
      entryId,
      playerName: target.player_name,
      entryName: target.entry_name,
      activeChip: chip,
      entryHistory: targetPicks.entryHistory,
      squad,
      leagueSize,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId, entryId },
      { status: 500 }
    );
  }
}
