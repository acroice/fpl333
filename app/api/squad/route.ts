import { NextRequest, NextResponse } from 'next/server';
import {
  fetchLeagueEntries,
  fetchEntryPicksCached,
  fetchEventLiveCached,
  fetchEventMinutesCached,
  fetchFinishedTeamsCached,
  fetchBootstrapCached,
  simulateAutosubs,
  playerPhotoUrl,
  clubBadgeUrl,
  CHIP_LABELS,
  CHIP_NAMES,
  type BootstrapSlim,
  type PicksData,
} from '../_lib/fpl';

export const revalidate = 0;

const POSITION_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Buduje listę 15 zawodników na podstawie efektywnych mnożników (0/1/2/3) i informacji o
// zamianach — współdzielone przez skład "oficjalny" (automatic_subs z FPL) i "projekcję"
// (nasza symulacja na żywo, patrz simulateAutosubs w _lib/fpl.ts).
function buildSquad(
  picks: PicksData['picks'],
  effectiveMultiplier: Record<number, number>,
  subbedIn: Set<number>,
  subbedOut: Set<number>,
  live: Record<number, number>,
  bootstrap: BootstrapSlim,
  multiplierSum: Record<number, number>,
  leagueSize: number
) {
  return picks
    .map(p => {
      const el = bootstrap.elementsById[p.element];
      const team = el ? bootstrap.teamsById[el.team] : undefined;
      const rawPoints = live[p.element] ?? 0;
      const mult = effectiveMultiplier[p.element] ?? 0;
      return {
        element: p.element,
        name: el?.web_name ?? '—',
        team: team?.short_name ?? '',
        teamBadgeUrl: team ? clubBadgeUrl(team.code) : '',
        position: el ? POSITION_LABEL[el.element_type] ?? '' : '',
        photoUrl: el ? playerPhotoUrl(el.code) : '',
        points: rawPoints,          // surowe punkty zawodnika w tej kolejce
        total: rawPoints * mult,    // to, co faktycznie wliczyło się (lub wliczy) do wyniku
        isCaptain: p.isCaptain,
        isViceCaptain: p.isViceCaptain,
        isBench: mult === 0,        // nie w efektywnej 11 -> ławka (nieużyta albo wypadnięta)
        subbedIn: subbedIn.has(p.element),
        subbedOut: subbedOut.has(p.element),
        multiplier: mult,
        ownershipPct: leagueSize ? Math.round(((multiplierSum[p.element] || 0) / leagueSize) * 100) : 0,
        slot: p.position,
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

// Skład jednego managera w konkretnej kolejce: 15 zawodników z punktami zdobytymi w tej
// kolejce, kapitanem/wicekapitanem, informacją czy grał w podstawowym składzie czy na ławce,
// % ownership w TEJ lidze, oraz — dopóki FPL nie zamknie kolejki — PROJEKCJA autosubów na
// podstawie danych live (kto na pewno nie zagra, bo mecz się skończył, a on ma 0 minut).
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

    // Skład "jak wybrany" — bazowy mnożnik z picks, bez żadnych zamian (subbedIn/subbedOut puste).
    const baseMultiplier: Record<number, number> = {};
    for (const p of targetPicks.picks) baseMultiplier[p.element] = p.multiplier;

    // Automatyczne zamiany FPL (oficjalne) — jeśli już są dostępne (kolejka zamknięta), stosujemy
    // je: podstawowy skład/ławka i punkty per zawodnik odzwierciedlają to, co faktycznie się liczyło.
    const officialSubOutToIn = new Map(targetPicks.automaticSubs.map(s => [s.elementOut, s.elementIn]));
    const officialSubInToOut = new Map(targetPicks.automaticSubs.map(s => [s.elementIn, s.elementOut]));
    const picksByElement = new Map(targetPicks.picks.map(p => [p.element, p]));

    const officialMultiplier: Record<number, number> = { ...baseMultiplier };
    for (const p of targetPicks.picks) {
      if (officialSubOutToIn.has(p.element)) {
        officialMultiplier[p.element] = 0;
      } else if (officialSubInToOut.has(p.element)) {
        const outPick = picksByElement.get(officialSubInToOut.get(p.element)!);
        officialMultiplier[p.element] = outPick ? outPick.multiplier : 1;
      }
    }

    const squad = buildSquad(
      targetPicks.picks,
      officialMultiplier,
      new Set(officialSubInToOut.keys()),
      new Set(officialSubOutToIn.keys()),
      live,
      bootstrap,
      multiplierSum,
      leagueSize
    );

    // Projekcja autosubów — tylko gdy FPL jeszcze nie ma własnych oficjalnych zamian (kolejka w
    // trakcie). Bez dodatkowego zapytania o minuty (współdzieli cache z fetchEventLiveCached);
    // jedno dodatkowe, tanie zapytanie o zakończone mecze.
    let projectedSquad: ReturnType<typeof buildSquad> | null = null;
    let projectedTotal: number | null = null;
    let hasProjection = false;

    if (targetPicks.automaticSubs.length === 0) {
      const [minutes, finishedTeams] = await Promise.all([
        fetchEventMinutesCached(gw),
        fetchFinishedTeamsCached(gw),
      ]);
      const sim = simulateAutosubs(targetPicks.picks, minutes, finishedTeams, bootstrap.elementsById);

      projectedSquad = buildSquad(
        targetPicks.picks,
        sim.effectiveMultiplier,
        new Set(sim.subs.map(s => s.elementIn)),
        new Set(sim.subs.map(s => s.elementOut)),
        live,
        bootstrap,
        multiplierSum,
        leagueSize
      );
      projectedTotal = projectedSquad.reduce((sum, p) => sum + p.total, 0);
      // UWAGA: celowo NIE porównujemy projectedTotal z entryHistory.points — to dwa osobne
      // endpointy FPL (live/ i picks/), które podczas trwającego meczu potrafią mieć lekko
      // inny moment odświeżenia (np. tymczasowe punkty bonusowe), więc same się różnią nawet
      // gdy nasza symulacja nie znalazła żadnej zamiany. hasProjection ma odzwierciedlać
      // wyłącznie to, czy SYMULACJA faktycznie coś przewiduje.
      hasProjection = sim.subs.length > 0 || sim.captainChanged;
    }

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
      hasProjection,       // czy projekcja przewiduje inny wynik niż to, co FPL pokazuje teraz
      projectedSquad,       // null, jeśli FPL już ma oficjalne automatic_subs (albo nic się nie zmienia)
      projectedTotal,       // suma punktów PO symulowanych zamianach; null jak wyżej
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fetch_failed', leagueId, entryId },
      { status: 500 }
    );
  }
}
