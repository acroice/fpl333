// Wspólne narzędzia do odpytywania FPL API.
// Dzielone między /api/league, /api/quarter-wins i /api/squad, żeby przy jednym odświeżeniu
// strony nie pobierać tych samych danych z FPL kilka razy z osobna.

export const fplHeaders: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://fantasy.premierleague.com/',
};

// Prosty cache w pamięci procesu (best-effort, TTL). Ogranicza liczbę zapytań do FPL przy
// częstych odświeżeniach strony przez kilku widzów naraz. Uwaga: na serverless (Vercel) żyje
// tylko tyle, ile żyje "ciepła" instancja funkcji — to nie jest gwarantowany, współdzielony
// cache, tylko odciążenie FPL w typowym przypadku kilku requestów w krótkim odstępie czasu.
const CACHE_TTL_MS = 60_000;
// bootstrap-static (nazwy zawodników, drużyny, terminarz GW) zmienia się rzadko w ciągu dnia —
// dłuższy TTL, żeby nie ciągnąć ~1.6MB przy każdym kliknięciu w skład gracza.
const BOOTSTRAP_TTL_MS = 15 * 60_000;

type CacheEntry<T> = { data: T; ts: number };

export type StandingsRaw = {
  results: any[]; // wszystkie strony standings.results, sklejone
  newEntries: any[]; // new_entries.results z ostatniej strony (przedsezonowe zapisy)
  leagueName: string; // nazwa ligi, tak jak ustawiona w FPL (league.name)
};

export type GwHistory = {
  gw: number;
  pts: number;         // punkty NETTO — FPL już odejmuje tu koszt hitów (event_transfers_cost)
  cost: number;         // ile pkt kosztowały transfery ponad darmowy limit w tej kolejce (0, 4, 8, ...)
  value: number;         // wartość drużyny w tej kolejce (jednostki 0.1mln, czyli 1000 = £100.0m)
  overallRank: number;   // ogólny ranking FPL (spośród wszystkich graczy) po tej kolejce
  benchPoints: number;   // pkt pozostawione na ławce w tej kolejce
};

export type ChipUsage = { name: string; event: number }; // name: 'bboost' | 'wildcard' | 'freehit' | '3xc' | 'manager' | ...

export type EntryHistoryData = {
  current: GwHistory[];
  chips: ChipUsage[];
};

export type LeagueEntryBasic = { entry: number; player_name: string; entry_name: string };

export type AutomaticSub = { elementIn: number; elementOut: number };

export type PicksData = {
  activeChip: string | null;
  entryHistory: {
    event: number; points: number; totalPoints: number;
    eventTransfers: number; eventTransfersCost: number;
    bank: number; value: number; pointsOnBench: number;
  };
  picks: { element: number; position: number; multiplier: number; isCaptain: boolean; isViceCaptain: boolean }[];
  automaticSubs: AutomaticSub[];
};

// Baza CDN oficjalnych zdjęć zawodników PL — publiczny, statyczny wzorzec (bez auth), używany
// też przez oficjalną stronę FPL. Rozmiary: 40x40 (mała miniaturka), 110x140 (portret).
export const PLAYER_PHOTO_BASE = 'https://resources.premierleague.com/premierleague/photos/players';
export function playerPhotoUrl(code: number, size: '40x40' | '110x140' = '40x40') {
  return `${PLAYER_PHOTO_BASE}/${size}/p${code}.png`;
}

export type BootstrapSlim = {
  elementsById: Record<number, { web_name: string; team: number; element_type: number; code: number }>;
  teamsById: Record<number, { short_name: string; name: string }>;
  currentGw: number; // is_current, albo ostatni z deadline_time w przeszłości, albo 1
};

const standingsCache = new Map<string, CacheEntry<StandingsRaw>>();
const historyCache = new Map<number, CacheEntry<EntryHistoryData>>();
const picksCache = new Map<string, CacheEntry<PicksData>>(); // klucz: `${entryId}:${gw}`
const liveCache = new Map<number, CacheEntry<Record<number, number>>>(); // klucz: gw -> {elementId: points}
let bootstrapCache: CacheEntry<BootstrapSlim> | null = null;

