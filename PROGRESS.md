# Progress Log

Bieżący stan pracy nad ROADMAP.md — czytaj to na początku sesji, żeby wiedzieć od czego
kontynuować. Aktualizowane na koniec każdej sesji roboczej (Weekly System → DOCUMENT).

## Stan na 2026-09-05 (sesja 2 — front-end dashboardu, poza kolejnością ROADMAP.md)

Cała ta sesja to celowa przerwa w Phase 2 (patrz sekcja niżej) na życzenie — polerowanie UX
istniejącego dashboardu Next.js (`app/`), nie backend/ML. **Phase 2 z ROADMAP.md (RAW → STAGING →
FEATURES) stoi w miejscu, nietknięta** — następna sesja robocza nad roadmapą zaczyna dokładnie
tam, gdzie zostawiła ją sesja 1 (patrz niżej, bez zmian).

### Baner "🚀 GW wystartowała" (`KickoffFactsBanner`)

Przebudowany z 3 kafelków (z czego 2 pokazywały w praktyce ten sam fakt — najpopularniejszy pick
w składzie to zwykle też najpopularniejszy kapitan) na 4 kafelki, każdy z realnie innym sygnałem:

1. **Kapitan tłumu** — bez zmian.
2. **Odważny wybór** — zastąpił "Najpopularniejszy pick": najmniej obstawiany kapitan w rundzie,
   kontrast do #1 zamiast powtórki tego samego faktu.
