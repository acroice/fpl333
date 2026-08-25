'use client';
import React from 'react';
import type { SectionId } from '../lib/types';

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'liga', label: 'Liga', icon: '🏠' },
  { id: 'sezon', label: 'Sezon', icon: '📊' },
  { id: 'cwiartki', label: 'Ćwiartki', icon: '🏆' },
  { id: 'porownaj', label: 'Porównaj', icon: '⚔️' },
  { id: 'statystyki', label: 'Statystyki', icon: '🧠' },
];

// Główna nawigacja aplikacji: poziomy pasek pigułek na desktopie, fixed bottom nav na telefonie.
// Oba warianty renderują się zawsze — CSS (media query) decyduje, który jest widoczny, więc nie
// ma migotania przy zmianie szerokości okna i nie trzeba mierzyć viewportu w JS.
export default function Nav({ active, onChange }: { active: SectionId; onChange: (id: SectionId) => void }) {
  return (
    <>
      <nav className="mainnav" aria-label="Główna nawigacja">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`mainnav-item${active === s.id ? ' is-active' : ''}`}
            aria-current={active === s.id ? 'page' : undefined}
          >
            <span className="mainnav-icon" aria-hidden="true">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <nav className="bottomnav" aria-label="Główna nawigacja (mobile)">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`bottomnav-item${active === s.id ? ' is-active' : ''}`}
            aria-current={active === s.id ? 'page' : undefined}
          >
            <span className="bottomnav-icon" aria-hidden="true">{s.icon}</span>
            <span className="bottomnav-label">{s.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
