# AGENT — Lifecycle, routing e contratti

Dettaglio canonico dell'intelligence, subordinato alla specifica. DATABASE possiede persistenza, SECURITY permessi e VISUAL_INTAKE l'elaborazione foto.

## Lifecycle

Richiesta autenticata → scope utente/household verificato → refresh detector pertinenti → ranking → contesto limitato → router → modello opzionale → output validato → scheda/conversazione/proposta → feedback. Le scritture non avvengono nel turno di generazione.

Detector e ranking sono servizi puri testabili con clock esplicito e timezone household. **Implementazione fase 03 (D14):** detector e score sono SQL deterministico in `baptista._refresh_observations(household, now)` (clock esplicito, non eseguibile dai client) e `baptista.priority_score` (coefficienti e `ranking_version` solo lì); i client invocano `refresh_observations` (membro attivo, lock per household, throttling 30s). Il briefing top 3 è una funzione TS pura (`lib/intelligence/briefing.ts`). Testi delle osservazioni in italiano (D12). I detector di fase 03 sono upcomingCalendar, overdueTasks, missedHabits, habitProgress e goalProgress; fase 04 aggiunge expiringFood e oldFood. Nomi API candidati: detectUpcomingCalendarEvents, detectMissedHabits, detectHabitProgress, detectGoalProgress, detectExpiringFood, detectOldFood. detectMissingExpectedSpending, detectMaintenanceDue e detectUnusualSpending sono futuri.

## Finestre dei detector

Default iniziali in un unico modulo configurazione: upcomingCalendar entro 24 ore; overdueTask dopo due_date locale; missedHabit soltanto a settimana conclusa sotto target; habitProgress mostra conteggio e rimanenti della settimana corrente; goalProgress reagisce a variazioni registrate, non produce ogni giorno una nuova osservazione identica. Le date all-day si confrontano come giorni locali.

Food: approaching entro 2 giorni dalla data effettiva (esplicita se presente, altrimenti stimata), expiresToday nel giorno corrente e expired dopo la data. Per stime usare sempre linguaggio di verifica. oldFood usa una soglia iniziale di 7 giorni per prodotti freschi in frigo senza data; dispensa/freezer sono esclusi dal detector generico e richiedono regola configurata. Questi sono promemoria di controllo, non durate di conservazione sicure. **Implementazione (fase 04, detector_version 3):** `food_expiry` (una osservazione per alimento e data effettiva: avvicinamento → oggi aggiorna la stessa scheda; le stime hanno titolo «Controlla: …», confidenza 0,5 e urgenza ridotta) e `old_food` (frigo, categorie fresche, nessuna data, da almeno 7 giorni da acquisto o inserimento). Consumo o eliminazione risolvono al refresh successivo. L'utente può correggere data e stato; ogni detector rivaluta e risolve il fatto precedente.

Chiavi di deduplica includono tipo, fonte, audience e finestra (giorno o settimana pertinente). Un cambio da approaching a today può aumentare priorità, ma la UI raggruppa le situazioni della stessa fonte per evitare due schede alimentari concorrenti. Il clock è parametro di test, non dipende implicitamente dall'orario della macchina.

## Priorità e briefing

Baseline deterministica: urgency, importance, confidence, actionability normalizzati in [0,1]. score = clamp(100*(0.35*urgency + 0.25*importance + 0.20*confidence + 0.20*actionability) + ageBonus - repetitionPenalty, 0, 100). ageBonus <=5, repetitionPenalty <=20; coefficienti versionati in un modulo, mai riscritti in UI. Ordinamento stabile score desc/created_at/id. Le stime non raggiungono alta certezza soltanto perché anziane.

Briefing mostra al massimo 3 situazioni e recupera al massimo 10 osservazioni candidate più contesto compatto (limite iniziale 8.000 token o minore capacità provider). Dettagli ulteriori sono richiesti attraverso tool paginati. Una scheda per fatto; non aggiungere notifiche ripetute a ogni render. Dismissal e cooldown 24 ore per ripresentazione della stessa situazione; fatti nuovi urgenti hanno una nuova chiave/finestra. Nessuna push/email in questa versione.

Il renderer deterministico è sempre disponibile. L'LLM può sintetizzare ma non cambiare date, importi o confidenza; ogni suggerimento cita source IDs autorizzati e viene invalidato se le fonti non sono più leggibili o attuali.

## Registry e routing

Registry server: provider id, location private/cloud, model id, purposes, capabilities verificate, timeout, context limit, costo stimato e disponibilità. Vercel AI SDK incapsula chiamate; AI Gateway è adapter cloud default, OpenAI-compatible adapter privato. Configurazione: LOCAL_AI_BASE_URL, LOCAL_AI_API_KEY, LOCAL_AI_MODEL; cloud model identificato nella configurazione server, non hardcoded nei componenti. Non imporre uno specifico modello commerciale.

| Scopo | Requisito minimo | Uso |
| --- | --- | --- |
| fast | text; structuredOutput se richiesto | sintesi breve |
| normal | text, tools e structuredOutput per agente | conversazione/tool |
| reasoning | capacità verificata e output richiesto | ragionamento cross-domain limitato |
| vision | vision + structuredOutput | estrazione/classificazione |
| embeddings | embeddings, dimensione/modello coerenti | memoria |
| image_processing | adapter processamento verificato | segmentazione separata |

