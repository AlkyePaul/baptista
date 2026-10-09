# BAPTISTA — Piano di produzione

## Scopo e autorità

Il piano possiede ordine, dipendenze e confini. MASTER_SPEC possiede prodotto/invarianti; architecture possiede i contratti tecnici. STATUS possiede l'avanzamento verificato. Questi documenti non attestano che il repository Windows o il progetto Supabase siano stati ispezionati.

## Sequenza e gate

| Fase | Documento operativo | Entry | Exit essenziale |
| --- | --- | --- | --- |
| 00 | [PROJECT_SETUP](phases/PHASE_00_PROJECT_SETUP.md) | repository accessibile e audit | build/lint, config e connessione verificate |
| 01 | [DATABASE](phases/PHASE_01_DATABASE.md) | gate 00 + DB isolato | schema base, RLS fail-closed e diff isolato |
| 02 | [AUTH_HOUSEHOLD](phases/PHASE_02_AUTH_HOUSEHOLD.md) | gate 01 | flusso household e gate sicurezza multiutente |
| 03 | [CORE_DOMAINS](phases/PHASE_03_CORE_DOMAINS.md) | gate 02 | domini senza AI, eventi/observations idempotenti |
| 04 | [ADVANCED_DOMAINS](phases/PHASE_04_ADVANCED_DOMAINS.md) | gate 03 | food/finance/wardrobe, vision concreta e review |
| 05 | [BAPTISTA_AGENT](phases/PHASE_05_BAPTISTA_AGENT.md) | gate 04 | tools, memoria, routing e conferme verificati |
| 06 | [PRODUCT_UX](phases/PHASE_06_PRODUCT_UX.md) | gate 05 | Home/mobile e percorsi coerenti |
| 07 | [HARDENING](phases/PHASE_07_HARDENING.md) | gate 06 | regressione critica e demo riproducibile |

Ogni gate dipende da tutti i precedenti. Un gate fallito non viene aggirato con uno stub presentato come feature completa. Aiuta distinguere prototipo locale, ambiente test e deployment remoto: passare test isolati non significa aver applicato migration remote.

## Perché questo ordine

Setup precede schema; schema e isolamento precedono identità; autorizzazione precede dati. Domini strutturati precedono AI perché alimentano calcoli e strumenti affidabili. I processori visuali di 04 trasformano dati in bozze senza orchestrazione; 05 aggiunge l'agente sopra lo stesso routing. La fase 06 rifinisce frontend già esistenti; 07 consolida test già introdotti a ogni fase.

## Dipendenze anticipate esplicite

- 01 implementa household/profiles/membership; i contratti delle altre tabelle sono documentati ma migrati dalla fase proprietaria. Evitare tabelle future inattive per «preparare tutto».
- 03 implementa events, observations e ranking deterministico. Non dipendono da SDK o modello AI.
- 04 implementa ai_settings minimi, ai_runs, registry, provider adapter e router per vision/image_processing. La modalità local_only deve essere sicura già qui. Non rinviare privacy al 05.
- 05 estende gli stessi moduli a testo/tool/embedding e introduce memoria/suggerimenti/proposte. Nessun doppio router o seconda policy fallback.
- UI funzionale, RLS, validazione e casi errore nascono insieme alla feature; non vengono rinviati al polish o hardening.

## Protocollo di sessione per coding agent

1. Leggere MASTER_SPEC, questo piano, STATUS e solo la fase corrente come mandato operativo. Aprire i documenti architecture referenziati per contratti necessari: «solo la fase» non significa ignorare tali dipendenze normative.
2. Leggere AGENTS.md e ispezionare repository reale. I percorsi suggeriti non autorizzano a sovrascrivere strutture esistenti.
3. Verificare entry conditions, descrivere piano limitato alla fase e lavorare fino al gate o a un blocco concreto.
4. Implementare soltanto scope corrente. Se manca una dipendenza prevista, registrarla; se è un difetto preesistente, correggere il minimo necessario con prova di regressione e spiegazione in STATUS. Nessuna feature di fase futura implicita.
5. Eseguire controlli appropriati, aggiornare contratto proprietario se necessario, poi STATUS con file/commit/prove/limiti e handoff.
6. Terminare la sessione con fase completata o blocked. Non avanzare automaticamente solo perché resta tempo.

## Fonti uniche

| Decisione | Proprietario |
| --- | --- |
| Identità, stack, prodotto, vincoli permanenti | MASTER_SPEC |
| Tabelle, constraints, eventi e strategia migration | architecture/DATABASE |
| Permessi, privacy, storage access e segreti | architecture/SECURITY |
| Routing, priorità, tools, memoria, conferme e telemetria | architecture/AGENT |
| Pipeline immagine, proposta e review | architecture/VISUAL_INTAKE |
| Ordine, gate e scope di esecuzione | questo piano e file fase |
| Avanzamento, evidenze e blocchi | STATUS |

I riepiloghi nelle fasi sono guardrail di esecuzione. Modificare prima il proprietario; non introdurre valori concorrenti in UI, test o altri documenti.

## Cambiamenti e disciplina di scope

Nessuna soglia documentale è una verità immutabile: i default tecnici sono iniziali, versionati e modificabili con motivazione/evidenza. Cambiamenti di privacy, autorizzazione o separazione GuideApp richiedono decisione esplicita dell'utente; non sono refactor ordinari. Modifiche operative coerenti possono essere decise dall'agente e registrate.

Deployment Vercel e applicazione al Supabase condiviso richiedono un piano concreto che preservi GuideApp; nessuno di questi documenti autorizza reset o cancellazioni di dati esistenti. La produzione di questa documentazione non avvia sviluppo o deploy.

## Prompt iniziale di implementazione

> Read docs/BAPTISTA_MASTER_SPEC.md, docs/BAPTISTA_PRODUCTION_PLAN.md, docs/BAPTISTA_STATUS.md and docs/phases/PHASE_00_PROJECT_SETUP.md. Inspect the actual repository and applicable AGENTS.md. We are implementing Phase 00 only. Follow referenced architecture contracts where needed. Do not implement subsequent phases. Update STATUS with verified outcomes and blockers, then stop at the phase handoff.
