"""Entry pointy dla Cloud Functions (2nd gen, HTTP trigger).

Dwie ODDZIELNE funkcje w tym samym pliku/source (functions-framework pozwala trzymac
kilka `@functions_framework.http` w jednym module - `gcloud functions deploy` wybiera
ktora ma uruchomic przez `--entry-point`), kazda ze swoim wlasnym Cloud Scheduler jobem:

- ingest_snapshot -> league_standings_snapshot (Phase 1, dziala od pierwszej sesji)
- ingest_raw_tables -> raw_players/raw_gameweeks/raw_fixtures (Phase 2, ta sesja)

Jedna funkcja na WSZYSTKIE trzy tabele Phase 2 (nie trzy osobne) - uzasadnienie patrz
naglowek raw_tables.py. Osobna od ingest_snapshot, zeby nie ruszac juz dzialajacej,
zdeployowanej automatyzacji Phase 1 przy okazji dodawania Phase 2.

Zadna z tych funkcji nie jest publicznie dostepna - `--no-allow-unauthenticated` przy
deployu, Cloud Scheduler autoryzuje sie tokenem OIDC dedykowanego service accounta
(fpl333-app, ma juz uprawnienia bigquery.dataEditor/jobUser).
"""

import functions_framework

from snapshot import run_ingest
from raw_tables import run_ingest_raw_tables


@functions_framework.http
def ingest_snapshot(request):
    summary = run_ingest()
    return summary, 200


@functions_framework.http
def ingest_raw_tables(request):
    summary = run_ingest_raw_tables()
    return summary, 200
