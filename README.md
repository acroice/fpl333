# FPL333 — Private League Dashboard (Next.js 14)

Minimal, deploy‑ready project for a private FPL league dashboard:
- League table (via official FPL endpoints)
- Quarter segments Q1–Q6 with dates, status in Polish, and number of GWs
- Countdown badge to season start (15 Aug 2025)

## Quick Deploy (Vercel)

1) Create a new GitHub repo and upload all files from this folder.
2) Go to Vercel → `New Project` → Import your repo.
3) Framework: **Next.js**. No env vars required.
4) Build command: `npm install && npm run build` (defaults are fine).
5) Deploy. Your app will be live at `*.vercel.app`.

## Local dev

```bash
npm install
npm run dev
```

Visit http://localhost:3000

## Configure your league

By default, the league ID is set to `831753` in `app/page.tsx` (the fetch to `/api/league?leagueId=831753`).  
Change it or make it dynamic as you wish.

## Files overview

- `app/api/league/route.ts` — proxies FPL league standings (handles pagination).
- `app/api/quarters/route.ts` — returns Q1–Q6 ranges, dates, status (Polish).
- `app/page.tsx` — minimalist UI that shows the League Table + Quarter cards.
- `app/layout.tsx` — layout + top countdown.
- `app/globals.css` — basic dark theme styles.

## Notes

- This is a minimal MVP to avoid CORS issues (server routes fetch FPL directly).
- You can add /player endpoints, caching, and fancy UI later.
