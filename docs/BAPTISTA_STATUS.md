# BAPTISTA — Stato verificato

Ultimo aggiornamento: 2026-10-10.

## Current phase

**Phase 04 — ADVANCED DOMAINS: in_progress, prima tranche (Cucina + Finanze manuali + UX stanze).** Avviata su mandato esplicito dell'utente (2026-10-10) con i gate 02/03 ancora in attesa del walkthrough autenticato (D27). Vision/intake, storage privato, router AI e Guardaroba **non ancora implementati**.

| Fase | Stato | Nota |
| --- | --- | --- |
| 00 Setup | completed | gate superato 2026-10-09 |
| 01 Database | completed | test isolati PGlite 27/27 + migration applicate al progetto condiviso |
| 02 Auth/Household | in_progress (gate) | codice completo; test multiutente a livello DB passati; **manca walkthrough browser con 2 utenti reali** |
| 03 Core domains | in_progress (gate) | codice, migration e test DB/unit passati; **manca walkthrough browser autenticato** |
| 04 Advanced domains | in_progress | Cucina e Finanze manuali + test; migration 04 applicate in remoto 2026-10-10; mancano vision (scontrini), storage, ai_settings/ai_runs/router, Guardaroba |
| 05–07 | not_started | — |

Repository: `C:\webdev_local\baptista`. Git inizializzato; **nessun commit ancora creato** (in attesa dell'utente).

## ⚠️ Incidente aperto — `mosquitos` non esposto (GuideApp)

Dal 2026-10-09 il Data API espone `public, graphql_public, baptista` e risponde PGRST106 per `mosquitos`. Causa: `pgrst.db_schemas=public,mosquitos` era un override sul ruolo `authenticator`; dopo «Reset override» in Dashboard la lista salvata non conteneva `mosquitos`. Il ripristino via SQL è stato bloccato dal sistema permessi (modifica di risorsa condivisa). **Fix manuale richiesto all'utente:** Dashboard → Exposed schemas → `public, graphql_public, mosquitos, baptista` → Save. Ultima verifica (2026-10-09 ~19:30 UTC): ancora PGRST106. Da ora la Dashboard è l'unica fonte di `db_schemas`; non reimpostarlo sul ruolo.

## Completed

### Phase 00 — 2026-10-09

Repository inizialmente con solo `docs/`. Versioni bloccate (pin esatti, lockfile): Next.js 16.4.0 (Turbopack), React 19.3.0, TypeScript 5.9.3 strict (`allowJs: false`), Tailwind CSS 4.3.3, ESLint 9.39.5 + eslint-config-next 16.4.0, `@supabase/supabase-js` 2.117.3, `@supabase/ssr` 0.12.7, `server-only` 0.0.1, `zod` 4.6.5; dev: `@electric-sql/pglite` 0.5.8, `tsx` 4.23.15. Node 22.11.0, Supabase CLI 2.120.0 (npx).

### Phase 01 — 2026-10-09

Migration (stessi ID in locale e remoto):

| Versione | Contenuto |
| --- | --- |
| `20261009164314_baptista_create_schema` | schema `baptista`; USAGE solo `authenticated`/`service_role`; niente `anon`; nessun default privilege |
| `20261009192058_baptista_foundations` | `households`, `household_members`, `profiles`; RLS; helper definer `is_active_member`, `is_household_owner`, `has_pending_invite`; procedure `create_household` (bootstrap atomico), `update_household` (owner + versione), `invite_member`, `respond_to_invite`, `remove_member`, `transfer_ownership`, `household_directory`; trigger ultimo owner (deferred) e validazione timezone |

Nota: il SQL applicato in remoto è identico ai file salvo alcuni banner di commento.

### Phase 02 — codice (gate pendente)

Login email/password con errore neutro, registrazione con conferma email (`/auth/conferma`, solo redirect relativi), logout che svuota il cookie household; profilo Baptista creato in modo idempotente al primo accesso (mai copiato da GuideApp); onboarding `/benvenuto` (crea casa / accetta inviti); `/casa`: membri, invito per email di utenti Baptista esistenti, accettazione, rimozione/uscita, trasferimento proprietà, nome/fuso, profilo; selettore casa (cookie = solo hint, rivalidato a ogni richiesta). `ExecutionContext` server (`lib/households/context.ts`) usato da ogni pagina e Server Action.

### Phase 03 — codice (gate pendente)

Migration `20261009192227_baptista_core_domains`: `calendar_events` (timed/all-day con fine esclusiva), `tasks`, `notes` (nota o checklist JSONB validata), `goals`, `habits`, `habit_entries` (FK composita, una al giorno, niente giorni futuri), `events`, `observations`, `observation_refreshes`; RLS `can_access` (private = proprietario membro attivo, household = membri attivi); grant di colonna (identità mai aggiornabili); eventi atomici via trigger; propagazione visibilità/cancellazione ai derivati; detector SQL (upcomingCalendar 24h, overdueTasks, missedHabits settimana conclusa, habitProgress, goalProgress su variazione registrata) con clock esplicito; ranking versionato; `refresh_observations` (membro, lock, throttling 30s); `dismiss_observation`.

UI (italiano, mobile-first): Home (saluto, avatar, «In evidenza» top 3 deterministico con «Ignora», oggi, abitudini settimana con «Oggi», obiettivi), Calendario (30 giorni, crea/modifica/elimina, tutto il giorno), Liste (attività con scadenza/completa/riapri/modifica, note e liste con checklist), Abitudini (settimana lun–dom, tocco per giorno, pausa), Obiettivi (progresso derivato), Baptista (segnaposto fase 05). Eliminazioni con doppio tocco; concorrenza ottimistica con `version`; refetch dopo ogni mutazione (`revalidatePath`).

Mappa codice: `app/(auth)`, `app/(app)/*`, `app/benvenuto`, `app/auth/conferma`, `app/actions/{auth,households,domains}.ts`; `services/{households,calendar,tasks,notes,goals,habits,intelligence,shared}.ts` (server-only); `lib/{dates,errors,actions}.ts`, `lib/auth/session.ts`, `lib/households/{context,permissions}.ts`, `lib/intelligence/briefing.ts`, `lib/db/types.ts`; `components/{ui,forms,bottom-nav}.tsx`; `supabase/tests/{harness,db.test}.ts`.

### Phase 04 — prima tranche (2026-10-10, gate non raggiunto)

Migration (testate su PGlite, applicate al progetto condiviso il 2026-10-10 su conferma utente; file rinominati con la versione server):

| File | Contenuto |
| --- | --- |
| `20261009224445_baptista_kitchen.sql` | `food_items` (scadenza esplicita/stimata con provenienza, nutrizione per 100 g, `closed_at` da trigger, eventi `food.item_added/consumed/discarded`), notes kind `recipe`, `meals` (items JSONB validato), `diet_entries` (solo private), `profiles.kcal_target`, `json_number`, fix `valid_checklist`, detector v3 con `food_expiry`/`old_food` |
| `20261009224541_baptista_finance.sql` | `expense_categories` (+ `ensure_expense_categories`), `expenses`, `expense_items` (RLS dal parent), `budgets`, `finance_goals` (preventivo a voci, `initial_estimate`), `watchlist_items` (per utente, max 30) |

App: stanze Cucina e Finanze attive (D25, D26). Cucina: `/stanze/cucina/dispensa` (+ `[id]`), `/aggiungi?tipo=alimento|ricetta|pasto`, `/ricette/[id]`, `/pasti/[id]`, `/dieta?giorno=`. Finanze: `/stanze/finanze/spese?mese=` (+ `[id]`, modale Manuale/Scontrino), `/budget` (+ `/obiettivi/[id]`), `/watchlist?periodo=`. Home mostra il cruscotto della stanza (Cucina: da controllare + calorie di oggi; Finanze: mese, budget, progetti). Vecchi URL (`/stanze/cucina/scadenze`, `/stanze/finanze/scontrini`, stanza nuda) reindirizzano alla prima pagina della stanza. UX stanze: pillola stanza nell'intestazione su ogni pagina, stanza ricordata visitando una sua pagina, voci centrali animate al cambio stanza.

Mappa codice: `services/{food,meals,diet,finance,watchlist}.ts`, `app/actions/{kitchen,finance}.ts`, `lib/{food,nutrition,money,openfoodfacts,openfoodfacts-parse}.ts`, `components/{kitchen,finance,food-lookup,modal,tradingview,room-pill,room-dashboards}.tsx`, `supabase/tests/phase04.test.ts`, `lib/kitchen-finance.test.ts`.

Non ancora fatto in fase 04: bucket privati e policy storage, `visual_intakes`, `ai_settings`/`ai_runs`, adapter/registry/router vision e image_processing, scansione scontrino reale (la scheda «Scontrino» mostra uno stato onesto «non ancora attiva»), Guardaroba (resta segnaposto), smoke provider e prove rete `local_only`.

## Known issues / blockers

- **Nessun provider AI configurato** (`AI_GATEWAY_API_KEY`/`LOCAL_AI_*` assenti): blocca vision scontrini e Guardaroba con classificazione; CRUD manuale non bloccato.
- **TradingView:** URL dell'iframe non documentato ufficialmente (vedi SECURITY); verificato solo che il loro script attuale costruisce lo stesso URL, non il rendering in browser.
- **Open Food Facts:** limiti di frequenza del servizio (ricerca ~10/min); nessun rate limit lato Baptista.

- **Incidente `mosquitos`** (sopra) — azione utente.
- **Gate 02/03 — walkthrough autenticato non eseguito dall'agente:** SECURITY vieta utenti di test nell'Auth condiviso, quindi i flussi autenticati (login, crea casa, invito/accettazione con 2 account, CRUD dei domini, briefing) vanno provati dall'utente con account reali. I vincoli sottostanti sono coperti dai test DB.
- **Auth condiviso con GuideApp (manuale, Dashboard → Authentication → URL Configuration):** aggiungere ai Redirect URLs `http://localhost:3000/auth/conferma` (e l'URL di produzione quando esisterà) senza togliere quelli di GuideApp. Senza questo, il link di conferma della registrazione punta al Site URL di GuideApp. I template email sono quelli di GuideApp. Il login con account già confermati funziona.
- **Advisors Supabase su `baptista`:** solo voci attese (`observation_refreshes` senza policy = nessun accesso client; procedure `security definer` eseguibili da `authenticated` per design). Gli helper `is_active_member`/`is_household_owner`/`has_pending_invite`/`can_access` sono chiamabili via RPC ma rivelano solo dati del chiamante.
- **Advisors su GuideApp (non toccati, solo segnalati):** 5 tabelle `public` senza RLS (`cancel_logs`, `external_modification_requests`, `whatsapp_conversations`, `ticketinghub_booking_events`, `whatsapp_flows`), 6 view `SECURITY DEFINER`, funzioni definer eseguibili da `anon`, leaked password protection disattivata.
- **Inviti:** un owner può dedurre se un'email ha un account Baptista (errore neutro unico, limitato agli owner) — limite accettato (D18).
- **npm audit:** 5 high in tooling lint (micromatch/fast-glob via eslint-config-next); non nel bundle.
- Chiave pubblica legacy `anon` (nessuna `sb_publishable_`): consigliato crearla.

## Architectural decisions / deviations

| ID | Decisione | Stato |
| --- | --- | --- |
| D01–D07 | vedi versioni precedenti (standalone, schema isolato, fasi, selected_members riservato, membership, proposte persistite) | invariati |
| D08 | TypeScript strict invece di JavaScript (utente) | implementato |
| D09 | Next 16 `proxy.ts` per refresh sessione, nessuna autorizzazione | implementato |
| D10 | Connessione verificata via `/auth/v1/health` | implementato |
| D11 | Schema creato sul progetto condiviso prima dell'ambiente isolato (utente) | implementato |
| D12 | **Italiano lingua del prodotto** in tutte le parti visibili (utente); testi detector in italiano senza dipendere dal locale DB | implementato |
| D13 | `cacheComponents` disattivato: tutte le pagine sono per-utente e dinamiche | implementato |
| D14 | Detector e ranking in SQL deterministico (definer, clock esplicito, non chiamabile dai client) invece che servizi TS: nessuna chiave secret lato server e `authenticated` non deve scrivere osservazioni; briefing in TS puro | implementato |
| D15 | Ambiente isolato = PGlite + shim ruoli/`auth` (Docker assente). Limite: non copre PostgREST/GoTrue reali | implementato |
| D16 | Fasi 01–03 in una sessione su mandato esplicito dell'utente (deroga a «una fase per sessione») | registrato |
| D17 | Eventi emessi solo da trigger DB nella stessa transazione | implementato |
| D18 | Invito per email risolto sul server solo verso utenti con profilo Baptista; errore neutro | implementato |
| D19 | Tabella di supporto `observation_refreshes` | implementato |
| D20 | **Stanze** (Soggiorno, Cucina, Finanze, Guardaroba): selettore a 4 riquadri in Home con animazione verso l'alto a sinistra, tinta di sfondo per stanza, voci centrali della barra per stanza; preferenza in cookie `baptista_room` (non è un input di autorizzazione). Cucina/Finanze/Guardaroba: pagine «in arrivo» (`/stanze/...`) | implementato |
| D22 | **Obiettivi con direzione**: `start_value` + formula unica `goal_percent` (SQL) replicata in `lib/goals.ts`; parsing numeri italiani. Bug corretto: «perdere peso» 85→70 kg risultava completato (85/70) | implementato |
| D23 | **In evidenza grafico**: card principale + 2 riquadri con visual dai dati del detector (anello abitudini/obiettivi, contatore giorni di ritardo, tessera data per eventi), «×» per ignorare | implementato |
| D24 | **Categorie** per abitudini e obiettivi: 10 di sistema + personali per utente, colore che si riflette su anelli (pagina, Home, In evidenza), filtro per categoria, gestione in `/abitudini/categorie`; leggibili anche tramite record condivisi (nome+colore), mai elencate né assegnabili da altri | implementato |
| D25 | **Cucina** (utente 2026-10-10): Dispensa con scadenze integrate (niente pagina Scadenze), Aggiungi = Alimento/Ricetta/Pasto, Dieta = conta calorie privato con Open Food Facts | implementato (tranche 1) |
| D26 | **Finanze** (utente 2026-10-10): scontrino = modale dentro Spese; Budget = budget mensili + progetti di spesa con preventivo; Watchlist personale con TradingView (solo iframe sandbox, mai script nell'origine) | implementato, scansione in attesa di vision |
| D27 | Fase 04 avviata su mandato utente con gate 02/03 in attesa del walkthrough autenticato (deroga all'ordine dei gate, come D16) | registrato |
| D21 | **Modulo Aggiungi** con 4 varianti (Da fare, Evento, Nota, Lista) al posto di «Liste»; `/liste` reindirizza; dettagli in `/aggiungi/attivita/[id]`, `/aggiungi/note/[id]`. Calendario a griglia mensile con giorni apribili; abitudini/obiettivi con anelli colorati | implementato |

## Evidence log

2026-10-09 — Phase 00: `npm ci`, lint, typecheck, build ok; health 200 su Supabase reale; nessun segreto nel bundle; import `server-only` da client fallisce la build come atteso.

2026-10-09 — Fasi 01–03, Windows 11, Node 22.11.0:

| Comando / scenario | Esito |
| --- | --- |
| `npm run test:db` (PGlite, tutte le migration da zero, ruoli reali `anon`/`authenticated`) | **27/27 pass** |
| …copertura | anon negato; bootstrap atomico; profilo/timezone obbligatori; estraneo non vede casa/membri/directory; invitato pending vede solo il nome; scritture dirette su membership/household negate; inviti solo owner + errore neutro; profili self-only; update casa versionato; ultimo owner protetto + trasferimento; record household vs private; owner/autore non falsificabili né riassegnabili; nessuna scrittura cross-household; visibilità solo dal proprietario; vincoli (fine>inizio, all-day, target>0, 1..7, checklist); entry duplicata/futura/estranea negate; eventi atomici, rollback senza evento, client non scrive eventi; detector con testi italiani; privato resta privato; refresh ripetuto senza duplicati; ranking stabile; dismissal persistente e risoluzione; goal solo su variazione; settimana con cambio ora legale e a cavallo di mese; refresh solo membri + throttling; membro revocato perde record/eventi/osservazioni; passaggio a privato rimuove derivati condivisi |
| `npm run test:unit` (date/fusi DST, briefing) | **8/8 pass** |
| `npm run lint`, `npm run typecheck`, `npm run build` | ok (17 route) |
| `apply_migration` foundations + core_domains sul progetto condiviso | success (`20261009192058`, `20261009192227`) |
| Verifica post-apply | 12 tabelle `baptista` tutte con RLS; 0 privilegi `anon`; 0 funzioni eseguibili da `anon`; `public` ancora 39 tabelle |
| Data API come anon su `baptista` (tabelle e RPC) | 42501 «permission denied for schema baptista» |
| **npm dev check** (server dev già attivo su :3000, codice corrente) | `/accedi`, `/registrati` 200 in italiano (`lang="it"`); tutte le route protette 307 → `/accedi`; `/auth/conferma?next=//evil.com` → `/accedi?errore=link`; pagina inesistente 404; `/api/health` 200 `phase: "03"`, Supabase ok; log dev senza errori |

2026-10-09 — Revisione UX (D20, D21): lint, typecheck, build ok; `npm test` 27/27 DB + 9/9 unit (aggiunto test griglia mensile); dev su :3000: nuove route `/aggiungi`, `/calendario?mese=&giorno=`, `/stanze/...` rispondono (307 → `/accedi` senza sessione), `/liste` reindirizza; log dev pulito dopo le correzioni. Verifica visuale via browser non eseguita (estensione Chrome non connessa).

2026-10-09 — Obiettivi e In evidenza (D22, D23): dato reale ispezionato (goal 85→70 kg mostrato al 121%); migration `20261009212333_baptista_goal_direction` (start_value con backfill, vincoli, `goal_percent`, payload evento e detector v2) e `20261009212442_baptista_function_grants` (revoca EXECUTE a anon/public su `goal_percent`, trovata nel controllo post-apply). Remoto: goal ora 85→70, 0%; nessuna funzione eseguibile da anon. `npm test`: 30/30 DB (nuovi: obiettivo decrescente, vincoli, nessun privilegio anon — verificato che fallisce senza la correzione) + 14/14 unit (formula, parsing numeri italiani, visual briefing); lint/typecheck/build ok; dev :3000 senza errori.

2026-10-09 — Categorie (D24): migration `20261009215527_baptista_categories` applicata (10 categorie di sistema, RLS, nessun privilegio anon). `npm test` 36/36 DB (nuovi: visibilità sistema/personali, niente sistema da client, colori/duplicati, assegnazione solo sistema o proprie, categoria personale visibile tramite abitudine condivisa ma non elencata, privata non trapela, eliminazione → senza categoria) + 16/16 unit; lint/typecheck/build ok; dev :3000 senza errori.

2026-10-10 — Fase 04 tranche 1, Windows 11, Node 22.11.0:

| Comando / scenario | Esito |
| --- | --- |
| `npm run test:db` (ora `supabase/tests/*.test.ts`) | **53/53 pass** (36 precedenti + 17 fase 04) |
| …copertura fase 04 | alimenti condivisi/privati, `closed_at` non scrivibile, eventi food; vincoli (quantità, barcode, stima senza base, kcal, storage), scrittura cross-household negata; ricette; validazione pasti incl. chiavi mancanti; diario sempre privato e snapshot dopo eliminazione pasto; `kcal_target` self-only; detector: oggi/domani/data/superata, oltre 2 giorni nulla, stima con testo cauto e confidenza 0,5, esplicita prevale, oldFood solo frigo fresco senza data, privato resta privato, consumo risolve, cambio data rivaluta con una sola scheda; categorie create una volta e solo da membri, duplicati case-insensitive; spese private e loro righe invisibili agli altri; valuta/totale/etichetta, categoria di altra casa rifiutata, categoria eliminata → spesa senza categoria; budget unici per categoria/valuta e totale; preventivo iniziale conservato e non scrivibile, voci validate, spese collegate; watchlist personale, simboli validati, limite 30. Regressione: checklist con chiavi mancanti ora rifiutata (prima accettata) |
| `npm run test:unit` | **23/23 pass** (nuovi: scadenze, porzioni/totali con macro sconosciute, diario e obiettivo, somme al centesimo per valuta, mesi, preventivo da testo, parsing Open Food Facts) |
| `npm run lint`, `npm run typecheck`, `npm run build` | ok (31 route) |
| Open Food Facts reale (curl, stesso UA/campi del client) | prodotto per codice 200 `status:1` con `energy-kcal_100g` ecc.; codice inesistente `status:0`; ricerca `cgi/search.pl` risponde con `products[]` |
| TradingView | script ufficiale scaricato: costruisce l'iframe `https://www.tradingview-widget.com/embed-widget/<widget>/` con impostazioni nell'hash → usato direttamente |
| Dev :3000 (server dell'utente) | nuove route 307 → `/accedi` senza sessione; `/api/health` 200 |
| Revisione pre-apply remota (sola lettura) | storia remota: ultima `20261009215527_baptista_categories`, nessuna collisione; `baptista.notes` 0 righe (nessuna violazione del nuovo `valid_checklist`); `public` 49 tabelle/viste (baseline per il confronto post-apply) |

| Apply remoto (MCP `apply_migration`, conferma utente) | `20261009224445_baptista_kitchen`, `20261009224541_baptista_finance` success; SQL remoto uguale ai file salvo banner di commento |
| Verifica post-apply | 22 tabelle `baptista`, 0 senza RLS; 0 grant di tabella e 0 funzioni eseguibili da anon/PUBLIC; `public` 49 tabelle/viste (invariato); `npm run test:db` 53/53 dopo la rinomina |
| Advisors security | nessuna voce nuova per `baptista` (solo quelle attese: `observation_refreshes` senza policy, procedure definer eseguibili da authenticated); voci GuideApp invariate |

Non eseguiti: walkthrough browser autenticato (anche per Cucina/Finanze); rendering reale dei grafici TradingView e del modale; vision.

## Handoff

1. Migration fase 04 applicate (fatto).
2. Utente: walkthrough autenticato di Soggiorno (gate 02/03) e ora di Cucina/Finanze; `mosquitos` e redirect `/auth/conferma` ancora da sistemare in Dashboard.
3. Fase 04 tranche 2: configurare un provider (AI Gateway o endpoint privato) → `ai_settings`/`ai_runs`, registry/router vision, bucket `baptista-receipts` privato con policy, `visual_intakes`, scansione scontrino nel modale Spese con review e conferma atomica; poi Guardaroba (originale/derivato, segmentazione separata). Approfondimento conta calorie con l'utente (es. lettore codice a barre da fotocamera).

## Regole di aggiornamento

Al termine di ogni sessione significativa: data, fase corrente, stato not_started/in_progress/blocked/completed, file/commit reali, migration ID effettivi, comandi/scenari con esiti, configurazioni manuali, blocchi e prossimo handoff. Non segnare completed se manca un gate. Conservare decisioni motivate e sostituire lo stato corrente obsoleto, evitando registri paralleli.
