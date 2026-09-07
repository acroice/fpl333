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
  - `ingest_raw_tables(request)` — Phase 2 (patrz niżej), jeszcze niewdrożony jako
    Cloud Function (na razie tylko ręczny CLI) — do zdeployowania analogicznie do
    powyższego, jako osobna funkcja (np. `fpl-ingest-raw-tables`) + osobny Scheduler
    job, żeby nie ruszać już działającej automatyzacji Phase 1.

- **`raw_tables.py`** — właściwa logika ingestu Phase 2 (`run_ingest_raw_tables()`):
  jedno pobranie `bootstrap-static` (→ `fpl_raw.raw_players` z `elements`, `fpl_raw.raw_gameweeks`
  z `events`) + jedno pobranie `/fixtures/` całego sezonu naraz (→ `fpl_raw.raw_fixtures`), wszystkie
  trzy partycjonowane dziennie po `ingested_ts`, zapis load jobem (WRITE_APPEND, jak w
  `snapshot.py`). Jedna funkcja na trzy tabele (nie trzy osobne) — `bootstrap-static` i tak trzeba
  pobrać raz, żeby dostać zarówno `elements`, jak i `events`; przy tej skali granularne retry per
  tabela nie dają realnej korzyści. Kolumny per tabela to świadomie wybrany podzbiór (nie cały
  surowy JSON, który dla `elements` ma ~100 pól) — dokładnie te pola, których Phase 3 z ROADMAP.md
  nazywa wprost jako features (minutes, starts, xG, xA, form, price, FDR/opponent_strength), plus
  tyle kontekstu, żeby dało się to połączyć w warstwie STAGING/FEATURES.

- **`ingest_raw_tables.py`** — cienki CLI wrapper na `run_ingest_raw_tables()`, do
  ręcznego odpalenia lokalnie:

  ```bash
  python ingest_raw_tables.py
  ```

  Zweryfikowane ręcznie (2026-09-07): 654 wiersze `raw_players`, 38 `raw_gameweeks`,
  380 `raw_fixtures` — poprawne typy, dane sprawdzone bezpośrednio zapytaniem do BigQuery.
