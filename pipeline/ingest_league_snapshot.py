"""Pierwszy krok Phase 1 (GCP Foundation) z ROADMAP.md: FPL API -> Python -> BigQuery.

Pobiera AKTUALNY stan tabeli prywatnej ligi FPL (jeden snapshot, nie pelna historia
gameweek-po-gameweek) i dopisuje go jako nowe wiersze do BigQuery. Celowo malutki
zakres danych na start - tyle wierszy ile jest managerow w lidze (rzedu dziesiatek),
zeby nie zblizac sie do zadnych limitow BigQuery podczas nauki.

Dlaczego load job, a nie streaming insert (client.insert_rows_json):
- load_table_from_json (batch load) jest w BigQuery calkowicie darmowy - placi sie
  tylko za storage i za query, nie za sam zapis.
- streaming insert historycznie mial oddzielny, platny limit/cennik.
Przy tak malej, nieczestej partii danych load job jest prostszym i tanszym wyborem,
i tak wlasnie warto to robic w prawdziwych pipeline'ach batchowych.

Tabela jest time-partitioned po `snapshot_ts` (partycja dzienna) - to standardowy
wzorzec BigQuery na dane, ktore rosna w czasie: kazde zapytanie filtrujace po dacie
skanuje tylko potrzebne partycje, nie cala tabele (taniej i szybciej), i to samo w
sobie jest jednym z tematow na certyfikacie (partitioning).

Uzycie:
    python pipeline/ingest_league_snapshot.py

Wymaga wczesniejszego:
    gcloud auth application-default login
(logowanie dla bibliotek klienckich - INNE od `gcloud auth login` uzywanego przez
sam CLI, patrz komentarz w ROADMAP.md / rozmowa z sesji, ktora to wprowadzila).
"""

from __future__ import annotations

import datetime
import os

import requests
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

# ---------------------------------------------------------------------------
# Konfiguracja - te same wartosci co w reszcie apki (leagueId) + zasoby GCP,
# ktore ustawilismy recznie przy naprawie Workload Identity Federation.
# ---------------------------------------------------------------------------
LEAGUE_ID = os.environ.get("FPL_LEAGUE_ID", "1078207")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-a756698f-2656-44a0-b8d")
BQ_DATASET = os.environ.get("BQ_DATASET", "fpl_raw")
BQ_TABLE = os.environ.get("BQ_TABLE", "league_standings_snapshot")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "EU")

FPL_HEADERS = {
    # FPL API bywa kapryśne bez sensownego User-Agent (patrz app/api/_lib/fpl.ts)
    "User-Agent": "Mozilla/5.0 (compatible; fpl333-pipeline/0.1)",
    "Accept": "application/json",
    "Referer": "https://fantasy.premierleague.com/",
}

TABLE_SCHEMA = [
    bigquery.SchemaField("snapshot_ts", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("league_id", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("entry", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("player_name", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("entry_name", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("rank", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("last_rank", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("total", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("event_total", "INT64", mode="NULLABLE"),
]


def fetch_league_standings(league_id: str) -> list[dict]:
    """Pobiera wszystkie strony standings ligi klasycznej FPL (jak fetchClassicStandingsRaw w TS)."""
    results: list[dict] = []
    page = 1
    while True:
        url = (
            f"https://fantasy.premierleague.com/api/leagues-classic/{league_id}/standings/"
            f"?page_standings={page}&page_new_entries=1"
        )
        resp = requests.get(url, headers=FPL_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        standings = data.get("standings", {})
        results.extend(standings.get("results", []))

        if standings.get("has_next"):
            page += 1
        else:
            break

    return results


def build_rows(standings: list[dict], league_id: str, snapshot_ts: datetime.datetime) -> list[dict]:
    ts_iso = snapshot_ts.isoformat()
    rows = []
    for r in standings:
        rows.append(
            {
                "snapshot_ts": ts_iso,
                "league_id": int(league_id),
                "entry": r["entry"],
                "player_name": r["player_name"],
                "entry_name": r["entry_name"],
                "rank": r.get("rank"),
                "last_rank": r.get("last_rank"),
                "total": r.get("total"),
                "event_total": r.get("event_total"),
            }
        )
    return rows


def ensure_dataset_and_table(client: bigquery.Client) -> bigquery.TableReference:
    dataset_ref = bigquery.DatasetReference(GCP_PROJECT_ID, BQ_DATASET)

    try:
        client.get_dataset(dataset_ref)
    except NotFound:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = BQ_LOCATION
        dataset.description = "Surowe (RAW) dane z FPL API - fundament pod feature engineering w kolejnych fazach."
        client.create_dataset(dataset)
        print(f"Utworzono dataset {BQ_DATASET} (lokalizacja {BQ_LOCATION}).")

    table_ref = dataset_ref.table(BQ_TABLE)
    try:
        client.get_table(table_ref)
    except NotFound:
        table = bigquery.Table(table_ref, schema=TABLE_SCHEMA)
        table.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY,
            field="snapshot_ts",
        )
        table.description = "Jeden snapshot tabeli ligi = jedno pobranie tego skryptu. Historia, nie stan biezacy."
        client.create_table(table)
        print(f"Utworzono tabele {BQ_DATASET}.{BQ_TABLE} (partycjonowana dziennie po snapshot_ts).")

    return table_ref


def main() -> None:
    snapshot_ts = datetime.datetime.now(datetime.timezone.utc)

    print(f"Pobieram standings ligi {LEAGUE_ID} z FPL API...")
    standings = fetch_league_standings(LEAGUE_ID)
    rows = build_rows(standings, LEAGUE_ID, snapshot_ts)
    print(f"Pobrano {len(rows)} wierszy (managerow) do zapisu.")

    client = bigquery.Client(project=GCP_PROJECT_ID)
    table_ref = ensure_dataset_and_table(client)

    job_config = bigquery.LoadJobConfig(
        schema=TABLE_SCHEMA,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    load_job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    load_job.result()  # czeka na zakonczenie joba (rzuci wyjatek jesli sie nie uda)

    table = client.get_table(table_ref)
    print(
        f"Gotowe. Zaladowano {load_job.output_rows} wierszy do "
        f"{table.project}.{table.dataset_id}.{table.table_id} "
        f"(tabela ma teraz laczenie {table.num_rows} wierszy, {table.num_bytes} bajtow)."
    )


if __name__ == "__main__":
    main()
