# SECURITY — Contratto di autorizzazione e privacy

Autorità: dettaglio di sicurezza subordinato alla [specifica](../BAPTISTA_MASTER_SPEC.md). Introduzione in 01–02; estensione ai nuovi oggetti in ogni fase. La fase 07 ripete e consolida, non introduce per la prima volta la sicurezza.

## Confini e minacce

Considerare non fidati browser, parametri URL, household selezionata, output LLM, testo OCR, file, descrizioni e risposte provider. Validare sessione server con le API raccomandate dalla versione Supabase SSR adottata; non considerare il semplice valore client della sessione prova d'identità. Le autorizzazioni dipendono dalle membership nel DB, mai da user_metadata modificabile o da un prompt.

Una sessione Auth del progetto condiviso non conferisce membership Baptista. Il login di GuideApp e quello Baptista usano infrastruttura condivisa ma non profili, ruoli o tabelle di dominio condivisi. Cambiare redirect, SMTP o provider Auth può impattare GuideApp: inventariare configurazione e applicare soltanto aggiunte compatibili.

## Matrice accesso

| Oggetto/operazione | Owner household | Member attivo | Non membro |
| --- | --- | --- | --- |
| Household e directory minima dei membri | legge/amministra | legge | nessun accesso |
| Record household | legge/scrive | legge/scrive | nessun accesso |
| Record private | solo se proprietario | solo se proprietario | nessun accesso |
| Cambio owner/membership | procedura privilegiata verificata | negato | negato |
| Record selected_members | negato finché ACL non implementato | idem | negato |
| Telemetria dettagliata e job interni | server autorizzato | server autorizzato | negato |

La scrittura di un record condiviso da parte di un membro è ammessa, ma household, autore e proprietario non sono riassegnabili attraverso CRUD generico. Il proprietario può cambiare visibilità private/household con validazione; passando da household a private, il server revoca o invalida anche i derivati condivisi, cache e URL futuri. La directory minima (display_name e avatar autorizzato) dei membri attivi è restituita da un endpoint ristretto verificato; il profilo completo resta self-only, senza grants generici ai profili altrui. Record derivati non possono ampliare il pubblico delle fonti. Una sintesi con fonti private è privata al richiedente anche se contiene altre fonti condivise.

## Membership e bootstrap

**Identità (D33, decisione utente 2026-10-12).** Baptista non è distribuita: `baptista.app_users` (email, nome, casa, ruolo) è l'unica fonte di chi può usarla, modificata solo da chi amministra il progetto Supabase (Table Editor; nessun accesso client). Il login resta email + password dell'Auth condiviso con GuideApp: un account dell'Auth senza riga in `app_users` non ottiene profilo né membership, viene disconnesso al login («Questo account non è abilitato a Baptista») e ogni procedura lo rifiuta (`require_uid()` → `not_allowed`). Profilo e membership derivano dalla riga tramite procedure definer (trigger della tabella e `claim_app_user()`, che legge l'email da `auth.users`, mai dal client). Registrazione, codici invito, onboarding e creazione di nuove case sono stati tolti dall'app; le procedure D32 restano nel DB inattive. Più owner per casa sono ammessi.

Creazione household e prima membership owner sono una transazione. Impedire inserimenti membership arbitrari e auto-promozioni. Il provisioning è una procedura esplicita, non un GRANT generico sulla tabella.

Impedire rimozione dell'ultimo owner; trasferimento richiede un membro attivo e transazione. Alla rimozione di un membro, revocare immediatamente l'accesso ai dati household inclusi i suoi record private nella household. Non trasferire automaticamente record privati. Consentire esportazione prima dell'uscita tramite accesso già autorizzato; recupero successivo non fa parte del prototipo. Cache client e selezione corrente vengono svuotate al cambio household/logout/revoca.

## RLS e privilegi

RLS su ogni tabella Baptista, inclusi eventi e tabelle interne. Grants minimi per tabella/operazione e funzioni: anon non legge domini, authenticated non scrive eventi, telemetria, osservazioni o job direttamente. SELECT e UPDATE devono collaborare; UPDATE include USING sul record attuale e WITH CHECK sul nuovo. Bloccare modifiche ai campi di identità mediante privilegi di colonna o procedure ristrette; RLS da sola non limita quali colonne vengono aggiornate.

Policy membership non devono ricorrere su household_members. L'eventuale helper definer per lookup o bootstrap è una piccola eccezione documentata: parametri vincolati alla sessione, oggetti qualificati, search_path fisso, EXECUTE revocato a PUBLIC/anon e concesso solo alle procedure richieste. Non usarlo per risolvere genericamente errori RLS. Funzioni helper restano baptista e non espongono elenchi privati. Views esposte usano security_invoker quando supportato oppure non sono accessibili ai ruoli client.

Le procedure privilegiate e i job verificano esplicitamente scope e autorizzazione; service role bypassa RLS e non è una scorciatoia per le richieste utente. I test RLS usano ruoli/sessioni reali, non soltanto il service role.

## Immagini e storage

