# PHASE 05 — Baptista agent

## Goal

Integrare agente, strumenti, memoria e azioni confermate sopra domini già funzionanti.

## Why this phase exists

Il modello ragiona su fatti pertinenti senza diventare fonte di autorizzazione o logica di dominio.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 04 passato; router e processori minimi disponibili; leggere AGENT e SECURITY integralmente, DATABASE per tabelle intelligence.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

AI SDK/Gateway e privato; routing text/embedding esteso; tools read/proposal; conversation, briefing opzionale, suggerimenti, memorie, notifiche in-app, settings e telemetria.

## Explicitly out of scope

Fine-tuning, SQL libero, azioni autonome, push/email/WhatsApp, manutenzione, smart home, outfit, ragionamento sull’intero DB o cloud fallback senza consenso.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Estendere registry/router 04 a fast/normal/reasoning/embeddings; verificare capacità tool/structured output dei modelli configurati. AI Gateway default cloud e adapter OpenAI-compatible privato.
2. Migrazioni suggestions, action_proposals, notifications e memories con audience e filtri; completare ai_settings/ai_runs senza duplicarne le fonti.
3. Implementare ExecutionContext server e tool di lettura AGENT compatti/paginati. Tool scrittura generano solo proposte validate; executor separato dopo conferma.
4. Conversazione con contesto limitato, regole prompt injection, max step/tool call/token, timeout, budget e messaggi errore. La UI mostra quali tool/proposte sono stati prodotti, senza log sensibili.
5. Lifecycle conferma con payload persistito, scadenza, idempotenza, versioni e transazione dominio/evento/esito. Revoca o stale source nega prima del write.
6. Briefing top 3 deterministico con optional synthesis; suggerimenti riferiscono osservazioni/fonti; feedback accepted/dismissed e cooldown persistenti.
7. Memoria esplicita/correggibile, retrieval top 5 scoped, pgvector dimensionato alla configurazione e fallback testuale. Nessuna generazione embedding cloud in local_only.
8. Settings modalità, consenso per purpose e budget; policy household prevale su preference utente. Telemetria per tentativo/correlation con costi unknown distinti da zero.
9. Scheduler soltanto se necessario e supportato: route autenticata, batching/lock e retry idempotente; on-demand resta fallback.
10. Verificare end-to-end con provider concreto e test negativi autorizzazione/rete; aggiornare STATUS.

## Expected files/components/modules

ai/agent, tools, context, memory; estensione ai/providers/registry/router/telemetry già esistenti; services/suggestions e action-proposals; route conversation/confirmation; UI chat, briefing e settings funzionali; migrations intelligence.

## Database work if applicable

Tabelle intelligence di questa fase con RLS; embedding nullable, migration dimensione definita sul modello effettivo. Nessun vettore condiviso tra modelli incompatibili.

## Security considerations

Ogni tool revalida scope; un output modello non può cambiare identità/household. Sintesi privata non entra in scheda condivisa. Conferma riguarda gli argomenti mostrati e non quelli rigenerati.

## Tests / validation

Mode matrix per testo/vision/segmentazione/embedding; fallback con/senza consenso; tool injection; replay/scadenza/revoca/conflitto; retrieval privata; telemetry unknown/failure; limiti loop/budget; briefing AI off; smoke reale tool/structuredOutput e build/lint.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Agente limitato e osservabile, memoria scoped, azioni realmente confermate, cloud/privato sostituibili e fallback deterministico.

## Definition of done

Le chiamate AI rispettano modalità su tutta la pipeline; nessuna mutazione avviene in generazione; test e smoke concreti passano. Le feature base funzionano con AI disabilitata. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 06 contratti schede, action UI, settings/errori e limiti provider; non creare nuovi domini durante polish.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
