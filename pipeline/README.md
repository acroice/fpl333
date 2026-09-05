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

- **`main.py`** — entry point pod Cloud Function gen2 (`ingest_snapshot(request)`,
  `functions-framework`). Wdrożony jako `fpl-ingest-league-snapshot`
  (`europe-west1`), wywoływany raz dziennie (06:00 czasu Warszawy) przez Cloud
  Scheduler job `fpl-ingest-league-snapshot-daily`, autoryzacja OIDC tokenem SA
  `fpl333-app`. Szczegóły deployu i napotkane problemy IAM — patrz `PROGRESS.md`
  w repo root.
