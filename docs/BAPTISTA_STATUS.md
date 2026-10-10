# BAPTISTA — Stato verificato

Ultimo aggiornamento: 2026-10-10.

## Current phase

**Phase 04.1 — CONNESSIONI + BAPTISTA DETERMINISTICO: in_progress (D30).** Passi A e B implementati e verificati in locale il 2026-10-10 su mandato esplicito dell'utente («apply the phase 4.1»), con i residui della fase 04 riportati (vedi sotto). Migration `baptista_wardrobe`, `baptista_connections`, `baptista_presentation` **applicate in remoto il 2026-10-10** su conferma dell'utente. Manca il walkthrough browser con account reali, che richiede prima il deploy su Vercel.

**Phase 04 — ADVANCED DOMAINS: in_progress, deterministica (D28).** Tranche 1: Cucina + Finanze + UX stanze (applicata). Tranche 2: Guardaroba manuale con foto private (codice e test pronti, **migration `baptista_wardrobe` in attesa di apply**). Avviata su mandato esplicito dell'utente (2026-10-10) con i gate 02/03 ancora in attesa del walkthrough autenticato (D27). Per D28 router AI, vision e intake passano alla fase 05.

| Fase | Stato | Nota |
| --- | --- | --- |
| 00 Setup | completed | gate superato 2026-10-09 |
| 01 Database | completed | test isolati PGlite 27/27 + migration applicate al progetto condiviso |
| 02 Auth/Household | in_progress (gate) | codice completo; test multiutente a livello DB passati; **manca walkthrough browser con 2 utenti reali** |
| 03 Core domains | in_progress (gate) | codice, migration e test DB/unit passati; **manca walkthrough browser autenticato** |
| 04 Advanced domains | in_progress | deterministica (D28): Cucina/Finanze applicate; Guardaroba pronto, migration da applicare; mancano foto dello scontrino allegata, lettore codice a barre, walkthrough autenticato |
| 04.1 Connessioni + Baptista deterministico | in_progress | codice A+B completo, test DB/unit e build ok (2026-10-10); migration applicate in remoto; deploy Vercel e walkthrough con 2–3 account reali da fare |
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

### Phase 04 — tranche 2: Guardaroba manuale (2026-10-10, gate non raggiunto)