3. **Chipy w rundzie** — ikonka + skrót nazwy chipa obok liczby (np. `👑 TC 2`), nie sama ikonka.
4. **Zysk z transferu** — zamiast suchej liczby transferów: realny efekt punktowy (suma pkt
   wchodzącego minus wychodzącego) u managera, któremu najbardziej się to opłaciło w tej rundzie.
   Świadomie pomija wildcard/freehit (przebudowa całego składu, nie punktowa decyzja "kogo na
   kogo") — inaczej te chipy zawsze dominowałyby wynik samą skalą.

### Zakładka Statystyki — reorganizacja i doprecyzowania

- Kolejność sekcji: Captaincy → Ownership → Chips → Bench → Stabilność → **Transfers (płatne/hity)
  na samym końcu** (najmniej angażująca treść, świadomie zepchnięta w dół).
- "Najlepszy kapitan w lidze (ta GW)" → "(OBECNY GW)" — jaśniejsza etykieta.
- Stabilność: domyślnie top 5 + "Pokaż więcej", jak reszta list w zakładce (wcześniej cała liga
  na raz).
- Bench: zdjęte medale (🥇🥈🥉) z rankingu — to "łzy na ławce" (coś złego), nie osiągnięcie do
  świętowania, więc zwykła numeracja. "Rekord ligi" doprecyzowany: najwięcej pkt zostawionych na
  ławce **w jednej kolejce** (nie suma sezonu).
- Transfers (💸 płatne/hity): nazwa i opis jawnie odróżniają to od "Zysku z transferu" z banera —
  to WYŁĄCZNIE koszt hita (pkt za transfer ponad darmowy limit), NIE różnica w formie kupionego
  względem sprzedanego zawodnika. Rozwinięcie wiersza managera pokazuje teraz konkretne GW, w
  których wziął hita, i jakie transfery w nich zagrał (wcześniej: cała sezonowa historia
  transferów, myląca bo nie tłumaczyła wprost skąd wziął się koszt). Też bez medali w rankingu.

### Zakładka Liga — widoczność transferów bez rozwijania wiersza

Manager, który zrobił transfer(y) w bieżącej GW, ma to teraz widać od razu w głównym wierszu
(analogicznie do plakietki chipa), bez klikania w wiersz:

- **<3 transferów**: pełne pigułki "kto na kogo (Δpkt)" bezpośrednio w wierszu (np.
  `Shaw → Ajayi (0)`), ten sam wizualny język co drill-down składu.
- **≥3 transferów** (zwykle wildcard/freehit — cała przebudowa składu): kompaktowy badge
  `🔄 N +/-X pkt` (liczba transferów + zsumowany bilans punktowy), żeby nie zaśmiecić wiersza,
  ale nadal nie zgubić najważniejszej informacji ("czy to się opłaciło").
- Rozwinięcie wiersza (drill-down składu) pokazuje pełne pigułki zawsze, niezależnie od liczby —
  bez zmian względem tego, co już działało.

### Backend pod tym wszystkim

- Nowy `fetchEntryTransfersCached(entryId)` w `_lib/fpl.ts` — endpoint FPL
  `/entry/{id}/transfers/` (cała historia transferów sezonu managera), cache'owany jak reszta.
- `quarter-wins/route.ts`: `differentialCaptain`, `topTransferGain`, `transfersHistory` (per
  manager, z `pointsOut`/`pointsIn`/`delta` liczonymi tylko dla transferów z `latestGw` — starsze
  GW nie mają dociąganych historycznych live stats, bo Statystyki i tak liczą tam tylko koszt
  hita per GW, nie deltę punktową).
- `squad/route.ts`: `SquadData.transfers` — "kto na kogo" w konkretnej GW z deltą punktową, do
  drill-downu składu w Lidze.

Zweryfikowane end-to-end na żywej lidze (GW3, w trakcie) na każdym etapie tej sesji — konkretne
przykłady liczb (kto, ile, jaka delta) w historii czatu tej sesji, nie powtarzane tu.

### Poprawka po merge'u: cofnięte transfery zawyżały liczniki (collapseTransferChain)

Zaraz po zmergowaniu powyższego zgłoszony realny błąd, znaleziony przy wyjaśnianiu pozornej
sprzeczności "+3 w szczegółach vs -3 na miniaturce" (to akurat nie był błąd — miniaturka pokazuje
SUMĘ wszystkich transferów tej rundy, +3 to delta jednego z nich, matematyka się zgadzała: -6+3=
-3). Prawdziwy problem: surowy endpoint FPL `/entry/{id}/transfers/` loguje KAŻDĄ zmianę zrobioną
w planerze składu jako osobny wpis — łącznie z cofniętymi (manager wstawia zawodnika, zmienia
zdanie, wraca do poprzedniego wyboru). Przy dużej przebudowie składu (wildcard) jeden manager miał
**22 surowe wpisy transferów w GW3, z czego realnie w składzie zostało tylko 10** — reszta to
duchy typu "Rogers → Cherki" (Rogers finalnie w ogóle nie został w składzie).

Naprawione nowym `collapseTransferChain()` w `_lib/fpl.ts` — redukuje chronologiczny log
transferów do netto par "wyszedł → wszedł" śledząc łańcuchy podstawień (kto ostatecznie zajął czyj
"slot" w składzie), odrzucając pełne cofnięcia. Zastosowane wszędzie, gdzie liczymy transfery
JEDNEJ GW: `transfersHistory` i `topTransferGain` w `quarter-wins/route.ts`, `buildTransferRows`
w `squad/route.ts` (czyli też drill-down składu w Lidze). Zweryfikowane na tym samym managerze:
22 → 10 transferów, bilans punktowy bez zmian (-3, bo cofnięte wpisy miały deltę 0 — nikt jeszcze
nie grał w momencie edycji składu, więc akurat nie zafałszowały wyniku, ale mogłyby przy innym
układzie danych).

### Redesign "next-gen": Statystyki, Sezon, Porównaj

Dalszy ciąg sesji 2, na życzenie — czysto wizualny upgrade trzech zakładek, zero zmian w logice
liczenia danych. Wydzielony wspólny system w `components/shared.tsx`:

- **`StatModule`** — panel z kolorową ikonką w kwadraciku, tytułem i podtytułem, obramowaniem w
  barwie dopasowanej do "charakteru" treści (`good`/`bad`/`special`/`neutral` — ten sam podział co
  `.statchip` i `.wrapped-card` w GW Wrapped). Każdy tematyczny blok w tych trzech zakładkach jest
  teraz osobnym `StatModule`, zamiast płaskiej listy sekcji rozdzielonych samym nagłówkiem.
- **`RankFill`/`barPct`** — proporcjonalny pasek tła w rankingach (Bench, Stabilność, Transfery-hity,
  bonusy z chipów, % ownership w Captaincy/Ownership) — szybki wizualny skan "kto ile" bez czytania
  każdej liczby, w tym samym duchu co pasek postępu ćwiartki w Lidze.

**Statystyki** — 6 modułów (Captaincy złoty, Ownership niebieski, Chips złoty, Bench czerwony,
Stabilność niebieski, Transfers czerwony) z paskami we wszystkich rankingach.

**Sezon** — wykres w module "Trend sezonu", a "Rekordy sezonu" przebudowane z gołego emoji-prefiksu
na kartę z kolorową ikonką (zielone dla dobrych momentów, czerwone dla złych, złote dla specjalnych
osiągnięć jak streak na #1).

**Porównaj** — cała zawartość w modułach (Bilans, H2H, Różnicowi zawodnicy, Pełne składy). Przy
okazji: tag właściciela w leaderboardzie różnic zmieniony z gołych liter "A"/"B" na **inicjały
managera** (np. "DC"), z tooltipem pełnego imienia — kolor (zielony/niebieski) zostaje jako
dodatkowy szybki podział wizualny.

### Redesign "next-gen": zakładka Liga (GW Pulse, GW Awards, drill-down składu)

Ten sam system (`StatModule`/`RankFill`/`Tone`) doprowadzony do ostatniej zakładki, która go
jeszcze nie miała — znów czysto wizualne, bez zmian w logice liczenia danych:

- **GW Pulse** (⚡ neutralny) i **GW Awards** (🏅 złoty) opakowane w `StatModule`, każdy kafelek
  GW Pulse dostał kolor ramki dopasowany do charakteru (Best GW/Biggest Rise zielone, Worst GW i
  Bench Disaster czerwone, Captain Fantastic złoty, League Average niebieski) — `StatTile`
  rozszerzony o opcjonalny prop `tone`.
- **Drill-down managera** (`SquadDrilldown` po rozwinięciu wiersza w Lidze) przebudowany z tekstowej
  listy rozdzielanej kropkami na rząd 4 pigułek-statchipów (🎯 Total, 🔄 Transfery, 🪑 Ławka,
  💰 Wartość) + osobny rząd przełącznika widoku pod spodem. Każdy zawodnik w składzie (podstawowy i
  ławka) ma teraz pasek `RankFill` pod spodem pokazującym % ownership w lidze — ten sam wizualny
  język co ranking ownership w Statystykach.

### Kafelek "Zysk z transferu": przeniesiony z banera startowego do GW Pulse

Kafelek pokazujący realny efekt punktowy transferu (nie tylko fakt, że ktoś go zrobił) pasuje
bardziej do GW Pulse — tam wymaga już policzonych punktów danej rundy, więc jest naturalnym
sąsiadem Best GW / Biggest Rise, a nie czymś do pokazania od razu po gwizdku, zanim ktokolwiek
zdobędzie punkty. W jego dawnym miejscu w "🚀 GW wystartowała": nowy kafelek **Aktywność
transferowa** — `{playersWithTransfersThisRound}/{leagueSize} managerów`, "zrobiło transfer przed
GW{n}" (dynamiczny numer rundy zamiast statycznego "tym gwizdkiem") — działa od razu po deadline,
nie czeka na wyniki, i celowo pomija wildcard/freehit (przebudowa całego składu to nie punktowa
decyzja "kogo na kogo"). Backend: `quarter-wins/route.ts` liczy `nonChipTransfersThisRound` raz i z
niego wyprowadza zarówno `topTransferGain` (teraz konsumowany przez Ligę), jak i
`playersWithTransfersThisRound` (konsumowany przez baner).

## Stan na 2026-09-05 (koniec dnia, po dokończeniu automatyzacji)

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
4. **PR #5** — automatyzacja ingestu: Cloud Scheduler (raz dziennie, 06:00 czasu
   Warszawy) → Cloud Function gen2 (`fpl-ingest-league-snapshot`, `europe-west1`) →
   BigQuery. Szczegóły niżej.

Dodano też `ROADMAP.md` (pełna fazowa roadmapa, PR #1) i ten plik.

### Automatyzacja ingestu — jak działa i jak powstała

Cel z Phase 1 ROADMAP.md ("automatyczne pobieranie danych") jest zrealizowany:
`python pipeline/ingest_league_snapshot.py` uruchamiany ręcznie zastąpiony przez
Cloud Scheduler → Cloud Function.

**Refaktoryzacja `pipeline/`:** logika przeniesiona do `snapshot.py` (`run_ingest()`),
`ingest_league_snapshot.py` to cienki CLI wrapper (działa tak samo jak wcześniej),
`main.py` to entry point pod Cloud Function (`ingest_snapshot(request)`,
`functions-framework`).

**Deploy:**

```
gcloud functions deploy fpl-ingest-league-snapshot \
  --gen2 --project=project-a756698f-2656-44a0-b8d --region=europe-west1 \
  --runtime=python313 --source=pipeline --entry-point=ingest_snapshot \
  --trigger-http --no-allow-unauthenticated \
  --service-account=fpl333-app@project-a756698f-2656-44a0-b8d.iam.gserviceaccount.com \
  --memory=256Mi --timeout=60s
```

Uwierzytelnianie: `fpl333-app` ma `roles/run.invoker` na usłudze Cloud Run pod spodem
funkcji (gen2 functions działają na Cloud Run). Cloud Scheduler job
`fpl-ingest-league-snapshot-daily` (cron `0 6 * * *`, strefa `Europe/Warsaw`) wywołuje
funkcję OIDC tokenem tego samego SA.

**Dwie osobne przeszkody IAM napotkane przy deployu Cloud Function (obie wymagały
ręcznego `gcloud ... add-iam-policy-binding` — zmiany IAM na poziomie projektu/bucketu są
blokowane dla mnie przez classifier, tak jak wcześniej przy WIF):**

1. Compute Engine default service account
   (`843494044426-compute@developer.gserviceaccount.com`) nie miał roli
   `roles/cloudbuild.builds.builder` na poziomie projektu — mimo że dedykowany SA
   `843494044426@cloudbuild.gserviceaccount.com` tę rolę już miał. Generyczny błąd
   Cloud Build (`missing permission on the build service account`) nie precyzował
   której roli/SA brakuje.
2. Po naprawie (1) build nadal failował z tym samym generycznym komunikatem. Dopiero
   `gcloud builds describe <BUILD_ID> --format=json` i zdekodowanie base64 pola
   `results.buildStepOutputs` ujawniło prawdziwą przyczynę: brak `roles/storage.objectViewer`
   na buckecie `gcf-v2-sources-843494044426-europe-west1` (źródło funkcji) dla tego
   samego SA. Po nadaniu obu ról deploy przeszedł.

**Test end-to-end wykonany:** `gcloud scheduler jobs run fpl-ingest-league-snapshot-daily`
→ request do Cloud Run zalogowany ze statusem 200 (log `run.googleapis.com/requests`,
zauważalne opóźnienie indeksowania logów rzędu ~2-3 min) → nowy wiersz
`snapshot_ts = 2026-09-05 08:50:50` w BigQuery (15 wierszy, tabela ma teraz łącznie 45).

Branch `automate-league-snapshot-ingest` zmergowany do `main` (**PR #5**) i usunięty
(zdalnie i lokalnie). Od teraz Cloud Scheduler dokłada nowy snapshot codziennie o
6:00 bez żadnej ręcznej interwencji.

### Stan repo na koniec sesji

- `main` zawiera wszystko (PR #1–#3, #5 zmergowane), working tree czysty, lokalny
  branch WIP usunięty — następna sesja startuje wprost z `main`, nie trzeba nic
  przełączać.
- Cała infrastruktura ingestu (Cloud Function, Cloud Scheduler, role IAM) jest już
  utworzona i działa w GCP — automatyzacja z Phase 1 jest w pełni zamknięta, nic tu
  nie czeka na dokończenie.
- `pipeline/` ma teraz trzy pliki logiki: `snapshot.py` (`run_ingest()` — właściwa
  logika), `ingest_league_snapshot.py` (CLI wrapper), `main.py` (Cloud Function entry
  point). Każda kolejna tabela RAW (patrz niżej) powinna trzymać się tego samego
  wzorca: funkcja `run_ingest_*()` w osobnym module, cienkie wrappery na wierzchu.

### Następny krok — Phase 2 z ROADMAP.md (warstwy RAW → STAGING → FEATURES)

Punkt wyjścia: mamy już jedną tabelę RAW (`league_standings_snapshot`) i działający,
automatyczny wzorzec ingestu, który się sprawdził — kolejne tabele RAW powinny go
powielić, a nie wymyślać nowy mechanizm dostarczania danych.

1. **Rozszerzyć RAW o kolejne surowe tabele** z FPL API (endpointy `bootstrap-static`
   i `fixtures`): `raw_players`, `raw_fixtures`, `raw_gameweeks`. Każda jako osobny
   moduł w `pipeline/`, ta sama zasada partycjonowania dziennego i load job (darmowy
   w BQ), analogicznie do `snapshot.py`.
2. Zdecydować, czy każda nowa tabela dostaje własną Cloud Function + Scheduler job,
   czy jedna funkcja robi ingest wszystkich tabel na raz (prościej operacyjnie, ale
   mniej granularne logi/retry) — do rozstrzygnięcia na początku tej fazy.
3. **Warstwa STAGING** — czyszczenie/normalizacja danych z RAW (typy, deduplikacja,
   obsługa braków) jako kolejny krok w BigQuery (widoki lub tabele pochodne).
4. **Warstwa FEATURES** — pierwsza tabela cech, np. `player_gameweek_features`,
   łącząca dane z RAW/STAGING pod przyszły model z Phase 3.
5. **Walidacja jakości danych** — Definition of Done z ROADMAP.md dla tej fazy:
   pipeline można uruchomić ponownie bez niszczenia danych, dane mają podstawową
   walidację (np. brak duplikatów per gameweek, sensowne zakresy wartości).

### Zaległe porządki, które można załatwić przy okazji Phase 2

- Usunąć relikt providera WIF `vercel` (bez team-slug) w poolu `vercel` — zostawiliśmy
  tylko `vercel-3`, który faktycznie działa.
- Zdjąć zbyt szeroką rolę `roles/iam.serviceAccountAdmin` z `fpl333-app` (powinien mieć
  tylko `workloadIdentityUser` + role BigQuery/Datastore, które już ma) — least privilege.
- Dataset `fpl_history` w BigQuery jest pusty, powstał przed sesją automatyzacji (1
  września), nieznane pochodzenie/przeznaczenie — do decyzji: usunąć czy zostawić,
  ewentualnie wykorzystać pod jedną z nowych tabel RAW zamiast tworzyć kolejny dataset.
- Pierwszy deploy `fpl-ingest-league-snapshot` zalogował nieszkodliwe ostrzeżenie
  "Cloud Run service ... was not found. The service was redeployed with default
  values." (spodziewane przy pierwszym deployu nowej funkcji) — sprawdzić przy
  kolejnych deployach (np. gdy dojdą funkcje dla `raw_players`/`raw_fixtures`/
  `raw_gameweeks`), że się nie powtarza z innego powodu.
