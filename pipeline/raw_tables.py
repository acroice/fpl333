"""Rdzen logiki: FPL API (bootstrap-static + fixtures) -> trzy tabele RAW -> BigQuery.

Rozszerzenie Phase 1 (RAW = league_standings_snapshot, patrz snapshot.py) o Phase 2 z
ROADMAP.md: raw_players, raw_gameweeks, raw_fixtures - surowiec pod przysza warstwe
FEATURES i pierwszy model z Phase 3 (Expected Points), ktory wprost potrzebuje: minutes,
starts, xG, xA, form, price, historical_points (raw_players) oraz
opponent_strength/home_away (raw_fixtures, przez team_h_difficulty/team_a_difficulty -
FPL FDR).

Jedna Cloud Function na wszystkie trzy tabele (nie trzy osobne), bo:
- bootstrap-static i tak trzeba pobrac raz, zeby dostac ZAROWNO elements (raw_players),
  JAK I events (raw_gameweeks) - druga tabela "za darmo" z tego samego requesta;
- fixtures to jeden dodatkowy call;
- przy tak malej skali (15-osobowa liga, dane raz dziennie) granularne retry per tabela
  nie daje realnej korzysci, a kosztuje wiecej infrastruktury do utrzymania (patrz
  decyzja odnotowana w PROGRESS.md).

Ten sam wzorzec co snapshot.py: SNAPSHOT, nie stan biezacy - kazde uruchomienie DOPISUJE
nowe wiersze (WRITE_APPEND, partycja dzienna po ingested_ts), nie nadpisuje. To celowe:
Phase 3 wymaga "temporal validation, unikania data leakage" - trzeba wiedziec, jak dana
kolejka WYGLADALA W DANYM DNIU (np. cena/forma zawodnika przed konkretnym GW), nie tylko
jak wyglada teraz. Nadpisywanie "aktualnego stanu" zniszczyloby te informacje.

Zakres kolumn per tabela jest SWIADOMIE wybrany (nie caly surowy JSON, ktory dla
elements ma ~100 pol) - dokladnie te pola, ktore Phase 3 juz nazywa wprost jako
features, plus tyle kontekstu (zespol, pozycja, dostepnosc), zeby dalo sie to polaczyc
w warstwie STAGING/FEATURES. To ta sama zasada, co juz zastosowana w TABLE_SCHEMA w
snapshot.py (jawny, wybrany schemat, nie zrzut calego JSON-a).
"""

from __future__ import annotations

import datetime
import os

import requests
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-a756698f-2656-44a0-b8d")
BQ_DATASET = os.environ.get("BQ_DATASET", "fpl_raw")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "EU")

FPL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; fpl333-pipeline/0.1)",
    "Accept": "application/json",
    "Referer": "https://fantasy.premierleague.com/",
}

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/"

PLAYERS_TABLE = "raw_players"
GAMEWEEKS_TABLE = "raw_gameweeks"
FIXTURES_TABLE = "raw_fixtures"

