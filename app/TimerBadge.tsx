'use client';
import React from 'react';

export default function TimerBadge() {
  const [text, setText] = React.useState('loading…');

  React.useEffect(() => {
    const start = new Date('2025-08-15T00:00:00Z');
    const update = () => {
      const now = new Date();
      const diff = start.getTime() - now.getTime();
      if (diff > 0) {
        const days = Math.ceil(diff / 86400000);
        setText(`Sezon startuje za ${days} dni`);
      } else if (now.toDateString() === start.toDateString()) {
        setText('Gameweek 1 kicks off today!');
      } else {
        setText('Gameweek 1 is live – let the chaos begin!');
      }
    };
    update();
    const id = setInterval(update, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return <div className="badge">{text}</div>;
}
