# PHASE 06 — Product UX

## Goal

Trasformare le UI funzionali in un prodotto mobile coerente, calmo e riconoscibile.

## Why this phase exists

La household deve poter leggere priorità e agire senza navigare in un pannello tecnico o usare sempre la chat.

## Entry conditions

Leggere [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md), [PRODUCTION_PLAN](../BAPTISTA_PRODUCTION_PLAN.md) e [STATUS](../BAPTISTA_STATUS.md). Gate 05 passato e percorsi funzionali esistenti. Leggere principi UX della specifica e contratti agent/intake rilevanti. Schizzi non presenti in questo pacchetto: procedere con i principi senza inventare loro contenuto.

Se una condizione manca, completare soltanto l'analisi indipendente e registrare il blocco: non saltare il gate e non implementare la fase successiva.

## Scope

Home, saluto/avatar, nav mobile, aree domini, schede osservazioni, review/confirmation, settings AI, stati vuoti/errori e accessibilità.

## Explicitly out of scope

Nuove tabelle dominio, nuovi tool, smart home, outfit, Expo app, subscription, sito marketing e riscrittura logica deterministica.

## Architecture constraints

Valgono invarianti MASTER_SPEC e contratti architecture. Repository standalone, TypeScript (strict), schema baptista, nessuna dipendenza GuideApp. Fonte tecnica: [DATABASE](../architecture/DATABASE.md), [SECURITY](../architecture/SECURITY.md), [AGENT](../architecture/AGENT.md), [VISUAL_INTAKE](../architecture/VISUAL_INTAKE.md); leggere le parti indicate negli entry conditions. Importare un contratto futuro non autorizza a costruirne la feature. Le dipendenze mancanti sono blocchi, non una deroga implicita.

## Implementation tasks

1. Inventariare flussi e definire token visivi CSS: colori calmi, tipografia, spacing, radius e gerarchia. Riutilizzare Tailwind 4 e componenti esistenti.
2. Home integra calendario oggi, habit/goal e top osservazioni; evidenzia cosa richiede attenzione senza decine di KPI. Avatar rispettano privacy storage.
3. Implementare navigazione candidata Home/Habits/Lists/Calendar/Baptista e accesso chiaro Kitchen/Finance/Wardrobe; validare etichette per assenza ambiguità Home vs futura stanza casa.
4. Rendere le schede contestuali tracciabili a fonti e azioni; mantenere distinction date esplicite/stime e nessuna promessa di sicurezza alimentare.
5. Consolidare conversazione e action proposal: cosa cambia, conferma, annulla, conflitto e successo senza doppie esecuzioni. UI non decide permessi.
6. Receipt/wardrobe review utilizzabile da telefono, campi confidence evidenziati, progress/error/retry e manual input disponibili.
7. Settings spiegano cloud/private, fallback e local_only come inferenza privata, non app offline. Non esporre URL segreti, chiavi o dettagli implementativi irrilevanti.
8. Verificare target tattili almeno 44px, focus/tastiera, label, contrasto, screen reader, reduced motion, scroll e safe-area; testare a 360/390/768px e desktop.
9. Screenshot e walkthrough dei percorsi principali; correggere overflow/stati carenti; aggiornare STATUS con eventuali scelte UX senza cambiare regole tecniche.

## Expected files/components/modules

components/ui e componenti dominio; app route/layout; app/globals.css/design tokens; Home e navigation; adattamenti review/confirmation/settings. Logica rimane nei servizi esistenti.

## Database work if applicable

Nessun nuovo modello dati. Un cambiamento necessario ai dati richiede documentazione, migration e test della fase proprietaria prima del polish dipendente; non mascherarlo come puro UI.

## Security considerations

Nessun dato privato nei preview household, negli avatar firmati persistiti o nelle cache. Stati forbidden non devono mostrare il contenuto per un frame prima della redirezione.

## Tests / validation

Walkthrough mobile con AI off/on, tastiera, focus, screen reader smoke, contrasto, errori provider/storage, cambio household e private cards. Build/lint e regressione dei contratti toccati.

Le prove devono indicare comando/scenario, ambiente e risultato reale. Un test saltato è un limite esplicito, non un pass. Non moltiplicare test che rispecchiano soltanto il codice; privilegiare vincoli, confini e casi di fallimento.

## Deliverables

Home e navigazione coerenti, flussi visuali/azioni rifiniti, design system leggero e prove visuali.

## Definition of done

Percorsi principali funzionano su telefono senza overflow o dipendenza dalla chat; accessibilità minima verificata; nessuna regressione ai gate di sicurezza. Moduli e migrazioni sono revisionabili; nessun segreto tracciato; docs allineati al comportamento; STATUS riporta ciò che è realmente verificato.

## Exit conditions

Completare i deliverable e i controlli descritti; registrare evidenze e blocchi in STATUS. Un problema su autorizzazione, privacy o integrità impedisce l'uscita. Non iniziare automaticamente la fase seguente al superamento del gate: la sessione corrente termina con il handoff.

## Handoff to next phase

Passare a 07 lista percorsi demo, viewport verificati, bug residui classificati e configurazione effettiva provider.

Il resoconto di sessione specifica commit/file, migration, prove, configurazioni manuali e limiti. STATUS contiene il puntatore canonico di avanzamento; non mantenere un secondo registro parallelo.