Tools affidabili, output strutturato e istruzioni hanno precedenza sulla qualità della prosa. Un endpoint compatibile non acquisisce automaticamente tutti i flag. Test smoke per le capacità configurate, niente benchmark enorme in questa fase.

| Modalità | Regola deterministica |
| --- | --- |
| cloud | solo cloud configurato compatibile |
| local_preferred | privato prima; fallback cloud solo con consenso esplicito memorizzato per purpose e budget |
| local_only | solo adapter privati; capability/unavailable error, zero cloud |
| auto | filtra per privacy/capacità/budget, preferisce privato compatibile per richieste semplici, cloud per complessità/capacità richieste secondo regole configurate |

Consenso fallback default false. Household può proibire cloud; scelta utente non può allargare questa policy. Un errore structured output non giustifica invio cloud senza consenso. Selezione router non è una chiamata LLM. Modalità fotografata all'inizio del run e ricontrollata prima dell'invio in caso di cambio policy.

Timeout iniziali testo 30s, vision 60s, singolo retry per errore transitorio; pipeline lunga passa a job persistito. Massimo 5 round tool e 10 tool call, max output e budget per richiesta configurati. Esaurimento produce risultato parziale esplicito o errore senza scritture. Tenere latenza del deployment entro limiti reali Vercel; non supporre processi vivi dopo la risposta.

## Tool contract

Tool server ricevono args validati e un ExecutionContext creato dal server (userId, householdId, session, mode, correlationId). Nessun tool accetta identità modello come autorità. Data minimization, paginazione, errori tipizzati forbidden/conflict/capability/unavailable/validation. Ricontrollare autorizzazione a ogni esecuzione.

Read tools: getTodayCalendar, getUpcomingEvents, getExpiringFood, getFoodInventory, getHabitStatus, getGoalProgress, getActiveObservations, getRecentExpenses, getWardrobeItems. Restituiscono record compatti con ID, provenance e campi necessari; immagini solo se autorizzate e realmente richieste.

Tool di generazione proposta: createTask, createCalendarEvent, markFoodConsumed, dismissObservation. Durante generazione questi nomi restituiscono una action_proposal, mai una mutazione. L'executor confermato è un percorso server separato non registrato come tool libero al modello. Nuovi write tools richiedono contratto, conferma e test prima di registrazione.

## Conferma transazionale

Stati proposal: proposed → confirmed → executed; oppure cancelled/expired/failed. confirmed è transitorio, acquisito atomicamente nella transazione con l'esecuzione; non lasciare una proposta confirmed eseguibile senza controlli. Scadenza iniziale 15 minuti.

Persistire payload validato, digest, source/expected_version e idempotency key. UI mostra esattamente campi e conseguenze. Endpoint conferma prende proposal ID, non payload AI. Rilegge proposta, membership, visibilità e versioni; controlla actor e household; esegue dominio+evento+esito atomicamente. Replay restituisce esito precedente; revoca o stato mutato nega/confligge. Un failed può richiedere nuova proposta secondo errore, non retry cieco di una scrittura.

Azioni manuali in UI (CRUD, consumo, dismissal) usano il gesto esplicito dell'utente come comando e non richiedono una seconda schermata AI; nessuna equivalenza tra output modello e gesto umano.

## Memoria e personalizzazione

Factual: preferenze esplicite confermate; behavioural: pattern di accettazione/dismissal con provenienza e confidenza; episodic: riepilogo di un'interazione utile. Non inferire fatti sensibili o permanenti da una singola risposta. L'utente può vedere, correggere e cancellare memoria. Memorie private di un membro non entrano in suggerimenti condivisi.

Recupero iniziale top 5 dopo filtri scope/visibilità e validità; deduplicazione e limiti token. Embedding privati rispettano modalità; local_only non chiama cloud per riempire un vettore assente. Cancellare il contenuto elimina anche embedding e riferimenti dipendenti. Niente fine-tuning, invio globale storia o memoria cross-household.

## Telemetria e costi

ai_runs per ogni tentativo provider, raggruppati correlation_id: household/user, purpose/provider/model/mode/location, fallback_used, tokens in/out nullable, estimated_cost nullable e valuta, pricing_version, latency_ms, tool_call_count, success/failure, sanitized error_code, timestamp. Unknown non è zero; inferenza privata non implica costo economico nullo. image_processing può avere costo senza token.

Log privi di prompt, immagini, credenziali e URL firmati. Aggregati costo per household, quota privata, fallback, latenza, error rate e costo purpose; filtri di accesso prima dell'aggregazione. Budget controllato prima della chiamata e aggiornato con consumo, concorrenza limitata. Cache briefing per audience, source versions e mode, mai household-only se include dati privati.

Fase 04 introduce soltanto adapter/registry/privacy/telemetria necessari ai processori; fase 05 estende gli stessi moduli, senza un secondo router. Riferimento API da verificare: [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management).
