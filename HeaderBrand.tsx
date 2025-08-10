'use client';
import React from 'react';

export default function HeaderBrand() {
  const [alt, setAlt] = React.useState(false);

  return (
    <div className="brand" onClick={() => setAlt(a => !a)} style={{cursor:'pointer'}}>
      <img
        src="/fpl333.svg"
        alt="FPL333"
        width={28}
        height={28}
        style={{ borderRadius: 8, border: '1px solid #16313f' }}
      />
      <div>
        <div className="headline">{alt ? 'FPL 🐐 League' : 'FPL333'}</div>
        <div className="kicker">Ranking naszej ligii:</div>
      </div>
    </div>
  );
}
