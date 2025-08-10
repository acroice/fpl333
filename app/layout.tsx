import './globals.css';
import React from 'react';
import dynamic from 'next/dynamic';
import HeaderBrand from './HeaderBrand';

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
            <HeaderBrand />
            <TimerBadge />
          </header>
          {children}
          <footer>powered by DC United</footer>
        </div>
      </body>
    </html>
  );
}
