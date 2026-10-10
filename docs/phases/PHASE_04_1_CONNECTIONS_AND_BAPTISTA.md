# PHASE 04.1 — Connessioni tra stanze e Baptista deterministico

> **D30 (decisione utente 2026-10-10):** fase intermedia tra 04 e 05, interamente senza AI. Due passi: **(A)** connessioni deterministiche tra oggetti ed eventi delle stanze, a partire dalla Lista della spesa; **(B)** uno strato di presentazione «Baptista» (avatar, espressioni, testi da template, micro‑conversazioni con opzioni esplicite, memoria di presentazione). I blocchi informativi semplici esistenti (abitudini, obiettivi, cruscotti delle stanze) **non si toccano**. **«In evidenza» diventa Baptista** (utente 2026-10-10): Baptista è il modo, con un personaggio e una relazione, di mettere davanti agli occhi ciò che conta; i suoi avvisi sono eventi in forma di chat. **Ordine:** prima il passo A con tutte le interazioni in forma semplice e testi fissi; poi il passo B «riveste» quelle interazioni con Baptista. Implementazione: passi A e B in codice il 2026-10-10 (stato, scostamenti ed evidenze in [STATUS](../BAPTISTA_STATUS.md)); migration non ancora applicate in remoto.

## Goal

Rendere la casa «collegata»: un gesto in una stanza propone, in modo deterministico e confermato dall'utente, il gesto conseguente in un'altra stanza (comprato → in frigo → spesa registrata; capo nuovo → era un acquisto? → spesa). Dare a Baptista una presenza riconoscibile e utile senza alcun modello: dati reali → regole → eventi → osservazioni → priorità → presentazione Baptista → azione dell'utente → aggiornamento reale.

## Why this phase exists

Le fasi 03–04 hanno prodotto domini corretti ma isolati. Le connessioni sono il valore che una famiglia percepisce («l'app sa che ho appena fatto la spesa») e sono calcolabili senza LLM. Costruirle prima della fase 05 garantisce che l'AI futura si appoggi a servizi, conferme e memoria di presentazione già verificati, invece di inventarli.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md), [STATUS](../BAPTISTA_STATUS.md), [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md) e le sezioni Lifecycle/Finestre/Priorità/Conferma di [AGENT](../architecture/AGENT.md).

Gate 04 deterministico superato, **oppure** residui della fase 04 (migration `baptista_wardrobe` applicata, foto scontrino, lettore codice a barre, walkthrough) elencati in STATUS come riportati esplicitamente, con decisione utente registrata (come D27). Il passo A richiede `wardrobe_items` applicata in remoto.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco.

## Scope

**Passo A — Connessioni.** Componente lista ad accordion riutilizzabile per tutte le liste; Lista della spesa della casa con due sezioni (Alimenti → Dispensa, Altro); spunta = comprato e messo in dispensa, «Tutto in dispensa» per gli alimenti non spuntati; avviso morbido per prodotti già in dispensa; domanda «L'hai comprato?» per i capi nuovi con creazione della spesa collegata; le connessioni del catalogo sotto marcate **[A]**. Tutte le domande e proposte funzionano già qui come schede semplici con testi fissi in italiano e pulsanti espliciti (stesse azioni server, stessi stati, stessa memoria di risposta), senza avatar né animazioni.

**Passo B — Strato Baptista.** Espressioni, registro di template italiani, selezione deterministica del messaggio, micro‑conversazioni a stati espliciti, memoria di presentazione per utente, budget di attenzione, stato tranquillo, Baptista al posto di «In evidenza» come conversazione a eventi, battuta/citazione del giorno nella Home del Soggiorno, presenza nelle stanze e nella scheda Baptista (senza chat libera). Il passo B non aggiunge nuove azioni di dominio: riusa quelle del passo A. Detector mancanti per coprire il mandato deterministico (sotto, B‑7).

## Explicitly out of scope

Qualsiasi chiamata a modelli, SDK AI, router, embedding; testo libero interpretato (nessun campo «scrivi a Baptista»); push/email; suggerimenti generati; ricette proposte; meteo/outfit; banche; riconoscimento da foto. Le connessioni marcate **[futuro]** nel catalogo sono solo descritte.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. In particolare:

- **Connessione = proposta, mai automatismo.** Un evento può generare una *domanda*; solo il gesto dell'utente esegue la scrittura. Nessun trigger DB crea record di dominio in un'altra stanza.
- **Una transazione per gesto composto.** La spunta di un alimento in Lista crea l'alimento in dispensa e chiude la riga della lista nella stessa procedura; la registrazione d'acquisto crea la spesa e collega il capo nella stessa procedura. Idempotenza (doppio tocco, replay) e `version` obbligatori.
- **Domande = osservazioni.** Le domande di connessione riusano `observations` (tipo dedicato, `dedupe_key`, audience, ranking, risoluzione quando il fatto cambia) invece di un secondo sistema di notifiche.
- **Privacy.** Una domanda nata da un record privato ha audience privata del proprietario; una spesa generata eredita la visibilità scelta esplicitamente nel gesto (default = visibilità del record di origine). Nessun testo di Baptista nomina record che il lettore non può leggere.
- **Template in codice, non nel DB.** Testi versionati in TS, revisionabili; il DB conserva solo fatti e memoria di presentazione.
- **Componenti di presentazione puri.** Selezione template e macchina a stati sono funzioni pure testabili con clock esplicito; React solo rende.