PLAYERS_SCHEMA = [
    bigquery.SchemaField("ingested_ts", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("id", "INT64", mode="REQUIRED"),  # element id z FPL
    bigquery.SchemaField("code", "INT64", mode="NULLABLE"),  # stabilny id do zdjec/CDN
    bigquery.SchemaField("web_name", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("first_name", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("second_name", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("team", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("element_type", "INT64", mode="NULLABLE"),  # 1 GKP/2 DEF/3 MID/4 FWD
    bigquery.SchemaField("now_cost", "INT64", mode="NULLABLE"),  # jednostki 0.1mln
    bigquery.SchemaField("status", "STRING", mode="NULLABLE"),  # a=available, i=injured, d=doubtful, ...
    bigquery.SchemaField("chance_of_playing_next_round", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("total_points", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("event_points", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("form", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("points_per_game", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("selected_by_percent", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("minutes", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("starts", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("goals_scored", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("assists", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("clean_sheets", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("goals_conceded", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("yellow_cards", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("red_cards", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("bonus", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("bps", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("influence", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("creativity", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("threat", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("ict_index", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("expected_goals", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("expected_assists", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("expected_goal_involvements", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("expected_goals_conceded", "FLOAT64", mode="NULLABLE"),
    bigquery.SchemaField("transfers_in_event", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("transfers_out_event", "INT64", mode="NULLABLE"),
]

GAMEWEEKS_SCHEMA = [
    bigquery.SchemaField("ingested_ts", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("id", "INT64", mode="REQUIRED"),  # numer GW
    bigquery.SchemaField("name", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("deadline_time", "TIMESTAMP", mode="NULLABLE"),
    bigquery.SchemaField("finished", "BOOL", mode="NULLABLE"),
    bigquery.SchemaField("data_checked", "BOOL", mode="NULLABLE"),  # bonusy potwierdzone
    bigquery.SchemaField("is_previous", "BOOL", mode="NULLABLE"),
    bigquery.SchemaField("is_current", "BOOL", mode="NULLABLE"),
    bigquery.SchemaField("is_next", "BOOL", mode="NULLABLE"),
    bigquery.SchemaField("average_entry_score", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("highest_score", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("most_selected", "INT64", mode="NULLABLE"),  # element id
    bigquery.SchemaField("most_captained", "INT64", mode="NULLABLE"),  # element id
    bigquery.SchemaField("most_vice_captained", "INT64", mode="NULLABLE"),  # element id
    bigquery.SchemaField("most_transferred_in", "INT64", mode="NULLABLE"),  # element id
    bigquery.SchemaField("top_element", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("top_element_points", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("transfers_made", "INT64", mode="NULLABLE"),
]

FIXTURES_SCHEMA = [
    bigquery.SchemaField("ingested_ts", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("id", "INT64", mode="REQUIRED"),  # fixture id
    bigquery.SchemaField("code", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("event", "INT64", mode="NULLABLE"),  # numer GW, NULL dla nierozplanowanych
    bigquery.SchemaField("kickoff_time", "TIMESTAMP", mode="NULLABLE"),
    bigquery.SchemaField("team_h", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("team_a", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("team_h_score", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("team_a_score", "INT64", mode="NULLABLE"),
    # FDR (Fixture Difficulty Rating) 1-5 wg FPL — surowiec pod feature opponent_strength z
    # Phase 3 (dla gospodarza to trudnosc GOSCIA i odwrotnie, ale trzymamy oba tak jak API,
    # decyzja "z czyjej perspektywy" nalezy do warstwy FEATURES, nie RAW)
    bigquery.SchemaField("team_h_difficulty", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("team_a_difficulty", "INT64", mode="NULLABLE"),
    bigquery.SchemaField("finished", "BOOL", mode="NULLABLE"),
    bigquery.SchemaField("started", "BOOL", mode="NULLABLE"),
]


def _iso_or_none(value: str | None) -> str | None:
    return value if value else None


def fetch_bootstrap() -> dict:
    resp = requests.get(BOOTSTRAP_URL, headers=FPL_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def fetch_fixtures() -> list[dict]:
    """Caly sezon naraz (bez ?event=), w odroznieniu od app/api/_lib/fpl.ts, ktore pyta o
    jedna GW na raz - tu chcemy kompletny terminarz (w tym przyszle, nierozegrane mecze,
    ktore dopiero staja sie 'opponent' features dla kolejnych GW)."""
    resp = requests.get(FIXTURES_URL, headers=FPL_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def build_players_rows(elements: list[dict], ts_iso: str) -> list[dict]:
    rows = []
    for e in elements:
        rows.append(
            {
                "ingested_ts": ts_iso,
                "id": e["id"],
                "code": e.get("code"),
                "web_name": e.get("web_name"),
                "first_name": e.get("first_name"),
                "second_name": e.get("second_name"),
                "team": e.get("team"),
                "element_type": e.get("element_type"),
                "now_cost": e.get("now_cost"),
                "status": e.get("status"),
                "chance_of_playing_next_round": e.get("chance_of_playing_next_round"),
                "total_points": e.get("total_points"),
                "event_points": e.get("event_points"),
                "form": float(e["form"]) if e.get("form") not in (None, "") else None,
                "points_per_game": float(e["points_per_game"]) if e.get("points_per_game") not in (None, "") else None,
                "selected_by_percent": float(e["selected_by_percent"]) if e.get("selected_by_percent") not in (None, "") else None,
                "minutes": e.get("minutes"),
                "starts": e.get("starts"),
                "goals_scored": e.get("goals_scored"),
                "assists": e.get("assists"),
                "clean_sheets": e.get("clean_sheets"),
                "goals_conceded": e.get("goals_conceded"),
                "yellow_cards": e.get("yellow_cards"),
                "red_cards": e.get("red_cards"),
                "bonus": e.get("bonus"),
                "bps": e.get("bps"),
                "influence": float(e["influence"]) if e.get("influence") not in (None, "") else None,
                "creativity": float(e["creativity"]) if e.get("creativity") not in (None, "") else None,
                "threat": float(e["threat"]) if e.get("threat") not in (None, "") else None,
                "ict_index": float(e["ict_index"]) if e.get("ict_index") not in (None, "") else None,
                "expected_goals": float(e["expected_goals"]) if e.get("expected_goals") not in (None, "") else None,
                "expected_assists": float(e["expected_assists"]) if e.get("expected_assists") not in (None, "") else None,
                "expected_goal_involvements": float(e["expected_goal_involvements"]) if e.get("expected_goal_involvements") not in (None, "") else None,
                "expected_goals_conceded": float(e["expected_goals_conceded"]) if e.get("expected_goals_conceded") not in (None, "") else None,
                "transfers_in_event": e.get("transfers_in_event"),
                "transfers_out_event": e.get("transfers_out_event"),
            }
        )
    return rows


def build_gameweeks_rows(events: list[dict], ts_iso: str) -> list[dict]:
    rows = []
    for ev in events:
        top_element_info = ev.get("top_element_info") or {}
        rows.append(
            {
                "ingested_ts": ts_iso,
                "id": ev["id"],
                "name": ev.get("name"),
                "deadline_time": _iso_or_none(ev.get("deadline_time")),
                "finished": ev.get("finished"),
                "data_checked": ev.get("data_checked"),
                "is_previous": ev.get("is_previous"),
                "is_current": ev.get("is_current"),
                "is_next": ev.get("is_next"),
                "average_entry_score": ev.get("average_entry_score"),
                "highest_score": ev.get("highest_score"),
                "most_selected": ev.get("most_selected"),
                "most_captained": ev.get("most_captained"),
                "most_vice_captained": ev.get("most_vice_captained"),
                "most_transferred_in": ev.get("most_transferred_in"),
                "top_element": ev.get("top_element"),
                "top_element_points": top_element_info.get("points"),
                "transfers_made": ev.get("transfers_made"),
            }
        )
    return rows


def build_fixtures_rows(fixtures: list[dict], ts_iso: str) -> list[dict]:
    rows = []
    for f in fixtures:
        rows.append(
            {
                "ingested_ts": ts_iso,
                "id": f["id"],
                "code": f.get("code"),
                "event": f.get("event"),
                "kickoff_time": _iso_or_none(f.get("kickoff_time")),
                "team_h": f.get("team_h"),
                "team_a": f.get("team_a"),
                "team_h_score": f.get("team_h_score"),
                "team_a_score": f.get("team_a_score"),
                "team_h_difficulty": f.get("team_h_difficulty"),
                "team_a_difficulty": f.get("team_a_difficulty"),
                "finished": f.get("finished"),
                "started": f.get("started"),
            }
        )
    return rows


def _ensure_dataset(client: bigquery.Client) -> bigquery.DatasetReference:
    dataset_ref = bigquery.DatasetReference(GCP_PROJECT_ID, BQ_DATASET)
    try:
        client.get_dataset(dataset_ref)
    except NotFound:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = BQ_LOCATION
        dataset.description = "Surowe (RAW) dane z FPL API - fundament pod feature engineering w kolejnych fazach."
        client.create_dataset(dataset)
    return dataset_ref


def _ensure_table(
    client: bigquery.Client,
    dataset_ref: bigquery.DatasetReference,
    table_name: str,
    schema: list[bigquery.SchemaField],
    description: str,
) -> bigquery.TableReference:
    table_ref = dataset_ref.table(table_name)
    try:
        client.get_table(table_ref)
    except NotFound:
        table = bigquery.Table(table_ref, schema=schema)
        table.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY,
            field="ingested_ts",
        )
        table.description = description
        client.create_table(table)
    return table_ref


def _load_rows(client: bigquery.Client, table_ref: bigquery.TableReference, rows: list[dict], schema: list[bigquery.SchemaField]) -> int:
    if not rows:
        return 0
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    load_job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    load_job.result()
    return load_job.output_rows


def run_ingest_raw_tables() -> dict:
    """Pelny przebieg: bootstrap-static (-> raw_players, raw_gameweeks) + fixtures
    (-> raw_fixtures), jeden ingested_ts wspolny dla wszystkich trzech, zeby dalo sie
    polaczyc 'jak wygladal caly stan FPL w tym samym momencie'. Zwraca podsumowanie
    (dict), wspolne dla trybu CLI i Cloud Function."""
    ingested_ts = datetime.datetime.now(datetime.timezone.utc)
    ts_iso = ingested_ts.isoformat()

    bootstrap = fetch_bootstrap()
    fixtures = fetch_fixtures()

    players_rows = build_players_rows(bootstrap["elements"], ts_iso)
    gameweeks_rows = build_gameweeks_rows(bootstrap["events"], ts_iso)
    fixtures_rows = build_fixtures_rows(fixtures, ts_iso)

    client = bigquery.Client(project=GCP_PROJECT_ID)
    dataset_ref = _ensure_dataset(client)

    players_table = _ensure_table(
        client, dataset_ref, PLAYERS_TABLE, PLAYERS_SCHEMA,
        "Snapshot stanu wszystkich zawodnikow FPL (bootstrap-static.elements) - jeden ingest = jeden dzien. Historia, nie stan biezacy.",
    )
    gameweeks_table = _ensure_table(
        client, dataset_ref, GAMEWEEKS_TABLE, GAMEWEEKS_SCHEMA,
        "Snapshot stanu wszystkich kolejek sezonu (bootstrap-static.events) - jeden ingest = jeden dzien.",
    )
    fixtures_table = _ensure_table(
        client, dataset_ref, FIXTURES_TABLE, FIXTURES_SCHEMA,
        "Snapshot calego terminarza sezonu (/fixtures/, wszystkie GW naraz) - jeden ingest = jeden dzien.",
    )

    players_loaded = _load_rows(client, players_table, players_rows, PLAYERS_SCHEMA)
    gameweeks_loaded = _load_rows(client, gameweeks_table, gameweeks_rows, GAMEWEEKS_SCHEMA)
    fixtures_loaded = _load_rows(client, fixtures_table, fixtures_rows, FIXTURES_SCHEMA)

    return {
        "ingested_ts": ts_iso,
        "raw_players": {"rows_loaded": players_loaded, "table": f"{players_table.project}.{players_table.dataset_id}.{players_table.table_id}"},
        "raw_gameweeks": {"rows_loaded": gameweeks_loaded, "table": f"{gameweeks_table.project}.{gameweeks_table.dataset_id}.{gameweeks_table.table_id}"},
        "raw_fixtures": {"rows_loaded": fixtures_loaded, "table": f"{fixtures_table.project}.{fixtures_table.dataset_id}.{fixtures_table.table_id}"},
    }
