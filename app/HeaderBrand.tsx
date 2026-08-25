'use client';
import React from 'react';

export default function HeaderBrand() {
  return (
    <div
      className="brand"
      onClick={() => window.location.reload()}
      title="Odśwież stronę"
      style={{cursor:'pointer'}}
    >
      <img
        src="/fpl333.svg"
        alt="FPL"
        width={28}
        height={28}
        style={{ borderRadius: 8, border: '1px solid #16313f' }}
      />
      <div>
        <div className="headline">FPL</div>
      </div>
    </div>
  );
}