---

## Passo A — Connessioni tra oggetti

### A‑1. Lista della spesa

**Componente lista ad accordion (tutte le liste).** Ogni lista dell'app (liste/checklist in `notes`, ingredienti di ricetta, Lista della spesa) usa lo stesso componente riutilizzabile `components/list-accordion.tsx`: intestazione con titolo, conteggio delle voci aperte e chevron; corpo richiudibile con le voci; stato aperto/chiuso ricordato per utente (preferenza locale, non dato di dominio). Le liste esistenti passano al componente senza cambiare dati.

**Una sola Lista della spesa per casa**, sempre condivisa con i membri (`visibility = 'household'` vincolata nel DB): niente righe private. Chi vuole una lista privata usa una normale lista in `notes`. L'accordion della Lista della spesa appare **in cima alla Dispensa** e **fissato per primo in Aggiungi → Liste** (stesso componente, stessi dati).

**Due sezioni, due pulsanti di aggiunta:**

- **Alimenti** — «+ Alimento»: ricerca Open Food Facts (riuso `components/food-lookup.tsx`) o testo libero. Sono le voci che finiscono in Dispensa.
- **Altro** — «+ Altro»: testo libero (detersivi, casa, farmacia…). Non toccano mai la Dispensa.

La sezione determina il tipo (`kind = food | other`); nessuna deduzione automatica.

**Modello:** tabella dedicata `shopping_items`, non la checklist JSONB di `notes` (ogni riga ha azioni con `version`, eventi e idempotenza propri).

| Campo | Note |
| --- | --- |
| household_id, created_by, visibility | `visibility` sempre `household` (check) |
| kind | `food` / `other`, dalla sezione |
| name | obbligatorio, testo libero o nome OFF |
| quantity, unit | facoltativi |
| barcode, off_snapshot | solo `food` da Open Food Facts: marca, categoria, nutrizione per 100 g (stessi campi di `food_items`), copiati al momento della scelta |
| storage | solo `food`: `fridge` / `freezer` / `pantry`, proposto da regola su categoria OFF (fresco → frigo, surgelato → freezer, altrimenti dispensa), modificabile con un chip sulla riga |
| status | `food`: `open` → `stocked` · `other`: `open` → `done` · entrambi: `removed` |
| food_item_id | FK all'alimento creato quando `stocked` (tracciabilità e annulla) |
| sort_order, version, timestamps | |

**Comportamenti (utente 2026-10-10):**

