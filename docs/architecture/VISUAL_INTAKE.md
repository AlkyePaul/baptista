# VISUAL_INTAKE — Immagini, bozze e conferma

Contratto di intake introdotto in fase 04. Registry e privacy sono in AGENT/SECURITY; struttura dati in DATABASE. Non richiede l'agente conversazionale della fase 05.

## Pipeline e stati

Upload autenticato → validazione byte/dimensioni → originale privato → intake persistito → preprocessing → processamento purpose-specific → validazione output → bozza → review/correzione → conferma → transazione di dominio/evento.

Stati: uploaded, processing, needs_review, confirmed, failed, cancelled, expired. Processing usa lease con timeout; retry non genera una nuova spesa. I run provider sono tracciati. La pagina può riprendere un intake attraverso ID dopo reload, verificando uploader e membership. Limite iniziale un job concorrente per utente; code grandi non richieste.

Bozze scadono dopo 7 giorni; cleanup autenticato elimina originali/derivati di bozze scadute o cancellate. Record confermati mantengono immagini finché l'utente non elimina il record o l'immagine; nessuna conservazione eterna implicita dei file abbandonati. Cleanup idempotente e scoped, non ricerca distruttiva su tutti i bucket.

Preprocessing può ridimensionare/ruotare e produrre derivato privo EXIF senza alterare l'originale. Non assumere che preprocessing, segmentazione, OCR e classificazione siano lo stesso modello. Una fase sync breve è accettabile; se supera il timeout deployment usare job persistito con polling autorizzato. Nessun lavoro essenziale lasciato a una promise dopo risposta Vercel.

## Scontrini

Schema proposta versionato: merchant, occurred_on/occurred_at con precisione esplicita, currency, subtotal, tax, discounts, total, payment_method; items[] con raw_description, normalized_description, quantity, unit_price, line_total, category, field_confidence e overall_confidence. Ogni campo può essere null quando non leggibile; confidenza [0,1] è segnale di revisione, non probabilità scientificamente calibrata.

Soglia iniziale <0.80 evidenzia revisione, ma anche alta confidenza richiede conferma. Il sistema non inventa quantità/date o EUR per default senza input utente. Categorie inferite si risolvono solo fra categorie della household. Totali non quadrati, valuta mancante e data illeggibile sono evidenziati; richiesta minima per conferma: data, valuta, totale e descrizioni delle righe salvate. Consente spesa manuale senza analisi riuscita.

Duplicati: merchant normalizzato, stessa household, stessa data e valuta, totale entro 0.01 nella valuta con due decimali (tolleranza adattata alle minor units). Hash file è segnale aggiuntivo, non identità dell'acquisto. Cercare solo record visibili al confermante per non rivelare spese private altrui. Avviso mostra candidati autorizzati; l'utente può confermare «è un altro acquisto». Serializzazione/idempotenza dell'intake impedisce doppio salvataggio da doppio click, ma non blocca due acquisti legittimi uguali.

Conferma: expense + expense_items + collegamento intake + receipt.imported nella stessa transazione DB, file già caricato. Se DB fallisce intake rimane recuperabile; se upload fallisce nessun record confermato promette un'immagine inesistente. Originale resta privato; download autorizzato.

## Guardaroba

Proposta: type, subtype, brand, primary_color, secondary_colors, pattern, estimated_material, season, style, formality, weather_suitability, visible_text/logo, tags e confidenza per attributo. Non trasformare stima materiale in certezza. Immagini con più capi chiedono crop/selezione di un capo nel prototipo, non creano automaticamente N oggetti.

Conservare originale. Segmentazione/background removal è adapter image_processing separato, risultato trasparente dove supportato; semantic classification usa vision. Può classificare l'originale quando derivato non disponibile. Fallimento segmentazione: messaggio e uso originale/crop manuale, nessuna conversione silenziosa a cloud. Fase 04 deve includere un adapter concreto funzionante oppure fallback esplicito con prova capability; sola interfaccia vuota non completa il flusso richiesto.

Review consente modifica di attributi e scelta originale/derivato. Conferma crea un solo wardrobe_item e wardrobe.item_added, con path coerenti. Nessun generatore outfit, virtual try-on o acquisto abbigliamento. L'architettura potrà introdurre outfits/outfit_items/outfit_feedback in una fase futura.

## Privacy e routing

Il request context determina mode e consent per vision e image_processing separatamente. Adapter cloud image processing è cloud anche se non è un LLM. local_only blocca cloud OCR, classificazione, rimozione sfondo, embedding e URL di analisi esterni; capability error consente ingresso manuale e conservazione privata, mai fallback silenzioso.

Non rendere il bucket pubblico per permettere lettura al provider. Preferire bytes inviati server-side; se provider richiede URL firmata, TTL breve e policy/modalità consentita. Provider riceve solo il derivato e dati necessari, non intera household. Evitare contenuti raw in errori/telemetria.

## Validazione ed esito

Test immagini ruotate, poco leggibili, oversize, MIME falsificato, output non JSON, attributi inattesi, valuta mancante, più capi, timeout, retry, doppio click, duplicati legittimi e revoca durante processamento/conferma. Test separati dei due processori e rete local_only. Un output che fallisce schema non può diventare record parziale senza review. Gli originali e i derivati devono essere non leggibili da un altro membro se private e da un'altra household in ogni caso.
