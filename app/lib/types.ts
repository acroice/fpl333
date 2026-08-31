// Współdzielone typy danych FPL333 — jedno źródło prawdy dla page.tsx i wszystkich sekcji/
// komponentów pod app/sections i app/components. Wydzielone z dawnego page.tsx bez zmian
// kształtu (żadne pole nie zniknęło), tylko żeby uniknąć duplikacji przy podziale na pliki.

export type LeagueEntry = {
  entry: number;
  player_name: string; // Manager
  entry_name: string;  // Team
  total: number;
  rank: number;
  event_total: number;
  last_rank: number; // 0 = FPL nie ma jeszcze poprzedniej pozycji do porównania
};

export type Quarter = {
  id: string;
  gw_from: number;
  gw_to: number;
  games: number;
  from: string;
  to: string;
  status: 'trwa' | 'zakończona' | 'wkrótce';
  note: string;
  is_current?: boolean;
  progress?: number; // 0–100, upływ czasu ćwiartki
};

export type QuarterTopRow = {
  entry: number;
  player_name: string;
  entry_name: string;
  points: number;
};

export type QuarterHitsRow = {
  entry: number;
  player_name: string;
  entry_name: string;
  hits: number; // pkt stracone na transferach ponad darmowy limit w tej ćwiartce
};

// per-GW punkty managera — cost/value/benchPoints dołączone dla sekcji Sezon/Statystyki
// (historia rankingu/punktów, bench/transfer aggregates); istniejące miejsca czytają tylko .pts
export type GwPoint = { gw: number; pts: number; cost: number; value: number; benchPoints: number };

export type CaptainInfo = { element: number; name: string; photoUrl: string; points: number } | null;

// ranking ogólny FPL (spośród wszystkich graczy) w latestGw — live w trakcie trwającej kolejki,
// nie tylko po jej zamknięciu; prevRank z poprzedniej GW do strzałki ruchu, null gdy brak (np. GW1)
export type OverallRankInfo = { rank: number; prevRank: number | null } | null;

export type TeamInfo = { value: number; transfers: number; transfersCost: number; played: number; playedTotal: number };

export type ChipInfo = { code: string; label: string; name?: string };

// bonus: pkt zdobyte DZIĘKI temu konkretnemu zagraniu chipa (nie total kolejki) — policzalne dla
// bboost (suma pkt z ławki) i 3xc (pkt kapitana, czyli nadwyżka ponad zwykłe podwojenie); null dla
// wildcard/freehit/manager, gdzie nie ma dobrze zdefiniowanego "zysku z chipa" (to chipy transferowe)
export type ChipHistoryEntry = { code: string; label: string; name: string; event: number; bonus: number | null };

export type SquadPlayer = {
  element: number;
  name: string;
  team: string;
  teamBadgeUrl: string;
  position: string;
  photoUrl: string;
  points: number;      // surowe punkty zawodnika w tej kolejce
  total: number;        // to, co faktycznie wliczyło się do wyniku (po ×kapitan)
  isCaptain: boolean;
  isViceCaptain: boolean;
  isBench: boolean;
  subbedIn: boolean;   // wszedł automatyczną zamianą (bo ktoś z podstawowej 11 nie zagrał)
  subbedOut: boolean;  // wypadł automatyczną zamianą (nie zagrał, mimo że był w podstawowej 11)
  multiplier: number;
  ownershipPct: number; // zwykły % ownership w naszej lidze, BEZ mnożnika za kapitana/wicekapitana
};

export type SquadData = {
  gw: number;
  entryId: number;
  playerName: string;
  entryName: string;
  activeChip: ChipInfo | null;
  entryHistory: {
    points: number; totalPoints: number;
    eventTransfers: number; eventTransfersCost: number;
    bank: number; value: number; pointsOnBench: number;
  };
  squad: SquadPlayer[];
  leagueSize: number;
  hasProjection: boolean;              // czy symulacja przewiduje realną zamianę/opaskę
  projectedSquad: SquadPlayer[] | null; // skład po symulowanych autosubach; null gdy hasProjection=false
  projectedTotal: number | null;
};

export type Award = {
  entry: number; player_name: string; entry_name: string;
  points?: number; value?: number; chip?: ChipInfo | null; rankChange?: number;
  bonus?: number | null; // Chip Master: pkt zdobyte dzięki chipowi (BB/TC); null gdy nie da się policzyć (WC/FH)
  captainName?: string; captainPts?: number; templateCaptainName?: string; templateCaptainPts?: number; // Best Captain
} | null;

export type Awards = {
  gw: number;
  topGun: Award; toughWeek: Award; chipMaster: Award;
  noChipWarrior: Award; valueKing: Award; rankCrasher: Award; bestCaptain: Award;
};

export type ChipUsageRow = { code: string; label: string; name: string; count: number; pct: number };

export type TopOwnedRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  ownedCount: number; ownedPct: number; captainCount: number;
};

export type CaptaincyRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  points: number; captainCount: number; captainPct: number;
};

export type DifferentialRow = {
  element: number; name: string; team: string; teamBadgeUrl: string; position: string; photoUrl: string;
  points: number; ownedCount: number; ownedPct: number;
};

export type LeagueOverview = {
  gw: number; leagueSize: number;
  chipUsage: ChipUsageRow[]; topOwned: TopOwnedRow[]; captaincy: CaptaincyRow[]; differentials: DifferentialRow[];
};

export type SectionId = 'liga' | 'sezon' | 'cwiartki' | 'porownaj' | 'statystyki';