- **Spunta un alimento = comprato.** Procedura `stock_shopping_items(ids[], bulk)` → crea `food_items` (nome, marca, barcode, nutrizione, quantità, storage della riga, `purchased_on = oggi`), imposta `stocked` + `food_item_id`, evento `shopping.items_stocked` con `bulk = false`. La riga **sparisce dalla lista** (è già in dispensa); un toast «Latte → Frigo · Annulla» permette di tornare indietro.
- **Spunta una voce Altro = fatto.** `done`, sparisce; nessun effetto su altre stanze.
- **«Tutto in dispensa»** (pulsante nell'intestazione della sezione Alimenti): stessa procedura su **tutti gli alimenti non spuntati** (`open`), ognuno con lo storage della sua riga; evento con `bulk = true`, che fa nascere la domanda C1 «Vuoi registrare la spesa di oggi?». Le voci Altro non sono mai incluse. Esecuzione immediata con Annulla (nessun foglio di conferma: la lista visibile è già la conferma).
- **Già in dispensa — avviso morbido.** Una riga Alimenti il cui barcode (o, senza barcode, nome normalizzato) corrisponde a un `food_items` attivo (`available`/`opened`) ha uno **sfondo rosso tenue** (token di colore dedicato, contrasto AA, nessuna icona d'allarme) e in cima all'accordion compare la frase «Le voci in rosso sono già in dispensa: controlla se ti servono davvero.» (nel passo B la dice Baptista, espressione *thoughtful*). Calcolato in lettura, mai memorizzato; scompare da solo se l'alimento in dispensa viene consumato. Un tocco sulla riga mostra cosa c'è («In dispensa: 1 l · Frigo · scade 14/10»). Non blocca né l'aggiunta né la spunta, e non consuma il budget di attenzione (B‑5).
- **Aggiunta duplicata:** stessa voce già aperta in lista (barcode o nome normalizzato) → incrementa la quantità invece di creare una riga doppia.
- **Annulla:** rimuove l'alimento creato solo se non modificato da allora (controllo `version`) e riporta la riga a `open`; altrimenti spiega perché non si può.
- **Scadenze:** gli alimenti stoccati nascono senza scadenza; dopo «Tutto in dispensa» la conferma offre «Aggiungi scadenze» (elenco compatto dei prodotti appena entrati con campo data).

### A‑2. Guardaroba → Spese: «L'hai comprato?»

Al salvataggio di un nuovo capo nasce la domanda (osservazione `wardrobe_acquisition`, audience = chi l'ha aggiunto). Opzioni:

- **«Sì, l'ho comprato»** → mini‑modulo: prezzo (facoltativo ma consigliato), data (default oggi), negozio (facoltativo), visibilità della spesa. Procedura `register_wardrobe_purchase(item_id, …)` → crea `expenses` (categoria «Abbigliamento», descrizione = tipo/marca del capo), imposta `wardrobe_items.acquisition = 'purchased'` e `wardrobe_items.expense_id`. Prezzo assente → `acquisition = 'purchased'` senza spesa e nessuna cifra inventata.
- **«Era già mio»** / **«È un regalo»** → solo `acquisition` (`owned_before` / `gift`).
- **«Più tardi»** → posticipo personale (memoria di presentazione, passo B); la domanda torna al massimo una volta dopo 3 giorni, poi scade.

La domanda si risolve quando `acquisition` non è più `unknown`.

**«Erano già miei» in blocco** (utente 2026-10-10). Serve al primo caricamento dell'armadio, che può durare più giorni (10 capi oggi, 10 domani):

- Azione **sempre disponibile** nella pagina Capi, non legata alla sessione di caricamento: seleziona tra i capi con `acquisition = 'unknown'` (filtro «Da rispondere») e li segna tutti `owned_before`, senza prezzo.
- **Minimo 7 capi selezionati.** Sotto i 7 il pulsante è disattivato con spiegazione («Per meno di 7 capi rispondi uno per uno») e si risponde dalla domanda del singolo capo. Scopo: il blocco non deve diventare una scorciatoia per saltare la domanda sul prezzo quando è davvero rilevante.
- Il minimo è verificato **anche sul server** (procedura `mark_wardrobe_owned_before(ids[])`: rifiuta meno di 7 id, capi non `unknown`, capi non propri o non leggibili); il controllo UI è solo comodità.
- Se restano meno di 7 capi senza risposta, il blocco non è disponibile: vanno risposti singolarmente.

Colonne: `wardrobe_items.acquisition` (`unknown` default, `purchased`, `gift`, `owned_before`), `wardrobe_items.expense_id` (FK composita household, `set null`). La scheda del capo mostra «Acquistato il … · 49,90 €» con link alla spesa.

### A‑3. Catalogo delle connessioni

Ogni connessione: **innesco** (evento persistito) → **domanda o proposta** → **gesto** → **scrittura atomica** → **risoluzione**. Priorità: **[A]** = in questa fase; **[A+]** = in questa fase se il tempo lo consente, altrimenti STATUS; **[futuro]** = solo descritta.

| # | Innesco | Baptista chiede / propone | Gesto ed effetto | Prio |
| --- | --- | --- | --- | --- |
| C1 | `shopping.items_stocked` prodotto da **«Tutto in dispensa»** (gesto in blocco) | «Vuoi registrare la spesa di oggi?» | spesa con una riga per prodotto stoccato (categoria Alimentari), importi inseriti a mano; nessun importo inventato. **Mai** dopo la spunta di una riga singola (l'evento porta `bulk = true/false`) | A |
| C2 | `food.item_consumed` / `food.item_discarded` o quantità a 0 | «Il latte è finito. Lo aggiungo alla lista?» | riga `shopping_items` con stesso nome/barcode/OFF | A |
| C3 | Ricetta aperta → «Cosa manca?» | «Mancano 3 ingredienti. Quali aggiungo alla lista?» | confronto per nome normalizzato tra ingredienti e Dispensa attiva; gli ingredienti mancanti appaiono **da spuntare** (il confronto è euristico); **solo quelli spuntati** vengono aggiunti alla Lista della spesa con un gesto «Aggiungi alla lista», con dedupe sulle righe già aperte | A |
| C4 | Alimento segnato consumato (micro‑conversazione o Dispensa) | «Lo aggiungo al tuo diario di oggi?» (solo a chi ha agito) | voce `diet_entries` privata con porzione in grammi scelta; solo se l'alimento ha kcal note | A |
| C5 | Spesa in categoria Abbigliamento senza capo collegato | «Vuoi aggiungere il capo al guardaroba?» (una volta per spesa) | apre Aggiungi capo precompilato con `expense_id`; il capo nasce con `acquisition = 'purchased'` (nessuna domanda A‑2) | A |
| C6 | Budget mensile al 80% / 100% (per categoria o totale) | «Alimentari: 80% del budget e mancano 12 giorni.» / «Alimentari: budget del mese superato.» | solo informazione + «Vedi spese»; una scheda per soglia, budget e mese; il 100% sostituisce l'80% | A |
| C7 | Lista della spesa con prodotti già comprati in passato | «Costo stimato: circa 34 €» in cima alla lista | media ultimi prezzi dalle `expense_items` con stesso nome/barcode; etichetta sempre «stima», mai sommata a spese reali | A+ |
| C8 | Prodotto abituale esaurito (definizione sotto) | «Mancano due prodotti abituali: uova, pane.» | aggiunta in blocco alla lista con spunte | A |
| C9 | Obiettivo collegato a un'abitudine (`goals.habit_id`) | progresso del goal = registrazioni dell'abitudine nel periodo del goal | nessuna domanda: calcolo; il goal «50 corse nel 2026» avanza da solo; un goal collegato non accetta progresso manuale (una sola fonte) | A |
| C10 | Progetto di spesa con date + evento in calendario nello stesso intervallo | «Ci sono 3 spese durante «Lisbona». Le collego al progetto?» | collega `expenses.goal_id` per le spese scelte | futuro |
| C11 | Attività con importo previsto (es. «Pagare bolletta 80 €») completata | «Registro la spesa di 80 €?» | spesa precompilata; richiede campo `tasks.expected_amount` | futuro |
| C12 | Pasto registrato in Dieta da un pasto salvato | «Scalo gli ingredienti dalla Dispensa?» | riduzione quantità con conferma per riga | futuro |
| C13 | Capo archiviato | «L'hai venduto o regalato?» | serve un concetto di entrata in Finanze, oggi assente | futuro |
| C14 | Evento calendario «cena con ospiti» | «Controllo la dispensa per la cena?» | richiede interpretazione del titolo → fase 05 (AI) | futuro |

**Prodotti abituali (C8) — definizione proposta.** «Abituale» è sempre una **scelta esplicita** dell'utente, mai dedotta in silenzio:

- Tabella `pantry_staples` (household, nome normalizzato, barcode facoltativo, visibilità della casa): una stella «Abituale» su alimento in Dispensa o riga della Lista.
- **Suggerimento deterministico:** se lo stesso prodotto (barcode, altrimenti nome normalizzato) è stato stoccato almeno **3 volte negli ultimi 60 giorni**, Baptista chiede una volta «Compri spesso le uova. Le segno come abituali?» (Sì / No, non chiederlo più). Il «No» è memorizzato e non si ripresenta.
- **Esaurito** = nessun `food_items` attivo (`available`/`opened`) con quel barcode o nome normalizzato **e** nessuna riga aperta in Lista. Il controllo parte dal consumo/scarto dell'ultimo esemplare (stesso innesco di C2): per un abituale C2 non chiede, aggiunge una proposta raggruppata C8.
- Nessuna stima di «quando finirà»: solo il fatto registrato che non ce n'è più.

Regole comuni: una domanda per fatto (dedupe sulla fonte); audience = chi ha generato l'innesco salvo dati della casa (C6 budget household → membri attivi); mai domande su record che il lettore non può leggere; ogni domanda ha un'uscita «Ora no»/«Non chiedere più per questo».

---

## Passo B — Strato Baptista deterministico

Riferimento visivo: mockup mobile «Baptista starts with a small observation» (01 apertura gentile → 02 risposta utile → 03 risoluzione tranquilla: *nota → rispondi → conferma → torna alla tua giornata*). Il layout di Home resta: saluto, avatar casa, eventi di oggi, blocchi esistenti; **la sezione Baptista prende il posto di «In evidenza»** (stessa posizione, stesse osservazioni prioritarie, stesso ranking) sotto il primo evento e sopra gli altri blocchi. I visual di D23 (anello, contatore giorni, tessera data) diventano la miniatura accanto al testo di Baptista.

### B‑1. Espressioni

Asset in `public/icons/baptista-icons/` (PNG ~1–1,2 MB ciascuno, sfondo trasparente). Da derivare in WebP 192/384 px con uno script `sharp` locale (gli originali restano come sorgente); nessun PNG da 1 MB servito in UI.

| File | Gesto | Stato deterministico | Uso |
| --- | --- | --- | --- |
| `baptista-alert.png` | indice alzato, sguardo attento | **Avvisa**: fatto noto e rilevante (scadenza esplicita, attività scaduta, budget superato) | apertura di un avviso |
| `baptista-thoughtful.png` | mano al mento | **Domanda / stima**: serve una risposta o il dato è stimato («Se l'uva è ancora lì…», «L'hai comprato?») | domande di connessione, osservazioni con confidenza < 1 |
| `baptista-suggestion.png` | mano aperta che porge | **Propone**: un'azione conseguente («Lo aggiungo alla lista?», «Registro la spesa?») | secondo passo di una micro‑conversazione, proposte C‑n |
| `baptista-confirmation.png` | occhi chiusi, mano sul petto (piccolo inchino) | **Conferma / celebra**: operazione completata o traguardo raggiunto | solo dopo esito server positivo |

**Si lavora solo con queste quattro** (decisione utente 2026-10-10): celebra = *confirmation*; nessuna espressione «a riposo» (lo stato tranquillo non mostra avatar o usa *suggestion* per la battuta del giorno). Espressioni nuove potranno arrivare dopo senza cambiare la logica. Mappatura in un solo modulo (`lib/baptista/expressions.ts`): tipo osservazione + fase conversazione → espressione. Nessuna espressione scelta a caso.

### B‑2. Voce e template

Voce: calda, discreta, breve, dà del tu, usa il nome di chi guarda solo in apertura e non più di una volta per sessione. Mai emozioni attribuite all'utente, mai fatti non presenti nei dati, mai rimproveri.

Esempi di registro (italiano, adattati dalle istruzioni dell'utente):

- Avvisa: «Paolo, una piccola faccenda in frigo: il pollo scade domani.»
- Propone: «Lo mettiamo in programma per cena?»
- Conferma: «Fatto. Una cosa in meno.»
- Celebra: «Cinque passeggiate questa settimana. Impeccabile.»

**Registro** (`lib/baptista/templates.ts`): per ogni tipo di osservazione/domanda, *famiglie* di frasi complete indicizzate da variante. Le varianti sono scelte da regole, non dal caso:

| Dimensione | Esempi di variante |
| --- | --- |
| cosa è successo | scadenza esplicita / stimata / superata |
| quando | mattina / sera; ultimo giorno della settimana; oggi vs domani |
| chi guarda | proprietario del record vs altro membro (record della casa) |
| cosa ha appena fatto | appena registrato il 4° passeggio → «Un altro! Ne manca solo uno.» |
| storia di presentazione | prima volta / già mostrato / posticipato e ripresentato |
| certezza | fatto («Scade domani») vs stima («Sono passati diversi giorni: controlla com'è») |

Esempio abitudine 4/5: prima presentazione «Quattro passeggiate questa settimana. Ne manca una.»; subito dopo la registrazione «Un'altra! Ora ne manca solo una.»; ultimo giorno «Una passeggiata oggi e l'obiettivo è fatto.»; già mostrato → nessuna nuova frase, resta visibile il blocco esistente 4/5.

Regole: alternative complete permesse per evitare monotonia, scelte con hash stabile (osservazione, giorno) così ogni dispositivo mostra la stessa frase; mai composizione di frammenti casuali; segnaposti tipizzati (`{nome}`, `{prodotto}`, `{data}` in it-IT) riempiti solo con valori che il lettore può leggere; un test verifica che ogni template di ogni tipo sia raggiungibile e riempibile.

### B‑3. Micro‑conversazioni

Scambi brevi con opzioni esplicite e risposte previste, definiti come **script** (`lib/baptista/scripts/*.ts`): passi, opzioni, azione server collegata, testi per esito ok/errore. Stati espliciti per ogni scambio:

`opening → (choice) → [confirming] → executing → done | failed`, più `snoozed` e `dismissed`.

Script di riferimento (mockup):

1. **Apertura** (alert): «Il pollo scade domani. È ancora in frigo?» con miniatura dell'alimento e intestazione «CUCINA · 1 ELEMENTO». Opzioni: **«Sì, c'è ancora»** (primario) · **«L'abbiamo mangiato»** · **«Più tardi»**.
2. **«L'abbiamo mangiato»** → bolla utente a destra, poi (suggestion) «Lo segno come consumato?» con riga «Pollo · Frigo». Pulsanti **«Segna come consumato»** · **«Annulla»**.
3. **Esecuzione**: identifica l'alimento → valida permessi e `version` → salva lo stato → l'evento nasce dal trigger → refresh osservazioni → (confirmation) «Fatto, segnato come consumato.» con riga «✓ Pollo · Consumato — Annulla». La conferma appare **solo** se il server ha risposto ok.
4. **Errore**: (thoughtful) «Non sono riuscito a segnarlo. Riprovo?» · **«Riprova»** · **«Lascia stare»**. Conflitto di versione: «Qualcuno l'ha appena modificato» + ricarica.
5. **«Sì, c'è ancora»** → «Bene. Te lo ricordo domattina se è ancora lì.» (posticipo personale fino all'indomani; frase mostrata solo se il posticipo è stato salvato).
6. **«Più tardi»** → la scheda si chiude; posticipo di 4 ore.

**Annulla** esiste solo per azioni con inverso definito e verificato da `version` (consumato → disponibile; spunta o «Tutto in dispensa» → rimuovi alimenti creati e riapri le righe). Finestra: finché la scheda di conferma è visibile o 30 s.

Nessun campo di testo libero: dove servono dati (prezzo, data, grammi) si usano mini‑moduli tipizzati dentro la scheda.

### B‑4. Memoria di presentazione

Tabella `baptista_presentations` (per utente, privata a chi guarda):

| Campo | Note |
| --- | --- |
| household_id, user_id | user = spettatore; RLS self-only |
| observation_id, dedupe_key | chiave stabile anche se l'osservazione viene rigenerata |
| first_shown_at, last_shown_at, show_count | aggiornati al massimo una volta per finestra (non a ogni render) |
| last_variant | template mostrato |
| outcome | `shown` / `answered` / `acted` / `snoozed` / `dismissed` / `failed` |
| snoozed_until | posticipo personale |
| script_step | passo corrente, per riprendere su un altro dispositivo |

Usi: niente avvisi ripetuti; rispetto di posticipi e scarti; coerenza tra dispositivi; risoluzione automatica quando cambia il fatto (l'osservazione diventa `resolved` e la scheda sparisce ovunque).

**Nota sullo scarto esistente:** oggi `dismiss_observation` imposta lo stato dell'osservazione per tutta la casa. Proposta: lo stato dell'osservazione resta per i *fatti* (active/resolved/expired); «Ora no» e «Ignora» di Baptista diventano personali in `baptista_presentations`. Poiché In evidenza diventa Baptista, l'«×» diventa «Ora no» personale. Decisione utente: provarlo e valutare la UX nel walkthrough; se due membri trovano strano vedere ancora un avviso che l'altro ha scartato, si rivede.

### B‑5. Budget di attenzione e stato tranquillo

- La sezione Baptista in Home è un **filo in stile chat**: al massimo **una conversazione attiva** (la più alta per `priority_score` tra quelle non posticipate/scartate dall'utente; le domande di connessione appena nate vanno in testa se l'utente ha appena agito) e al massimo **2 bolle compatte in coda** («Poi ci sono anche: …», tocco = apre quella conversazione). Totale 3, come il vecchio In evidenza.
- Al massimo **3 nuove aperture al giorno** per utente; oltre, le osservazioni restano raggiungibili nella scheda Baptista («Da rispondere»).
- Le conferme e le risposte a gesti dell'utente non consumano budget.
- **Stato tranquillo:** se non c'è nulla di pertinente nessun avviso (nel Soggiorno resta solo la battuta del giorno, B‑8); il sottotitolo del saluto diventa una frase calma da template («Un po' di respiro.», «Tutto in ordine per oggi.»), scelta da regole (ora del giorno, eventi rimanenti). Mai avvisi per riempire spazio.
- Nessun numero o badge Baptista inventato.

### B‑6. Presenza nelle stanze e scheda Baptista

- **Home:** sezione Baptista al posto di In evidenza, conversazione come nel mockup (avatar a sinistra, intestazione stanza · conteggio, testo, miniatura del record, pulsanti a tutta larghezza; risposte dell'utente come bolle a destra). Nella Home del Soggiorno il filo si apre con la battuta del giorno (B‑8).
- **Stanze:** scheda compatta in cima a Dispensa, Spese, Capi, Lista della spesa con le sole osservazioni della stanza; dopo un gesto (salvataggio capo, «Tutto in dispensa») la domanda di connessione appare nel punto in cui l'utente si trova.
- **Scheda Baptista (barra):** sostituisce il segnaposto. Senza AI mostra: «Da rispondere» (domande aperte e posticipate), «Fatto di recente» (esiti confermati con Annulla quando ancora valido), riepiloghi calcolati a richiesta tramite pulsanti predefiniti («Quanto abbiamo speso in alimentari questo mese?» → calcolo + frase da template). Nessun input di testo.
- **Transizioni morbide (utente 2026-10-10)** — come se Baptista entrasse e poi parlasse:
  1. **Avatar in dissolvenza** (~400 ms, ease-out, opacità 0→1 con leggerissima scala 0,97→1); cambio di espressione = dissolvenza incrociata tra le due immagini, mai un taglio netto.
  2. **Il messaggio appare lettera per lettera** solo **dopo** la fine della dissolvenza, come se lo dicesse in quel momento: ~30 ms per carattere, brevi pause dopo punteggiatura (`,` ~120 ms, `.`/`?`/`:` ~250 ms), durata totale limitata a ~2 s (testi lunghi accelerano).
  3. **Pulsanti e miniatura** entrano in dissolvenza quando il testo è completo; prima non sono cliccabili.
  4. Un tocco sulla bolla **completa subito** il testo.
  5. Ogni bolla successiva della micro‑conversazione ripete il ciclo (avatar/espressione → testo → opzioni); la bolla dell'utente appare subito, senza scrittura.
  6. La scrittura avviene **una sola volta per messaggio e per utente**: tornando sulla pagina o su un altro dispositivo il testo già mostrato appare intero (stato da `baptista_presentations`), non si riscrive a ogni render.
  7. Piccolo inchino (rotazione 3–4°) sull'espressione di conferma.
  8. **Accessibilità:** con `prefers-reduced-motion` nessuna dissolvenza né scrittura progressiva (tutto immediato); per gli screen reader il testo completo è annunciato subito (`aria-live="polite"`) e le lettere animate sono `aria-hidden`.

  Implementazione con CSS/`requestAnimationFrame`, nessuna libreria di animazione aggiuntiva salvo motivazione.
- I blocchi esistenti (abitudini, obiettivi, cruscotti delle stanze) restano invariati. In evidenza non esiste più come blocco separato: nessun doppione possibile.

### B‑8. Battuta o citazione del giorno (Soggiorno)

Entrando nella Home del Soggiorno (stanza principale) c'è **sempre** un'interazione con Baptista, anche quando non c'è nulla da segnalare: il filo si apre con una battuta da maggiordomo o una citazione.

- **Contenuto** in codice (`lib/baptista/daily.ts`), in italiano, curato a mano: almeno 90 voci, **misto** (decisione utente 2026-10-10) di tre generi, ognuno con un campo `kind`:
  - `joke` — battuta breve e garbata nello stile di Baptista;
  - `quote` — citazione con `author` obbligatorio (solo di pubblico dominio; attribuzione verificata, niente frasi dall'attribuzione dubbia; niente passi lunghi protetti);
  - `aphorism` — aforisma o proverbio senza autore certo (es. proverbi italiani), mai spacciato per citazione.

  Facoltative voci legate a date fisse (Capodanno, Natale…) che hanno precedenza quel giorno. Prima stesura scritta dall'agente durante il passo B, rivista dall'utente prima del rilascio.
- **Introduzione che dichiara il genere.** Baptista apre sempre dicendo che cosa sta per dire, così una battuta non viene presa per una citazione e un aforisma non viene attribuito a nessuno. Le introduzioni sono template per genere (scelti con lo stesso indice del giorno):
  - battuta: «Una battuta per cominciare la giornata:» · «Mi concedi una facezia?»
  - citazione: «Come diceva {autore}:» · «Una citazione di {autore}, per oggi:»
  - aforisma: «Un aforisma per oggi:» · «Come si suol dire:»

  Struttura della bolla: introduzione → testo (tra « » per citazioni e aforismi) → per le citazioni l'autore ripetuto in piccolo sotto («— Seneca»). Un test verifica che ogni `quote` abbia un autore e che nessun `joke`/`aphorism` ne abbia uno.
- **Selezione deterministica:** indice = (numero del giorno nel fuso della casa) mod N → stessa voce per tutti i membri lo stesso giorno, nessuna ripetizione prima di N giorni, nessuna casualità.
- **Presentazione:** espressione *suggestion* per citazioni e aforismi, *confirmation* per le battute; l'introduzione si scrive per prima, poi il testo; dissolvenza e scrittura lettera per lettera alla prima apertura del giorno, poi testo intero (memoria in `baptista_presentations` con chiave `daily:<data>`).
- Precede gli eventuali avvisi della giornata nel filo; non è un'osservazione, non consuma il budget di attenzione, non ha pulsanti (al massimo un tocco per richiuderla fino a domani).
- Solo nel Soggiorno; le altre stanze mostrano soltanto i propri avvisi.

### B‑7. Detector e calcoli da aggiungere

Per coprire il mandato deterministico (istruzioni utente 2026-10-10) mancano:

| Detector / calcolo | Regola | Note |
| --- | --- | --- |
| `calendar_overlap` | due eventi a orario visibili allo stesso utente che si sovrappongono nelle prossime 48 h | solo eventi leggibili dallo spettatore |
| `food_opened` | alimento `opened` da N giorni (soglia per categoria, default 3 frigo) | sempre linguaggio di verifica, confidenza 0,5 |
| `spending_comparison` | mese corrente fino a oggi vs stesso giorno del mese precedente, per categoria e totale, per valuta | solo a richiesta o oltre ±25%; testo «Finora 20% in più di settembre allo stesso punto» |
| `budget_threshold` | C6 | |
| `wardrobe_acquisition`, `restock_question`, `shopping_expense_question`, `diet_log_question`, `wardrobe_from_expense`, `staple_suggestion`, `staples_missing` | domande A‑2, C2, C1, C4, C5, C8 | audience = attore (C8 esaurito: membri della casa) |
| `habit_last_day` | variante del progresso abitudine l'ultimo giorno della settimana | serve al template, non nuova scheda |

Versione detector incrementata; `ranking_version` invariata salvo motivazione.

---

## Expected files/components/modules

Passo A: migration `baptista_connections` (shopping_items, pantry_staples, colonne wardrobe, `goals.habit_id`, procedure `stock_shopping_items`, `register_wardrobe_purchase`, `mark_wardrobe_owned_before`, eventi, detector domande); `services/shopping.ts`, `app/actions/shopping.ts`, `components/list-accordion.tsx` (passaggio delle liste esistenti), Lista della spesa in Dispensa e Aggiungi, schede domanda semplici con testi fissi, estensioni a `services/wardrobe.ts`, `components/wardrobe.tsx`; `lib/shopping.ts` (normalizzazione nomi, regola storage).

Passo B: migration `baptista_presentation` (`baptista_presentations`, detector B‑7); `lib/baptista/{expressions,templates,select,scripts/*,attention,daily}.ts` (puri); `services/baptista.ts` (server-only: candidate, registrazione presentazioni/esiti); `app/actions/baptista.ts`; `components/baptista/{card,bubble,avatar,options,result}.tsx`; WebP derivati in `public/icons/baptista-icons/`.

Documenti proprietari da aggiornare al momento dell'implementazione: DATABASE (tabelle/procedure), AGENT (domande come osservazioni, template, memoria di presentazione, budget di attenzione, nuovi detector), MASTER_SPEC (Lista della spesa nella Cucina, strato Baptista deterministico nell'esperienza).

## Security considerations

Procedure composte `security invoker` o definer limitate, con membership e visibilità riverificate; identità mai dal client; la spesa generata non può avere visibilità più ampia di quanto l'utente sceglie; `baptista_presentations` self-only (un membro non vede cosa gli altri hanno scartato); template riempiti solo con campi letti tramite RLS dello spettatore; annulla soggetto agli stessi permessi dell'azione.

## Tests / validation

- DB (PGlite): spunta di un alimento idempotente (doppio tocco = una sola creazione), «Tutto in dispensa» prende solo gli alimenti `open` ed esclude Altro, riga con visibilità diversa da `household` rifiutata, annulla rifiutato se l'alimento è cambiato; corrispondenza «già in dispensa» per barcode e nome normalizzato, che sparisce dopo il consumo; acquisto capo crea una spesa sola e collega, prezzo assente non crea spesa, capo altrui rifiutato; «Erano già miei» in blocco rifiutato sotto 7 capi anche chiamando la procedura direttamente, e su capi già risposti o altrui; C1 nasce solo da «Tutto in dispensa», mai dalla spunta singola; C3 aggiunge solo gli ingredienti spuntati senza duplicare righe aperte; goal collegato a un'abitudine segue le registrazioni e rifiuta progresso manuale; abituale suggerito solo dopo 3 stoccaggi in 60 giorni e mai dopo «No»; domande con audience corretta, risolte quando il fatto cambia, nessun duplicato a refresh ripetuti; presentazioni self-only e posticipo rispettato; detector B‑7 con clock esplicito (cambio ora legale, fine mese, multi-valuta).
- Unit: selezione template per ogni variante e ogni tipo; nessun segnaposto non riempito; macchina a stati (nessuna conferma senza esito ok, errore → retry); sequenza dissolvenza → scrittura → opzioni, salto con tocco, nessuna riscrittura di un messaggio già mostrato, `prefers-reduced-motion` immediato; battuta del giorno uguale per tutti i membri nello stesso giorno e diversa per N giorni consecutivi (fuso della casa, cambio ora legale); budget di attenzione; mappatura espressioni.
- Browser (utente, 2–3 account reali): flusso del mockup completo, lista condivisa tra due membri, coerenza tra dispositivi di posticipo/scarto, stato tranquillo, `prefers-reduced-motion`.
- `npm run check`, `npm test`; nessuna variabile AI necessaria.

## Deliverables

Liste in accordion; Lista della spesa con sezioni Alimenti/Altro, spunta → Dispensa e avviso «già in dispensa»; domanda d'acquisto del guardaroba con spesa collegata; connessioni [A] del catalogo; Baptista al posto di In evidenza, con battuta del giorno nel Soggiorno, presente in stanze e scheda dedicata con espressioni, template e micro‑conversazioni reali; memoria di presentazione persistita.

## Definition of done

Criterio dell'utente: tre utenti reali usano la casa condivisa e gli spazi privati, gestiscono dati, ricevono osservazioni corrette e interagiscono con Baptista **senza alcuna chiave di modelli**. Verificati: persistenza reale; permessi tra utenti; esattezza di calcoli e regole; coerenza di date e periodi; nessuna osservazione duplicata o superata; azioni e conferme reali (mai conferma fittizia); errori e stati vuoti gestiti; scarti e posticipi rispettati; personalità coerente via template ed espressioni; funzionamento completo con AI disconnessa. Moduli e migration revisionabili; docs proprietari allineati; STATUS con prove reali.

## Exit conditions

Completare i deliverable; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare la fase 05 in automatico.

## Handoff to next phase

Alla fase 05 passano: script e template come superficie su cui l'AI potrà proporre sintesi (senza sostituirli quando l'AI è spenta), le procedure composte come futuri executor di `action_proposals`, la memoria di presentazione come base dei feedback accepted/dismissed, le connessioni [futuro] che richiedono interpretazione (C14). L'AI proporrà dati strutturati e userà i servizi autorizzati; non sostituirà calcoli, permessi né regole.

## Decisioni e domande aperte

Decise con l'utente il 2026-10-10: C1 solo dopo «Tutto in dispensa»; C3 aggiunge solo gli ingredienti spuntati; C4, C5, C6, C8, C9 in questa fase; definizione di prodotto abituale confermata; «Erano già miei» in blocco sempre disponibile con minimo 7 capi; transizioni morbide (B‑6); tutte le liste in accordion; Lista della spesa unica e condivisa con sezioni Alimenti/Altro, in Dispensa e in Aggiungi; spunta = in dispensa, «Tutto in dispensa» per i non spuntati; avviso rosso tenue per i prodotti già in dispensa; «Ora no» personale da provare; Baptista sostituisce In evidenza; battuta/citazione del giorno nel Soggiorno; solo le quattro espressioni esistenti; **prima il passo A con interazioni semplici a testi fissi, poi il passo B**.

Battuta del giorno: misto di battute, citazioni e aforismi, con introduzione che ne dichiara il genere (e l'autore per le citazioni); prima stesura dall'agente, revisione dell'utente.

Nessuna domanda aperta: la fase è pronta per il passo A.
