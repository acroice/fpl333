# Progress Log

Bieżący stan pracy nad ROADMAP.md — czytaj to na początku sesji, żeby wiedzieć od czego
kontynuować. Aktualizowane na koniec każdej sesji roboczej (Weekly System → DOCUMENT).

## Stan na 2026-09-05 (koniec dnia)

### Zrobione i zmergowane do `main`

1. **PR #1** — naprawiony Workload Identity Federation Vercel → GCP. Trzy niezależne
   bugi: brak `roles/iam.workloadIdentityUser` na SA `fpl333-app`, brakujące zmienne
   `GCP_*` dla środowiska Preview w Vercelu, i mismatch `allowedAudiences` na providerze
   `vercel-3`. Szczegóły w opisie PR #1 na GitHubie.
2. **PR #2** — usunięty tymczasowy `/api/gcp-test` (był publiczny na Production) +
   nieużywane zależności (`@vercel/oidc`, `google-auth-library`).
3. **PR #3** — pierwszy ręczny ingest FPL → BigQuery: `pipeline/ingest_league_snapshot.py`
   zapisuje snapshot tabeli ligi do `fpl_raw.league_standings_snapshot` (partycjonowana
   dziennie, load job — darmowy w BQ). Uruchomiony ręcznie 2×, tabela ma 30 wierszy.

Dodano też `ROADMAP.md` (pełna fazowa roadmapa, PR #1) i ten plik.

### W toku — branch `automate-league-snapshot-ingest` (WIP, NIE zmergowany, NIE ma PR)

Cel: zamienić ręczne `python pipeline/ingest_league_snapshot.py` na automatyczny
Cloud Scheduler (raz dziennie) → Cloud Function, zgodnie z milestone Phase 1 w
ROADMAP.md ("automatyczne pobieranie danych").

**Zrobione na tym branchu:**
- Refaktoryzacja `pipeline/`: logika przeniesiona do `snapshot.py` (`run_ingest()`),
  `ingest_league_snapshot.py` to teraz cienki CLI wrapper (działa tak samo jak wcześniej —
  przetestowane, tabela ma teraz 30 wierszy z dwóch ręcznych uruchomień), nowy
  `main.py` to entry point pod Cloud Function (`ingest_snapshot(request)`,
  `functions-framework`). Zacommitowane, wypchnięte na `origin/automate-league-snapshot-ingest`.
- Włączone API w projekcie: `cloudfunctions.googleapis.com`, `cloudbuild.googleapis.com`,
  `run.googleapis.com`, `eventarc.googleapis.com`, `cloudscheduler.googleapis.com`.

**Zablokowane na:** deploy Cloud Function (gen2) failuje na etapie Cloud Build:

```
OperationError: code=3, message=Build failed with status: FAILURE. Could not build
the function due to a missing permission on the build service account.
```

**Przyczyna:** Compute Engine default service account
(`843494044426-compute@developer.gserviceaccount.com`) — używany domyślnie przez
Cloud Build do budowania obrazu funkcji — nie ma roli `roles/cloudbuild.builds.builder`.
Znana, udokumentowana usterka na świeżo włączonym Cloud Build API.

### Następne kroki (jutro, w tej kolejności)

1. **Nadać brakującą rolę** (wymaga ręcznego uruchomienia — zmiany IAM na poziomie
   projektu są blokowane dla mnie przez classifier, tak jak poprzednio przy WIF):

   ```
   gcloud projects add-iam-policy-binding project-a756698f-2656-44a0-b8d \
     --member="serviceAccount:843494044426-compute@developer.gserviceaccount.com" \
     --role="roles/cloudbuild.builds.builder"
   ```

2. **Ponowić deploy** (z repo root, branch `automate-league-snapshot-ingest`):

   ```
   gcloud functions deploy fpl-ingest-league-snapshot \
     --gen2 \
     --project=project-a756698f-2656-44a0-b8d \
     --region=europe-west1 \
     --runtime=python313 \
     --source=pipeline \
     --entry-point=ingest_snapshot \
     --trigger-http \
     --no-allow-unauthenticated \
     --service-account=fpl333-app@project-a756698f-2656-44a0-b8d.iam.gserviceaccount.com \
     --memory=256Mi \
     --timeout=60s
   ```

3. Nadać `fpl333-app` rolę `roles/run.invoker` na wdrożonej usłudze (gen2 functions
   działają na Cloud Run pod spodem) — dokładna komenda do ustalenia po udanym deployu
   (nazwa usługi Cloud Run może się różnić od nazwy funkcji).

4. Utworzyć **Cloud Scheduler** job — cron raz dziennie (decyzja z sesji: "raz dziennie"
   wystarczy do budowania historii rankingu), autoryzacja przez OIDC token
   service accounta `fpl333-app` wskazujący na URL funkcji.

5. **Przetestować end-to-end**: ręcznie odpalić Scheduler job (`gcloud scheduler jobs run`),
   sprawdzić że nowy wiersz wylądował w BigQuery, sprawdzić logi funkcji.

6. Dopiero wtedy: commit ewentualnych poprawek, **PR i merge** brancha
   `automate-league-snapshot-ingest` do `main` (jeszcze nie było — branch jest tylko
   zabezpieczony na zdalnym repo, nie zmergowany).

### Zaległe porządki (nieblokujące, kiedyś)

- Usunąć relikt providera WIF `vercel` (bez team-slug) w poolu `vercel` — zostawiliśmy
  tylko `vercel-3`, który faktycznie działa.
- Zdjąć zbyt szeroką rolę `roles/iam.serviceAccountAdmin` z `fpl333-app` (powinien mieć
  tylko `workloadIdentityUser` + role BigQuery/Datastore, które już ma) — least privilege.
- Dataset `fpl_history` w BigQuery jest pusty, powstał przed tą sesją (1 września),
  nieznane pochodzenie/przeznaczenie — do decyzji: usunąć czy zostawić na później.

### Po dokończeniu automatyzacji

Przejście do **Phase 2** z ROADMAP.md: warstwy RAW → STAGING → FEATURES, więcej
surowych tabel (`raw_players`, `raw_fixtures`, `raw_gameweeks`), walidacja jakości
danych.
