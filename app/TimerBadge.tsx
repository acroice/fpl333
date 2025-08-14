'use client';
import React from 'react';

/** Dzisiejsza data w strefie Europe/Warsaw jako {Y,M,D,H,m,s} */
function nowPartsWarsaw() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const s = fmt.format(new Date()); // "YYYY-MM-DD HH:mm:ss" w czasie PL
  const [d, t] = s.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m, sec] = t.split(':').map(Number);
  return { Y, M, D, h, m, sec };
}

/** Z części w czasie PL budujemy instant (UTC) odpowiadający tej „ściennej” godzinie w Warszawie */
function warsawDate(Y: number, M: number, D: number, h = 0, m = 0, s = 0) {
  // UWAGA: tworzymy Date z komponentów w PL jako UTC — to daje właściwy „instant”
  return new Date(Date.UTC(Y, M - 1, D, h, m, s));
}

function formatCountdown(diffMs: number) {
  if (diffMs <= 0) return 'Deadline trwa!';

  const HOUR = 3600_000;
  const MIN = 60_000;

  if (diffMs >= HOUR) {
    const hours = Math.ceil(diffMs / HOUR);
    return `Deadline za ${hours} godz.`;
  } else {
    const mins = Math.max(1, Math.ceil(diffMs / MIN));
    return `Deadline za ${mins} min`;
  }
}

export default function TimerBadge() {
  const [text, setText] = React.useState('loading…');

  React.useEffect(() => {
    const update = () => {
      const { Y, M, D, h, m, sec } = nowPartsWarsaw();
      const nowW = warsawDate(Y, M, D, h, m, sec);

      // Target = najbliższe 19:00 czasu Warszawskiego
      let target = warsawDate(Y, M, D, 19, 0, 0);
      if (nowW.getTime() >= target.getTime()) {
        // już po 19:00 → bierzemy JUTRO 19:00
        const tomorrow = warsawDate(Y, M, D, 0, 0, 0);
        const t = new Date(tomorrow.getTime() + 24 * 3600_000);
        target = warsawDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 19, 0, 0);
      }

      const diff = target.getTime() - nowW.getTime();
      setText(formatCountdown(diff));
    };

    update();
    // odświeżamy co 30 sekund, a przy <1h i tak liczymy minuty
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return <div className="badge">{text}</div>;
}
