"""STAGING (widoki) + FEATURES (materializowana tabela) na warstwie RAW - Phase 2 z
ROADMAP.md, ostatni krok przed pierwszym modelem z Phase 3 (Expected Points).

STAGING (dataset fpl_staging) to WIDOKI, nie tabele - dane RAW sa male (pojedyncze MB),
wiec materializowanie STAGING nie daje zadnej korzysci kosztowej, a widok jest zawsze
swiezy i nie wymaga wlasnej logiki odswiezania. Zadanie tej warstwy to wylacznie
CZYSZCZENIE: raw_players/raw_fixtures/raw_gameweeks sa snapshotami CALEGO stanu robionymi
codziennie (patrz raw_tables.py) - w dniach z wiecej niz jednym ingestem (np. reczne testy)
maja WIELE wierszy per encja per dzien, wiec STAGING dedupuje do jednego (najswiezszego)
wiersza na dzien/encje. Podstawowa walidacja jakosci z Definition of Done w ROADMAP.md.

FEATURES (dataset fpl_features, tabela player_gameweek_features) to MATERIALIZOWANA
tabela (nie widok) - Phase 4 z ROADMAP.md chce odtwarzalnosci eksperymentow (data_window,
feature_version), do czego lepiej pasuje ustalony, wersjonowany snapshot cech niz widok,
ktory zmienia sie pod eksperymentem w trakcie jego trwania. Budowana PELNYM przeliczeniem
za kazdym razem (WRITE_TRUNCATE), nie przyrostowo - dane sa na tyle male (kilka tysiecy
wierszy), ze pelny rebuild kosztuje ulamek centa, a to o wiele prostsze niz osobna logika
"co się zmieniło od ostatniego builda".

Kluczowa zasada (patrz PROGRESS.md, sesja 4 - trzy rundy przemyslenia
raw_player_gameweek_live): KAZDA cecha dla wiersza (element, gw) musi byc policzalna Z
DANYCH SPRZED deadline'u tej kolejki, inaczej to data leakage. Stad:
- performance features (avg_points_last3 itd.) licza sie z kolejek WCZESNIEJSZYCH niz gw
  (window frame "3 PRECEDING AND 1 PRECEDING" - explicit wykluczenie biezacego wiersza);
- cena/forma to snapshot raw_players NAJSWIEZSZY, ale SPRZED deadline'u danej kolejki (nie
  "dzisiejszy") - dla GW1-3 nie ma zadnego snapshotu sprzed ich deadline'u (zaczelismy
  snapshotowac dopiero 07.09, po GW3), wiec te kolumny wychodza NULL - to zamierzone, nie
  blad (patrz decyzja w PROGRESS.md: trening pierwszego modelu ma uzywac ceny/formy dopiero
  od GW4).
"""

from __future__ import annotations

import os

from google.cloud import bigquery
from google.cloud.exceptions import NotFound

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-a756698f-2656-44a0-b8d")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "EU")

STAGING_DATASET = "fpl_staging"
FEATURES_DATASET = "fpl_features"
FEATURES_TABLE = "player_gameweek_features"

# Przypisanie element -> (team, element_type, web_name) z NAJWCZESNIEJSZEGO dostepnego
# snapshotu raw_players - transfery miedzy klubami w trakcie kilku tygodni sezonu sa
# rzadkie, wiec to bezpieczne uproszczenie (nie leakage: to fakt historyczny "w ktorym
# klubie grał", nie ruchoma cecha jak cena/forma).
_STG_PLAYER_TEAM = """
CREATE OR REPLACE VIEW `{project}.{staging}.stg_player_team` AS
SELECT id AS element, team, element_type, web_name
FROM (
  SELECT id, team, element_type, web_name,
         ROW_NUMBER() OVER (PARTITION BY id ORDER BY ingested_ts ASC) AS rn
  FROM `{project}.fpl_raw.raw_players`
)
WHERE rn = 1
"""

# Jeden wiersz na (element, dzien) - najswiezszy ingest tego dnia, jesli bylo ich kilka.
_STG_PLAYERS_DAILY = """
CREATE OR REPLACE VIEW `{project}.{staging}.stg_players_daily` AS
SELECT id AS element, DATE(ingested_ts) AS snapshot_date, now_cost, form, status,
       chance_of_playing_next_round
FROM (
  SELECT *,
         ROW_NUMBER() OVER (PARTITION BY id, DATE(ingested_ts) ORDER BY ingested_ts DESC) AS rn
  FROM `{project}.fpl_raw.raw_players`
)
WHERE rn = 1
"""

# Jeden wiersz na fixture id - najswiezszy ingest (wyniki/FDR moga sie zaktualizowac po
# meczu, wiec bierzemy ostatni znany stan, nie pierwszy).
_STG_FIXTURES = """
CREATE OR REPLACE VIEW `{project}.{staging}.stg_fixtures` AS
SELECT id, code, event AS gw, kickoff_time, team_h, team_a, team_h_score, team_a_score,
       team_h_difficulty, team_a_difficulty, finished
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ingested_ts DESC) AS rn
  FROM `{project}.fpl_raw.raw_fixtures`
)
WHERE rn = 1
"""

_STG_GAMEWEEKS = """
CREATE OR REPLACE VIEW `{project}.{staging}.stg_gameweeks` AS
SELECT id AS gw, deadline_time, finished, data_checked
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ingested_ts DESC) AS rn
  FROM `{project}.fpl_raw.raw_gameweeks`
)
WHERE rn = 1
"""

STAGING_VIEWS: dict[str, str] = {
    "stg_player_team": _STG_PLAYER_TEAM,
    "stg_players_daily": _STG_PLAYERS_DAILY,
    "stg_fixtures": _STG_FIXTURES,
    "stg_gameweeks": _STG_GAMEWEEKS,
}

