# BAPTISTA — Specifica canonica

Versione documentale iniziale: 2026-09-30. Stato dell'applicazione: vedi [STATUS](BAPTISTA_STATUS.md) (Phase 00 completata il 2026-10-09).

## Autorità e lettura

Questo documento governa prodotto e vincoli permanenti. [DATABASE](architecture/DATABASE.md), [SECURITY](architecture/SECURITY.md), [AGENT](architecture/AGENT.md) e [VISUAL_INTAKE](architecture/VISUAL_INTAKE.md) possiedono i rispettivi contratti di dettaglio. Il [piano](BAPTISTA_PRODUCTION_PLAN.md) possiede sequenza e confini; lo [stato](BAPTISTA_STATUS.md) registra soltanto fatti verificati. I documenti di fase assegnano lavoro, non autorizzano deroghe ai vincoli.

In caso di conflitto: fermare la parte dipendente, correggere prima il documento proprietario, allineare i riferimenti e registrare la deviazione nello stato. La comparsa di una capacità nella specifica non autorizza a implementarla nella fase corrente. Non estendere una fase per convenienza.

## Identità del prodotto

Baptista è un sistema operativo domestico con un assistente privato per famiglie e piccoli gruppi fidati. Le aree strutturate sono il prodotto principale; la conversazione è uno degli accessi. Home e le schede contestuali devono essere utili prima di aprire la chat. Il prodotto deve funzionare quando ogni modello AI è disabilitato.

Il ciclo fondamentale è stato strutturato → logica deterministica → eventi → osservazioni → priorità → ragionamento opzionale → suggerimenti → azioni confermate → feedback → memoria. Il modello non riceve periodicamente l'intero database per cercare problemi: riceve situazioni già rilevate e contesto limitato, autorizzato e pertinente.

## Invarianti

1. Applicazione Next.js autonoma, repository e logica separati da GuideApp.
2. Il prototipo condivide temporaneamente il progetto Supabase con GuideApp. `public.*` rimane di GuideApp; tutti gli oggetti di dominio Baptista sono `baptista.*`.
3. Riferimenti a `auth.users` e uso delle infrastrutture Auth/Storage sono consentiti. Nessuna dipendenza dai domini GuideApp.
4. Household è il confine organizzativo; membership e visibilità sono verificate fuori dal modello e anche nel database.
5. Dati privati e derivati rimangono privati: immagini, eventi, osservazioni, memorie, suggerimenti, log e aggregati.
6. Fatti calcolabili sono calcolati senza LLM. Il ragionamento AI è sostituibile e opzionale.
7. Intake visuale produce bozze verificabili; soltanto una conferma umana genera record di dominio.
8. Ogni proposta AI che modifica stato passa da conferma esplicita, autorizzazione attuale e scrittura idempotente sul server.
9. `local_only` proibisce invii a servizi AI cloud, incluse immagini, embedding e processamento immagini; errori di capacità sono espliciti.
10. La costruzione procede attraverso gate sequenziali. Nessuna sessione implementa automaticamente tutte le fasi.

Le policy necessarie su `storage.objects`, configurazioni Auth, estensioni e metadati infrastrutturali sono eccezioni infrastrutturali al vincolo di schema. Devono essere limitate a Baptista senza alterare le policy GuideApp.

## Stack e confini di codice

Stack richiesto: Next.js 16 App Router, React 19, TypeScript in modalità strict (decisione utente 2026-10-09, D08: sostituisce «JavaScript senza TypeScript»), Tailwind CSS 4, PostgreSQL/Supabase Auth/Storage, pgvector, deployment Vercel, Vercel AI SDK e AI Gateway. Le versioni precise e le API devono essere verificate e bloccate in fase 00 e quando viene introdotta l'AI.

React gestisce presentazione e interazioni; servizi di dominio, autorizzazione, detector, ranking, routing e orchestrazione vivono fuori dai componenti. I servizi server non sono importabili nel browser. Una futura app Expo può riutilizzare i contratti tramite API senza dipendere dall'albero Next.js. Non creare ora un monorepo mobile o un SDK distribuito.

