// Wspólne narzędzia do odpytywania FPL API.
// Dzielone między /api/league i /api/quarter-wins, żeby przy jednym odświeżeniu strony
// nie pobierać tych samych standings ligi dwa razy z osobna.

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

type CacheEntry<T> = { data: T; ts: number };

export type StandingsRaw = {
  results: any[]; // wszystkie strony standings.results, sklejone
  newEntries: any[]; // new_entries.results z ostatniej strony (przedsezonowe zapisy)
};

export type GwHistory = {
  gw: number;
  pts: number;  // punkty NETTO — FPL już odejmuje tu koszt hitów (event_transfers_cost)
  cost: number; // ile pkt kosztowały transfery ponad darmowy limit w tej kolejce (0, 4, 8, ...)
};

const standingsCache = new Map<string, CacheEntry<StandingsRaw>>();
const historyCache = new Map<number, CacheEntry<GwHistory[]>>();

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

  return { results, newEntries: lastData?.new_entries?.results ?? [] };
}

// Standings ligi (wszystkie strony + new_entries), z cache TTL po leagueId.
export async function fetchClassicStandingsCached(leagueId: string): Promise<StandingsRaw> {
  const hit = standingsCache.get(leagueId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchClassicStandingsRaw(leagueId);
  standingsCache.set(leagueId, { data, ts: Date.now() });
  return data;
}

async function fetchEntryHistoryRaw(entryId: number): Promise<GwHistory[]> {
  const url = `https://fantasy.premierleague.com/api/entry/${entryId}/history/`;
  const res = await fetch(url, { cache: 'no-store', headers: fplHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.current ?? []).map((e: any) => ({
    gw: e.event,
    pts: e.points,
    cost: Number(e.event_transfers_cost ?? 0),
  }));
}

// Historia punktowa gracza (per GW, netto + koszt hitów), z cache TTL po entryId.
export async function fetchEntryHistoryCached(entryId: number): Promise<GwHistory[]> {
  const hit = historyCache.get(entryId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const data = await fetchEntryHistoryRaw(entryId);
  historyCache.set(entryId, { data, ts: Date.now() });
  return data;
}
