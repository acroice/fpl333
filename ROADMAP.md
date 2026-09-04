# DS → ML Engineer → MLOps / GenAI Engineer
## Google Cloud + FPL333 Career Roadmap

### Główny cel

Rozwijam się jako Data Scientist w kierunku:

**Data Scientist → ML Engineer → MLOps / GenAI Engineer**

Priorytetem jest Google Cloud Platform, ponieważ technologie Google Cloud są wykorzystywane w moim środowisku zawodowym i mogą być istotnym kierunkiem mojego dalszego rozwoju oraz przyszłych rekrutacji do zespołów IT / Data / AI.

Nie chcę kolekcjonować przypadkowych kursów.

Każdy etap nauki powinien dawać jednocześnie:

1. wiedzę,
2. praktyczne doświadczenie,
3. credential / Skill Badge tam, gdzie ma to wartość,
4. implementację w FPL333,
5. konkretny element portfolio, który można opisać w CV lub na GitHubie.

---

## GŁÓWNY CEL CERTYFIKACYJNY

### Google Cloud Professional Machine Learning Engineer

Oficjalna ścieżka: https://www.skills.google/paths/17

Informacje o certyfikacji: https://cloud.google.com/learn/certification/machine-learning-engineer

To jest główny długoterminowy credential.

Nie trzeba zdawać egzaminu od razu. Najpierw praktyczne doświadczenie poprzez: Google Skills + praca zawodowa + FPL333. Dopiero później bezpośrednie przygotowanie do egzaminu Professional Machine Learning Engineer.

---

## ZASADA CAŁEJ ROADMAPY

Każdy większy temat realizowany jest w modelu:

```
LEARN → GOOGLE LAB → BUILD IN FPL333 → TEST → DEPLOY → DOCUMENT → UNDERSTAND
```

Nie przechodzimy dalej tylko dlatego, że obejrzano kurs. Trzeba potrafić odpowiedzieć:

- co zrobiono,
- dlaczego,
- jak działa architektura,
- jakie były alternatywy,
- jak system zachowa się w produkcji,
- co zrobił AI coding agent,
- co dałoby się poprawić samodzielnie.

---

## PHASE 0 — Professional AI Development (Tydzień 1)

**Cel:** przejść z „terminal + AI robi kod” do AI-assisted professional development.

**Nauka:** VS Code, Git, GitHub, branches, Pull Requests, git diff, testing, code review, Claude Code / Codex, context engineering.

**FPL333 workflow:**

```
TASK → BRANCH → AI AGENT → CODE → GIT DIFF → TESTS → REVIEW → COMMIT → PR → MERGE
```

**Definition of Done** — potrafię bez AI: utworzyć branch, sprawdzić diff, cofnąć zmianę, rozwiązać prosty conflict, zrobić commit, stworzyć PR, wyjaśnić zmiany wygenerowane przez agenta.

---

## PHASE 1 — Google Cloud Foundation (Tydzień 2)

**Priorytet:** nie zostać Cloud Engineerem, ale dobrze rozumieć: GCP projects, IAM, service accounts, authentication, billing, Cloud Storage, BigQuery, Cloud Run, logging, secrets.

**FPL333 LAB — architektura:**

```
FPL API → Python → GCP → BigQuery
```

Pierwszy milestone: automatyczne pobieranie danych FPL i zapis do BigQuery.

**CV value:** „Built a cloud-based ingestion pipeline integrating external REST APIs with Google BigQuery.”

---

## PHASE 2 — Data Engineering for ML (Tydzień 3)

**Nauka:** BigQuery, SQL, data ingestion, data quality, feature tables, partitioning, scheduled workloads.

**FPL333 — warstwy:**

```
RAW → STAGING → FEATURES
```

Przykład: `raw_players`, `raw_fixtures`, `raw_gameweeks` → `player_gameweek_features`.

**Definition of Done:** pipeline można uruchomić ponownie bez niszczenia danych; dane mają podstawową walidację jakości.

---

## PHASE 3 — Machine Learning Engineering (Tydzień 4–5)

**Google Skills — main path:** Professional Machine Learning Engineer Certification Learning Path — https://www.skills.google/paths/17

Priorytet modułów: ML development, BigQuery / data preparation, Vertex AI, model training, model evaluation, experiments, production ML.

**FPL333 MODEL #1 — FPL Expected Points Model**

