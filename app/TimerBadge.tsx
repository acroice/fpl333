'use client';
import React from 'react';

/** Zwraca „teraz” jako Date odpowiadający czasowi ściennemu w Europe/Warsaw. */
function nowInWarsaw(): Date {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const s = fmt.format(new Date()); // "YYYY-MM-DD HH:mm:ss" w czasie PL
  const [d, t] = s.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m, sec] = t.split(':').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h, m, sec));
}

/** Parsuje "DD.MM.YYYY" (tak zwraca /api/quarters) do instant odpowiadającego 00:00 Warsaw tego dnia. */
function parseDMY_WarsawStart(dmy: string): Date {
  const [dd, mm, yyyy] = dmy.split('.').map(Number);
  // 00:00 czasu warszawskiego -> składamy UTC z komponentów Warsaw
  return new Date(Date.UTC(yyyy, (mm - 1), dd, 0, 0, 0));
}

function formatDiff(ms: number) {
  if (ms <= 0) return 'Start już teraz!';
  const SEC = 1000, MIN = 60 * SEC, H = 60 * MIN, D = 24 * H;
  const days = Math.floor(ms / D);
  const hours = Math.floor((ms % D) / H);
  const mins = Math.floor((ms % H) / MIN);

  if (days > 0) return `Start za ${days} dni ${hours} godz.`;
  if (hours > 0) return `Start za ${hours} godz. ${mins} min`;
  return `Start za ${Math.max(1, mins)} min`;
}

type Quarter = {
  id: string;
  from: string; // "DD.MM.YYYY"
  to: string;   // "DD.MM.YYYY"
};

export default function TimerBadge() {
  const [text, setText] = React.useState('loading…');

  React.useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        // pobierz ćwiartki
        const res = await fetch('/api/quarters', { cache: 'no-store' });
        const data = await res.json();

        const quarters: Quarter[] = data?.quarters ?? [];
        if (!quarters.length) {
          if (!cancelled) setText('—');
          return;
        }

        // oblicz najbliższy start ćwiartki > teraz (Warsaw)
        const nowW = nowInWarsaw();

        // utwórz listę targetów: { id, startDate }
        const targets = quarters.map(q => ({ id: q.id, start: parseDMY_WarsawStart(q.from) }));
        // wybierz pierwszy start > teraz; jeśli brak, sezon skończony
        const next = targets.find(t => t.start.getTime() > nowW.getTime());

        if (!next) {
          if (!cancelled) setText('Sezon zakończony 🎉');
          return;
        }

        const diff = next.start.getTime() - nowW.getTime();
        if (!cancelled) setText(`Start ${next.id}: ${formatDiff(diff)}`);
      } catch (e) {
        if (!cancelled) setText('—');
      }
    }

    // pierwszy strzał + interwał
    tick();
    const id = setInterval(tick, 30_000); // co 30 s odświeżenie
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return <div className="badge">{text}</div>;
}
