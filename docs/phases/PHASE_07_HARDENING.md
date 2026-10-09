# PHASE 07 — Hardening e demo readiness

## Goal

Verificare il prototipo oltre happy path e preparare una demo riproducibile.

## Why this phase exists

Confini multiutente, errori esterni e dati sintetici devono essere affidabili quanto la presentazione.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 06 passato; tutte le prove precedenti disponibili; ambiente isolato con due household; provider/failure injection configurabili. Leggere documenti proprietari per ogni difetto trovato.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Regressione RLS/Auth/storage/tools, edge case, provider/privacy, telemetria, prestazioni misurate, build/lint, seed demo sintetico e procedura di recupero.

## Explicitly out of scope

Nuovi domini, ruoli complessi, app mobile nativa, migrazione a Supabase dedicato, integrazioni future e rollout pubblico non richiesto.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Eseguire suite accesso con anon, owner/member, estraneo, revocato e multi-household su domini, RPC, views, immagini, derivati, memoria e telemetria.
2. Test concorrenti su membership, double confirm, versione stale, job duplicati e rollback mutazione/evento. Verificare che source deletion risolva/invalidi derivati.
3. Failure injection: provider down, endpoint privato non raggiungibile, malformed structured output, timeout, rate limit, budget esaurito e immagine corrotta. Manual CRUD e briefing deterministico devono restare disponibili.
4. Prova network local_only per ogni purpose e processore: nessuna chiamata AI cloud, inclusi retry, embedding e log contenuti. Verificare anche local_preferred con consenso assente/presente.
5. Confrontare telemetria con tentativi effettivi: tokens unknown, costo stimato con versione prezzi, fallback e failure rate; nessun segreto/contenuto loggato.
6. Misurare tempi delle viste con dataset demo e query paginate; analizzare indici/piani sulle query realmente lente. Evitare ottimizzazioni o indici vettoriali senza misura.
7. Creare seed demo sintetico idempotente, separato dalla produzione, con scadenze relative al clock, una foto autorizzata/test e casi errore; nessun dato GuideApp o familiare reale.
8. Verificare installazione da lockfile, build production, lint e walkthrough demo pulito. Documentare comandi verificati, env necessarie, limiti deployment e recupero da errori.
9. Correggere difetti direttamente nella componente proprietaria con regression test mirato; aggiornare docs e STATUS senza dichiarare test non eseguiti.
10. Preparare release candidate: elenco gate/pass, rischi residui concreti e checklist demo. Deployment Vercel è configurazione prevista; pubblicazione non è requisito implicito di questa fase.

## Expected files/components/modules

Test integrazione/e2e/DB; fixture e seed sintetici; correzioni ai moduli esistenti; STATUS con report gate e comandi demo. Non creare file documentali extra dentro docs se non richiesti.

## Database work if applicable

Solo migration correttive motivate da difetti. Seed e cleanup con guardie esplicite per ambiente e scope. Nessun reset del Supabase condiviso.

## Security considerations

Nessun gate incompleto su accesso cross-household, privacy local_only, scritture non confermate o immagini pubbliche. Questi difetti bloccano demo readiness.

## Tests / validation

Suite completa dei gate, network assertions, failure injection, multiutente e build/lint production. Performance registrata con hardware/ambiente/dataset per rendere i numeri interpretabili.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Prototipo verificato, demo riproducibile, stato aggiornato con evidenze e limiti reali.

## Definition of done

Tutti i gate critici passano; bug residui non compromettono sicurezza, privacy o integrità. Il record STATUS distingue release candidate locale da deployment remoto effettivo. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Chiudere il piano 00–07; aprire una nuova fase esplicita soltanto per futuri ampliamenti. Non iniziare automaticamente manutenzione, smart home, outfit o app Expo.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