async function fetchClassicStandingsRaw(leagueId: string): Promise<StandingsRaw> {
  let page = 1;
  let results: any[] = [];
  let lastData: any = null;

  while (true) {
    const url = `https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/?page_standings=${page}&page_new_entries=1`;
    const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
    if (!res.ok) throw new Error(`classic ${res.status}`);

    const data = await res.json();
    lastData = data;
    results = results.concat(data?.standings?.results ?? []);

    if (data?.standings?.has_next) page += 1;
    else break;
  }

  return {
    results,
    newEntries: lastData?.new_entries?.results ?? [],
    leagueName: lastData?.league?.name ?? '',
  };
}

// Standings ligi (wszystkie strony + new_entries), z cache TTL po leagueId.
export async function fetchClassicStandingsCached(leagueId: string): Promise<StandingsRaw> {
  const hit = standingsCache.get(leagueId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchClassicStandingsRaw(leagueId);
  standingsCache.set(leagueId, { data, ts: Date.now() });
  return data;
}

// Lista uczestników ligi (entryId + nazwy), zdeduplikowana; korzysta ze standings powyżej.
export async function fetchLeagueEntries(leagueId: string): Promise<LeagueEntryBasic[]> {
  const { results, newEntries } = await fetchClassicStandingsCached(leagueId);

  const mappedNew = newEntries.map((n: any) => ({
    entry: n.entry,
    player_name: n.player_first_name + ' ' + n.player_last_name,
    entry_name: n.entry_name,
  }));

  const mappedStandings = results.map((r: any) => ({
    entry: r.entry,
    player_name: r.player_name,
    entry_name: r.entry_name,
  }));

  const merged = [...mappedStandings, ...mappedNew];
  const seen = new Map<number, LeagueEntryBasic>();
  for (const row of merged) {
    if (!seen.has(row.entry)) seen.set(row.entry, row);
  }
  return Array.from(seen.values());
}

async function fetchEntryHistoryRaw(entryId: number): Promise<EntryHistoryData> {
  const url = `https://fantasy.premierleague.com/api/entry/${entryId}/history/`;
  const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
  if (!res.ok) return { current: [], chips: [] };
  const data = await res.json();
  return {
    current: (data?.current ?? []).map((e: any) => ({
      gw: e.event,
      pts: e.points,
      cost: Number(e.event_transfers_cost ?? 0),
      value: Number(e.value ?? 0),
      overallRank: Number(e.overall_rank ?? 0),
      benchPoints: Number(e.points_on_bench ?? 0),
    })),
    chips: (data?.chips ?? []).map((c: any) => ({ name: c.name, event: c.event })),
  };
}

// Historia punktowa gracza (per GW, netto + koszt hitów + wartość drużyny + ranking ogólny)
// oraz lista użytych chipów w sezonie, z cache TTL po entryId.
export async function fetchEntryHistoryCached(entryId: number): Promise<EntryHistoryData> {
  const hit = historyCache.get(entryId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchEntryHistoryRaw(entryId);
  historyCache.set(entryId, { data, ts: Date.now() });
  return data;
}

async function fetchBootstrapRaw(): Promise<BootstrapSlim> {
  const url = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
  if (!res.ok) throw new Error(`bootstrap ${res.status}`);
  const data = await res.json();

  const elementsById: BootstrapSlim['elementsById'] = {};
  for (const e of data?.elements ?? []) {
    elementsById[e.id] = { web_name: e.web_name, team: e.team, element_type: e.element_type, code: e.code };
  }
  const teamsById: BootstrapSlim['teamsById'] = {};
  for (const t of data?.teams ?? []) {
    teamsById[t.id] = { short_name: t.short_name, name: t.name };
  }

  const events: any[] = data?.events ?? [];
  const current = events.find((e) => e.is_current) ?? events.find((e) => e.is_next);
  const currentGw = current ? current.id : 1;

  return { elementsById, teamsById, currentGw };
}

// Słownik zawodników/drużyn + numer bieżącej kolejki, z dłuższym cache TTL (dane rzadko się zmieniają).
export async function fetchBootstrapCached(): Promise<BootstrapSlim> {
  if (bootstrapCache && Date.now() - bootstrapCache.ts < BOOTSTRAP_TTL_MS) return bootstrapCache.data;

  const data = await fetchBootstrapRaw();
  bootstrapCache = { data, ts: Date.now() };
  return data;
}

async function fetchEntryPicksRaw(entryId: number, gw: number): Promise<PicksData> {
  const url = `https://fantasy.premierleague.com/api/entry/${entryId}/event/${gw}/picks/`;
  const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
  if (!res.ok) {
    return {
      activeChip: null,
      entryHistory: { event: gw, points: 0, totalPoints: 0, eventTransfers: 0, eventTransfersCost: 0, bank: 0, value: 0, pointsOnBench: 0 },
      picks: [],
      automaticSubs: [],
    };
  }
  const data = await res.json();
  const eh = data?.entry_history ?? {};
  return {
    activeChip: data?.active_chip ?? null,
    entryHistory: {
      event: eh.event ?? gw,
      points: Number(eh.points ?? 0),
      totalPoints: Number(eh.total_points ?? 0),
      eventTransfers: Number(eh.event_transfers ?? 0),
      eventTransfersCost: Number(eh.event_transfers_cost ?? 0),
      bank: Number(eh.bank ?? 0),
      value: Number(eh.value ?? 0),
      pointsOnBench: Number(eh.points_on_bench ?? 0),
    },
    picks: (data?.picks ?? []).map((p: any) => ({
      element: p.element,
      position: p.position,
      multiplier: p.multiplier,
      isCaptain: !!p.is_captain,
      isViceCaptain: !!p.is_vice_captain,
    })),
    // Automatyczne zamiany FPL (gdy ktoś z podstawowej 11 nie zagrał wcale, a ławka miała
    // sensowną alternatywę) — FPL dolicza je dopiero PO zakończeniu kolejki (finished:true
    // w bootstrap-static), więc dla trwającej/świeżo zamkniętej kolejki ta lista bywa pusta
    // nawet jeśli zamiana faktycznie się należy.
    automaticSubs: (data?.automatic_subs ?? []).map((s: any) => ({
      elementIn: s.element_in,
      elementOut: s.element_out,
    })),
  };
}

// Skład gracza w konkretnej kolejce (11 + ławka, kapitan, chip), z cache TTL po entryId+gw.
export async function fetchEntryPicksCached(entryId: number, gw: number): Promise<PicksData> {
  const key = `${entryId}:${gw}`;
  const hit = picksCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchEntryPicksRaw(entryId, gw);
  picksCache.set(key, { data, ts: Date.now() });
  return data;
}

async function fetchEventLiveRaw(gw: number): Promise<Record<number, number>> {
  const url = `https://fantasy.premierleague.com/api/event/${gw}/live/`;
  const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
  if (!res.ok) return {};
  const data = await res.json();
  const byElement: Record<number, number> = {};
  for (const el of data?.elements ?? []) {
    byElement[el.id] = Number(el?.stats?.total_points ?? 0);
  }
  return byElement;
}

// Punkty każdego zawodnika w danej kolejce (na żywo w trakcie GW), z cache TTL po gw.
export async function fetchEventLiveCached(gw: number): Promise<Record<number, number>> {
  const hit = liveCache.get(gw);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchEventLiveRaw(gw);
  liveCache.set(gw, { data, ts: Date.now() });
  return data;
}

// Czytelne etykiety chipów FPL, do wyświetlenia jako badge.
export const CHIP_LABELS: Record<string, string> = {
  bboost: 'BB',
  wildcard: 'WC',
  freehit: 'FH',
  '3xc': 'TC',
  manager: 'AM',
};

export const CHIP_NAMES: Record<string, string> = {
  bboost: 'Bench Boost',
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  '3xc': 'Triple Captain',
  manager: 'Assistant Manager',
};