# Uwaga o double gameweeks: player_fixtures_dedup bierze tylko PIERWSZY mecz danej
# kolejki na zawodnika (ROW_NUMBER), jesli klub akurat ma dwa mecze w tej samej GW. Rzadki
# przypadek w kalendarzu PL, celowo nieobslugiwany w pelni na tym etapie - udokumentowane
# uproszczenie, nie przeoczenie.
FEATURES_QUERY = """
WITH player_fixtures AS (
  SELECT
    f.gw,
    pt.element,
    (f.team_h = pt.team) AS was_home,
    IF(f.team_h = pt.team, f.team_a, f.team_h) AS opponent_team,
    IF(f.team_h = pt.team, f.team_a_difficulty, f.team_h_difficulty) AS opponent_difficulty,
    ROW_NUMBER() OVER (PARTITION BY f.gw, pt.element ORDER BY f.id) AS rn
  FROM `{project}.{staging}.stg_fixtures` f
  JOIN `{project}.{staging}.stg_player_team` pt
    ON pt.team IN (f.team_h, f.team_a)
  WHERE f.gw IS NOT NULL
),
player_fixtures_dedup AS (
  SELECT gw, element, was_home, opponent_team, opponent_difficulty
  FROM player_fixtures
  WHERE rn = 1
),
price_asof_gw AS (
  SELECT
    gwd.gw,
    pd.element,
    pd.now_cost,
    pd.form,
    pd.status,
    ROW_NUMBER() OVER (PARTITION BY gwd.gw, pd.element ORDER BY pd.snapshot_date DESC) AS rn
  FROM `{project}.{staging}.stg_gameweeks` gwd
  JOIN `{project}.{staging}.stg_players_daily` pd
    ON pd.snapshot_date < DATE(gwd.deadline_time)
),
price_asof_gw_dedup AS (
  -- NULL dla GW bez zadnego snapshotu SPRZED deadline'u (GW1-3 - zaczelismy snapshotowac
  -- dopiero po GW3) - to zamierzone, patrz naglowek pliku, nie brakujacy JOIN.
  SELECT gw, element, now_cost, form, status
  FROM price_asof_gw
  WHERE rn = 1
),
results_with_lags AS (
  SELECT
    gw,
    element,
    minutes,
    total_points,
    LAG(total_points) OVER w AS prev_gw_points,
    LAG(minutes) OVER w AS prev_gw_minutes,
    AVG(total_points) OVER (PARTITION BY element ORDER BY gw ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS avg_points_last3,
    AVG(minutes) OVER (PARTITION BY element ORDER BY gw ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS avg_minutes_last3,
    AVG(expected_goals + expected_assists) OVER (PARTITION BY element ORDER BY gw ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS avg_xgi_last3,
    SUM(total_points) OVER (PARTITION BY element ORDER BY gw ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS cum_points_before_gw
  FROM `{project}.fpl_raw.raw_player_gameweek_live`
  WINDOW w AS (PARTITION BY element ORDER BY gw)
)
SELECT
  r.gw,
  r.element,
  pt.web_name,
  pt.element_type,
  r.total_points AS target_points,   -- TARGET: to, co model ma przewidziec (nie feature wejsciowy!)
  r.minutes AS target_minutes,
  r.prev_gw_points,
  r.prev_gw_minutes,
  r.avg_points_last3,
  r.avg_minutes_last3,
  r.avg_xgi_last3,
  r.cum_points_before_gw,
  pf.was_home,
  pf.opponent_team,
  pf.opponent_difficulty,
  pg.now_cost AS price,
  pg.form,
  pg.status,
  CURRENT_TIMESTAMP() AS built_at
FROM results_with_lags r
LEFT JOIN `{project}.{staging}.stg_player_team` pt ON pt.element = r.element
LEFT JOIN player_fixtures_dedup pf ON pf.gw = r.gw AND pf.element = r.element
LEFT JOIN price_asof_gw_dedup pg ON pg.gw = r.gw AND pg.element = r.element
"""


def _ensure_dataset(client: bigquery.Client, name: str, description: str) -> bigquery.DatasetReference:
    ref = bigquery.DatasetReference(GCP_PROJECT_ID, name)
    try:
        client.get_dataset(ref)
    except NotFound:
        ds = bigquery.Dataset(ref)
        ds.location = BQ_LOCATION
        ds.description = description
        client.create_dataset(ds)
    return ref


def run_build_staging_and_features() -> dict:
    """Pelny przebieg: (re)stworz widoki STAGING, potem PELNYM przeliczeniem zbuduj
    player_gameweek_features. Zwraca podsumowanie (dict), wspolne dla trybu CLI i
    ew. przyszlej automatyzacji."""
    client = bigquery.Client(project=GCP_PROJECT_ID)
    _ensure_dataset(client, STAGING_DATASET, "STAGING - oczyszczone/zdeduplikowane widoki na warstwie RAW.")
    features_ref = _ensure_dataset(client, FEATURES_DATASET, "FEATURES - tabele cech pod modele ML (Phase 3+).")

    for view_sql in STAGING_VIEWS.values():
        client.query(view_sql.format(project=GCP_PROJECT_ID, staging=STAGING_DATASET)).result()

    destination = features_ref.table(FEATURES_TABLE)
    job_config = bigquery.QueryJobConfig(
        destination=destination,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    query = FEATURES_QUERY.format(project=GCP_PROJECT_ID, staging=STAGING_DATASET)
    query_job = client.query(query, job_config=job_config)
    query_job.result()

    table = client.get_table(destination)
    return {
        "staging_views": list(STAGING_VIEWS.keys()),
        "features_table": f"{table.project}.{table.dataset_id}.{table.table_id}",
        "features_rows": table.num_rows,
    }
