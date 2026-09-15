"""CLI do recznego (re)budowania STAGING + FEATURES - patrz features.py po pelny
opis warstw i decyzje projektowe.

Uzycie:
    python pipeline/build_features.py

Wymaga wczesniejszego:
    gcloud auth application-default login
"""

from features import run_build_staging_and_features


def main() -> None:
    print("Buduje widoki STAGING i tabele FEATURES (player_gameweek_features)...")
    summary = run_build_staging_and_features()
    print(f"  Widoki STAGING: {', '.join(summary['staging_views'])}")
    print(f"  FEATURES: {summary['features_table']} ({summary['features_rows']} wierszy)")
    print("Gotowe.")


if __name__ == "__main__":
    main()
