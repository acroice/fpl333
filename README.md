# FPL333 — Private League Dashboard + ML Data Pipeline

Dwie części w jednym repo:

1. **`app/`** — Next.js 14 dashboard prywatnej ligi Fantasy Premier League: tabela ligi, ćwiartki
   sezonu, statystyki, historia sezonu, porównania managerów. Deployowany na Vercelu.
2. **`pipeline/`** — Python, dane FPL → Google BigQuery. Część większego projektu portfolio na
   ścieżce Data Scientist → ML Engineer → MLOps (Google Cloud), opisanego w `ROADMAP.md` — bieżący
   stan i decyzje projektowe krok po kroku są w `PROGRESS.md`.

## `app/` — dashboard

Zakładki:
- **Liga** — tabela rankingowa na żywo (live punkty, live ranking ogólny FPL), rozwijany skład
  każdego managera per kolejka (z podziałem na podstawę/ławkę, kto kogo ma), GW Pulse/GW Awards/GW
  Wrapped.
- **Ćwiartki** — sezon podzielony na 4 ćwiartki (Q1–Q4), zwycięzcy zakończonych, ranking bieżącej.
- **Statystyki** — Captaincy, Chip Tracker, Ownership (z rozwijanym "kto go ma"), Chips (historia
  sezonu + realny zysk z chipa), Bench, Stabilność, Transfers.
- **Sezon** — wykres rankingu/punktów w czasie, rekordy sezonu.
- **Porównaj** — bilans, head-to-head, różnicowi zawodnicy między dwoma managerami.

### Quick Deploy (Vercel)

1. Utwórz repo na GitHubie i wypchnij zawartość tego folderu.
2. Vercel → `New Project` → Import repo.
3. Framework: **Next.js**. Zmienne środowiskowe niepotrzebne.
4. Build command: `npm install && npm run build` (domyślne wystarczą).
5. Deploy — appka będzie żywa pod `*.vercel.app`.

### Local dev

```bash
npm install
npm run dev
```

Otwórz http://localhost:3000

### Konfiguracja ligi

Domyślny ID ligi to `1078207` ("Fantasy ekstazy"), ustawiony w `app/page.tsx` (fetch do
`/api/league?leagueId=1078207`). Zmień wg potrzeby.

### Struktura `app/`

- `app/api/league/route.ts` — tabela ligi (klasyczne standingi FPL, z paginacją).
- `app/api/league-overview/route.ts` — Ownership/Captaincy/chipUsage dla danej kolejki.
- `app/api/quarter-wins/route.ts` — ćwiartki, live punkty, awards, historia GW-po-GW, chipy.
- `app/api/quarters/route.ts` — zakresy dat Q1–Q4, status.
- `app/api/squad/route.ts` — rozwijany skład managera w danej kolejce.
- `app/api/_lib/fpl.ts` — współdzielone funkcje odpytujące FPL API (cache, symulacja autosubów itd).
- `app/sections/` — treść poszczególnych zakładek (Liga/Ćwiartki/Statystyki/Sezon/Porównaj).
- `app/components/` — reużywalne komponenty (banery GW, wykres sezonu, nawigacja, shared.tsx).

## `pipeline/` — dane pod ML (Google Cloud)

Codzienny, w pełni zautomatyzowany ingest danych FPL do BigQuery (Cloud Functions + Cloud
Scheduler, $0/miesiąc — mieści się w darmowym tierze GCP):

- **RAW** (`fpl_raw`) — `league_standings_snapshot`, `raw_players`, `raw_gameweeks`,
  `raw_fixtures` (snapshoty codzienne) + `raw_player_gameweek_live` (wyniki per zawodnik per
  kolejka, ingest przyrostowy, tylko rozliczone kolejki).
- **STAGING** (`fpl_staging`) — widoki czyszczące/deduplikujące RAW.
- **FEATURES** (`fpl_features`) — `player_gameweek_features`: pierwsza tabela cech pod model
  przewidujący punkty zawodnika w kolejnej kolejce (minuty/xG/xA/forma/cena/przeciwnik), z
  jawnie wyeliminowanym data leakage (cechy liczone tylko z danych sprzed danej kolejki).

Pełny opis skryptów i decyzji projektowych (dlaczego snapshot a nie stan bieżący, dlaczego widoki
a nie tabele w STAGING, jak uniknięto data leakage w cenie/formie) — patrz `pipeline/README.md`.
Historia sesja-po-sesji z uzasadnieniami — `PROGRESS.md`. Docelowa mapa faz (Phase 1–10, aż po
model ML, symulacje Monte Carlo i warstwę LLM) — `ROADMAP.md`.

**Stan na dziś:** Phase 1 (ingest ligi) i Phase 2 (RAW → STAGING → FEATURES) ukończone i
zautomatyzowane. Phase 3 (pierwszy model ML) jeszcze nie rozpoczęta.
