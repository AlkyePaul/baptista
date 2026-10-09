# PHASE 01 — Database foundations

## Goal

Creare schema baptista e fondazioni relazionali di identità/household con accesso fail-closed.

## Why this phase exists

L’isolamento del progetto condiviso e l’integrità dei riferimenti devono precedere ogni UI autenticata.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 00 verificato; connessione disponibile; ambiente DB isolato e inventario dello shared project. DATABASE e SECURITY sono letture obbligatorie, oltre ai tre documenti radice.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Schema, profiles, households, household_members; constraints, indici, RLS iniziale, helper minimi, migration e fixture di test.

## Explicitly out of scope

Tabelle Calendar/Tasks/Notes/Goals/Habits, inventario, spese, guardaroba, events/observations, memorie, ai_runs, intake e agent. Nessuna UI polished, nessun provider, nessun reset remoto.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Modellare le tre tabelle secondo DATABASE, membership pending/active/revoked e role owner/member. Separare profilo self-only dalla directory minima autorizzata dei membri.
2. Aggiungere unique membership e vincoli role/state/timezone; definire bootstrap household+owner transazionale verificato e protezione ultimo owner.
3. Implementare policy e grants minimi con anon escluso. Eliminare ricorsione policy membership con helper ristretto se necessario; fissare search_path e EXECUTE.
4. Verificare l’esposizione baptista senza alterare public. Non concedere ALL generico né default privileges che espongono tabelle future.
5. Generare migration incrementale con CLI corrente, applicare su ambiente isolato e validare schema. Documentare differenze fra SQL versionato e configurazioni Dashboard inevitabili.
6. Fixture idempotenti per due household, utenti distinti e revocato: Auth utenti solo in ambiente test con API admin appropriata, niente password reali o utenti GuideApp modificati.
7. Eseguire test DB negativi sotto ruoli effettivi e ispezione catalogo per grants/FK/policy. Registrare diff che mostra nessuna alterazione GuideApp.
8. Aggiornare DATABASE soltanto per decisioni concrete compatibili e STATUS con migration ID, risultati e configurazioni ancora manuali.

## Expected files/components/modules

supabase/migrations/ migration generata; supabase/tests/ test SQL; supabase/seed.sql con dati sintetici e guardie ambiente; lib/auth/ o lib/households/ soltanto contratti utili alla fase successiva. Non creare servizi dei domini futuri.

## Database work if applicable

Solo le tre tabelle base e funzioni/policy necessarie. RLS fail-closed pronta prima di esporre dati. Storage bucket e tutte le tabelle dominio saranno introdotti nella fase proprietaria.

## Security considerations

Bootstrap non permette scegliere arbitrariamente creator/owner. Membro non può auto-promuoversi. I helper privilegiati non sono endpoint di lettura generale.

## Tests / validation

Migration da DB pulito isolato e ripetizione seed; accesso anon/estraneo/revocato negato; membership senza ricorsione; ultimo owner protetto; FK e grants corretti. Nessuna assertion basata soltanto su service role.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Migration riproducibile, schema base e matrice di test sicura, inventario delle eccezioni infrastrutturali.

## Definition of done

Tre tabelle e procedure base passano test isolamento e diff non tocca domini public. Deployment remoto non è prova obbligatoria se test DB isolato è completo e viene dichiarato. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 02 i contratti bootstrap/membership, auth configurata, risultati RLS e stato delle configurazioni remote. Non presentare DB isolato come già applicato a produzione.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
