# PHASE 04 — Advanced domains (deterministici)

> **D28 (decisione utente 2026-10-10):** la fase 04 chiude un prodotto interamente deterministico. Router AI, ai_settings/ai_runs, visual_intakes, estrazione scontrini e classificazione/segmentazione del guardaroba passano all'inizio della fase 05. I punti sotto relativi alla vision restano come riferimento del contratto, eseguiti in 05.

## Goal

Cucina, Finanze e Guardaroba utilizzabili senza AI: inventario e diario, spese/budget/progetti, capi fotografati e classificati a mano con foto private.

## Why this phase exists

La vision trasforma input non strutturati in proposte verificabili senza diventare un agente con poteri di scrittura.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 03 passato; storage privato configurabile; provider almeno uno per smoke vision o percorso manuale esplicito. Leggere VISUAL_INTAKE, SECURITY e sezioni routing di AGENT.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Food inventory e detector; finance manuale e righe; wardrobe manuale; bucket privati con validazione upload e derivati senza EXIF; foto dello scontrino allegabile alla spesa senza estrazione. (Fino a D28 lo scope includeva anche adapter vision/image_processing, registry/privacy/settings minimi, ai_runs e receipt intake: ora in fase 05.)

## Explicitly out of scope

Conversazione Baptista, memory/embedding, orchestrazione cross-domain, suggerimenti agent, outfit, banche, anomalie e UI finale.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Migrazioni dei domini avanzati, visual_intakes, ai_settings e ai_runs. Policy granulari e FK parent household; introdurre bucket privati/policy limitati a Baptista.
2. CRUD food con quantità/unità, date/provenienza scadenza, storage e stati. Detector scadenza esplicita entro 2 giorni; stima usa linguaggio cauto; oldFood segnala verifica dopo soglia per categoria configurata, non sicurezza alimentare.
3. Finance manuale: categorie household idempotenti, expense/items, totali filtrati per visibilità e valuta. Nessuna somma multi-valuta senza conversione dichiarata.
4. Implementare unico adapter/registry/router destinato ad essere esteso in 05: solo scopi vision e image_processing, quattro modalità e consenso fallback server. Telemetria senza contenuti.
5. Upload validato e intake persistito; lifecycle riprendibile con lease e cleanup. Output strutturato validato non scrive domini.
6. Receipt estrazione per campi/righe, warning confidenza/discrepanze, duplicate detection autorizzata, review e conferma atomica one expense/many items.
7. Wardrobe originale/derivato separati, adapter segmentazione distinto, classificazione correggibile e salvataggio singolo capo. Fallback originale/manuale esplicito quando processore non supportato.
8. Eseguire smoke reale dei processori disponibili e prove rete local_only; registrare provider/capacità realmente funzionanti, non dichiarare completata vision testata solo con mock.
9. Aggiornare documenti proprietari solo per decisioni implementate e STATUS con job/provider limits.

## Expected files/components/modules

services/food, finance, wardrobe, intake; lib/storage; ai/providers, registry.ts, router.ts, telemetry.ts introdotti in forma minima; schermate upload/review; migrations; test visuali e privacy.

## Database work if applicable

Tabelle e bucket della fase, no memories/suggestions/action_proposals. ai_runs può già contenere contratto telemetria completo per evitare migration incompatibili, ma non implica implementare agent.

## Security considerations

Intake è privato all’uploader; conferma revalida membership e scelta visibilità. local_only include rimozione sfondo e OCR; nessuna URL arbitraria o bucket reso pubblico.

## Tests / validation

Expiry esplicita vs stimata, consumed elimina osservazione, valute e arrotondamenti, duplicate override, double-click, upload falsificato/oversize, timeout, retry, malformed JSON, revoca, immagini private e zero AI cloud in local_only. Build/lint e smoke provider.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Food/finance/wardrobe usabili manualmente e con intake vision quando capability disponibile; review e conferma verificati; router minimo condiviso.

## Definition of done

**Dopo D28:** domini Cucina/Finanze/Guardaroba usabili e verificati senza AI; upload validato (byte reali, MIME, dimensioni, pixel), foto private leggibili solo secondo la visibilità del record, derivati senza EXIF, nessun provider AI chiamato. Il testo seguente vale per la pipeline vision, ora criterio della fase 05.


Almeno una pipeline vision concreta validata, separazione segmentazione/classificazione effettiva e tutti i fallback privacy-safe. Provider indisponibile non blocca CRUD manuale, ma una pipeline non verificata resta issue/gate incompleto. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 05 gli adapter esistenti e i limiti capacità. Estendere questi moduli, non introdurre un secondo router concorrente.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
