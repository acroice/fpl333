'use client';
import React from 'react';
import type { Awards, LeagueEntry } from '../lib/types';

type Props = {
  awards: Awards | null;
  league: LeagueEntry[];
  active: boolean; // z backendu: czy jesteśmy w 24h oknie od (estymowanego) końca ostatniej GW
};

const dismissKey = (gw: number) => `fpl333_gwsummary_dismissed_${gw}`;

// "📋 Podsumowanie GW" — powiadomienie z krótkim, fajnym podsumowaniem najświeższej kolejki,
// widoczne niezależnie od tego, w której zakładce jesteśmy (renderowane w page.tsx nad <Nav>).
// Aktywne przez 24h od (estymowanego) końca ostatniego meczu tej GW — `active` liczy backend
// (patrz gwSummaryActive w /api/quarter-wins). Odrzucenie (✕) zapamiętywane w localStorage per
// numer GW, więc nie wraca po zamknięciu, ale automatycznie "odblokuje się" samo dla następnej GW.
export default function GwSummaryBanner({ awards, league, active }: Props) {
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

  const lines: { icon: string; text: React.ReactNode }[] = [];
  if (awards.topGun) {
    lines.push({ icon: '🔥', text: <><strong>{awards.topGun.player_name}</strong> najlepszy w tej GW — {awards.topGun.points} pkt</> });
  }
  if (leader) {
    lines.push({ icon: '👑', text: <>Prowadzi <strong>{leader.player_name}</strong> — {leader.total} pkt</> });
  }
  if (awards.chipMaster) {
    const bonusText = awards.chipMaster.bonus != null
      ? `+${awards.chipMaster.bonus} z ${awards.chipMaster.chip?.label}`
      : `${awards.chipMaster.points} pkt`;
    lines.push({ icon: '🏅', text: <><strong>{awards.chipMaster.player_name}</strong> zgarnął {bonusText} chipem</> });
  }
  if (awards.bestCaptain) {
    lines.push({
      icon: '🧠',
      text: <><strong>{awards.bestCaptain.player_name}</strong> trafił z kapitanem: {awards.bestCaptain.captainName} ({awards.bestCaptain.captainPts} pkt)</>,
    });
  }
  if (awards.toughWeek) {
    lines.push({ icon: '💀', text: <>Najgorszy tydzień: <strong>{awards.toughWeek.player_name}</strong> — {awards.toughWeek.points} pkt</> });
  }

  if (!lines.length) return null;

  return (
    <div className="gwsummary-banner">
      <button className="gwsummary-close" onClick={dismiss} aria-label="Zamknij powiadomienie">✕</button>
      <div className="gwsummary-header">📋 Podsumowanie GW{awards.gw}</div>
      <div className="gwsummary-lines">
        {lines.map((l, i) => (
          <div key={i} className="gwsummary-line"><span aria-hidden="true">{l.icon}</span> {l.text}</div>
        ))}
      </div>
    </div>
  );
}