Realtime si usa dove rende utile la collaborazione: invalidazione delle viste autorizzate, non fonte di verità. Refetch e recupero dopo disconnessione sono obbligatori quando viene introdotto. Non avviare uno stream per ogni componente né creare ora infrastrutture di streaming parallele.

## Household, identità e visibilità

Una persona può appartenere a più household; il contesto corrente è una selezione verificata, non una prova di accesso. Oggetti pertinenti hanno UUID, household, proprietario, autore, visibilità e timestamp. `private` significa proprietario attualmente membro; `household` significa membri attivi; `selected_members` richiede un ACL esplicito. Nel prototipo la UI offre private/household; selected_members è riservato e rifiutato finché il relativo ACL non viene implementato con test.

Amministrare la household non conferisce lettura dei record privati altrui. Il proprietario di un record è distinto dall'owner amministrativo della household. Le regole operative complete sono in SECURITY.

## Domini del prototipo

| Area | Comportamento richiesto | Prima fase funzionale |
| --- | --- | --- |
| Identità | profilo Baptista, household, membership, contesto corrente | 02 |
| Calendario | eventi con date coerenti, vista oggi/prossimi | 03 |
| Produttività | task, completamento, scadenze; note e liste semplici | 03 |
| Obiettivi | target, progresso manuale deterministico | 03 |
| Abitudini | piano settimanale, registrazioni, completamento | 03 |
| Cucina | inventario frigo/freezer/dispensa con scadenze, quantità, consumo, valori nutrizionali (Open Food Facts); ricette; pasti; diario calorie personale (D25) | 04 |
| Finanza | spese manuali (lo scontrino è un modo di inserimento), categorie, righe e totali; budget mensili; progetti di spesa con preventivo; watchlist personale di titoli/ETF (D26) | 04 |
| Guardaroba | foto originale privata, derivato senza EXIF, classificazione manuale (04); classificazione e segmentazione AI con review (05, D28) | 04 |
| Intelligence | eventi, osservazioni, priorità | 03–04 |
| Agente | briefing, strumenti, suggerimenti, conferma, memoria e telemetria | 05 |

Manutenzione domestica, smart home, anomalie finanziarie, integrazione bancaria, outfit completi, fine-tuning personale e calendari esterni sono estensioni future. Gli esempi su caldaia e spese mancanti illustrano la direzione del prodotto, non requisiti del prototipo. Non inferire spese attese senza una preferenza esplicita.

## Determinismo e linguaggio

Le osservazioni distinguono dato esplicito, stima e assenza di registrazione. Una scadenza dichiarata può produrre «Il pollo scade oggi»; una stima deve dire «Se l'uva è ancora lì, controllala». Una mancata registrazione di abitudine non prova che l'attività non sia stata svolta. Quantità, percentuali e totali non sono inventati dal modello.

Gli eventi rappresentano fatti persistiti; le osservazioni rappresentano situazioni attuali risolvibili. Ranking e deduplicazione precedono l'AI. Un briefing deterministico rimane disponibile senza provider.

## AI, strumenti e memoria

Baptista è l'agente; il modello è il motore sostituibile. Vercel AI Gateway è il percorso cloud predefinito. L'adapter privato usa un endpoint OpenAI-compatible configurabile, senza dipendenza specifica da Ollama, LM Studio, llama.cpp o vLLM. Un URL localhost su Vercel non raggiunge il PC dell'utente.

Modalità: `cloud`, `local_preferred`, `local_only`, `auto`. Scopo e capacità sono contratti distinti: fast/normal/reasoning/vision/embeddings/image_processing contro text/tools/structuredOutput/vision/reasoning/embeddings/imageEditing. Compatibilità API non prova supporto delle capacità. Il router deterministico limita costo, timeout e fallback secondo AGENT.

OBSERVE legge, SUGGEST propone, ACT esegue soltanto dopo conferma. Nessun SQL libero al modello. Identità e household sono derivate sul server; gli argomenti modello non possono sostituirle. Le memorie fattuali, comportamentali ed episodiche sono recuperate per pertinenza dopo filtraggio dei permessi; nessuna raccolta indiscriminata della storia.

## Vision e privacy

Scontrino: originale privato → estrazione → proposta con confidenza per campo/riga → correzione → conferma → una spesa con più righe. Duplicati probabili generano avviso, non blocco assoluto.

