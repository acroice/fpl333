'use client';
import React from 'react';
import type { CaptainBreakdownRow, DifferentialCaptain, TransferActivityRow, ChipRoundUsage } from '../lib/types';
import { StatTileGrid, StatTile, chipIcon } from './shared';

type Props = {
  gw: number;
  active: boolean; // z backendu: 10 min po pierwszym gwizdku tej GW, dopóki runda trwa
  captainBreakdown: CaptainBreakdownRow[];
  differentialCaptain: DifferentialCaptain;
  mostTransfers: TransferActivityRow;
  chipUsage: ChipRoundUsage[];
  leagueSize: number;
};

const dismissKey = (gw: number) => `fpl333_kickoff_dismissed_${gw}`;

// "🚀 GW wystartowała" — powiadomienie z ciekawostkami tuż po pierwszym gwizdku tej kolejki,
// zanim jeszcze znamy wyniki: rozkład kapitanów (i kontrastowy "odważny wybór" — kto poszedł pod
// prąd z opaską), transfery zagrane przed deadline'em, użycie chipów w tej rundzie. Kafelki w tym
// samym języku co GW Pulse (StatTile/StatTileGrid, wspólne z GwSummaryBanner). Symetryczne do
// GwSummaryBanner (ten pokazuje się PO kolejce, ten PRZED/W TRAKCIE) — wzajemnie wykluczające się
// dzięki warunkom liczonym w backendzie.
// Uwaga: dawniej trzeci kafelek pokazywał "najpopularniejszy pick w składach" obok "Kapitana
// tłumu" — w praktyce niemal zawsze ten sam zawodnik (najpopularniejszy pick = z reguły też
// najpopularniejszy kapitan), więc dwa kafelki obok siebie powtarzały ten sam fakt. Zastąpiony
// "Odważnym wyborem" (differentialCaptain) dla realnego kontrastu.
export default function KickoffFactsBanner({ gw, active, captainBreakdown, differentialCaptain, mostTransfers, chipUsage, leagueSize }: Props) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!gw) return;
    try {
      setDismissed(localStorage.getItem(dismissKey(gw)) === '1');
    } catch {
      // prywatne okno / zablokowany storage — po prostu nie pamiętamy odrzucenia między wizytami
    }
  }, [gw]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(gw), '1');
    } catch {
      // patrz komentarz wyżej
    }
  }

  if (!active || dismissed || !gw) return null;

  const topCaptain = captainBreakdown[0];
  const otherCaptainsCount = Math.max(0, captainBreakdown.length - 1);
  const chipTotal = chipUsage.reduce((s, c) => s + c.count, 0);

  const tiles: React.ReactNode[] = [];
  if (topCaptain) {
    const caption = otherCaptainsCount > 0
      ? `${topCaptain.count}/${leagueSize} · +${otherCaptainsCount} inn${otherCaptainsCount === 1 ? 'y' : 'i'}`
      : `${topCaptain.count}/${leagueSize} (wszyscy)`;
    tiles.push(
      <StatTile key="captain" photoUrl={topCaptain.photoUrl} value={topCaptain.name} caption={caption} label="Kapitan tłumu" />
    );
  }
  if (differentialCaptain) {
    const managerCaption = differentialCaptain.managers.length === 1
      ? differentialCaptain.managers[0].player_name
      : `${differentialCaptain.managers.length} managerów`;
    tiles.push(
      <StatTile
        key="differential"
        photoUrl={differentialCaptain.photoUrl}
        value={differentialCaptain.name}
        caption={`${differentialCaptain.count}/${leagueSize} · ${managerCaption}`}
        label="Odważny wybór"
      />
    );
  }
  if (mostTransfers) {
    tiles.push(
      <StatTile
        key="transfers"
        icon="🔄"
        value={mostTransfers.transfers}
        caption={mostTransfers.player_name}
        label="Transfery tej kolejki"
      />
    );
  }
  tiles.push(
    <StatTile
      key="chips"
      icon="🃏"
      value={chipTotal > 0 ? chipTotal : '0'}
      caption={chipTotal > 0
        ? (
          <span className="kickoff-chip-row">
            {chipUsage.map(c => (
              <span key={c.code} className="kickoff-chip-badge" title={c.label}>
                <span className="kickoff-chip-icon">{chipIcon(c.code)}</span>{c.count}
              </span>
            ))}
          </span>
        )
        : 'nikt jeszcze'}
      label="Chipy w rundzie"
    />
  );

  if (!tiles.length) return null;

  return (
    <div className="gwsummary-banner gwsummary-banner--kickoff">
      <button className="gwsummary-close" onClick={dismiss} aria-label="Zamknij powiadomienie">✕</button>
      <div className="gwsummary-header">🚀 GW{gw} wystartowała</div>
      <StatTileGrid>{tiles}</StatTileGrid>
    </div>
  );
}
