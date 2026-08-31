'use client';
import React from 'react';
import type { Awards, LeagueEntry, TopCaptainPick } from '../lib/types';
import { StatTileGrid, StatTile } from './shared';

type Props = {
  awards: Awards | null;
  league: LeagueEntry[];
  topCaptainPick: TopCaptainPick;
  active: boolean; // z backendu: czy jesteśmy w 24h oknie od (estymowanego) końca ostatniej GW
};

const dismissKey = (gw: number) => `fpl333_gwsummary_dismissed_${gw}`;

// "📋 Podsumowanie GW" — powiadomienie z krótkim, fajnym podsumowaniem najświeższej kolejki,
// widoczne niezależnie od tego, w której zakładce jesteśmy (renderowane w page.tsx nad <Nav>).
// Kafelki w tym samym języku wizualnym co "GW Pulse" w Lidze (StatTile/StatTileGrid — wspólne z
// nią komponenty), żeby to wyglądało jak część tej samej rodziny, nie osobny, luźny styl.
// Aktywne przez 24h od (estymowanego) końca ostatniego meczu tej GW — `active` liczy backend
// (patrz gwSummaryActive w /api/quarter-wins). Odrzucenie (✕) zapamiętywane w localStorage per
// numer GW, więc nie wraca po zamknięciu, ale automatycznie "odblokuje się" samo dla następnej GW.
export default function GwSummaryBanner({ awards, league, topCaptainPick, active }: Props) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!awards) return;
    try {
      setDismissed(localStorage.getItem(dismissKey(awards.gw)) === '1');
    } catch {
      // prywatne okno / zablokowany storage — po prostu nie pamiętamy odrzucenia między wizytami
    }
  }, [awards?.gw]);

  function dismiss() {
    setDismissed(true);
    if (!awards) return;
    try {
      localStorage.setItem(dismissKey(awards.gw), '1');
    } catch {
      // patrz komentarz wyżej — jeśli się nie uda zapisać, banner po prostu wróci po odświeżeniu
    }
  }

  if (!active || !awards || dismissed) return null;

  const leader = [...league].sort((a, b) => a.rank - b.rank)[0] ?? null;
  const benchTears = awards.benchTears ?? null; // fallback na toughWeek niżej, gdy nikt nic nie zostawił na ławce

  const tiles: React.ReactNode[] = [];
  if (awards.topGun) {
    tiles.push(
      <StatTile key="topgun" icon="🔥" value={`${awards.topGun.points} pkt`} caption={awards.topGun.player_name} label="Best GW" />
    );
  }
  if (leader) {
    tiles.push(
      <StatTile key="leader" icon="👑" value={`${leader.total} pkt`} caption={leader.player_name} label="Lider ligi" />
    );
  }
  if (topCaptainPick) {
    const managerCaption = topCaptainPick.managers.length === 1
      ? topCaptainPick.managers[0].player_name
      : `${topCaptainPick.managers.length} managerów`;
    tiles.push(
      <StatTile
        key="topcaptain"
        photoUrl={topCaptainPick.photoUrl}
        value={topCaptainPick.name}
        caption={`${topCaptainPick.points} pkt · ${managerCaption}`}
        label="Top Captain"
      />
    );
  }
  if (benchTears) {
    tiles.push(
      <StatTile key="bench" icon="🪑" value={`${benchTears.benchPoints} pkt`} caption={benchTears.player_name} label="Bench Tears" />
    );
  } else if (awards.toughWeek) {
    tiles.push(
      <StatTile key="tough" icon="💀" value={`${awards.toughWeek.points} pkt`} caption={awards.toughWeek.player_name} label="Najgorszy tydzień" />
    );
  }

  if (!tiles.length) return null;

  return (
    <div className="gwsummary-banner">
      <button className="gwsummary-close" onClick={dismiss} aria-label="Zamknij powiadomienie">✕</button>
      <div className="gwsummary-header">📋 Podsumowanie GW{awards.gw}</div>
      <StatTileGrid>{tiles}</StatTileGrid>
    </div>
  );
}
