# PHASE 00 — Project setup

## Goal

Preparare un repository autonomo eseguibile e convenzioni sicure senza funzionalità di prodotto.

## Why this phase exists

Un ambiente riproducibile e confini chiari evitano di accoppiare Baptista a GuideApp o partire con configurazioni ambigue.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Accesso al repository locale fornito dall’utente; leggere AGENTS.md se presente, inventariare i file esistenti e la cronologia Git. La presenza di docs non implica che il repository sia vuoto. Non cancellare o rigenerare codice esistente senza analisi.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Next.js 16, React 19, TypeScript strict, Tailwind 4; infrastruttura client/server Supabase; ambiente, convenzioni migration e storage; pagina iniziale tecnica e gestione errori configurazione.

## Explicitly out of scope

CRUD di prodotto, tabelle dominio, login completo, household UI, detector, agent, provider AI, bucket remoti, deployment pubblico e riprogettazione UX.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Audit del repository: package, lockfile, app, configurazioni, segreti accidentalmente tracciati e docs presenti. Preservare lavoro esistente, registrare ciò che è già implementato solo dopo verifica.
2. Verificare release/API attuali, pin delle versioni precise compatibili e lockfile. TypeScript strict come linguaggio principale (D08); nessun sorgente .js/.jsx applicativo (allowJs false).
3. Avviare App Router e Tailwind; creare layout minimo mobile e una pagina che renda evidente che le feature sono successive.
4. Creare factory Supabase browser/server con schema baptista esplicito, server-only per moduli sensibili e integrazione cookie SSR raccomandata dalla versione scelta. Nessuna sessione verificata solo dal browser.
5. Creare .env.example con URL/chiave publishable Supabase e nomi server futuri descritti senza valori reali. Validare solo le variabili necessarie alla fase; AI assente non deve impedire build.
6. Configurare script dev/build/lint, convenzioni path e migration. Verificare CLI con --help prima di documentare comandi; ricostruire storia del progetto condiviso prima di ogni futura applicazione remota.
7. Smoke read non distruttiva della connessione se credenziali disponibili; altrimenti stato blocked per questa verifica, senza inventare successo. Non creare tabella public per testare connessione.
8. Definire nel repository procedure di review migration, ambiente isolato e nomi bucket privati. Aggiornare STATUS con ambiente e verifiche effettive.

## Expected files/components/modules

app/layout.tsx, app/page.tsx, app/globals.css; lib/supabase/client.ts, server.ts; lib/config/env.ts; .env.example; package.json e lockfile; configurazione lint/Next/Tailwind compatibile; supabase/config.toml solo dopo verifica della CLI. I percorsi sono convenzioni suggerite: riutilizzare equivalenti esistenti e registrare mappa nello stato.

## Database work if applicable

Nessuna migrazione di dominio. Inventario read-only degli schemi e delle configurazioni condivise se accessibile; non modificare exposed schemas o Auth globalmente.

## Security considerations

Verificare che bundle browser non contenga segreti; no service role in client, no log token. Stato errore configurazione non espone valori.

## Tests / validation

Installazione da lockfile, dev smoke, build, lint; verificare import server-only e typecheck (tsc --noEmit) senza errori. Connessione Supabase reale o blocco documentato, senza considerare uno stub prova di connessione.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Repository eseguibile, configurazioni riproducibili, factory Supabase e convenzioni documentate.

## Definition of done

Build/lint passano e connessione è verificata prima di iniziare 01; nessuna feature successiva presente per effetto di questa sessione. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 01 inventario migrazioni, versione DB/CLI, configurazioni condivise e limitazioni. Leggere DATABASE e SECURITY per il lavoro schema.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