Abbigliamento: originale privato → segmentazione separata → classificazione → revisione → item. I provider possono essere diversi; il fallimento della rimozione sfondo non impedisce salvataggio con originale dopo revisione. Nessuna promessa che materiale o marca siano identificabili con certezza.

`local_only` riguarda inferenza e processori; Supabase e Vercel restano infrastrutture cloud. L'interfaccia deve spiegare correttamente questa distinzione senza promettere un'app interamente offline.

## Esperienza desiderata

**Lingua del prodotto: italiano** (decisione utente 2026-10-09, D12). Tutto ciò che l'utente vede è in italiano: interfaccia, messaggi di errore, testi generati dai detector, email/notifiche future, e in fase 05 le risposte dell'assistente. Date e numeri in formato it-IT (es. «lun 14/09», «12,5»), `lang="it"`. Codice, identificatori, nomi di tabelle e commenti tecnici restano in inglese; la documentazione di progetto resta in italiano.

Mobile-first, gerarchia calma, spaziature generose, target tattili grandi, poche visualizzazioni superflue. Home: saluto, avatar household, calendario, goal, habit e osservazioni prioritarie. Navigazione candidata (schizzi 2026-09-30, etichette italiane): Home, Abitudini e obiettivi, Liste e note, Calendario, Baptista (assistente); avatar dei membri in alto; Kitchen, Finance e Wardrobe sono aree accessibili senza rendere Home un pannello aziendale. Token, componenti, colori di stanza/tipo/stato e pattern di lista sono definiti in [DESIGN_SYSTEM](architecture/DESIGN_SYSTEM.md).

**Stanze (D20, decisione utente 2026-10-09).** L'app è organizzata in quattro stanze: **Soggiorno** (stanza principale: cose da fare, eventi, obiettivi, abitudini, calendario), **Cucina** (posate o cappello da cuoco), **Finanze** (salvadanaio o moneta), **Guardaroba** (vestito e pantaloni). Niente riquadri in Home (D31): la stanza si sceglie dalla pillola nell'intestazione, che apre un pannello con le stanze su una riga. Cambiare stanza cambia leggermente lo sfondo generale e le tre voci centrali della barra; Home e Baptista restano fisse. Soggiorno: Home · Abitudini · Aggiungi · Calendario · Baptista. Cucina: Home · Dispensa · Aggiungi · Dieta · Baptista. Finanze: Home · Spese · Aggiungi · Budget · Baptista (D31). Guardaroba: Home · Capi · Aggiungi · Baptista. Home mostra il cruscotto della stanza scelta. Una pillola nell'intestazione permette di cambiare stanza da ogni pagina (porta alla Home della stanza); visitare una pagina di una stanza la rende la stanza ricordata; al cambio di stanza le tre voci centrali della barra scorrono in entrata e la voce attiva prende il colore della stanza.

**Cucina (D25, decisione utente 2026-10-10).** Le scadenze vivono dentro la Dispensa (sezione «Da controllare» in cima e badge per alimento): non esiste una pagina Scadenze. Aggiungi ha tre varianti: Alimento (con ricerca Open Food Facts per nome o codice a barre), Ricetta e Pasto (D31 ha poi spostato ricette e pasti sul catalogo alimenti: vedi sotto). Dieta è un conta calorie personale e privato: diario giornaliero per pasto (colazione, pranzo, cena, spuntini) da alimento, pasto salvato o inserimento rapido, con obiettivo giornaliero facoltativo. I valori del diario sono snapshot; macro sconosciute appaiono come «—», mai stimate. Parte da approfondire con l'utente.

**Finanze (D26, decisione utente 2026-10-10).** Spesa e scontrino non sono sezioni distinte: lo scontrino è un modo di aggiungere una spesa, una scheda del modale «Aggiungi spesa» dentro Spese (attiva solo con provider vision verificato). Budget riunisce budget mensili (totale e per categoria, confrontati con il ritmo del mese) e progetti di spesa (vacanze, lavori…) con preventivo a voci modificabile nel tempo, preventivo iniziale conservato e spese collegate. La Watchlist con TradingView è stata rimossa in D31.

