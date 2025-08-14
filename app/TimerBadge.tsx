'use client';
import React from 'react';

/**
 * Pomocniczo: zwraca "teraz" jako Date odpowiadający
 * warszawskiemu czasowi ściennemu (Europe/Warsaw) – z użyciem Intl.
 * Konstruujemy UTC Date z części sformatowanych w tej strefie,
 * więc różnice czasu liczą się poprawnie (CET/CEST).
 */
function nowInWarsaw(): Date {
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
  const s = fmt.format(new Date());           // "YYYY-MM-DD HH:mm:ss" w strefie Warsaw
  const [d, t] = s.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m, sec] = t.split(':').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h, m, sec));
}

/**
 * Start sezonu FPL w CZASIE WARSZAWSKIM.
 * Jeśli chcesz konkretną godzinę kickoffu – podmień "00:00:00" na np. "20:00:00".
 * 15 sierpnia 2025 to CEST (UTC+02:00), więc dopisujemy offset.
 */
const SEASON_START_WARSAW = new Date('2025-08-15T00:00:00+02:00');

// Dla porównań "czy ten sam dzień" użyjemy prostego Y-M-D dla tej daty.
const START_Y = 2025, START_M = 8, START_D = 15;

export default function TimerBadge() {
  const [text, setText] = React.useState('loading…');

  React.useEffect(() => {
    const update = () => {
      const nowW = nowInWarsaw();

      // różnica do startu w milisekundach (obie wartości odniesione do UTC,
      // ale nowW reprezentuje "warszawskie teraz")
      const diff = SEASON_START_WARSAW.getTime() - nowW.getTime();

      // wyciągamy "dzień w Warszawie" dla teraz
      const fmtYMD = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Warsaw',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const [yStr, mStr, dStr] = fmtYMD.format(nowW).split('-');
      const y = Number(yStr), m = Number(mStr), d = Number(dStr);

      if (diff > 0) {
        // zaokrąglamy w górę do pełnych dni
        const days = Math.ceil(diff / 86400000);
        setText(`Sezon startuje za ${days} dni`);
      } else if (y === START_Y && m === START_M && d === START_D) {
        setText('Gameweek 1 startuje DZISIAJ!');
      } else {
        setText('Gameweek 1 jest live – jedziemy! ⚽');
      }
    };

    update();
    const id = setInterval(update, 60 * 60 * 1000); // odśwież co godzinę
    return () => clearInterval(id);
  }, []);

  return <div className="badge">{text}</div>;
}
