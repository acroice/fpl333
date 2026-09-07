# Progress Log

Bieżący stan pracy nad ROADMAP.md — czytaj to na początku sesji, żeby wiedzieć od czego
kontynuować. Aktualizowane na koniec każdej sesji roboczej (Weekly System → DOCUMENT).

## Stan na 2026-09-07 (sesja 4 — bugfixy live-punktów, next-gen drill-downy, przegląd kodu)

Dalszy ciąg polerowania front-endu dashboardu (patrz sesja 3 niżej) — Phase 2 z ROADMAP.md nadal
nietknięta. Cztery PR-y zmergowane do `main` (#17–#20), każdy zweryfikowany end-to-end na żywej
lidze przez działający dev server (bez odpalania drugiego obok — patrz notatka o `.next/` niżej),
plus finalny przegląd kodu całej sesji z poprawkami.

### PR #17 — Bugfix: latestGw pokazywała opóźnione punkty w kolejnych miejscach + GW Wrapped

Sesja 3 naprawiła rozjazd Ćwiartki↔Liga (live `event_total` zamiast laggy `/entry/{id}/history/`
dla świeżo zamkniętej kolejki), ale nie objęła: `awards.topGun/toughWeek/noChipWarrior/benchTears`
w `quarter-wins/route.ts` (zasilają "Podsumowanie GW" i "GW Wrapped") oraz kafelek "Total" w
rozwijanym składzie managera w Lidze (`squad/route.ts`, `entryHistory.points` z endpointu picks/ —
ten sam laggy mechanizm). Oba naprawione live-computed wartościami.

GW Wrapped: nowy `allTiedBy()` (backend) zwraca WSZYSTKICH remisujących o ekstremalną wartość
nagrody, nie tylko pierwszego napotkanego (`Award.tiedEntries`) — front (`awardNames()`/
`namesOrInitials()` w `shared.tsx`) pokazuje pełne imiona przy ≤3 osobach, inicjały przy 4-6, `X
managerów` powyżej. Karty w GW Wrapped dopełniane z puli zapasowej do zawsze 6 (2×3), gdy
podstawowy zestaw nie ma kompletu danych w danym tygodniu.

FT w wierszu managera w Lidze: etykieta pokazywała `event_transfers` (ile transferów ZAGRANO), nie
"free transfers" mimo nazwy — poprawione na realny bank wolnych transferów DO DYSPOZYCJI (nowa
`computeFreeTransfersAvailable()` w `_lib/fpl.ts`, symuluje zasady FPL od sezonu 2024/25: start 1
od GW2, +1/kolejkę, cap 5, Wildcard/Free Hit zamrażają bank). Jeden bugfix po drodze: pierwsza
wersja liczyła bank NA START latestGw (stan sprzed jej rozegrania) zamiast stanu PO niej —
zgłoszone przez użytkownika na żywym przykładzie (manager oszczędził transfer, powinien mieć 2 nie
1), naprawione rozszerzeniem symulacji o samą latestGw.

### PR #18 — Statystyki: Chip Tracker uspójniony sezonowo + zysk z Free Hit + wyróżnienie TC

Moduł "Chips" (Statystyki) obiecywał w podtytule "cały sezon", ale pigułki na górze pokazywały
tylko aktywne chipy W TEJ kolejce — mylące. Wydzielone do osobnej mini-sekcji "Chip Tracker" obok
Captaincy (ten sam charakter: bieżący stan kolejki). Moduł "Chips" zostaje wyłącznie historią
sezonu, z nowym liczeniem **zysku z Free Hit** (wynik składu z chipem minus to, ile zdobyłby skład
sprzed FH w tej samej kolejce — symulacja autosubów starego składu na realnych minutach,
`simulateAutosubs`). Wildcard i Assistant Manager usunięte z tego widoku (brak dobrze
zdefiniowanego zysku — WC to trwała przebudowa na przyszłość, AM to inny mechanizm w ogóle
nieobsługiwany). Bench Boost dostał dodatkowe 🚀 obok 🪑 w Statystykach (samo krzesełko zlewało się
z resztą treści); w Lidze/bannerach zostaje samo 🪑. Ownership → rozwinięte "kto go ma" wyróżnia
teraz Triple Captain (złota pigułka + 👑³).

### PR #19 — Rozwijane "kto go ma/kapitanuje": drill-down składu w Lidze + Captaincy

`OwnersPanel` wydzielony do `shared.tsx` (był lokalną funkcją w `StatsSection.tsx`) — reużywalny
komponent, teraz współdzielony przez Ownership, Captaincy i nowy drill-down składu w Lidze.
Naprawiony mylący separator "kropka + myślnik" przy ławce w drill-downzie składu; zarówno
podstawowy skład, jak i ławka dostały klikalny wiersz rozwijający listę "kto go ma" (nowe pole
`owners` w `SquadPlayer`). Captaincy w Statystykach: wiersz (np. "13/15") jest klikalny, rozwija
pełną listę managerów, którzy kapitanowali danego zawodnika (nowe pole `captainOwners`).

### PR #20 — Liga: pasek w drill-downzie składu pokazuje wkład punktowy, nie % obstawy

Diagnoza zgłoszenia "paski nie są tu tak adekwatne jak w Statystykach": w Statystykach listy są
posortowane po tej samej wartości co pasek (RankFill), więc paski czytają się jak leaderboard. W
drill-downzie składu kolejność to pozycja w składzie (GK→DEF→MID→FWD→ławka), nie ranking — pasek %
obstawy (drugorzędna metryka) skakał losowo, a najważniejsza metryka (punkty) nie miała żadnej
wizualizacji. Naprawione: pasek pokazuje wkład punktowy względem max w składzie, tonowany kolorem
(złoty=kapitan, zielony=dodatni, czerwony=ujemny, szary=ławka nieliczącą się) — nie wymaga
sortowania listy. % obstawy zostaje jako drugorzędna pigułka `X% · Y/Z` (na prośbę użytkownika,
ten sam format co Ownership).

### Przegląd kodu całej sesji (`code-review --level high` na diffie #17–#20) + poprawki

- **Realny bug**: zysk z Free Hit dla managera, który zagrał FH w TRWAJĄCEJ latestGw, liczył się z
  oficjalnych `automatic_subs`, których FPL nie ma jeszcze dla nierozliczonej kolejki (puste do
  zamknięcia GW) — naprawione tym samym wzorcem co reszta pliku: `simulateAutosubs()` dopóki
  oficjalnych zamian brak, potem oficjalne, gdy się pojawią (jak `hasProjection` w
  `squad/route.ts`).
- Usunięty martwy kod (`topBy`/`bottomBy` w `quarter-wins/route.ts`, niepotrzebne po refaktorze na
  `allTiedBy`).
- Zduplikowana logika "wszyscy remisujący o wartość ekstremalną" (własne kopie w
  `LeagueSection.tsx` i `GwWrappedModal.tsx`) scalona do jednego `extremeTied()`/`namesOf()` w
  `shared.tsx`.
- `barPct()` (pasek proporcjonalny) liczył szerokość z surowej wartości, nie z wartości
  bezwzględnej — dla ujemnych wartości (zysk z chipa na minusie, wkład punktowy przy czerwonej
  kartce) każda ujemna liczba lądowała na tej samej twardej podłodze 4%, tracąc informację o
  skali. Naprawione `Math.abs()` w liczniku — kierunek (dobrze/źle) i tak niesie osobno kolor.

### Notatka operacyjna: `npm run build` obok działającego `npm run dev` psuje `.next/`

W trakcie sesji dwukrotnie trafiony błąd warsztatowy: (1) `Get-Process -Name node | Stop-Process`
po weryfikacji zabijało WSZYSTKIE procesy node, w tym dev server użytkownika działający w innym
terminalu — od tej pory dev server użytkownika zostaje nietknięty, testy idą przez curl do portu,
na którym już nasłuchuje. (2) `npm run build` (produkcyjny) uruchomiony obok żywego `npm run dev`
nadpisuje/przenumerowuje chunki w współdzielonym `.next/`, co dev server (już załadowany w pamięci)
zgłasza jako `Cannot find module './NNN.js'` — od tej pory build weryfikacyjny odpalany tylko gdy
port docelowy nie jest zajęty (`Get-NetTCPConnection -LocalPort 3000`), inaczej wystarcza
`npx tsc --noEmit` + curl do już działającego serwera.

### Start Phase 2 z ROADMAP.md — trzy nowe tabele RAW (`raw_players`, `raw_gameweeks`, `raw_fixtures`)

Front-end dashboardu uznany za dojrzały/stabilny (żadnych otwartych zgłoszeń) — pierwszy krok w
stronę faktycznego ML: rozszerzenie `pipeline/` o RAW ponad istniejący `league_standings_snapshot`
(Phase 1), dokładnie tym samym wzorcem (snapshot, WRITE_APPEND, partycja dzienna po
`ingested_ts` — celowo, żeby Phase 3 mogło robić temporal validation bez data leakage, czyli
odtworzyć "jak wyglądał zawodnik/mecz W DANYM DNIU", nie tylko stan bieżący).

Nowe pliki: `pipeline/raw_tables.py` (`run_ingest_raw_tables()` — jedno pobranie
`bootstrap-static` daje jednocześnie `elements` → `raw_players` i `events` → `raw_gameweeks`, plus
jedno pobranie `/fixtures/` całego sezonu → `raw_fixtures`) i cienki CLI wrapper
`pipeline/ingest_raw_tables.py`. **Decyzja architektoniczna** (otwarty punkt z poprzedniej sesji):
JEDNA Cloud Function na wszystkie trzy tabele, nie trzy osobne — `bootstrap-static` i tak trzeba
pobrać raz na dwie z trzech tabel, a przy tej skali (15-osobowa liga, raz dziennie) granularny
retry per tabela nie daje realnej korzyści kosztem większej infrastruktury. `pipeline/main.py`
dostał drugi entry point (`ingest_raw_tables`, obok istniejącego `ingest_snapshot`, w tym samym
pliku — `gcloud functions deploy` wybiera który przez `--entry-point`), żeby nie ruszać już
działającej automatyzacji Phase 1 przy dodawaniu Phase 2.

Kolumny per tabela to świadomie wybrany podzbiór (nie cały surowy JSON — `elements` ma ~100 pól),
dokładnie te, które Phase 3 z ROADMAP.md nazywa wprost jako features: `minutes`, `starts`,
`expected_goals`/`expected_assists` (xG/xA), `form`, `now_cost` (price), `total_points`
(raw_players) oraz `team_h_difficulty`/`team_a_difficulty` — FPL FDR, surowiec pod
`opponent_strength`/`home_away` (raw_fixtures).

Zweryfikowane ręcznie (`python ingest_raw_tables.py`, ADC już skonfigurowane z Phase 1): 654
wiersze `raw_players`, 38 `raw_gameweeks`, 380 `raw_fixtures`, dataset/tabele utworzone same przy
pierwszym uruchomieniu (jak w Phase 1). Sprawdzone bezpośrednio zapytaniem do BigQuery — poprawne
typy (TIMESTAMP/BOOL/FLOAT64), sensowne wartości (np. `raw_fixtures.team_h_difficulty` 1-5,
`raw_gameweeks.data_checked=true` dla już rozliczonych GW).

### Deploy `ingest_raw_tables` — Cloud Function + Cloud Scheduler (Phase 2 zautomatyzowana)

Wdrożone jako osobna funkcja `fpl-ingest-raw-tables` (`europe-west1`, gen2, `python313`,
512Mi/0.33 vCPU, timeout 120s, SA `fpl333-app`) — nie ruszało istniejącej `fpl-ingest-league-snapshot`.
Deploy przeszedł bez przeszkód IAM na poziomie projektu/bucketu (te z sesji 1 — role na Compute
Engine default SA i buckecie `gcf-v2-sources-*` — najwyraźniej wystarczają dla kolejnych funkcji w
tym samym projekcie, nie trzeba było ich powtarzać).

Jedna NOWA przeszkoda: `roles/run.invoker` na Cloud Run trzeba nadać OSOBNO per usługa (nie
dziedziczy się między funkcjami) — nowy `fpl-ingest-raw-tables-daily` job dostawał
`PERMISSION_DENIED` (status code 7) do pierwszego `gcloud run services add-iam-policy-binding
fpl-ingest-raw-tables ... --role=roles/run.invoker --member=serviceAccount:fpl333-app@...`. W
odróżnieniu od project/bucket-level bindingów z sesji 1, TEN binding (na poziomie pojedynczej
usługi Cloud Run) nie był blokowany dla agenta — wykonany bezpośrednio, bez potrzeby ręcznej
interwencji użytkownika.

Cloud Scheduler job `fpl-ingest-raw-tables-daily` (cron `10 6 * * *`, `Europe/Warsaw` — celowo 10
min po istniejącym `fpl-ingest-league-snapshot-daily`, żeby oba joby nie startowały w tej samej
sekundzie), autoryzacja OIDC tokenem SA `fpl333-app`. Test end-to-end (`gcloud scheduler jobs run`
→ `status: {}` bez kodu błędu, ten sam sygnał sukcesu co przy działającym już Phase 1 jobie) —
potwierdzony drugim kompletem wierszy w BigQuery (654/38/380, identycznie jak ręczny test) z nowym
`ingested_ts`. Od teraz obie automatyzacje dokładają nowy snapshot codziennie bez ręcznej
interwencji.

Koszt: wszystko mieści się w darmowym tierze GCP (Cloud Functions/Scheduler/Cloud Build free tier,
BigQuery load joby darmowe, storage rzędu pojedynczych MB nawet po całym sezonie) — realistycznie
$0/miesiąc dodatkowo. Do zweryfikowania przez użytkownika w Billing, jeśli chce się upewnić.

**Następny krok:** warstwa STAGING (czyszczenie/normalizacja/dedup) i FEATURES (pierwsza tabela
cech, np. `player_gameweek_features`, łącząca RAW pod model z Phase 3).

### Stan repo na koniec sesji 4

`main` ma wszystko z tej sesji zmergowane (PR #17–#22, fast-forward, każdy z osobnym, opisowym
commitem), working tree czysty, brak lokalnych/zdalnych branchy WIP (każdy PR kasował swój branch
po merge'u). Każdy merge front-endu wywołał automatyczny deploy na Vercelu (GitHub integration),
potwierdzony statusem `success` przez GitHub API — PR z Phase 2 (`pipeline/`) nie dotyka Next.js,
więc nie wywołuje deployu Vercela. `ingest_raw_tables` wdrożony i zautomatyzowany (Cloud Function +
Cloud Scheduler, patrz wyżej) — Phase 2 ma teraz DZIAŁAJĄCY, codzienny ingest wszystkich czterech
tabel RAW (`league_standings_snapshot` + `raw_players`/`raw_gameweeks`/`raw_fixtures`). Kolejna
sesja kontynuuje Phase 2: warstwa STAGING/FEATURES (patrz plan wyżej i w sekcji sesji 1
niżej) — front-end dashboardu zostaje w stabilnym, zamkniętym stanie.

## Stan na 2026-09-06 (sesja 3 — front-end dashboardu, kontynuacja sesji 2)

Dalszy ciąg polerowania UX (patrz sesja 2 niżej) — Phase 2 z ROADMAP.md nadal nietknięta.

### Sprzątanie: `next.config.js`

Usunięta przestarzała `experimental.appDir` (Next.js 14 ma App Router domyślnie, opcja nie jest
już rozpoznawana i tylko generowała warning przy starcie dev servera) — zero zmian w zachowaniu.

### Redesign "next-gen": zakładka Liga — tabela/karty rankingu + hit widoczny przy wyniku

Zgłoszenie: karta managera na mobile "zjadała" nazwiska (ucinały je plakietki chipów/transferów w
tej samej linii flex), a przy okazji poproszono o next-gen upgrade tabeli (inspiracja:
plan.livefpl.net) i o widoczny hit przy wyniku GW.

- **Prawdziwa przyczyna ucinania nazwisk**: `.leaguecard-row1` trzymał nazwisko, plakietkę chipa,
  plakietkę transferów i total w JEDNEJ linii flex — na wąskim ekranie z aktywnymi plakietkami
  nazwisku zostawało za mało miejsca. Naprawione przebudową karty na `[rank | avatar |
  .leaguecard-body]`, gdzie CAŁA reszta (nazwisko, drużyna, plakietki, kapitan, delta/GW/gap) żyje
  w jednej kolumnie, jedna pod drugą — nazwisko ma teraz zawsze własny, pełnoszerokościowy wiersz,
  plakietki dostały osobny, zawijany wiersz niżej. Przy okazji dodana nazwa drużyny na mobile
  (wcześniej widoczna tylko na desktopie).
- **`ManagerAvatar`** (nowy komponent w `shared.tsx`) — kółko z inicjałami managera (managerowie,
  w odróżnieniu od zawodników, nie mają zdjęć z API FPL), Top3 rankingu podświetlony kolorem
  medalu (złoto/srebro/brąz) — ten sam duch co `rankBadge()` 🥇🥈🥉 w ćwiartkach. `initials()`
  przeniesione z `CompareSection.tsx` do `shared.tsx` (był to duplikat czekający na reużycie).
- **Hit przy wyniku GW**: gdy manager wziął płatny transfer, obok wyniku pojawia się `(-4) = 51`
  (czerwony hit + wynik netto), z tooltipem pokazującym wynik brutto. Dane (`teamInfo.transfersCost`)
  już istniały w API, brakowało tylko wyświetlenia w Lidze.

### Bugfix: delta transferu liczyła punkty zawodnika, który wylądował na ławce

Zgłoszenie: manager miał pokazane "-3" z transferu na Dubravkę, mimo że Dubravka w ogóle nie grał
w podstawowym składzie tej GW (siedział na ławce). Przyczyna: `delta = pointsIn - pointsOut`
liczyła SUROWE punkty wchodzącego zawodnika z `live`, niezależnie od tego, czy w ogóle wliczyły się
do wyniku managera. Naprawione: nowy współdzielony helper `effectiveMultiplierAfterSubs()` w
`_lib/fpl.ts` (uwzględnia oficjalne automatyczne zamiany FPL) mówi, czy wchodzący faktycznie zagrał
w podstawowym składzie tej GW — gdy nie (`benchedIn: true`), **delta = 0** (ten konkretny ruch w
praktyce nie wpłynął na wynik tej kolejki), zamiast fałszywie liczyć go jako stratę. Zastosowane
wszędzie, gdzie liczymy deltę transferu jednej GW: `squad/route.ts` (drill-down składu w Lidze) i
`quarter-wins/route.ts` (`transfersHistory`/plakietki w głównym wierszu Ligi, `topTransferGain` w
GW Pulse). UI: mała ikonka 🪑 przy nazwisku zawodnika na ławce w pigułce transferu, z tooltipem
"na ławce, nie liczy się do wyniku" — żeby było widać PRZYCZYNĘ delty 0, nie tylko sam wynik.
Zweryfikowane na żywym przykładzie z tej sesji: Dubravka i Konsa (obaj na ławce) przeszli z
`-3`/`-4` na `delta: 0`.

### Ownership (Statystyki): rozwijalne "kto go ma" + drill-down składu Ligi na mobile

- **Ownership → klik = lista managerów**: każdy wiersz w "Najczęściej wybierani"/"Różnicowi
  zawodnicy" jest teraz klikalny (chevron ▼/▲ przy %) i rozwija pigułki z managerami, którzy mają
  danego zawodnika — z oznaczeniem 🪑, jeśli trzymali go na ławce (nie 🏅/(C), jeśli był kapitanem).
  Najbardziej przydatne właśnie przy niskiej obstawie (np. "1/15" z Różnicowych) — od razu widać
  KTO i czy w ogóle skorzystał z jego punktów, bez szukania po całej Lidze. Backend:
  `league-overview/route.ts` buduje `owners[]` per zawodnik z `allPicks` (ma już te dane —
  zero dodatkowych zapytań), ławka liczona z uwzględnieniem automatycznych zamian (ten sam duch co
  `squadplayer.isBench` w `squad/route.ts`).
- **Drill-down składu w Lidze na mobile**: wiersz zawodnika (nazwisko+klub w jednej linii, punkty/
  % obstawy w drugiej tej samej linii flex) zlewał się na wąskim ekranie. Naprawione czysto w CSS
  (media query ≤600px): druga część (`.squadplayer > span:last-child`) dostaje `flex-basis: 100%`,
  więc zawsze schodzi na własną linię pod nazwiskiem, wyrównaną wcięciem. Desktop bez zmian.

### Bugfix: Ćwiartki (i Sezon/Statystyki) liczyły bieżącą kolejkę na innych liczbach niż Liga

Zgłoszenie: po tym jak Liga dostała bardziej "dynamiczne/estymowane" live wyniki (live event_total,
live overall rank, live projekcja składu — patrz wcześniejsze sesje), Ćwiartki zaczęły pokazywać
**inną liczbę punktów** dla tej samej, trwającej kolejki. Przyczyna: `quarterScores`/`gwPoints` w
`quarter-wins/route.ts` liczyły się z `/entry/{id}/history/` — ten endpoint FPL dla
TRWAJĄCEJ/świeżo zakończonej (ale jeszcze nie potwierdzonej bonusami) kolejki zostaje w tyle
dokładnie o tyle punktów, ile jeszcze nie doliczono bonusów. Sprawdzone na żywo: GW3 pokazywała
`50 pkt` z historii, a `53 pkt` (już z bonusami) w live standings Ligi (`event_total`) — **jedynym**
źródłem FPL z faktycznie live wynikiem (potwierdzone też wcześniej przy `estimateLiveOverallRank`).

Naprawione u źródła: dla `latestGw` backend podmienia punkty z historii na żywy `event_total` ze
standings (już i tak cache'owanych, zero dodatkowego kosztu) — zarówno w liczeniu Ćwiartek
(Top3, zwycięzca bieżącej ćwiartki), jak i w `gwPoints` (czyli automatycznie też wykres Sezonu i
rankingi Bench/Stabilność w Statystykach dostają tę samą korektę — ta sama liczba wszędzie w
appce, nie tylko w Ćwiartkach). Starsze, już zamknięte kolejki zostają na historii FPL bez zmian —
tam jest ona w 100% wiarygodna, nic tam nie trzeba poprawiać. Zweryfikowane: Damian Cichocki GW3
poszedł z `50` → `53` pkt, sumując się do `204` — dokładnie tyle, ile total w Lidze.

### Stan repo na koniec sesji 3

`main` ma wszystko z tej sesji zmergowane (PR #13–#16), working tree czysty, brak lokalnych
branchy WIP. Front-end dashboardu (baner GW, Statystyki/Sezon/Porównaj/Liga next-gen, Ownership
drill-down, spójność live-wyników Ćwiartki↔Liga) jest w stabilnym, zamkniętym stanie. Kolejna
sesja może zacząć od Phase 2 z ROADMAP.md (RAW → STAGING → FEATURES, patrz plan w sekcji sesji 1
niżej) — nic z front-endu nie czeka w tej chwili na dokończenie.

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

### Zdjęcia zawodników — sprawdzone, zostają bez zmian

Padło pytanie, czy przełączyć się na inne API zdjęć zawodników, bo część zdjęć wygląda nieaktualnie.
Sprawdzone w kodzie (`playerPhotoUrl()` w `_lib/fpl.ts`): już teraz korzystamy z oficjalnego CDN
Premier League (`resources.premierleague.com/premierleague/photos/players`) — dokładnie tego
samego źródła, którego używa sama oficjalna appka FPL. Nieaktualne zdjęcia niektórych zawodników
(zwłaszcza nowych transferów) to opóźnienie po stronie działu mediów PL, nie wynik naszego
cache'owania (bootstrap odświeżamy co 15 min) ani gorszego API. **Decyzja: zostawiamy jak jest** —
zamiana na inne źródło (Sofascore, API-Football, Transfermarkt) wymagałaby dopasowywania
zawodników po nazwisku zamiast po FPL `element`/`code`, co przy ~700 zawodnikach w lidze grozi
podłożeniem złego zdjęcia pod złego gracza. Nie wracać do tego tematu bez nowego argumentu.

### Stan repo na koniec sesji 2

`main` ma wszystko z tej sesji zmergowane (PR #6–#12), working tree czysty, brak lokalnych
branchy WIP. Kolejna sesja może zacząć od razu od Phase 2 z ROADMAP.md (RAW → STAGING →
FEATURES, patrz plan niżej w sekcji sesji 1) — front-end dashboardu jest w stabilnym,
zamkniętym stanie, nic tu nie czeka w tej chwili na dokończenie.

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
