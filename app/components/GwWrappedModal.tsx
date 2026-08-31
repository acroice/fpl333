'use client';
import React from 'react';
import type { Awards, LeagueEntry, CaptainInfo, TopCaptainPick } from '../lib/types';
import { PlayerAvatar } from './shared';

type Props = {
  open: boolean;
  onClose: () => void;
  onViewAllAwards: () => void;
  awards: Awards | null;
  league: LeagueEntry[];
  captainInfo: Record<number, CaptainInfo>;
  topCaptainPick: TopCaptainPick;
};

// znajdź wszystkie wpisy remisujące o max awans (last_rank - rank) — jak extremeTied w
// LeagueSection, tylko lokalna kopia (tamta nie jest eksportowana, a to jedyne miejsce tu
// potrzebne) — nie chcemy arbitralnie wybierać jednej osoby przy remisie
function biggestClimber(league: LeagueEntry[]) {
  const risers = league
    .filter(e => e.last_rank > 0 && e.last_rank > e.rank)
    .map(e => ({ e, delta: e.last_rank - e.rank }));
  if (!risers.length) return null;
  const maxDelta = Math.max(...risers.map(r => r.delta));
  const tied = risers.filter(r => r.delta === maxDelta).map(r => r.e);
  return { entries: tied, delta: maxDelta };
}

// "🏁 GW Wrapped" — dodatkowy, świąteczny ekran zamykający kolejkę, obok (nie zamiast) GW Pulse
// i GW Awards w Lidze. Ta sama treść co tam (awards, league) — jedno źródło danych, inne
// opakowanie: kilka najciekawszych faktów zamiast pełnej listy, większy hero na MVP, i
// jednorazowe auto-pokazanie się (logika w page.tsx) zamiast stałej obecności w tabeli.
export default function GwWrappedModal({
  open, onClose, onViewAllAwards, awards, league, captainInfo, topCaptainPick,
}: Props) {
  if (!open || !awards) return null;

  const gw = awards.gw;
  const climber = biggestClimber(league);
  const mvp = awards.topGun; // "główny bohater kolejki" — najwyższy wynik GW, tak jak sugerowane
  const mvpCaptain = mvp ? captainInfo[mvp.entry] : null;

  // karty drugorzędne — tylko te, dla których mamy realne, policzone dane (żadnych zmyślonych
  // metryk typu "transfer impact", których nie da się wiarygodnie policzyć z obecnego API)
  type Card = { key: string; icon?: string; photoUrl?: string; accent: 'good' | 'bad' | 'special' | 'neutral'; label: string; title: React.ReactNode; sub: React.ReactNode };
  const cards: Card[] = [];

  if (climber) {
    const names = climber.entries.map(e => e.player_name).join(' · ');
    cards.push({
      key: 'climber', icon: '📈', accent: 'good', label: 'Biggest Climber',
      title: `+${climber.delta} miejsc`, sub: names,
    });
  }
  if (awards.toughWeek) {
    cards.push({
      key: 'tough', icon: '💀', accent: 'bad', label: 'Tough Week',
      title: `${awards.toughWeek.points} pkt`, sub: awards.toughWeek.player_name,
    });
  }
  if (awards.benchTears) {
    cards.push({
      key: 'bench', icon: '🪑', accent: 'bad', label: 'Bench Disaster',
      title: `${awards.benchTears.benchPoints} pkt`, sub: awards.benchTears.player_name,
    });
  }
  if (topCaptainPick) {
    const capSub = topCaptainPick.managers.length === 1
      ? topCaptainPick.managers[0].player_name
      : `${topCaptainPick.managers.length} managerów`;
    cards.push({
      key: 'topcap', photoUrl: topCaptainPick.photoUrl, accent: 'special', label: 'Top Captain',
      title: topCaptainPick.name, sub: `${topCaptainPick.points} pkt · ${capSub}`,
    });
  }
  if (awards.chipMaster) {
    const bonusText = awards.chipMaster.bonus != null ? `+${awards.chipMaster.bonus} z chipa` : `${awards.chipMaster.points} pkt`;
    cards.push({
      key: 'chip', icon: '🏅', accent: 'special', label: `Chip Master · ${awards.chipMaster.chip?.label}`,
      title: bonusText, sub: awards.chipMaster.player_name,
    });
  }
  if (awards.bestCaptain) {
    cards.push({
      key: 'bestcap', icon: '🧠', accent: 'good', label: 'Best Captain',
      title: `${awards.bestCaptain.captainName} ${awards.bestCaptain.captainPts}`, sub: awards.bestCaptain.player_name,
    });
  }

  return (
    <div className="wrapped-overlay" onClick={onClose}>
      <div className="wrapped-sheet" onClick={e => e.stopPropagation()}>
        <button className="wrapped-close" onClick={onClose} aria-label="Zamknij">✕</button>

        <div className="wrapped-header">
          <div className="wrapped-title">🏁 GW{gw} WRAPPED</div>
          <div className="wrapped-subtitle">Another Gameweek in the books.</div>
        </div>

        {mvp && (
          <div className="wrapped-hero">
            {mvpCaptain?.photoUrl ? (
              <PlayerAvatar src={mvpCaptain.photoUrl} alt={mvpCaptain.name} />
            ) : (
              <span className="wrapped-hero-icon" aria-hidden="true">👑</span>
            )}
            <div className="wrapped-hero-label">Gameweek MVP</div>
            <div className="wrapped-hero-name">{mvp.player_name}</div>
            <div className="wrapped-hero-sub">{mvp.entry_name} · <strong>{mvp.points} pkt</strong></div>
          </div>
        )}

        {cards.length > 0 && (
          <div className="wrapped-grid">
            {cards.map(c => (
              <div key={c.key} className={`wrapped-card wrapped-card--${c.accent}`}>
                {c.photoUrl ? <PlayerAvatar src={c.photoUrl} alt={c.label} /> : c.icon && <span className="wrapped-card-icon">{c.icon}</span>}
                <div className="wrapped-card-title">{c.title}</div>
                <div className="wrapped-card-sub">{c.sub}</div>
                <div className="wrapped-card-label">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="wrapped-footer">
          <div className="wrapped-signoff">That's a wrap on GW{gw}. 👏<br />See you in GW{gw + 1}.</div>
          <div className="wrapped-actions">
            <button className="wrapped-btn wrapped-btn--primary" onClick={onViewAllAwards}>Zobacz wszystkie nagrody</button>
            <button className="wrapped-btn" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </div>
    </div>
  );
}
