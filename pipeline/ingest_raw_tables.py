"""CLI do recznego uruchamiania ingestu trzech tabel RAW (nauka/debugowanie) - patrz
pipeline/main.py dla wersji automatycznej (Cloud Function + Cloud Scheduler).

Pobiera bootstrap-static (-> raw_players, raw_gameweeks) i fixtures (-> raw_fixtures)
i dopisuje jako nowe wiersze do BigQuery, ta sama logika (snapshot, WRITE_APPEND,
partycja dzienna) co ingest_league_snapshot.py - pelne uzasadnienie tych decyzji
patrz komentarz tam.

Uzycie:
    python pipeline/ingest_raw_tables.py

Wymaga wczesniejszego:
    gcloud auth application-default login
"""

from raw_tables import run_ingest_raw_tables


def main() -> None:
    print("Pobieram bootstrap-static + fixtures i zapisuje raw_players/raw_gameweeks/raw_fixtures...")
    summary = run_ingest_raw_tables()
    for table_key in ("raw_players", "raw_gameweeks", "raw_fixtures"):
        info = summary[table_key]
        print(f"  {table_key}: zaladowano {info['rows_loaded']} wierszy do {info['table']}")
    print(f"Gotowe (ingested_ts={summary['ingested_ts']}).")


if __name__ == "__main__":
    main()