Problem: PREDICT `player_points_next_GW`.

Features: minutes, starts, xG, xA, shots, chances_created, fixture_strength, opponent_strength, home_away, form, price, historical_points.

Szczególny nacisk na: temporal validation, data leakage, baselines, feature engineering, hyperparameter tuning, model evaluation, reproducibility.

**Definition of Done:** baseline + model ML, porównanie performance, umiejętność wyjaśnienia dlaczego model jest lepszy/gorszy.

---

## PHASE 4 — Vertex AI / Production ML (Tydzień 6–7)

**Google Skills:** kontynuacja ścieżki Professional Machine Learning Engineer, nacisk na: Vertex AI, training, experiments, evaluation, model management, pipelines, deployment.

**Rekomendowany skill:** Machine Learning Operations (MLOps) with Vertex AI: Model Evaluation — https://www.skills.google/paths/1834/course_templates/1080

**FPL333 — lifecycle modelu w GCP:**

```
BigQuery → training → evaluation → model version → predictions
```

Każdy eksperyment powinien mieć minimum: `model_version`, `training_date`, `data_window`, `feature_version`, `parameters`, `metrics`.

**CV value:** „Developed and operationalized ML models on Google Cloud using BigQuery and Vertex AI.”

---

## PHASE 5 — ML Pipelines / MLOps (Tydzień 8)

**Must do Google Skill:** Orchestrate ML Workflows with Agent Platform — https://www.skills.google/course_templates/1667

Tematy: Vertex AI Pipelines, Kubeflow Pipelines, Google Cloud ML orchestration, automated ML workflows.

**FPL333 pipeline:**

```
NEW DATA → VALIDATION → FEATURE ENGINEERING → TRAINING/INFERENCE → EVALUATION → PREDICTIONS → BIGQUERY
```

**Definition of Done:** system generuje nowe predykcje bez ręcznego uruchamiania notebooka.

---

## PHASE 6 — CI/CD + Serving (Tydzień 9)

**Nauka:** GitHub Actions, Docker, Cloud Run, CI/CD, testing, environment variables, Workload Identity, logging.

**FPL333 API:** `GET /predictions`, `GET /players/{id}`, `GET /recommendations`.

**Deployment:**

```
GitHub → CI → tests → Docker → Cloud Run
```

**Frontend:**

```
Vercel → Cloud Run API → BigQuery / predictions
```

**CV value:** „Implemented automated CI/CD and containerized ML inference services using GitHub Actions and Cloud Run.”

---

## PHASE 7 — Decision Science (Tydzień 10)

Tu projekt zaczyna wyróżniać się na tle tutoriali. Nie tylko `predict FPL points`, ale `OPTIMIZE DECISIONS`.

**FPL Decision Engine — inputs:** expected points, expected minutes, fixtures, player price, budget, free transfers, transfer costs, current squad, global ownership, local ownership, top-3 ownership.

System powinien rozróżniać BEST PLAYER od BEST DECISION GIVEN MY LEAGUE POSITION.

---

## PHASE 8 — Monte Carlo / League Optimization (Tydzień 11)

Najbardziej portfolio-worthy element projektu.

**Objective:** MAXIMIZE `P(win local league)` zamiast wyłącznie MAXIMIZE `expected FPL points`.

**Nauka:** Monte Carlo, simulation, probability distributions, variance, risk, optimization.

**FPL333:** symulacja wielu możliwych przyszłości sezonu — bierze pod uwagę current standings, points gap, remaining gameweeks, player ownership, captain overlap, expected points, uncertainty, differentials.

Przykład: SAFE STRATEGY → P(win league) = 18%; AGGRESSIVE STRATEGY → P(win league) = 27%.

**Portfolio value:** główny element README projektu.

---

## PHASE 9 — Generative AI / LLMOps (Tydzień 12–13)

**Google learning path — must do:** Deploy and Manage Generative AI Models — https://www.skills.google/paths/1283 (development, deployment, monitoring, MLOps, Vertex AI lifecycle generative AI).

**Google skill — must do:** Machine Learning Operations (MLOps) for Generative AI — https://www.skills.google/course_templates/927

**Nauka:** Gemini / foundation models, Vertex AI, structured outputs, tool calling, context engineering, LLM evaluation, observability, LLMOps, cost management.

**Ważna zasada:** LLM NIE przewiduje FPL samodzielnie.

