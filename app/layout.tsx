import './globals.css';
import React from 'react';
import dynamic from 'next/dynamic';

const TimerBadge = dynamic(() => import('./TimerBadge'), { ssr: false });

export const metadata = {
  title: 'FPL333',
  description: 'Private League Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/fpl333.svg" type="image/svg+xml" />
      </head>
      <body>
        <div className="container">
          <header>
            <div className="brand">
              <img
                src="/fpl333.svg"
                alt="FPL333"
                width={28}
                height={28}
                style={{ borderRadius: 8, border: '1px solid #16313f' }}
              />
              <div>
                <div className="headline">FPL333</div>
                <div className="kicker">Ranking naszej ligii:</div>
              </div>
            </div>
            <TimerBadge />
          </header>
          {children}
          <footer>powered by DC United</footer>
        </div>
      </body>
    </html>
  );
}