Bucket baptista-receipts, baptista-wardrobe e baptista-avatars privati. Percorso household UUID / proprietario UUID / upload UUID / nome generato dal server. Il prefisso è un criterio di policy, non prova sufficiente di accesso. Metadata e record source verificano ownership/visibilità anche per immagini elaborate. Un oggetto non ancora confermato è leggibile solo dall'uploader membro attivo.

Policy su storage.objects limitate per bucket; niente alterazioni generalizzate delle policy esistenti. URL firmati brevi, emessi dopo autorizzazione, non loggati o memorizzati nei record. Un URL già firmato resta utilizzabile fino alla scadenza: usare TTL breve e documentare questo limite alla revoca. Concedere upsert soltanto se necessario, con tutte le operazioni richieste; preferire chiavi immutabili.

Validare byte reali, MIME, dimensioni e pixel; limite iniziale 10 MB e 20 megapixel, JPEG/PNG/WebP. HEIC richiede conversione esplicita o messaggio supportato, non file scambiato per JPEG. Rimuovere EXIF dai derivati; non inviare metadati GPS al provider. Originali accessibili solo in privato. Nessuna URL remota arbitraria scaricata dal server.

## AI e azioni

Prompt injection in scontrini, note o foto è dato non istruzione. Le tool allowlist e i permessi sono verificati fuori dal modello; SQL, segreti e URL privati di inferenza non sono tool. Le chiamate di lettura sono paginate e filtrate prima della sintesi.

Ogni scrittura AI, incluso dismissObservation, è una proposta persistita con autore, household, input validato, scadenza, versione attesa e idempotency key. La conferma riguarda il payload mostrato, non un nuovo payload del modello. Server riesamina membership, scope, permessi e precondizioni, poi esegue una volta. Payload cambiato richiede nuova conferma; record cambiato produce conflitto e revisione. Dettagli lifecycle in AGENT.

Modalità e consenso al fallback sono server-side. `local_only` è fail-closed per testo, immagini, segmentazione, embedding e retry. Contenuti non finiscono neanche in log/error reporting cloud. Una scelta private/self-hosted non prova assenza di retention del gestore: configurazione e avviso devono essere espliciti.

## Foto del guardaroba (fase 04, D28/D29)

Bucket `baptista-wardrobe` privato (10 MB, JPEG/PNG/WebP). Policy su `storage.objects` limitate al bucket e a funzioni definer `baptista.wardrobe_object_{writable,readable,deletable}`: scrittura solo nella cartella `<casa>/<utente>/…` di un membro attivo; lettura del caricatore o di chi può leggere il capo che usa il file (un capo reso privato nasconde le sue foto); cancellazione con la stessa regola della lettura; nessun update. Il browser riduce la foto e rimuove EXIF/GPS prima dell'invio; il server rivalida e crea la miniatura senza metadati. URL firmati da 10 minuti, mai salvati: un link già emesso resta valido fino alla scadenza anche dopo una revoca.

## Servizi esterni non AI (D25, D26)

Open Food Facts: chiamato solo dal server (Server Action autenticata), host fisso `world.openfoodfacts.org`, nessun redirect, timeout 8 s, risposta validata e valori fuori intervallo scartati; esce solo il testo cercato o il codice a barre. Non è un provider AI, quindi `local_only` non si applica, ma l'interfaccia dichiara dove va la ricerca. Licenza dati ODbL citata nell'interfaccia.

TradingView: il frammento ufficiale esegue uno script di terze parti nell'origine Baptista, dove potrebbe leggere i cookie di sessione Supabase non httpOnly. Si carica quindi soltanto l'iframe cross-origin (`www.tradingview-widget.com/embed-widget/mini-symbol-overview/`, lo stesso URL costruito dal loro script), con `sandbox` e `referrerPolicy="no-referrer"`; a TradingView arrivano solo simbolo e impostazioni di visualizzazione. Il formato dell'URL non è documentato ufficialmente: se cambia, il grafico smette di caricarsi senza effetti sulla sicurezza.

## Segreti e endpoint

Solo URL Supabase e chiave publishable possono essere NEXT_PUBLIC. Chiavi AI, LOCAL_AI_API_KEY e service role restano server-only. Non creare impostazioni browser per leggere le chiavi. Endpoint privati sono configurati dall'operatore con allowlist; impedire SSRF verso metadata, credenziali in URL e redirect fuori allowlist. Il supporto localhost in sviluppo è una configurazione intenzionale e non un'eccezione aperta in produzione.

## Suite minima

Due household, owner e member distinti, un estraneo autenticato, anon e membro revocato. Provare SELECT/INSERT/UPDATE/DELETE, RPC, views, Storage, contesto falsificato, FK incrociate, promotion, privati di altri membri, derivate e cache. Provare conferma dopo revoca, replay, proposta scaduta, modifica concorrente e output AI con household/user inventati. Per local_only intercettare rete e dimostrare zero richieste AI cloud; non basta uno stub che simula il router.

Fonti tecniche da riverificare all'implementazione: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
