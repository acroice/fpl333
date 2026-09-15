# pipeline/

Python — celowo osobny od `app/` (Next.js/TypeScript). Zgodnie z ROADMAP.md (Phase 1),
data engineering i ML po stronie GCP robimy w Pythonie; `app/` zostaje frontendem/API
dla samego dashboardu.

## Setup (jednorazowo)

```bash
cd pipeline
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# logowanie dla bibliotek klienckich (INNE od `gcloud auth login` uzywanego przez CLI)
gcloud auth application-default login
```

## Skrypty

- **`features.py`** — STAGING (widoki, dataset `fpl_staging`: `stg_player_team`,
  `stg_players_daily`, `stg_fixtures`, `stg_gameweeks` — deduplikacja dziennych snapshotów RAW do
  jednego wiersza na encję/dzień) + FEATURES (`run_build_staging_and_features()`, materializowana
  tabela `fpl_features.player_gameweek_features`, pełny rebuild przez `WRITE_TRUNCATE` za każdym
  razem — dane są małe, więc to tańsze i prostsze niż logika przyrostowa). Jeden wiersz =
  (zawodnik, kolejka): `target_points`/`target_minutes` (to, co model ma przewidzieć),
  `prev_gw_points`/`prev_gw_minutes`, `avg_points_last3`/`avg_minutes_last3`/`avg_xgi_last3`,
  `cum_points_before_gw` (wszystko liczone WYŁĄCZNIE z kolejek wcześniejszych niż `gw` — zero
  przecieku), `was_home`/`opponent_team`/`opponent_difficulty` (z `raw_fixtures`, perspektywa
  rozwiązana per zawodnik), `price`/`form` (z `raw_players`, tylko jeśli mamy snapshot SPRZED
  deadline'u tej kolejki — dla GW1-3 celowo `NULL`, patrz decyzja o data leakage w PROGRESS.md
  sesja 4). Uproszczenie: przy double gameweeku (na razie się nie zdarzył) bierze tylko pierwszy
  mecz danej kolejki, nie sumuje obu.

- **`build_features.py`** — cienki CLI wrapper na `run_build_staging_and_features()`:

  ```bash
  python build_features.py
  ```

  Zweryfikowane ręcznie (2026-09-15): 2549 wierszy (610+626+654+659, dokładnie tyle co
  `raw_player_gameweek_live`), zero duplikatów `(element, gw)`. Haaland sprawdzony ręcznie GW-po-GW
  (`prev_gw_points`/`avg_points_last3`/`cum_points_before_gw` zgadzają się z ręcznym przeliczeniem).
  `price`/`form` poprawnie `NULL` dla 100% wierszy GW1-3, obecne dla GW4 poza 4 zawodnikami
  dodanymi do gry już po jej deadline (oczekiwane, nie błąd).

- **`snapshot.py`** — właściwa logika ingestu (`run_ingest()`): pobiera aktualny stan
  tabeli ligi FPL (jeden snapshot, nie pełna historia) i dopisuje go do BigQuery
  (`fpl_raw.league_standings_snapshot`, partycjonowana dziennie). Dataset i tabela
  tworzą się same przy pierwszym uruchomieniu. Świadomie mały zakres danych (rzędu
  liczby managerów w lidze na jedno uruchomienie) i zapis przez load job (darmowy w
  BigQuery), nie streaming insert — patrz komentarz na górze pliku po "dlaczego".

- **`ingest_league_snapshot.py`** — cienki CLI wrapper na `run_ingest()`, do ręcznego
  odpalenia lokalnie:

  ```bash
  python ingest_league_snapshot.py
  ```

