'use client';
import React from 'react';
import type { Awards, LeagueEntry, CaptainInfo, TopCaptainPick } from '../lib/types';
import { PlayerAvatar, awardNames, namesOrInitials, extremeTied } from './shared';

type Props = {
  open: boolean;
  onClose: () => void;
  onViewAllAwards: () => void;
  awards: Awards | null;
  league: LeagueEntry[];
  captainInfo: Record<number, CaptainInfo>;
  topCaptainPick: TopCaptainPick;
};

// znajdź największy awans w lidze (last_rank - rank), ze wszystkimi remisującymi — reużywa
// extremeTied ze shared.tsx (ta sama funkcja co Best/Worst GW/Biggest Rise w LeagueSection),
// zamiast osobnej, ręcznie pisanej kopii tej samej logiki
function biggestClimber(league: LeagueEntry[]) {
  const risers = league.filter(e => e.last_rank > 0 && e.last_rank > e.rank);
  const { value: delta, entries } = extremeTied(risers, e => e.last_rank - e.rank, 'max');
  return entries.length ? { entries, delta } : null;
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
  // metryk typu "transfer impact", których nie da się wiarygodnie policzyć z obecnego API).
  // Sześć slotów (2×3) jest wizualnie symetryczne — te pierwsze 6 to podstawowy, "najciekawszy"
  // zestaw; gdy któregoś tygodnia zabraknie danych na któryś z nich (np. nikt nie pobił template
  // captaina), dopełniamy niżej z puli zapasowej w kolejności ważności, żeby siatka nie robiła się
  // krzywa. `sub` wszędzie przez awardNames/namesOrInitials — przy remisie (kilku managerów z tą
  // samą wartością) wymienia WSZYSTKICH, nie jednego arbitralnie wybranego.
  type Card = { key: string; icon?: string; photoUrl?: string; accent: 'good' | 'bad' | 'special' | 'neutral'; label: string; title: React.ReactNode; sub: React.ReactNode };
  const cards: Card[] = [];

  if (climber) {
    cards.push({
      key: 'climber', icon: '📈', accent: 'good', label: 'Największy awans',
      title: `+${climber.delta} miejsc`, sub: namesOrInitials(climber.entries.map(e => e.player_name)),
    });
  }
  if (awards.toughWeek) {
    cards.push({
      key: 'tough', icon: '💀', accent: 'bad', label: 'Najgorszy tydzień',
      title: `${awards.toughWeek.points} pkt`, sub: awardNames(awards.toughWeek),
    });
  }
  if (awards.benchTears) {
    cards.push({
      key: 'bench', icon: '🪑', accent: 'bad', label: 'Łzy na ławce',
      title: `${awards.benchTears.benchPoints} pkt`, sub: awardNames(awards.benchTears),
    });
  }
  if (topCaptainPick) {
    const capSub = namesOrInitials(topCaptainPick.managers.map(m => m.player_name));
    cards.push({
      key: 'topcap', photoUrl: topCaptainPick.photoUrl, accent: 'special', label: 'Kapitan Kolejki',
      title: topCaptainPick.name, sub: `${topCaptainPick.points} pkt · ${capSub}`,
    });
  }
  if (awards.chipMaster) {
    const bonusText = awards.chipMaster.bonus != null ? `+${awards.chipMaster.bonus} z chipa` : `${awards.chipMaster.points} pkt`;
    cards.push({
      key: 'chip', icon: '🏅', accent: 'special', label: `Mistrz Chipa · ${awards.chipMaster.chip?.label}`,
      title: bonusText, sub: awardNames(awards.chipMaster),
    });
  }
  if (awards.bestCaptain) {
    cards.push({
      key: 'bestcap', icon: '🧠', accent: 'good', label: 'Odważny Kapitan',
      title: `${awards.bestCaptain.captainName} ${awards.bestCaptain.captainPts}`, sub: awardNames(awards.bestCaptain),
    });
  }

  // Pula zapasowa — dopełnia do 6 kart, gdy powyższy podstawowy zestaw nie ma kompletu (np. nikt
  // nie pobił template captaina tej kolejki), w kolejności "co najbardziej pasuje" jako kolejny
  // najciekawszy fakt. Nie duplikuje żadnego typu z podstawowego zestawu wyżej.
  if (cards.length < 6 && awards.noChipWarrior) {
    cards.push({
      key: 'nochip', icon: '🛡️', accent: 'neutral', label: 'No-Chip Warrior',
      title: `${awards.noChipWarrior.points} pkt`, sub: awardNames(awards.noChipWarrior),
    });
  }
  if (cards.length < 6 && awards.valueKing) {
    cards.push({
      key: 'value', icon: '💰', accent: 'special', label: 'Value King',
      title: `£${((awards.valueKing.value ?? 0) / 10).toFixed(1)}m`, sub: awardNames(awards.valueKing),
    });
  }
  if (cards.length < 6 && awards.rankRiser) {
    cards.push({
      key: 'rankriser', icon: '🚀', accent: 'good', label: 'Rank Riser',
      title: `+${Math.abs(awards.rankRiser.rankChange ?? 0).toLocaleString('pl')}`, sub: awardNames(awards.rankRiser),
    });
  }
  if (cards.length < 6 && awards.rankCrasher) {
    cards.push({
      key: 'rankcrasher', icon: '🔻', accent: 'bad', label: 'Rank Crasher',
      title: `-${awards.rankCrasher.rankChange?.toLocaleString('pl')}`, sub: awardNames(awards.rankCrasher),
    });
  }
  if (cards.length < 6 && awards.transferTangle) {
    cards.push({
      key: 'tangle', icon: '🔀', accent: 'bad', label: 'Transfer Tangle',
      title: `-${awards.transferTangle.value}`, sub: awardNames(awards.transferTangle),
    });
  }

  return (
    <div className="wrapped-overlay" onClick={onClose}>
      <div className="wrapped-sheet" onClick={e => e.stopPropagation()}>
        <button className="wrapped-close" onClick={onClose} aria-label="Zamknij">✕</button>

        <div className="wrapped-header">
          <div className="wrapped-title">🏁 GW{gw} WRAPPED</div>
          <div className="wrapped-subtitle">Kolejna kolejka za nami.</div>
        </div>

        {mvp && (
          <div className="wrapped-hero">
            {mvpCaptain?.photoUrl ? (
              <PlayerAvatar src={mvpCaptain.photoUrl} alt={mvpCaptain.name} />
            ) : (
              <span className="wrapped-hero-icon" aria-hidden="true">👑</span>
            )}
            <div className="wrapped-hero-label">MVP Kolejki</div>
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
          <div className="wrapped-signoff">To już wszystko z GW{gw}. 👏<br />Do zobaczenia w GW{gw + 1}.</div>
          <div className="wrapped-actions">
            <button className="wrapped-btn wrapped-btn--primary" onClick={onViewAllAwards}>Zobacz wszystkie nagrody</button>
            <button className="wrapped-btn" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </div>
    </div>
  );
}
