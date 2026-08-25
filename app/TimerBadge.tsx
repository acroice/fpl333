'use client';
import React from 'react';

function formatDiff(ms: number) {
  if (ms <= 0) return 'już teraz!';
  const SEC = 1000, MIN = 60 * SEC, H = 60 * MIN, D = 24 * H;
  const days = Math.floor(ms / D);
  const hours = Math.floor((ms % D) / H);
  const mins = Math.floor((ms % H) / MIN);

  if (days > 0) return `za ${days} dni ${hours} godz.`;
  if (hours > 0) return `za ${hours} godz. ${mins} min`;
  return `za ${Math.max(1, mins)} min`;
}

type NextGwDeadline = { gw: number; deadline: string } | null;

// Odliczanie do deadline'u transferów najbliższej kolejki — bardziej użyteczne na co dzień niż
// odliczanie do startu ćwiartki (te są rzadkie, deadline jest co tydzień). deadline_time z FPL to
// dokładny znacznik czasu (UTC), więc licząc różnicę względem Date.now() nie trzeba kombinować
// ze strefami czasowymi jak przy datach dziennych ("DD.MM.YYYY") ćwiartek.
export default function TimerBadge() {
  const [text, setText] = React.useState('loading…');

  React.useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch('/api/quarters', { cache: 'no-store' });
        const data = await res.json();
        const next: NextGwDeadline = data?.nextGwDeadline ?? null;

        if (!next) {
          if (!cancelled) setText('Sezon zakończony 🎉');
          return;
        }

        const diff = new Date(next.deadline).getTime() - Date.now();
        if (!cancelled) setText(`Deadline GW${next.gw}: ${formatDiff(diff)}`);
      } catch (e) {
        if (!cancelled) setText('—');
      }
    }

    // pierwszy strzał + interwał
    tick();
    const id = setInterval(tick, 30_000); // co 30 s odświeżenie
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return <div className="badge" title="Deadline transferów najbliższej kolejki">{text}</div>;
}