- **`main.py`** — entry pointy pod Cloud Functions gen2 (`functions-framework`), dwie
  oddzielne funkcje w jednym pliku (`gcloud functions deploy` wybiera którą przez
  `--entry-point`):
  - `ingest_snapshot(request)` — Phase 1, wdrożony jako `fpl-ingest-league-snapshot`
    (`europe-west1`), wywoływany raz dziennie (06:00 czasu Warszawy) przez Cloud
    Scheduler job `fpl-ingest-league-snapshot-daily`, autoryzacja OIDC tokenem SA
    `fpl333-app`. Szczegóły deployu i napotkane problemy IAM — patrz `PROGRESS.md`
    w repo root.
  - `ingest_raw_tables(request)` — Phase 2 (patrz niżej), wdrożony jako
    `fpl-ingest-raw-tables` (`europe-west1`, 512Mi/0.33 vCPU), wywoływany raz dziennie
    (06:10 czasu Warszawy — celowo 10 min po `fpl-ingest-league-snapshot-daily`, żeby
    oba joby nie startowały w tej samej sekundzie) przez Cloud Scheduler job
    `fpl-ingest-raw-tables-daily`, autoryzacja OIDC tokenem SA `fpl333-app`. Osobna
    funkcja i osobny Scheduler job od Phase 1 — nie ruszają już działającej
    automatyzacji `league_standings_snapshot`.

- **`raw_tables.py`** — właściwa logika ingestu Phase 2 (`run_ingest_raw_tables()`), CZTERY tabele:
  - `raw_players` (z `bootstrap-static.elements`), `raw_gameweeks` (z `bootstrap-static.events`,
    jedno pobranie na obie), `raw_fixtures` (z `/fixtures/`, cały sezon naraz) — snapshot całego
    stanu, partycjonowane dziennie po `ingested_ts`, WRITE_APPEND co uruchomienie (jak w
    `snapshot.py`). Kolumny per tabela to świadomie wybrany podzbiór (nie cały surowy JSON, który
    dla `elements` ma ~100 pól) — dokładnie te pola, których Phase 3 z ROADMAP.md nazywa wprost
    jako features (minutes, starts, xG, xA, form, price, FDR/opponent_strength).
  - `raw_player_gameweek_live` (z `/api/event/{gw}/live/`) — INNY wzorzec: przyrostowy, nie
    codzienny full-refresh. Jedno zapytanie daje WSZYSTKICH zawodników dla JEDNEJ kolejki (nie 654
    zapytań na zawodnika — odrzucony wariant z `/api/element-summary/{id}/`). Ingestowane tylko
    kolejki z potwierdzonymi bonusami (`data_checked=true`, ta sama dyscyplina co
    `GwCompletionInfo.allFinished` w `app/api/_lib/fpl.ts`), i tylko te, których jeszcze nie ma w
    tabeli (`SELECT DISTINCT gw`) — w typowym tygodniu bez nowo rozliczonej kolejki to 0 dodatkowych
    zapytań do FPL. Partycjonowana po numerze kolejki (`RANGE 0-39`), nie po dacie ingestu — to
    ustalone fakty historyczne, nie ruchomy stan. **Celowo bez ceny/formy zawodnika** (endpoint
    `live/` ich nie zwraca) — dokładanie DZISIEJSZEJ ceny z `raw_players` do wierszy sprzed GW4
    byłoby data leakage (model widziałby przyszłą cenę ucząc się na starszych danych). Do treningu
    pierwszego modelu (Phase 3) cenę/formę brać z `raw_players` tylko od GW4 w przód — GW1-3 mają
    tu tylko wyniki, bez cenowych features.

- **`ingest_raw_tables.py`** — cienki CLI wrapper na `run_ingest_raw_tables()`, do
  ręcznego odpalenia lokalnie:

  ```bash
  python ingest_raw_tables.py
  ```

  Zweryfikowane ręcznie (2026-09-07): 654 `raw_players`, 38 `raw_gameweeks`, 380 `raw_fixtures`,
  1890 `raw_player_gameweek_live` (610+626+654 — rosnąca liczba elementów w grze GW1→GW3, nowi
  zawodnicy dopisywani przez FPL w trakcie sezonu, nie błąd) — poprawne typy i wartości sprawdzone
  bezpośrednio zapytaniem do BigQuery, w tym krzyżowo (Haaland GW3: 9 pkt, bonus 3 — zgodne z
  niezależnie sprawdzonym wcześniej `/api/event/3/live/`). Drugie uruchomienie zaraz po pierwszym
  potwierdziło logikę przyrostową: 0 nowych wierszy w `raw_player_gameweek_live` (GW1-3 już w
  tabeli, żadna nowa kolejka jeszcze nierozliczona).
