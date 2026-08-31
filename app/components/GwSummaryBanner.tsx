'use client';
import React from 'react';
import type { Awards, LeagueEntry } from '../lib/types';

type Props = {
  awards: Awards | null;
  league: LeagueEntry[];
};

// "📋 Podsumowanie GW" — powiadomienie z krótkim, fajnym podsumowaniem najświeższej kolejki,
// widoczne niezależnie od tego, w której zakładce jesteśmy (renderowane w page.tsx nad <Nav>).
//
// TYMCZASOWO na potrzeby podglądu: pokazuje się zawsze, gdy mamy dane awards, i znika tylko po
// kliknięciu ✕ (bez zapamiętywania między odświeżeniami). Docelowo ma się pojawiać automatycznie
// przez 24h od zakończenia ostatniego meczu kolejki (nie od oficjalnego, opóźnionego "finished"
// z FPL — patrz plan) i pamiętać odrzucenie w localStorage, żeby nie wracać po zamknięciu. To
// dograjemy po ustaleniu dokładnego triggera; na razie to podgląd samej treści/wyglądu.
export default function GwSummaryBanner({ awards, league }: Props) {
  const [dismissed, setDismissed] = React.useState(false);
  if (!awards || dismissed) return null;

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
      <button className="gwsummary-close" onClick={() => setDismissed(true)} aria-label="Zamknij powiadomienie">✕</button>
      <div className="gwsummary-header">📋 Podsumowanie GW{awards.gw}</div>
      <div className="gwsummary-lines">
        {lines.map((l, i) => (
          <div key={i} className="gwsummary-line"><span aria-hidden="true">{l.icon}</span> {l.text}</div>
        ))}
      </div>
    </div>
  );
}
