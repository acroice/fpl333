import './globals.css';
import React from 'react';

export const metadata = {
  title: 'FPL333',
  description: 'Private League Dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header>
            <div className="brand">
              <div style={{width:28,height:28, borderRadius:8, background:'#0f2029', border:'1px solid #16313f'}} />
              <div>
                <div className="headline">FPL333</div>
                <div className="kicker">Private League Dashboard</div>
              </div>
            </div>
            <div id="season-timer" className="badge">loading…</div>
          </header>
          {children}
          <footer>powered by DC United</footer>
        </div>
        <script dangerouslySetInnerHTML={{__html:`
          (function(){
            const start = new Date('2025-08-15T00:00:00Z'); // season start UTC
            const el = document.getElementById('season-timer');
            function update(){
              const now = new Date();
              const diff = start.getTime() - now.getTime();
              if(diff > 0){
                const days = Math.ceil(diff / (1000*60*60*24));
                el.textContent = 'Sezon startuje za ' + days + ' dni';
              } else if (now.toDateString() === start.toDateString()) {
                el.textContent = 'Gameweek 1 kicks off today!';
              } else {
                el.textContent = 'Gameweek 1 is live – let the chaos begin!';
              }
            }
            update();
            setInterval(update, 60*60*1000);
          })();
        `}} />
      </body>
    </html>
  )
}
