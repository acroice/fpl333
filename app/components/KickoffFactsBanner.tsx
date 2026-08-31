'use client';
import React from 'react';
import type { CaptainBreakdownRow, TemplateOwnership, ChipRoundUsage } from '../lib/types';

type Props = {
  gw: number;
  active: boolean; // z backendu: 10 min po pierwszym gwizdku tej GW, dopóki runda trwa
  captainBreakdown: CaptainBreakdownRow[];
  templateOwnership: TemplateOwnership;
  chipUsage: ChipRoundUsage[];
  leagueSize: number;
};

const dismissKey = (gw: number) => `fpl333_kickoff_dismissed_${gw}`;

// "🚀 GW wystartowała" — powiadomienie z ciekawostkami tuż po pierwszym gwizdku tej kolejki,
// zanim jeszcze znamy wyniki: rozkład kapitanów, najpopularniejszy pick w składach, użycie
// chipów w tej rundzie. Symetryczne do GwSummaryBanner (ten pokazuje się PO kolejce, ten PRZED/
// W TRAKCIE) — wzajemnie wykluczające się dzięki warunkom liczonym w backendzie.
export default function KickoffFactsBanner({ gw, active, captainBreakdown, templateOwnership, chipUsage, leagueSize }: Props) {
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

  const lines: { icon: string; text: React.ReactNode }[] = [];
  if (topCaptain) {
    const otherCaptainsLabel = otherCaptainsCount === 1 ? 'innego kapitana' : 'innych kapitanów';
    lines.push({
      icon: '🎯',
      text: (
        <>
          Kapitan tłumu: <strong>{topCaptain.name}</strong> — {topCaptain.count}/{leagueSize} ({topCaptain.pct}%)
          {otherCaptainsCount > 0 && <> · reszta rozjechana na {otherCaptainsCount} {otherCaptainsLabel}</>}
        </>
      ),
    });
  }
  if (templateOwnership) {
    lines.push({
      icon: '📌',
      text: <>Najczęściej wybierany w składach: <strong>{templateOwnership.name}</strong> — {templateOwnership.count}/{leagueSize} ({templateOwnership.pct}%)</>,
    });
  }
  lines.push({
    icon: '🃏',
    text: chipTotal > 0
      ? <>Chipy w tej rundzie: {chipUsage.map(c => `${c.count}×${c.label}`).join(' · ')}</>
      : <>Nikt jeszcze nie zagrał chipa w tej rundzie</>,
  });

  if (!lines.length) return null;

  return (
    <div className="gwsummary-banner gwsummary-banner--kickoff">
      <button className="gwsummary-close" onClick={dismiss} aria-label="Zamknij powiadomienie">✕</button>
      <div className="gwsummary-header">🚀 GW{gw} wystartowała</div>
      <div className="gwsummary-lines">
        {lines.map((l, i) => (
          <div key={i} className="gwsummary-line"><span aria-hidden="true">{l.icon}</span> {l.text}</div>
        ))}
      </div>
    </div>
  );
}
