# PHASE 03 — Core deterministic domains

## Goal

Calendario, task, note/liste, goal e habit realmente utilizzabili senza AI, con primi eventi e osservazioni.

## Why this phase exists

Baptista costruisce valore e fatti affidabili prima del ragionamento generativo.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 02 sicurezza passato; context e autorizzazione riutilizzabili. Leggere DATABASE per domini/eventi e AGENT per detector/ranking deterministici.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

CRUD essenziale dei cinque domini, servizi server, eventi transazionali, detector, ranking e briefing deterministico con UI funzionale.

## Explicitly out of scope

Food/finance/wardrobe, upload immagini, provider AI, chat, embedding, action_proposals, suggerimenti LLM, notifiche push, calendari esterni e ricorrenze complesse.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Migrazioni per calendar_events, tasks, notes, goals, habits, habit_entries, events e observations; policy prima dei grants.
2. Servizi di dominio indipendenti React: validazione, autorizzazione, CRUD e mutazione+evento atomica. La UI non emette il proprio evento separato dalla scrittura.
3. Calendar timed/all-day e vista oggi/prossimi rispettano timezone; task scaduti/completati; note/list con checklist semplice; goal progresso; habit target settimanale con entry giornaliera idempotente.
4. Implementare detector con clock esplicito: upcoming events entro 24h, overdue task, habit sotto target nella settimana conclusa, progresso settimanale corrente e goal cambiato. Evitare di presentare mancata registrazione come comportamento certo.
5. Osservazioni con audience ereditata, dedupe_key, valid_until e lifecycle; resolve quando la fonte non soddisfa più condizione. Refresh on-demand limitato e idempotente, anche senza nuovi eventi.
6. Implementare ranking AGENT in un modulo e briefing deterministico top 3. Dismiss manuale come gesto utente; non creare ancora chat o write tools AI.
7. Liste paginate, stati vuoti/errore, concorrenza tramite versioni; aggiornamento UI dopo mutazione con refetch. Realtime non necessario salvo collaborazione dimostrata e policy verificate.
8. Testare domini e calcoli senza qualunque credenziale/provider AI; aggiornare STATUS con limiti accettati.

## Expected files/components/modules

services/calendar, tasks, notes, goals, habits; services/events; intelligence/detectors e priority.ts; componenti e route funzionali dei cinque domini; migrations e test dominio/RLS.

## Database work if applicable

Le tabelle della fase con FK composite per figli e indici dei percorsi di lettura. events/observations non sono scrivibili direttamente dal browser; procedure di dominio hanno permessi ristretti.

## Security considerations

Campi owner/household/created_by non riassegnabili via update generico. Osservazioni e payload non rendono visibile una nota privata a tutta la famiglia.

## Tests / validation

Test timezone/DST, settimana a cavallo mese, target 1/7, doppia entry, goal target zero rifiutato, completamento riapertura, eventi atomici su rollback, detector ripetuto senza duplicati, fonte privata e revoca. Build/lint.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Cinque domini completi con UI essenziale e briefing deterministico, eventi e osservazioni verificati.

## Definition of done

Un utente può organizzare e aggiornare la household senza AI. Refresh ripetuto non duplica fatti; nessun accesso cross-household o cross-private. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 04 pattern eventi/observazioni, moduli calcolo e limiti UI. Tabelle avanzate restano assenti finché inizia 04.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
