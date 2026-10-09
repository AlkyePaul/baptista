# PHASE 02 — Auth, household e permessi

## Goal

Rendere utilizzabile autenticazione e contesto household con autorizzazione testata end-to-end.

## Why this phase exists

Il prodotto deve conoscere utenti e confini prima di accettare dati personali o domestici.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 01 con RLS verificata; schema base disponibile nell’ambiente di sviluppo; API SSR compatibili e callback autorizzati. Leggere SECURITY e sezioni identità di DATABASE.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Login/logout, sessione server, profilo, creazione household, membership con accettazione, selezione household e fondazioni private/household.

## Explicitly out of scope

Domini successivi, inviti email pubblici, recupero dati dopo uscita, ruoli complessi, selected_members operativo, AI e UI finale.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Implementare login email/password con errori neutri, logout e recupero sessione/callback coerente; registrazione e reset password se supportati dalla configurazione Auth scelta, con redirect allowlist Baptista aggiunto senza sostituire GuideApp.
2. Provisionare profilo Baptista al primo accesso in modo idempotente; non importare il profilo GuideApp e non modificare l’utente Auth globale per preference del dominio.
3. UI creazione household usa procedura bootstrap; lista household contiene soltanto membership attive e inviti pending destinati all’utente.
4. Owner propone membership a utente esistente risolto sul server; destinatario accetta; aggiunta non attribuisce accesso prima dell’accettazione. Impedire enumerazione pubblica degli utenti.
5. Contesto household verificato per ogni route/server action. Selezione in cookie è solo hint; fallback esplicito se membership revocata. Cache sempre keyed per utente/household.
6. Implementare aggiornamento name/timezone household da owner, profilo proprio e trasferimento owner/revoca controllati; impedire rimozione ultimo owner.
7. Esporre API autorizzazione riutilizzabile per domini successivi e validazione visibilità private/household; selected_members viene rifiutato.
8. Testare browser/server/DB contro household falsificata e sessioni diverse; aggiornare STATUS con prove.

## Expected files/components/modules

app/(auth)/ e route protette; lib/auth/require-user.ts, lib/households/context.ts, permissions.ts; services/households/; components/household-switcher.tsx e schermate membership. Equivalenti esistenti sono validi.

## Database work if applicable

Affinare solo fondazioni 01 se la UX evidenzia una lacuna; ogni modifica richiede migration e test. Nessuna tabella dominio.

## Security considerations

Session refresh e routing non bastano: ogni operazione server rilegge membership. Revoca svuota dati/cache; admin non ottiene dati privati. Non usare user_metadata come ruolo.

## Tests / validation

Creazione/accettazione/switch/logout; due utenti e due household; accesso anon; revoca mentre pagina è aperta; ID falsificati; owner transfer e ultimo owner. Build/lint e test RLS devono passare.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Flusso identità funzionante, contesto household affidabile e servizio permessi riutilizzabile.

## Definition of done

Utente senza membership vede onboarding; utente con membership vede solo household autorizzate. Gate sicurezza 02 documentato prima dei domini. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 03 ExecutionContext/contratti autorizzazione e test fixtures. UI resta semplice; non anticipare dashboard finale.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
