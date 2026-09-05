"""CLI do recznego uruchamiania ingestu (nauka/debugowanie) - patrz pipeline/main.py
dla wersji automatycznej (Cloud Function + Cloud Scheduler).

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
skanuje tylko potrzebne partycje (taniej i szybciej), i to samo w sobie jest jednym
z tematow na certyfikacie (partitioning).

Uzycie:
    python pipeline/ingest_league_snapshot.py

Wymaga wczesniejszego:
    gcloud auth application-default login
(logowanie dla bibliotek klienckich - INNE od `gcloud auth login` uzywanego przez
sam CLI).
"""

from snapshot import run_ingest


def main() -> None:
    print(f"Pobieram i zapisuje snapshot...")
    summary = run_ingest()
    print(
        f"Gotowe. Zaladowano {summary['rows_loaded']} wierszy do {summary['table']} "
        f"(tabela ma teraz laczenie {summary['table_total_rows']} wierszy, "
        f"{summary['table_total_bytes']} bajtow)."
    )


if __name__ == "__main__":
    main()