**Connessioni e Baptista deterministico (D30, fase 04.1).** Le stanze sono collegate da proposte, mai da automatismi: la Lista della spesa della casa (unica, condivisa, in cima alla Dispensa e fissata per prima in Aggiungi → Liste; sezioni Alimenti e Altro; spunta di un alimento = comprato e in dispensa, «Tutto in dispensa» per gli alimenti visibili, righe già in dispensa con sfondo rosso tenue; annulla per 30 s), «L'hai comprato?» per i capi nuovi con spesa collegata (oppure «Era già mio» / «È un regalo»; «Erano già miei» in blocco solo da 7 capi), registrare la spesa dopo «Tutto in dispensa», rimettere in lista ciò che è finito, diario dopo il consumo, capo dalla spesa di abbigliamento, avvisi di budget 80/100%, prodotti abituali, ingredienti mancanti di una ricetta, obiettivi che avanzano con un'abitudine. «In evidenza» è diventato Baptista: un personaggio con quattro espressioni che parla in micro‑conversazioni a eventi (nota → rispondi → conferma → torna alla tua giornata), con frasi da template, opzioni esplicite e conferme solo dopo esito reale; nel Soggiorno apre con una battuta o una citazione del giorno. Tutte le liste usano lo stesso componente ad accordion.

**Semplificazione (D31, utente 2026-10-11).** Cucina: un **catalogo alimenti di casa** alimenta dispensa, Lista della spesa, ricette e pasti (prima gli alimenti di casa, poi Open Food Facts, altrimenti «Nuovo alimento»); Aggiungi aggiunge solo un alimento, in dispensa o in lista; la Home della Cucina è il **ricettario di famiglia** (ricette con ingredienti dal catalogo e quantità facoltative); i **pasti** (alimenti con grammi, per le calorie) restano distinti e una ricetta si aggiunge a un pasto. Finanze: niente Watchlist; barra Spese · Aggiungi · Budget, «Progetti» al posto di «obiettivi di spesa». Guardaroba: Capi · Aggiungi. La stanza si cambia solo dalla pillola nell'intestazione.

**Utenti (D33, decisione utente 2026-10-12).** Baptista è un'app di famiglia, non distribuita: chi la usa è scritto nella tabella `baptista.app_users` (email, nome, casa, ruolo), gestita dal pannello di Supabase. Si entra con email e password dell'account esistente; niente registrazione, inviti, onboarding o creazione di altre case nell'app. Casa attuale «FAMILIADA» con due proprietari (Paolo, Laia). Installata sul telefono («Aggiungi a schermata Home»), l'app ha come icona Baptista (espressione «confirmation»).

**Categorie (D24).** Abitudini e obiettivi possono avere una categoria. Esistono categorie di sistema (per tutti) e categorie personali create da ogni utente; ognuno vede nel proprio elenco solo quelle di sistema e le proprie. Ogni categoria ha un colore, che colora anelli e grafica dell'abitudine/obiettivo. Su un elemento condiviso, gli altri membri vedono nome e colore della categoria personale usata, ma non possono assegnarla né la vedono nel proprio elenco.

**Modulo Aggiungi (D21).** Da fare, eventi, note e liste sono quattro varianti di uno stesso modulo «Aggiungi» (sostituisce «Liste»), con l'elenco degli elementi del tipo scelto. **Calendario** come griglia mensile con giorni apribili (eventi e cose da fare in scadenza). **Abitudini e obiettivi** mostrati con anelli colorati di avanzamento rispetto all'obiettivo (settimanale per le abitudini).

Le prime UI sono funzionali; la fase 06 integra identità visiva e interazioni. Gli schizzi in `docs/sketches/` sono riferimenti UX, non specifiche tecniche: avatar famiglia in alto, barra di navigazione in basso (Abitudini e obiettivi, Guardaroba, Liste e note, Calendario, Assistente AI), relazioni obiettivi↔abitudini↔calendario.

## Completamento del prototipo

Il prototipo è completo soltanto dopo tutti i gate: sicurezza tra utenti/household, domini utilizzabili senza AI, review visuale, conferme resistenti a replay, routing privato verificato, gestione errori, build e demo riproducibile. Nessuna funzione futura è necessaria per superare il gate finale.
