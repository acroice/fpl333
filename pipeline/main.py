"""Entry point dla Cloud Function (2nd gen, HTTP trigger).

Wywolywane przez Cloud Scheduler raz dziennie (cron ustawiony w gcloud scheduler,
nie tutaj). Nie jest publicznie dostepne - `--no-allow-unauthenticated` przy deployu,
Scheduler autoryzuje sie tokenem OIDC dedykowanego service accounta (ten sam
fpl333-app, ktory ma juz uprawnienia bigquery.dataEditor/jobUser).

Ta sama logika co reczne CLI (ingest_league_snapshot.py) - patrz snapshot.py.
"""

import functions_framework

from snapshot import run_ingest


@functions_framework.http
def ingest_snapshot(request):
    summary = run_ingest()
    return summary, 200