```
USER → LLM → TOOLS → (ML MODEL, BIGQUERY, LEAGUE DATA, SIMULATIONS) → LLM → EXPLANATION / RECOMMENDATION
```

LLM jest warstwą reasoning/interface. ML i dane pozostają źródłem prawdy.

---

## PHASE 10 — FPL333 AI Agent (Tydzień 14)

**FPL333 Intelligence Agent.**

Przykład:

> USER: „Mam 1 FT, 1.2m w banku i tracę 37 punktów do lidera. Co robimy?”
>
> AGENT: pobiera squad → pobiera league situation → pobiera predictions → uruchamia Decision Engine → pobiera simulations → generuje rekomendację.

**Przykładowy output:**

```
RECOMMENDED TRANSFER
Palmer → Saka

Expected gain next 4 GW: +7.3 points
Local league ownership: Saka 21%
Top-3 ownership: 0%

Estimated impact:
P(win league) before: 19%
P(win league) after: 24%

Risk: Medium
Alternative: ...
```

---

## Google Credential Strategy

Nie chodzi o 30 losowych badges — spójna historia.

**Level 1** — Google Skills / Skill Badges: BigQuery, Vertex AI, ML, MLOps, ML Pipelines, Model Evaluation.

**Level 2** — Generative AI: Deploy and Manage Generative AI Models; Machine Learning Operations for Generative AI.

**Level 3 — Main certification:** Google Cloud Certified: Professional Machine Learning Engineer.

---

## CV Strategy

Nie: „Created a Fantasy Premier League website.”

Tak:

> **FPL333 — End-to-End ML & GenAI Decision Platform**
>
> Designed and developed an end-to-end ML decision platform on Google Cloud for Fantasy Premier League optimization.
>
> Architecture: Python, BigQuery, Vertex AI, Cloud Run, Docker, GitHub Actions, Vercel.
>
> Implemented: automated data ingestion, ML feature pipelines, expected-points prediction models, model evaluation and versioning, automated ML pipelines, cloud inference, CI/CD, Monte Carlo league simulations, decision optimization, LLM tool-calling layer.
>
> Developed a league-aware optimization engine using ML predictions and Monte Carlo simulations to maximize the probability of winning a private Fantasy Premier League competition.

---

## GitHub / Portfolio Strategy

README powinno pokazywać:

1. Business problem — how can ML optimize decisions in Fantasy Premier League?
2. Architecture — diagram systemu.
3. Data pipeline — FPL API → BigQuery.
4. ML — features, target, validation, models, metrics.
5. MLOps — experiments, registry, pipelines, CI/CD, monitoring.
6. Decision Engine — transfer optimization.
7. Simulation — probability of winning league.
8. GenAI — LLM tools / agent.
9. Demo — fpl333 web application.
10. Lessons learned — technical decisions, trade-offs, limitations.

---

## AI Coding Rule

Claude / Codex może: analyze, plan, implement, test, review.

Ale przy każdym większym komponencie trzeba potrafić odpowiedzieć **WHY?**

Jeżeli nie da się wyjaśnić kodu wygenerowanego przez AI — zadanie nie jest DONE.

---

## Weekly System

- **LEARN** — maksymalnie kilka godzin teorii.
- **BUILD** — konkretny element FPL333.
- **SHIP** — działający kod.
- **DOCUMENT** — README / architecture / notes.
- **REVIEW** — odpowiedz: Co zbudowałem? Czego się nauczyłem? Co potrafię zrobić bez AI? Czego nadal nie rozumiem? Co zrobił agent? Jak sprawdziłem poprawność jego pracy?

---

## Success Criteria

Po zakończeniu roadmapy — umiejętność samodzielnego wyjaśnienia:

```
FPL API → BigQuery → Feature Engineering → ML Training → Vertex AI → Model Evaluation
→ ML Pipeline → Model Serving → Cloud Run → CI/CD → Decision Engine → Monte Carlo
→ LLM Tools → FPL333 Application
```

Najważniejszym efektem nie jest certyfikat. Efektem jest sytuacja, w której podczas rozmowy rekrutacyjnej można otworzyć projekt i powiedzieć: „To jest system, który zaprojektowałem. Pokażę Ci, jak działa.” Certyfikaty Google Cloud są potwierdzeniem wiedzy wykorzystanej do jego zbudowania.