Migration `20261009225721_baptista_wardrobe.sql` (PGlite ok, **non applicata in remoto**): `wardrobe_items` (tipo, colori, fantasia, stagioni, stile, marca, taglia, etichette, note, `original_path`/`thumb_path`, `processed_path` riservato alla fase 05, archiviazione; foto solo nella cartella del caricatore e della propria casa; evento `wardrobe.item_added`), bucket privato `baptista-wardrobe` (10 MB, JPEG/PNG/WebP) e 3 policy su `storage.objects` limitate a quel bucket: scrittura solo in `<casa>/<utente>/<upload>/<file>` da membro attivo; lettura del caricatore o di chi può leggere il capo; cancellazione con la stessa regola della lettura (l'app cancella prima le foto e poi il capo). Nessuna policy di update: oggetti immutabili.

Upload (D29): il browser riduce la foto (lato lungo 2048 px, JPEG, orientamento applicato, EXIF/GPS rimossi sul dispositivo) per restare sotto il limite di 4,5 MB del corpo richiesta su Vercel; il server ricontrolla byte reali (firma JPEG/PNG/WebP, HEIC riconosciuto con messaggio chiaro), 10 MB, 20 megapixel, decodifica con `sharp` e genera la miniatura WebP 800 px senza metadati. Foto servite solo con URL firmati da 10 minuti emessi dopo RLS. `sharp` 0.35.5 aggiunto esplicitamente alle dipendenze; `serverActions.bodySizeLimit` e `proxyClientMaxBodySize` a 11 MB.

UI: `/stanze/guardaroba/capi` (griglia foto, filtri tipo/stagione/colore, archivio), `/capi/[id]` (foto, dettagli, modifica, cambia foto, archivia, elimina), `/aggiungi` (Scatta/Galleria + classificazione a mano), `/categorie` (riepilogo per tipo, stagione, colore); Home Guardaroba con capi della stagione e ultimi aggiunti. Codice: `services/wardrobe.ts`, `app/actions/wardrobe.ts`, `lib/{wardrobe,image-check}.ts`, `components/{wardrobe,wardrobe-grid,photo-picker}.tsx`. `parseForm` ora raccoglie chiavi ripetute (gruppi di checkbox) in array.

### Phase 04.1 — connessioni e Baptista deterministico (2026-10-10, gate non raggiunto)

Entrata con residui della fase 04 riportati su mandato dell'utente (come D27): `baptista_wardrobe` non applicata, foto scontrino, lettore codice a barre, walkthrough.

Migration (PGlite ok, applicate in remoto il 2026-10-10, file rinominati con la versione server): `20261010202428_baptista_connections.sql` — `name_key`, `shopping_items` (solo household, stato `stocked` solo da procedura), `pantry_staples`, colonne `wardrobe_items.acquisition/expense_id`, `goals.habit_id` con sincronizzazione dalle registrazioni, procedure `add_shopping_item`, `stock_shopping_items`, `unstock_shopping_items`, `register_shopping_expense`, `register_wardrobe_purchase`, `mark_wardrobe_owned_before` (min 7), `set_pantry_staple`; eventi shopping/expense/acquisition/staple; refresh non throttled dopo eventi nuovi; detector v4 (domande C1/C2/C4/C5/A‑2, C6, C8, `calendar_overlap`, `food_opened`). `20261010202448_baptista_presentation.sql` — `baptista_presentations` self-only + `record_presentation`.

Passo A (UI): `components/list-accordion.tsx` per tutte le liste (Aggiungi → Liste, nota, ingredienti di ricetta); `components/shopping-list.tsx` in cima alla Dispensa e fissata per prima in Aggiungi → Liste (Alimenti con ricerca OFF e categoria → luogo proposto, Altro; spunta = in dispensa con «Annulla» 30 s; «Tutto in dispensa» + «Aggiungi scadenze»; righe già in dispensa con token `--already`; stella «Abituale» anche sugli alimenti in Dispensa); ricetta «Cosa manca?» (C3, solo spuntati); capo: blocco «L'hai comprato?» (prezzo/data/negozio/visibilità, «Era già mio», «È un regalo», «Cambia risposta»), «Acquistato il … · prezzo» con link alla spesa, vista «Da rispondere» con «Erano già miei» da 7 capi; Aggiungi capo da `?spesa=` (C5); obiettivi «Avanza con un'abitudine» (C9). Codice: `services/shopping.ts`, `app/actions/shopping.ts`, `lib/shopping.ts`, estensioni a wardrobe/goals/food-lookup/openfoodfacts.

Passo B: `lib/baptista/{expressions,select,templates,attention,machine,typing,daily,calculations,view}.ts` e `lib/baptista/scripts/*` (puri); `services/baptista.ts`, `app/actions/baptista.ts`; `components/baptista/{avatar,bubble,options,conversation,thread,room}.tsx`; WebP 192/384 da `scripts/baptista-icons.mjs` (8–20 KB invece di ~1 MB). Home Soggiorno: Baptista al posto di «In evidenza» (battuta/citazione del giorno, 1 conversazione + 2 in coda, frase calma); Home delle altre stanze, Dispensa, Spese e Capi: Baptista della stanza; scheda Baptista: «Chiedi a Baptista» (4 calcoli predefiniti, incluso `spending_comparison`), «Da rispondere», «Fatto di recente».

Scostamenti dal documento di fase: dati OFF salvati come colonne tipizzate invece di `off_snapshot` JSONB; battuta del giorno con 8 voci (1 battuta + 1 citazione per famiglia, finanze, cucina, guardaroba: decisione utente 2026-10-10) invece di 90, nessuna voce per date fisse; «Più tardi» sul capo posticipa di 3 giorni finché la domanda è valida (14 giorni) invece di «una sola volta»; budget C6 calcolato solo sulle spese condivise; C7 (costo stimato, A+) non fatto; `old_food`/`food_opened` hanno script propri, gli altri tipi esistenti (`missed_habit`, `goal_progress`, `upcoming_calendar`) solo informativi.

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
| D28 | **Prima il deterministico** (utente 2026-10-10): la fase 04 si chiude senza AI; router/ai_settings/ai_runs/visual_intakes, lettura scontrini e classificazione guardaroba passano all'inizio della fase 05 (provider: Vercel AI Gateway). Piano, fasi 04/05, AGENT e VISUAL_INTAKE aggiornati | registrato |
| D29 | Foto ridotte nel browser prima dell'upload (limite corpo Vercel 4,5 MB; EXIF/GPS rimossi sul dispositivo); il server rivalida byte e pixel e crea la miniatura senza metadati. L'«originale» conservato è la versione ridotta, non il file della fotocamera | implementato |
| D30 | **Fase 04.1** (utente 2026-10-10): prima della 05, (A) connessioni deterministiche tra stanze (Lista della spesa → Dispensa, «L'hai comprato?» per i capi → Spese, catalogo C1–C14) e (B) strato Baptista senza AI (espressioni in `public/icons/baptista-icons/`, template italiani, micro‑conversazioni a stati, memoria di presentazione per utente, budget di attenzione); In evidenza diventa Baptista (filo a eventi in stile chat) e il Soggiorno apre con una battuta/citazione del giorno; gli altri blocchi informativi restano invariati. Ordine: prima A con interazioni semplici, poi B; solo le 4 espressioni esistenti. Vedi [fase 04.1](phases/PHASE_04_1_CONNECTIONS_AND_BAPTISTA.md) | progettato |
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

2026-10-10 — Fase 04.1, Windows 11, Node 22.11.0:

| Comando / scenario | Esito |
| --- | --- |
| `npm run test:db` | **78/78 pass** (20 nuovi in `supabase/tests/phase041.test.ts`) |
| …copertura | lista solo household e invisibile agli estranei; «Altro» senza dati cibo; aggiunta duplicata somma la quantità (nome e barcode); spunta idempotente con alimento della casa ed evento bulk=false; stato `stocked` non scrivibile dal client; «Tutto in dispensa» solo righe cibo elencate ed evento bulk=true; annulla rifiutato se un alimento è cambiato, riuscito altrimenti; estraneo rifiutato; C1 solo dopo il blocco e solo a chi ha agito, righe solo per importi digitati, risolta dopo la registrazione, seconda registrazione rifiutata; C2 solo all'attore e risolta quando il prodotto entra in lista; C4 solo con kcal note; «già in dispensa» con accenti e sparisce dopo il consumo; abituale suggerito dopo 3 stoccaggi, mai dopo «No», una riga per prodotto, estraneo rifiutato; abituale esaurito raggruppato, C2 tace per gli abituali, sparisce quando è in lista; acquisto capo: domanda solo al proprietario, una spesa privata collegata, replay senza doppioni, senza prezzo nessuna spesa, capo privato altrui e versione vecchia rifiutati; «Erano già miei» rifiutato sotto 7 (anche con id duplicati), su capi altrui, tutto o niente; C5 e capo nato «purchased», spesa privata altrui non collegabile; budget 80% → 100% con spese private escluse; obiettivo collegato segue le registrazioni (anche di altri membri), evento di progresso, progresso manuale rifiutato, obiettivo condiviso su abitudine privata rifiutato; sovrapposizioni entro 48 h con privacy; aperto da 4 giorni; presentazioni self-only, conteggio una volta per finestra, posticipo, nessuna scrittura per altri |
| `npm run test:unit` | **42/42 pass** (15 nuovi: ogni tipo di detector ha uno script e ogni alternativa è completa e senza segnaposti; script del mockup; scelta stabile; nome solo in apertura; esempio abitudine 4/5 e celebrazione; espressioni; macchina a stati; budget di attenzione; battuta del giorno uguale per giorno, senza ripetizioni per N giorni, autore solo per le citazioni; scrittura 30 ms/lettera con pause e massimo 2 s; intestazioni, frase calma, confronto mensile; chiave nome = SQL, luogo da categoria OFF, corrispondenza dispensa, ingredienti mancanti) |
| `npm run check` | ok (35 route) |
| `next start` su :3100 senza sessione | route nuove/aggiornate 307 → `/accedi`; `/icons/baptista-icons/baptista-alert-192.webp` 200; `/api/health` 200 |

Apply remoto (2026-10-10, MCP `apply_migration`, conferma utente): pre-check storia remota (ultima `20261009224541`, nessuna collisione), baseline `public` 49 tabelle/viste, bucket solo `avatars`; applicate `20261010202151_baptista_wardrobe`, `20261010202428_baptista_connections`, `20261010202448_baptista_presentation` (SQL uguale ai file salvo commenti). Post-apply: 26 tabelle `baptista`, 0 senza RLS, 0 grant e 0 funzioni eseguibili da anon/PUBLIC; `public` ancora 49; bucket `avatars` + `baptista-wardrobe`, policy storage di GuideApp invariate più le 3 `baptista_wardrobe_*`; `_refresh_observations` v4 eseguita sulle case esistenti senza errori; `name_key` uguale a `lib/shopping.ts`. Advisors: per `baptista` solo le voci attese (procedure definer eseguibili da `authenticated`, `observation_refreshes` senza policy). `npm run test:db` 78/78 dopo la rinomina.

Build come su Vercel: copia dei soli file che Git spedisce (tracciati + non ignorati, senza `node_modules`/`.next`/`.env.local`), `npm ci` pulito, `next build` con le due variabili pubbliche → ok (35 route). Il lockfile contiene i binari Linux di `sharp` (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`).

Non eseguiti: deploy Vercel; walkthrough autenticato del flusso del mockup, lista condivisa tra due membri, coerenza tra dispositivi, `prefers-reduced-motion` (SECURITY vieta utenti di test nell'Auth condiviso).

2026-10-10 — D28 e Guardaroba:

| Comando / scenario | Esito |
| --- | --- |
| `npm run test:db` (harness con schema `storage` minimo) | **58/58 pass** (nuovi: bucket privato e limiti; upload solo nella propria cartella di una casa di cui si è membri, cartella altrui/estraneo/percorso malformato/altro bucket negati; foto leggibile dal caricatore, poi da chi legge il capo, nascosta se il capo diventa privato, mai a estranei; capo non può puntare a foto altrui o di altra casa, stagioni e coppia foto/miniatura validate; cancellazione foto solo per chi può accedere al capo) |
| `npm run test:unit` (ora con condizione `react-server`) | **27/27 pass** (nuovi: firma dei byte, HEIC, stagioni e etichette; `sharp` reale: miniatura ruotata secondo EXIF, 533×800, WebP senza EXIF; rifiuto di file finto, vuoto, HEIC, JPEG corrotto, oltre 10 MB, oltre 20 MP) |
| `npm run check` | ok (35 route); unico avviso: ExperimentalWarning di Node 22.11 sui moduli JSON caricati da `sharp` |
| Pre-check remoto (sola lettura) | bucket esistenti: solo `avatars` (GuideApp, pubblico) con 2 policy; nessuna policy `baptista_*`; colonne `storage.buckets` compatibili; ultima migration `20261009224541` |


## Handoff

1. Migration fino a `baptista_presentation` applicate (fatto). Deploy su Vercel: commit e push del lavoro (quasi tutto è ancora non committato: Vercel costruisce da Git), variabili `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nel progetto Vercel, URL `https://<dominio>/auth/conferma` tra i Redirect URLs di Supabase Auth (senza toccare Site URL e URL di GuideApp).
2. Utente: walkthrough autenticato di Soggiorno (gate 02/03) e ora di Cucina/Finanze; `mosquitos` e redirect `/auth/conferma` ancora da sistemare in Dashboard.
3. Chiusura fase 04 (deterministica): foto dello scontrino allegata alla spesa (bucket `baptista-receipts`, stesse regole del guardaroba), lettore codice a barre da fotocamera per la Cucina, correzioni dal walkthrough; poi gate 02/03/04.
4. Fase 04.1 (D30): codice completo; dopo l'apply, walkthrough con 2–3 account reali (flusso del mockup, lista condivisa, «Ora no» personale tra dispositivi, riduzione movimento) e revisione delle 8 voci della battuta del giorno; poi gate 04.1. C7 resta facoltativo.
5. Fase 05: prima lo strato AI con Vercel AI Gateway (router, ai_settings/ai_runs, visual_intakes, lettura scontrini e classificazione/segmentazione guardaroba con review), poi l'agente.

## Regole di aggiornamento

Al termine di ogni sessione significativa: data, fase corrente, stato not_started/in_progress/blocked/completed, file/commit reali, migration ID effettivi, comandi/scenari con esiti, configurazioni manuali, blocchi e prossimo handoff. Non segnare completed se manca un gate. Conservare decisioni motivate e sostituire lo stato corrente obsoleto, evitando registri paralleli.
