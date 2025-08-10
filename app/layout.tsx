import './globals.css';
import React from 'react';
import TimerBadge from './TimerBadge';

export const metadata = {
  title: 'FPL333',
  description: 'Private League Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header>
            <div className="brand">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#0f2029',
                  border: '1px solid #16313f',
                }}
              />
              <div>
                <div className="headline">FPL333</div>
                <div className="kicker">Private League Dashboard</div>
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
