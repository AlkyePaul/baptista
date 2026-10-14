# BAPTISTA — Stato verificato

Ultimo aggiornamento: 2026-10-13.

## Current phase

**Phase 04.1 — CONNESSIONI + BAPTISTA DETERMINISTICO: in_progress, codice completo.** Passi A e B, D31 (catalogo alimenti) e D33 (utenti da `app_users`) implementati e applicati in remoto; `npm run check` e `npm test` verdi (2026-10-12). Per il gate formale di 02/03/04/04.1 manca solo il walkthrough con gli account reali, che richiede il deploy Vercel funzionante. **«Prossimi passi» (sotto): scontrino e lettore codice a barre implementati il 2026-10-13, migration `baptista_receipts` da applicare in remoto; battuta del giorno rivista dall'utente.** Poi la fase 05.

**Phase 04 — ADVANCED DOMAINS: in_progress, deterministica (D28).** Cucina, Finanze e Guardaroba (con foto private) applicati in remoto; foto dello scontrino e lettore codice a barre implementati (2026-10-13), scontrino in attesa dell'apply remoto. Per D28 router AI, vision e intake passano alla fase 05.

### Prossimi passi (focus deciso dall'utente il 2026-10-12)

1. **Foto dello scontrino allegata alla spesa — implementata, migration da applicare.** Migration `20261013084111_baptista_receipts`: bucket privato `baptista-receipts` (10 MB, solo JPEG), colonna `expenses.receipt_path` (percorso `<casa>/<utente>/<upload>/scontrino.jpg`, prefisso casa verificato da check, cartella dell'utente verificata da trigger), policy insert/select/delete come il guardaroba (leggibile da chi può leggere la spesa; spesa privata = scontrino privato), purge D32 che ora restituisce `(bucket, path)` e include gli scontrini delle spese private eliminate. App: `services/receipts.ts` (riduzione nel browser con `PhotoPicker`, poi sul server controllo di byte reali/dimensione/pixel con `services/images.ts` e ricodifica JPEG max 2400 px senza EXIF/GPS; upload prima della riga e rimozione se la riga fallisce; sostituzione, rimozione, eliminazione della spesa con il suo file; URL firmati da 10 minuti). UI: campo «Scontrino (facoltativo)» in Finanze → Aggiungi → Spesa; sezione «Scontrino» nel dettaglio della spesa (vedi, allega/cambia, rimuovi); icona scontrino nell'elenco Movimenti. Nessuna lettura del contenuto: arriva in fase 05.
2. **Lettore codice a barre da fotocamera — implementato.** Pulsante fotocamera nel campo di ricerca di ogni selettore alimenti (`FoodPicker`: Cucina → Aggiungi, Lista della spesa, Dieta, Pasti, Ricette) e nel campo «Codice a barre» della scheda alimento del catalogo. `components/barcode-scanner.tsx`: fotocamera posteriore a schermo intero, EAN-13/EAN-8/UPC-A/UPC-E, codice accettato dopo due letture uguali con cifra di controllo valida (`lib/barcode.ts`), ripiego «Foto del codice». Decodifica sempre sul dispositivo: `BarcodeDetector` nativo (Chrome Android) oppure il ponyfill `barcode-detector@3.2.2` (zxing-wasm) con il file `.wasm` servito da Baptista (`scripts/copy-zxing.mjs` in `predev`/`prebuild` → `public/zxing/`, ignorato da git; escluso dal proxy). Dopo la lettura: alimento di casa con lo stesso codice → scelto subito; altrimenti ricerca Open Food Facts per codice (già esistente, nessuna chiave API: l'API di lettura è pubblica e chiede solo uno User-Agent); se non trovato, «Nuovo alimento con codice …» con il codice già compilato.
3. **Revisione delle voci della «battuta del giorno»: fatta dall'utente** (2026-10-13). C7 (costo stimato) resta facoltativo.

| Fase | Stato | Nota |
| --- | --- | --- |
| 00 Setup | completed | gate superato 2026-10-09 |
| 01 Database | completed | test isolati PGlite 27/27 + migration applicate al progetto condiviso |
| 02 Auth/Household | in_progress (gate) | semplificata da D33 (utenti da `app_users`, niente inviti né registrazione); test DB passati; **manca walkthrough browser con i 2 account reali** |
| 03 Core domains | in_progress (gate) | codice, migration e test DB/unit passati; **manca walkthrough browser autenticato** |
| 04 Advanced domains | in_progress | deterministica (D28): Cucina/Finanze/Guardaroba applicati; scontrino e lettore codice a barre implementati (2026-10-13, migration scontrino da applicare); manca walkthrough autenticato |
| 04.1 Connessioni + Baptista deterministico | in_progress | codice A+B, D31, D33 completi e applicati; test e build ok (2026-10-12); walkthrough con gli account reali da fare dopo il deploy |
| 05–07 | not_started | — |

Repository: `C:\webdev_local\baptista`, GitHub `AlkyePaul/baptista` (branch `main`); deploy Vercel da Git (progetto `baptista`, team `alkyepauls-projects`).

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
- **Deploy Vercel (2026-10-12):** due progetti Vercel (`baptista` e `baptista-13yx`) erano collegati allo stesso repository; `baptista` falliva ogni build nel prerender (`ConfigError`: mancavano `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). L'utente ha aggiunto le variabili a `baptista` ed elimina `baptista-13yx` dal dashboard (l'API non permette la cancellazione); nuovo deploy da verificare.
- **Gate 02/03 — walkthrough autenticato non eseguito dall'agente:** SECURITY vieta utenti di test nell'Auth condiviso, quindi i flussi autenticati (login, crea casa, invito/accettazione con 2 account, CRUD dei domini, briefing) vanno provati dall'utente con account reali. I vincoli sottostanti sono coperti dai test DB.
- **Auth condiviso con GuideApp:** con D33 Baptista usa solo il login email + password di account già confermati: niente registrazione né link via email, quindi non servono Redirect URLs. Un eventuale recupero password passa dalla Dashboard.
- **Advisors Supabase su `baptista`:** solo voci attese (`observation_refreshes` senza policy = nessun accesso client; procedure `security definer` eseguibili da `authenticated` per design). Gli helper `is_active_member`/`is_household_owner`/`has_pending_invite`/`can_access` sono chiamabili via RPC ma rivelano solo dati del chiamante.
- **Advisors su GuideApp (non toccati, solo segnalati):** 5 tabelle `public` senza RLS (`cancel_logs`, `external_modification_requests`, `whatsapp_conversations`, `ticketinghub_booking_events`, `whatsapp_flows`), 6 view `SECURITY DEFINER`, funzioni definer eseguibili da `anon`, leaked password protection disattivata.
- **Utenti (D33):** aggiungere o togliere una persona = modificare `baptista.app_users` nel Table Editor di Supabase (l'account deve esistere nell'Auth condiviso; se viene creato dopo, la riga si applica al primo login). Togliere una riga revoca la membership e avvia la pulizia a 30 giorni dei dati privati (D32). Gli inviti D32 sono inattivi: in `household_invitations` è rimasto 1 invito aperto, inutilizzabile senza riga in `app_users`.
- **Pulizia ex membri (D32):** pigra, al primo uso della casa dopo i 30 giorni (max 1/giorno): in una casa inattiva i dati privati restano finché qualcuno non apre l'app. Se la cancellazione delle foto dal bucket fallisce, restano file orfani leggibili/cancellabili solo dai membri attivi della casa.
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
| D30 | **Fase 04.1** (utente 2026-10-10): prima della 05, (A) connessioni deterministiche tra stanze (Lista della spesa → Dispensa, «L'hai comprato?» per i capi → Spese, catalogo C1–C14) e (B) strato Baptista senza AI (espressioni in `public/icons/baptista-icons/`, template italiani, micro‑conversazioni a stati, memoria di presentazione per utente, budget di attenzione); In evidenza diventa Baptista (filo a eventi in stile chat) e il Soggiorno apre con una battuta/citazione del giorno; gli altri blocchi informativi restano invariati. Ordine: prima A con interazioni semplici, poi B; solo le 4 espressioni esistenti. Vedi [fase 04.1](phases/PHASE_04_1_CONNECTIONS_AND_BAPTISTA.md) | implementato e applicato (walkthrough da fare) |
| D31 | **Semplificazione** (utente 2026-10-11): (1) **catalogo alimenti della casa** (`foods`): dispensa, Lista della spesa (Alimenti), ricette e pasti scelgono sempre un alimento del catalogo — prima gli alimenti di casa, poi Open Food Facts, altrimenti «Nuovo alimento»; nome e valori nutrizionali vivono solo nel catalogo e le modifiche raggiungono dispensa e lista; «Altro» resta testo libero; abituale = flag sull'alimento (al posto di `pantry_staples`). (2) **Ricettario**: ricette in tabelle proprie (ingredienti dal catalogo con quantità facoltativa + preparazione), nella Home della Cucina; nessun ingrediente scritto a mano. (3) **Pasti** separati dalle ricette: alimenti del catalogo con grammi (0 ammesso), per calorie e macro; una ricetta si aggiunge a un pasto dalla ricetta o dal pasto (pesi convertiti, il resto a 0 g). (4) Cucina → Aggiungi aggiunge solo un alimento (in dispensa o in lista). (5) **Finanze**: Watchlist/TradingView rimossi; barra Spese · Aggiungi (spesa, budget, progetto) · Budget; «obiettivi di spesa» → «Progetti». (6) Scadenze solo in Dispensa e Baptista (tolte dalla Home della Cucina). (7) Guardaroba → Categorie rimossa (doppione dei filtri). (7b) Budget: la pagina Budget tiene solo i budget per categoria e i Progetti; il budget totale del mese si vede, modifica e rimuove in Spese. (8) Stanze: niente riquadri in Home, solo la pillola nell'intestazione che apre un pannello a tutta larghezza (stanze su una riga, la scelta va a sinistra). (9) Codice morto rimosso: vecchio «In evidenza», azione «×» condivisa, scheda Scontrino disattivata, redirect di `/liste` e delle sezioni ritirate | implementato e applicato (2026-10-12) |
| D32 | **Inviti e ciclo di vita della casa** (utente 2026-10-11, fuori fase): (1) Baptista **solo su invito**: il profilo si crea solo riscattando un codice (`claim_invitation`); niente più autoprovisioning, un account dell'Auth condiviso (GuideApp) senza codice vede solo `/invito`. (2) L'owner invita qualsiasi email: utente Baptista → invito in attesa come prima; altrimenti codice di 8 caratteri (hash in `household_invitations`, legato all'email, 14 giorni, monouso, bloccato dopo 5 tentativi errati, max 20 aperti per casa), da chiedere anche in registrazione. (3) L'ultimo membro attivo che esce **elimina la casa** e tutti i dati; la cancellazione dell'account dell'owner promuove il membro attivo più anziano invece di bloccarsi. (4) I dati **privati** di chi esce o viene rimosso si eliminano dopo **30 giorni** (anche le foto guardaroba), a meno che rientri prima; i condivisi restano. Pulizia pigra all'uso dell'app (`after()` nel layout), una volta al giorno per casa. Migration `baptista_invitations` | applicato 2026-10-12; punti (1)–(2) sostituiti da D33, (3)–(4) restano |
| D33 | **Utenti semplici** (utente 2026-10-12): l'app non è destinata alla distribuzione. `baptista.app_users` (email, nome, casa, ruolo) è l'unica fonte degli utenti, gestita dal Table Editor di Supabase; login email + password esistente; chi non è in tabella viene disconnesso al login e rifiutato da ogni procedura (`require_uid` → `not_allowed`). Tolti dall'app: registrazione, codici invito, onboarding `/benvenuto`, `/invito`, `/auth/conferma`, creazione e cambio casa, inviti/rimozione/trasferimento da `/casa` (restano elenco membri, impostazioni casa, profilo, esci). Più owner per casa. FAMILIADA: Paolo e Laia owner. Icona dell'app installata = Baptista «confirmation» (`app/manifest.ts`, `app/apple-icon.png`, `scripts/app-icons.mjs`) | implementato e applicato (2026-10-12) |
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

2026-10-11 — D31 semplificazione: migration `20261012123725_baptista_food_catalog.sql` (PGlite ok, applicata in remoto il 2026-10-12): `foods` + `ensure_food` (deduplica per barcode, poi nome+marca), `food_items.food_id` obbligatorio (trigger che risolve/crea l'alimento e copia nome e nutrizione; nome/nutrizione non più modificabili sull'elemento), `shopping_items.food_id` per le righe Alimenti, sincronizzazione delle modifiche del catalogo, `add_shopping_item` per alimento del catalogo, `pantry_staples` sostituita da `foods.staple`, `recipes` + `recipe_ingredients` (la ricetta-nota esistente viene convertita, le righe ingredienti finiscono nel testo), `meal_items` (al posto del JSONB `meals.items`), `add_recipe_to_meal`, `watchlist_items` eliminata, detector v5 (C2/C8 per alimento del catalogo). Dati remoti al momento del controllo: 1 casa, 1 ricetta-nota («risotto al formaggio», 4 righe), nessun alimento, pasto, lista, abituale o watchlist. `npm run test:db` **81/81** (nuovo `supabase/tests/catalog.test.ts`: catalogo condiviso e deduplicato, estranei esclusi, elemento di dispensa sempre dal catalogo e nome non modificabile, modifiche del catalogo propagate, alimento di un'altra casa rifiutato, alimento in uso non eliminabile, riga lista con luogo predefinito; ricette con quantità facoltative e unità validate, ricetta privata protetta anche negli ingredienti; ricetta → pasto con grammi convertiti e 0 g per il resto, senza duplicati, estranei rifiutati). `npm run test:unit` **37/37** (rimossi i test di codice eliminato: briefing, corrispondenza per nome, ingredienti testuali; totali pasto con 0 g e kcal mancanti). `npm run check` ok (34 route).

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


2026-10-11 — D32 inviti e ciclo di vita, Windows 11: `npm run test:db` **94/94 pass** (nuovo `supabase/tests/invitations.test.ts`, 13 test: profilo non autoprovisionabile; codice monouso legato all'email, formato libero; utente esistente → invito senza codice; blocco dopo 5 tentativi, scadenza, nuovo codice; lista/annullo solo owner, limite 20; ultimo membro che esce elimina casa, attività e inviti; cancellazione account owner → promozione del più anziano; account dell'unico membro → casa eliminata; pulizia: niente prima di 30 giorni, poi solo privati, throttling giornaliero, chi rientra conserva e chi resta in attesa perde; foto private non leggibili prima della pulizia, poi restituite e cancellabili; copertura di ogni tabella per-utente con `household_id`). Harness: profili di test inseriti come admin. `npm run test:unit` 37/37, `npm run check` ok (nuova route `/invito`). Nessuna modifica remota.

2026-10-12 — Richieste utente sulle home, Windows 11: (1) frase d'apertura di Baptista in cima a Guardaroba, Cucina e Finanze (`lib/baptista/greetings.ts`, deterministica, testo da rifinire; `components/baptista/greeting.tsx`): Guardaroba = meteo di oggi da Open-Meteo (`services/weather.ts`, nessuna chiave, cache 30 min, timeout 3 s; luogo, in ordine: posizione del dispositivo se l'utente la concede — pulsante «Usa la posizione del dispositivo» nella frase del Guardaroba, Geolocation API dopo un tocco, poi aggiornamento silenzioso se il permesso è già concesso; salvata solo in un cookie httpOnly `baptista_geo` del dispositivo, arrotondata a ~1 km, mai nel DB (`lib/geo.ts`, `app/actions/location.ts`, `components/baptista/device-location.tsx`); poi geolocalizzazione IP di Vercel `x-vercel-ip-*`; in locale la città del fuso della casa) + consiglio su cosa indossare; Cucina = pasti segnati oggi (fasce del diario) e kcal, invito a inserire se 0 o sotto 500 kcal, poi confronto con l'obiettivo; Finanze = % del mese trascorso vs % del budget totale usato. (2) Bug: impostare il budget totale (senza categoria) falliva con «expected nonoptional» — `optionalUuid` in `services/finance.ts` era `z.union([z.undefined(), uuid])`, che in zod 4 non rende la chiave facoltativa; ora `uuid.optional()` (stesso difetto toccava spese senza categoria/progetto). (3) Home Soggiorno: riepilogo calendario «Oggi e domani» (evento in corso conta per oggi) e, in fondo sotto Obiettivi, «Liste» (accordion) e «Note e appunti» (ultime 6). `npm run check` ok, `npm run test:unit` **42/42** (nuovi `lib/baptista/greetings.test.ts`, `services/finance.test.ts`, `lib/geo.test.ts`); risposta reale Open-Meteo verificata con curl. Non eseguito: verifica nel browser con sessione (la posizione richiede HTTPS o localhost: da telefono via IP di rete locale in http non funziona).

2026-10-12 — Revisione e D33, Windows 11, Node 22.11.0:

| Comando / scenario | Esito |
| --- | --- |
| Log build Vercel (`dpl_5YBQQzT5isXQFaosxffRtcMzCjmL`) | errore nel prerender di `/abitudini`: `ConfigError` per le variabili pubbliche Supabase mancanti nel progetto `baptista`; `baptista-13yx` (stesso repo) READY |
| Confronto migration locali/remote prima di D33 | 13 file = 13 versioni remote (+ `part1` no-op noto) |
| Advisors security | per `baptista` solo voci attese (3 tabelle senza policy per design, procedure definer eseguibili da `authenticated`) |
| `npm run test:db` | **100/100** (nuovo `supabase/tests/app-users.test.ts`, 6 test: riga → profilo e membership con il ruolo, due owner, cambio ruolo; account creato dopo la riga → `claim_app_user` al login; account fuori tabella → nessun accesso, procedure rifiutate con `not_allowed`, tabella illeggibile per client e anon; riga eliminata → membership revocata e accesso perso; cambio casa → vecchia membership revocata; email normalizzata). Harness: `createUser` inserisce l'utente in `app_users` |
| `npm run test:unit` | **42/42** (test della battuta del giorno adattato alle 43 voci dell'utente: almeno una battuta e una citazione per tema) |
| `npm run check` | ok (nuove route `/accesso-negato`, `/manifest.webmanifest`, `/apple-icon.png`; tolte `/registrati`, `/invito`, `/benvenuto`, `/auth/conferma`) |
| Apply remoto `20261012211108_baptista_app_users` (MCP, su richiesta dell'utente) | success; poi righe `app_users`: paolo@los7secretos.com «Paolo» owner, viajaconlaia@gmail.com «Laia» owner, casa FAMILIADA → entrambi con profilo e membership owner `active` |
| Verifica post-apply | 31 tabelle `baptista`, 0 senza RLS, 0 grant e 0 funzioni eseguibili da anon/PUBLIC, `app_users` senza grant per `authenticated`, helper interni non eseguibili da `authenticated`; `public` 49 (invariato) |

Non eseguiti: login reale nel browser con i due account; installazione su telefono per vedere l'icona.

2026-10-13 — Scontrino e lettore codice a barre, Windows 11, Node 22.11.0:

| Comando / scenario | Esito |
| --- | --- |
| `npm run test:db` | **105/105** (nuovo `supabase/tests/receipts.test.ts`, 5 test: bucket privato solo JPEG 10 MB; upload solo nella propria cartella di una casa di cui si è membri; lettura da uploader e poi da chi legge la spesa, nascosto se la spesa diventa privata; spesa non può puntare al file di un altro né a un'altra casa, un membro può allegare il proprio scontrino a una spesa condivisa e chi legge la spesa può rimuoverlo; purge a 30 giorni restituisce `(baptista-receipts, path)` e il file diventa eliminabile). Test purge guardaroba adattato al nuovo formato `(bucket, path)` |
| `npm run test:unit` | **44/44** (nuovo `lib/barcode.test.ts`: cifra di controllo GS1, formati accettati) |
| `npm run check` | ok. Il build stampa `ExperimentalWarning: Importing JSON modules` di Node 22 anche senza le modifiche di oggi (preesistente, innocuo) |

Non eseguiti: apply remoto di `baptista_receipts` (in attesa dell'utente); prova reale della fotocamera su iPhone e Android; upload reale di uno scontrino.

2026-10-14 — Home personalizzata, preferiti e navigazione gerarchica, Windows 11:

| Comando / scenario | Esito |
| --- | --- |
| `npx tsc --noEmit` | ok (0 errori) |
| eslint sui file nuovi | 0 errori, 0 warning |

Implementazione: (1) **Feature registry** (`lib/features.ts`): 9 sezioni navigabili da 4 stanze, ognuna con ID stabile (`stanza.sezione`), icona, rotta, supporto preferiti e widget. (2) **Navigazione gerarchica**: il menu della pillola stanza nell'intestazione ora mostra le sezioni di ogni stanza con stella per aggiungere/rimuovere i preferiti; sostituisce il semplice selettore a 4 riquadri. (3) **Preferiti personali** (`baptista.user_favorites`): tabella con RLS self-only, un preferito per feature per utente, ordinamento e modalità di visualizzazione (link o widget). (4) **Home personalizzata**: la Home del Soggiorno mostra i preferiti dell'utente come link rapidi (griglia 3 colonne) e widget (per le sezioni con dati); modalità Modifica per riordinare, rimuovere e cambiare modalità; stato vuoto invitante. (5) **3 widget**: Diario alimentare (kcal oggi con anello), Spese (totale del mese con barra budget), Guardaroba (griglia degli ultimi 4 capi). Migration `20261014140000_user_favorites.sql` da applicare; graceful degradation se la tabella non esiste ancora. Icone aggiunte: `star`, `star-filled`, `grip`, `chevron-right`.

File nuovi: `lib/features.ts`, `services/favorites.ts`, `app/actions/favorites.ts`, `components/favorite-star.tsx`, `components/favorites-section.tsx`, `components/nav-panel.tsx`, `components/widgets.tsx`, `supabase/migrations/20261014140000_user_favorites.sql`.

File modificati: `lib/rooms.ts` (4 nuovi IconName), `lib/db/types.ts` (tipo `UserFavorite`), `components/icons.tsx` (4 nuove icone), `components/room-pill.tsx` (NavPanel al posto di RoomSwitcher), `app/(app)/layout.tsx` (favoritedSet passato alla pillola), `app/(app)/page.tsx` (sezione preferiti + widget nella LivingRoom), `docs/architecture/DATABASE.md` (tabella `user_favorites`).

Non eseguiti: apply remoto di `20261014140000_user_favorites`; walkthrough autenticato nel browser.

2026-10-14 — Aggiornamento icone e categorie Guardaroba (UI, nessuna migration): `Capi` mostra sempre le 9 categorie con immagine ottimizzata, numero di capi e stato non interattivo attenuato a zero; l'editor Look mostra il numero di capi ancora aggiungibili per categoria con lo stesso stato a zero; `Aggiungi capo` usa le immagini della stessa serie. Le icone comuni di Soggiorno, Cucina e Finanze usano gli asset in `public/icons/{general,food,finance}-icon` nei punti semantici corrispondenti; il tasto Baptista usa l'espressione `suggestion` già visibile nell'intestazione. `next/image` usa dimensioni di 28–40 px per le categorie e 32 px per le icone condivise. `npm run check`: ok (11 warning ESLint in altri file del workspace); `npm run test:unit`: 59/59. `npm test`: suite DB ferma nel setup PGlite con `not_allowed` (42501), 0/114 pass, 106 casi cancellati; il motivo non è stato risolto in questa sessione UI. Nessuna applicazione remota né walkthrough autenticato.

## Handoff

0. **Deploy (utente):** eliminare il progetto Vercel `baptista-13yx`, poi commit e push di questa sessione e nuovo deploy di `baptista`. La migration D33 è già applicata: anche il codice già online funziona per i due utenti in tabella.
1. **Walkthrough (utente)** con i due account reali sull'URL di produzione: login (e rifiuto di un account GuideApp fuori tabella), Soggiorno, Cucina, Finanze, Guardaroba, lista condivisa tra i due, «Ora no» tra dispositivi, `prefers-reduced-motion`, installazione sul telefono con l'icona. Chiude i gate 02/03/04/04.1, salvo i «Prossimi passi».
2. **Scontrino e codice a barre** (sopra): review e apply remoto di `20261013084111_baptista_receipts` **prima** del deploy del codice (README Supabase, punto 6), poi prova sul telefono: scansione di un prodotto (iPhone e Android), spesa con scontrino, sostituzione e rimozione, spesa privata vista dall'altro account.
3. Ancora aperti: incidente `mosquitos` (Dashboard → Exposed schemas), chiave `sb_publishable_` consigliata.
4. Fase 05: prima lo strato AI con Vercel AI Gateway (router, ai_settings/ai_runs, visual_intakes, lettura degli scontrini e classificazione/segmentazione del guardaroba con review), poi l'agente. La lettura dello scontrino partirà dalla foto del «Prossimo passo» 1.

## Regole di aggiornamento

Al termine di ogni sessione significativa: data, fase corrente, stato not_started/in_progress/blocked/completed, file/commit reali, migration ID effettivi, comandi/scenari con esiti, configurazioni manuali, blocchi e prossimo handoff. Non segnare completed se manca un gate. Conservare decisioni motivate e sostituire lo stato corrente obsoleto, evitando registri paralleli.
