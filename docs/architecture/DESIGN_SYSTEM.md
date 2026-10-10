# DESIGN SYSTEM — Baptista

Contratto visivo dell'app: token, componenti, pattern di lista e regole di coerenza tra stanze. Vale per ogni nuova schermata; la [fase 06](../phases/PHASE_06_PRODUCT_UX.md) lo applica in modo sistematico, ma da subito nessun nuovo codice deve allontanarsene.

**Fonti.** (1) L'implementazione attuale (`app/globals.css`, `components/ui.tsx`, `components/forms.tsx`, `components/modal.tsx`, `components/bottom-nav.tsx`, `components/room-*.tsx`, `components/briefing.tsx`). (2) Il mockup di riferimento «Baptista starts with a small observation» (tre schermate: apertura gentile → risposta utile → risoluzione quieta). (3) Le decisioni D20 (stanze), D21 (Aggiungi), D24 (categorie), D25/D26 (Cucina/Finanze) e B‑5/B‑6 (filo Baptista) della [MASTER_SPEC](../BAPTISTA_MASTER_SPEC.md) e della [fase 04.1](../phases/PHASE_04_1_CONNECTIONS_AND_BAPTISTA.md).

Le parti marcate **[attuale]** descrivono il codice di oggi; quelle marcate **[target]** sono il riferimento da raggiungere (fase 06 o prima, se si tocca il componente).

---

## 1. Principi

1. **Calma prima di tutto.** Sfondo caldo, poche superfici, niente ombre decorative, niente KPI in serie. Il mockup lo dice in una riga: *notice → respond → confirm → return to your day*. Ogni schermata deve poter essere letta in tre secondi.
2. **Una cosa alla volta.** Al massimo un elemento «hero» per schermata (il filo Baptista in Home, il totale del mese in Finanze, l'anello kcal in Dieta). Tutto il resto è lista o tessera.
3. **Il colore significa qualcosa.** Tre famiglie, mai mescolate: *colore della stanza* (dove sono), *colore del tipo di oggetto* (che cos'è), *colore di stato* (serve attenzione?). Un colore usato per decorare è un errore.
4. **Stessi oggetti, stesso aspetto ovunque.** Un evento ha la stessa riga in Home, Calendario e Aggiungi; un alimento la stessa riga in Dispensa, Home Cucina e lista della spesa.
5. **Mobile, un pollice.** Larghezza utile `max-w-md`, target ≥ 44 px, azioni primarie in basso nella card, a tutta larghezza.
6. **Italiano, sempre.** Testi brevi, frase in minuscolo (sentence case), formati it-IT, `tabular-nums` per orari e importi.

---

## 2. Token

Tutti i colori vivono in `app/globals.css` come variabili CSS esposte a Tailwind con `@theme inline`; ogni token ha la coppia chiara/scura. **Nessun esadecimale nei componenti** (oggi ce ne sono ~40, vedi §10).

### 2.1 Neutri e base [attuale → target]

| Token | Chiaro | Scuro | Uso |
| --- | --- | --- | --- |
| `--background` | `#f7f5f0` | `#141311` | sfondo app (crema caldo del mockup); ridefinito per stanza (§3) |
| `--surface` | `#ffffff` | `#1e1d1a` | card, righe, barra di navigazione |
| `--foreground` | `#1c1b19` | `#ecebe7` | testo principale |
| `--muted` | `#6b6760` | `#a19d95` | testo secondario, icone inattive, meta |
| `--border` | `#e4e0d8` | `#2f2d29` | bordi hairline e divisori |
| `--accent` | `#3d6b4f` | `#7fb08f` | colore del brand: link, focus, stati attivi, successo |
| `--on-accent` | `#ffffff` | `#10140f` | testo su accent |
| `--danger` | `#a33a2c` | `#e0806f` | errori, scaduto, in ritardo, sforamento |

**[target] Nuovi token** necessari per il mockup e per eliminare gli esadecimali sparsi:

| Token | Chiaro | Scuro | Uso |
| --- | --- | --- | --- |
| `--ink` | `#21412f` | `#a9d0b6` | verde bosco profondo dei pulsanti primari e del wordmark (mockup «Yes, still there»); `--on-ink` bianco / `#0f1712` |
| `--warning` | `#b7801f` | `#e3b65c` | «scade presto», budget al limite, stime da verificare (oggi «presto» usa `accent`, che significa successo: va corretto) |
| `--subtle` | `foreground / 5%` | idem | fondo di hover, segmenti attivi, icone neutre (oggi `bg-foreground/5` e `/[0.07]` misti: uniformare a uno) |
| `--neutral-mark` | `#8f8a80` | `#7d7a73` | categoria assente, settimana conclusa (oggi `#8f8a80` e `#9a948a`) |

Regola: `--accent` resta per link, focus, selezioni e conferme; `--ink` solo per il pulsante primario e il wordmark. Il primario del mockup è più scuro del verde attuale: il contrasto testo bianco/`--ink` è ≥ 7:1.

### 2.2 Tipografia

Font: **Geist** (sans) già caricato; Geist Mono solo per codici (barcode, ticker). Orari e importi usano `tabular-nums`, non il monospace (oggi l'orario in Home usa `font-mono`: da sostituire).

| Ruolo | Classe | Esempio |
| --- | --- | --- |
| Display | `text-3xl font-semibold tracking-tight` | saluto «Buonasera, Paolo», titolo pagina, totale del mese |
| Sottotitolo | `text-base text-muted` | «Un po' di respiro.» sotto il saluto |
| Titolo sezione | `text-lg font-semibold` | «Oggi», «Da controllare in dispensa» |
| Titolo card / hero | `text-lg leading-snug font-semibold` | testo della scheda Baptista principale |
| Corpo | `text-base` | titolo di una riga di lista |
| Meta | `text-sm text-muted` | orario, scadenza, «Frigo», importo secondario |
| Eyebrow | `text-[11px] font-medium tracking-wider uppercase text-muted` | «CUCINA · 1 ELEMENTO» sopra un messaggio Baptista |
| Didascalia | `text-xs` | etichette della barra, badge, legende |

Massimo tre livelli tipografici dentro una stessa card.

### 2.3 Spaziatura

Scala Tailwind (4 px). Valori canonici:

- pagina: `px-5`, `pt-6`, `max-w-md`, spazio inferiore = altezza barra + safe area;
- tra sezioni: `gap-8`; dentro una sezione (titolo → contenuto): `gap-3`;
- padding card: `p-4` (hero `p-4`/`p-5`), riga di lista `px-4 py-3`;
- griglie di tessere: `gap-2`;
- form: `gap-4` tra campi, `gap-1.5` tra etichetta e campo.

### 2.4 Raggi

| Raggio | Uso |
| --- | --- |
| `rounded-full` | avatar, pill (stanza, categoria), badge, chip, puntini, pulsanti icona |
| `rounded-xl` (12) | pulsanti, input, segmenti, celle del calendario, miniature, popover item |
| `rounded-2xl` (16) | card, contenitori di lista, tessere stanza e scorciatoie, empty state |
| `rounded-3xl` (24) | contenitori Baptista, hero, bottom sheet |

Non usare `rounded-lg` né `rounded-md` salvo la casella di spunta (`rounded-md`, §5.4).

### 2.5 Elevazione

Bordi, non ombre. `border border-border` su ogni superficie bianca. Ombre ammesse soltanto: `shadow-md` sulla tessera stanza attiva, `shadow-lg` su popover/menu, `shadow-sm` sulla miniatura-calendario degli eventi. Superfici sovrapposte (header, barra) usano `backdrop-blur` con fondo al 90–95%.

### 2.6 Movimento

| Durata | Uso |
| --- | --- |
| 150 ms | press (`active:scale-[0.98]`), hover, cambio colore |
| 320 ms | ingresso delle voci della barra al cambio stanza (`.nav-swap`) |
| 400–420 ms | riordino tessere stanza (FLIP), dissolvenza avatar Baptista |
| 500 ms | cambio tinta di sfondo della stanza |
| 700 ms | riempimento anelli e barre |

Curva unica: `cubic-bezier(0.2, 0.8, 0.2, 1)`. Con `prefers-reduced-motion` ogni animazione si annulla (già fatto per `.nav-swap` e FLIP; obbligatorio per i nuovi effetti, incluse dissolvenza e scrittura progressiva di Baptista, B‑6).

---

## 3. Stanze e temi

Le stanze (D20) colorano **il contenitore**, mai il contenuto. Ogni stanza ha tre valori:

| Stanza | Icona | `--room-bg` (sfondo app) | `--tile-bg` | `--tile-fg` |
| --- | --- | --- | --- | --- |
| Soggiorno | divano | `#f7f5f0` (base) | `#eadfcf` sabbia | `#5a4630` |
| Cucina | posate | `#faf2eb` | `#f5d2bd` pesca | `#7a3b1c` |
| Finanze | salvadanaio | `#eff6f1` | `#cbe6d4` salvia | `#24573a` |
| Guardaroba | gruccia | `#f4f1f9` | `#ddd5f0` lavanda | `#4a3a7a` |

(Le varianti scure sono in `globals.css`.)

**Dove si usa il colore della stanza**

- sfondo dell'app (`data-room` su `RoomShell`, transizione 500 ms);
- tessera stanza attiva in Home e pill nell'header (`.room-tile-active`);
- pillola della voce attiva nelle tre voci centrali della barra;
- **[target]** contenitore del messaggio Baptista: tinta della stanza *di origine* dell'osservazione (nel mockup la scheda è pesca perché l'osservazione viene dalla Cucina: «KITCHEN · 1 ITEM»). Osservazioni senza stanza o del Soggiorno → sabbia.

**Dove non si usa:** pulsanti primari, link, anelli di avanzamento, badge di stato, puntini del calendario. Un pulsante primario è `--ink` in tutte le stanze: cambiare stanza non deve cambiare il significato dei comandi.

**Aggiungere una stanza** = una voce in `lib/rooms.ts` (id, etichetta, icona, 3 voci di navigazione) + 3 righe chiare e 3 scure in `globals.css`. Nessun altro file deve conoscere i colori delle stanze. Le tinte di sfondo restano entro ~3% di luminosità dalla base, le tinte delle tessere a contrasto testo ≥ 4.5:1.

---

## 4. Struttura della pagina

```
┌ Header (sticky, blur) ───────────────────────┐
│ avatar×3  ·  [● Cucina ▾]  ·  nome casa       │
├──────────────────────────────────────────────┤
│ Display + sottotitolo / data                   │
│ (Home) tessere stanza 4×                       │
│ Hero (filo Baptista / totale / anello)         │
│ Sezione → lista / griglia                      │
│ Sezione → …                                    │
├ Bottom nav (fixed, safe area) ───────────────┤
│ Home │ voce 1 │ voce 2 │ voce 3 │ Baptista     │
└──────────────────────────────────────────────┘
```

### 4.1 Header [attuale]

Avatar dei membri (max 3 sovrapposti, `-space-x-2`, `ring-2 ring-background`, `+N` oltre), pill della stanza al centro, nome della casa / selettore a destra. **[target]** Il mockup mostra il wordmark «baptista» (minuscolo, `--ink`, semibold) a sinistra e gli avatar a destra con un «+» lavanda per invitare: da valutare in fase 06 insieme alla pill della stanza, che va mantenuta (D20). Il «+» degli avatar segue lo stile pulsante icona (§5.1).

### 4.2 Barra di navigazione variabile [attuale]

- Cinque slot uguali: **Home** e **Baptista** fissi ai lati, **tre voci della stanza** al centro (`ROOMS[room].nav`).
- Altezza `min-h-16`, icona 24 px sopra, etichetta `text-xs font-medium`; fondo `surface/95` con blur e bordo superiore.
- Inattivo: icona e testo `muted`. Attivo fisso (Home/Baptista): `accent`. Attivo di stanza: pillola `h-8 w-14` nel colore della stanza dietro l'icona, testo `--tile-fg`.
- Al cambio stanza il gruppo centrale è rimontato (chiave = stanza) e scorre in entrata (`.nav-swap`).
- **[target]** dal mockup: icona **piena** per la voce attiva (oggi solo cambio colore) ed etichetta `font-semibold`. Serve una variante `filled` in `components/icons.tsx` per le icone usate in barra.
- Regole: etichette di una sola parola, ≤ 10 caratteri; «Aggiungi» quando presente sta sempre nella voce centrale; mai più di tre voci di stanza; mai badge numerici inventati (B‑5).

### 4.3 Home

Ordine fisso: data (meta, prima lettera maiuscola) → saluto display → **[target]** sottotitolo calmo da template (B‑5) → tessere stanza → filo Baptista → cruscotto della stanza. Le tessere stanza sono quadrate, 4 in riga, la selezionata in alto a sinistra con icona 32 px e `shadow-md`.

---

## 5. Componenti

Fonte unica: `components/ui.tsx`, `components/forms.tsx`, `components/modal.tsx`. Prima di scrivere classi a mano, cercare il componente; se manca, aggiungerlo qui e lì, non nella pagina.

### 5.1 Pulsanti

| Variante | Aspetto | Uso |
| --- | --- | --- |
| `primary` | `min-h-12 rounded-xl` fondo `--ink` **[target; oggi `accent`]**, testo bianco, `font-medium` | una sola azione principale per card/form; nelle card Baptista a tutta larghezza |
| `secondary` | `min-h-12 rounded-xl` bordo, fondo `surface` | alternativa («We ate it», «Annulla») |
| `secondary` su tinta | bordo `foreground/70`, fondo trasparente | dentro contenitori colorati (Baptista): il bianco pieno «buca» la tinta |
| `ghost` / terziario | testo `muted`, nessun bordo, `min-h-11` | «Più tardi», «Mostra altre», azioni di riga |
| `danger` | testo `danger`, conferma con secondo tocco (`confirmLabel`) | butta, elimina; mai dialog del browser |
| icona | `size-11 rounded-full`, icona 20 px | chiudi, scarta, «+» avatar |

Ordine verticale nel mockup: primario → secondario → terziario centrato. In orizzontale (barre di form) il primario sta a destra. Testo dei pulsanti: verbo all'infinito o frase breve («Segna come consumato», «Aggiungi evento»). Stato pending: etichetta «Salvataggio…» o «…», mai spinner senza testo.

### 5.2 Card e superfici

- `Card`: `rounded-2xl border border-border bg-surface`. Contiene liste (`divide-y divide-border`, padding sulle righe) o contenuto (`p-4`).
- **Card di tipo** (Aggiungi): bordo superiore 3 px nel colore del tipo (§6).
- **Card hero / tono** (`briefing.tsx`): `rounded-3xl`, fondo al 6–7% del colore di stato (`urgent` → danger, `normal` → accent, `info` → surface).
- **Contenitore Baptista** **[target]**: `rounded-3xl`, fondo `--tile-bg` della stanza di origine al ~60%, nessun bordo.

### 5.3 Riga di lista (`ListRow`) **[target: componente nuovo]**

Tutte le liste dell'app usano la stessa anatomia; oggi è riscritta a mano in ogni pagina con altezze e colonne diverse.

```
┌───────────────────────────────────────────────────┐
│ [leading]  Titolo                       [trailing] ›│
│            meta · meta                               │
└───────────────────────────────────────────────────┘
```

- Altezza `min-h-14`, `px-4 py-3`, `gap-3`, allineamento verticale centrato.
- **leading** (una sola variante per lista, larghezza fissa): casella di spunta 44 px (§5.4) · chip icona 40 px (cerchio, icona 20 px su fondo del tipo al 15%, come il calendario lavanda del mockup) · orario `w-14 tabular-nums text-sm text-muted` · barra colore `w-1 h-8 rounded-full` · miniatura 48 px `rounded-xl` · puntino categoria `size-2.5`.
- **body**: titolo `text-base` (una riga, `line-clamp-1`; due righe solo per note); meta `text-sm text-muted` separata da « · ».
- **trailing**: al massimo **un** elemento tra badge di stato, importo, `PrivateMark`, azioni rapide; poi il chevron `›` (`muted`, 16 px) se la riga è navigabile. Il mockup usa sempre il chevron: oggi manca ovunque.
- Elementi completati: titolo `text-muted line-through`, spostati in un `<details>` «Completate di recente (n)» in fondo.
- Righe miste (eventi + cose da fare nello stesso giorno): eventi prima, ordinati per ora; poi cose da fare.

### 5.4 Casella di spunta

Unica per cose da fare, voci delle liste (spesa inclusa) e ingredienti delle ricette: quadrato `size-5 rounded-md` con bordo 2 px nel colore del tipo; spuntato = pieno con ✓ bianco; area cliccabile 44 px. Oggi i task usano un quadrato ambra fatto a mano e `CheckboxField` usa il checkbox nativo: **[target]** un componente `Check` condiviso. Il checkbox nativo resta solo per opzioni di form (es. «Tutto il giorno»).

### 5.5 Tessere e scorciatoie

- **Tessera stanza**: quadrata, `rounded-2xl`, icona + etichetta `text-xs`; attiva = tinta stanza + `shadow-md`.
- **Scorciatoia** (`Shortcut` in `room-dashboards.tsx`): 3 in riga, `min-h-20`, icona sopra etichetta, superficie bianca. **[target]** spostarla in `ui.tsx`: oggi esiste solo per i cruscotti.
- **Tessera di avanzamento** (abitudini/obiettivi in Home): 3 in riga, anello 72 px al centro, titolo `line-clamp-2`, eventuale azione compatta in basso.
- **Tessera foto** (Guardaroba): 2 colonne (3 da `sm`), immagine `aspect-[4/5]` `object-cover`, piede con swatch colore + nome.
- **Tessera nota/lista**: 2 colonne, `min-h-24`, titolo, anteprima `line-clamp-2`, piede con conteggio `3/7` e badge.

### 5.6 Avanzamento

| Componente | Quando |
| --- | --- |
| `ProgressRing` | abitudini (settimana), obiettivi, kcal del giorno, giorni alla scadenza nel filo. Traccia al 16% del colore, arco arrotondato, cifra al centro. Dimensioni: 56 (piccola), 72 (tessera), 84 (hero) |
| `ProgressBar` / `BudgetBar` | budget e progetti di spesa: `h-2 rounded-full`, traccia `foreground/10`; oltre il 100% diventa `--danger` |
| **[target]** `DotTracker` | conteggi piccoli e discreti (≤ 7): «Passeggiate della settimana 4 / 5» del mockup. Puntini `size-3` pieni nel colore della categoria, vuoti con bordo. Alternativa compatta all'anello nelle righe di lista |

L'anello non nasconde il sovra‑raggiungimento: arco pieno, etichetta reale («5/3»).

### 5.7 Badge, chip e marchi

- `Badge` (`rounded-full px-2.5 py-0.5 text-xs font-medium`): toni `muted`, `accent` (fatto/completo), `warning` **[target]**, `danger`. Testo minuscolo («scade domani», «stima: venerdì»).
- `CategoryChip`: puntino + nome, `text-xs text-muted`. Selettore categorie: pill con bordo e fondo al 14% del colore quando scelto.
- `PrivateMark`: badge «Solo io», sempre ultimo elemento prima del chevron.
- Eyebrow di contesto (§2.2) per indicare origine e conteggio: «CUCINA · 1 ELEMENTO», «FINANZE · BUDGET».

### 5.8 Segmenti

Due implementazioni oggi (`Tabs` in `modal.tsx` e la nav tipi di `aggiungi/page.tsx`) con lo stesso aspetto: contenitore `rounded-2xl border bg-surface p-1`, segmento `min-h-11 rounded-xl`, attivo `--subtle` + `text-foreground`. **[target]** un solo componente `Segmented` che accetta link o pannelli; il puntino colore del tipo è opzionale.

### 5.9 Form

`Field`, `SelectField`, `VisibilityField`, `CategoryField`, `ColorField`, `SubmitButton`, `ActionForm` (`components/forms.tsx`): input `min-h-12 rounded-xl`, focus `border-accent ring-2 ring-accent/25`, errore sotto il campo in `danger`, hint in `muted`. Campi affiancati con `grid grid-cols-2 gap-3` solo per valori brevi (date, quantità/unità). Il primo campo ha sempre un placeholder d'esempio («Es. Pagare la bolletta»).

### 5.10 Bottom sheet

`Modal`: sheet dal basso su telefono (`rounded-t-3xl`, `max-h-[92dvh]`), dialog centrato da `sm`. Titolo `text-xl font-semibold` + chiudi icona. Si chiude da solo dopo un salvataggio riuscito. Una sola azione primaria in fondo.

### 5.11 Stati vuoti, errori, caricamento

- `EmptyState`: `rounded-2xl border-dashed`, testo centrato `text-sm text-muted`, tono calmo e un invito concreto con link («Nessuna lista. Prova con la lista della spesa.»). Mai «Nessun dato».
- Errori di form: `role="alert"`, sotto il campo o in fondo al form; errori di azione rapida: piccolo testo `danger` sotto il pulsante.
- **[target]** Conferma con annullamento (mockup schermata 3): riga su superficie bianca dentro il contenitore, chip check verde (accent al 15%), testo «Pollo · Consumato», link «Annulla» sottolineato a destra. Stesso pattern per ogni azione reversibile proposta da Baptista.

### 5.12 Avatar e miniature

- `Avatar`: iniziali su 4 pastelli deterministici (`sm` 32 px, `md` 48 px). **[target]** foto profilo quando disponibile (privacy storage, fase 06); i pastelli diventano token `--avatar-1…4`.
- Miniatura record: 48 px `rounded-xl` `object-cover`, a destra del messaggio Baptista o come leading di riga (alimento, capo). Senza foto: icona del tipo su fondo del tipo al 15%.

---

## 6. Colori dei tipi di oggetto

Ogni tipo di record ha **un** colore usato per: puntino nel selettore di Aggiungi, bordo superiore della card di creazione, casella di spunta, chip icona e puntini del calendario. Oggi questi colori sono esadecimali ripetuti nelle pagine e alcuni collidono (Ricetta = Da fare, Pasto = Lista, Nota = Progetto di spesa). **[target]** una mappa unica, ad esempio `lib/design/kinds.ts` (nomi in inglese) che legge variabili CSS `--kind-*`:

| Tipo | Token | Colore | Note |
| --- | --- | --- | --- |
| Evento | `--kind-event` | `#7a6fd0` lavanda | come l'icona calendario del mockup; sostituisce `accent` per eventi e puntini del calendario |
| Da fare | `--kind-task` | `#d9a33a` ambra | invariato |
| Nota | `--kind-note` | `#4f8fd6` blu | oggi lavanda: cambia per liberarla agli eventi |
| Lista / lista della spesa | `--kind-list` | `#3f9d8c` verde acqua | invariato |
| Alimento | `--kind-food` | `#e0795b` corallo | invariato |
| Ricetta | `--kind-recipe` | `#8a6d4f` nocciola | oggi ambra (collide con Da fare) |
| Pasto | `--kind-meal` | `#6aa04f` verde | oggi verde acqua (collide con Lista) |
| Spesa | colore della categoria | fallback `--neutral-mark` | |
| Progetto di spesa | `--kind-project` | `#2f7f9f` petrolio | oggi lavanda |
| Abitudine / obiettivo | colore della categoria (D24) | fallback `ringColor(id)` | |
| Capo | colore principale del capo (swatch) | | |

Regole: un colore di tipo non diventa mai fondo pieno di una card (solo 3 px, puntini, chip al 15%); i colori di categoria scelti dall'utente vincono sul colore di tipo per abitudini, obiettivi e spese; i colori di stato (§7) vincono su entrambi.

## 7. Colori di stato

| Stato | Token | Esempi |
| --- | --- | --- |
| Attenzione urgente | `--danger` | scaduto, scade oggi, in ritardo, budget superato |
| Attenzione presto | `--warning` | scade entro 2 giorni, budget oltre il ritmo del mese, scadenza stimata |
| Fatto / positivo | `--accent` | lista completa, conferma, obiettivo raggiunto |
| Neutro | `--muted` / `--neutral-mark` | nessuna scadenza, settimana chiusa |

Una stima non è mai mostrata come fatto: badge «stima: …» e, nel filo, «?» al posto del numero (già in `briefing.tsx`).

---

## 8. Pattern per dominio

Tutti costruiti con §5; qui solo ciò che è specifico.

| Schermata | Pattern |
| --- | --- |
| **Filo Baptista** (Home, schede stanza) | Contenitore tinto (§3); avatar del maggiordomo a sinistra (~96 px, espressioni con dissolvenza incrociata); eyebrow «STANZA · N ELEMENTI»; testo `text-lg`; miniatura a destra; pulsanti a tutta larghezza primario → secondario → «Più tardi». Risposte dell'utente: bolla a destra `rounded-2xl` su verde salvia chiaro, appare subito. Messaggi di Baptista successivi: bolla a sinistra nella tinta della stanza più satura. Al massimo una conversazione + 2 bolle compatte (B‑5). |
| **Oggi / eventi** | `ListRow` con leading orario (o chip icona evento), titolo, meta «tutto il giorno» o intervallo; chevron. In Home la riga singola del prossimo evento (mockup «18:30 Ritirare Laia ›») usa chip icona evento. |
| **Calendario** | Griglia 7 colonne di celle `aspect-square rounded-xl`; oggi = anello accent; selezionato = fondo `--ink`; puntini: eventi `--kind-event`, cose da fare `--kind-task`, max 3. Sotto, il giorno selezionato con la stessa `ListRow`. |
| **Da fare** | `ListRow` con casella §5.4; meta «Scade domani» (`danger` se scaduta); completate in `<details>`. |
| **Liste e lista della spesa** | Indice in tessere 2 colonne (§5.5). Dettaglio: un'unica card con righe a casella, input «Aggiungi elemento» fisso in fondo alla card, spuntati in fondo. La lista della spesa può raggruppare per reparto con titoli eyebrow. |
| **Dispensa** | Sezione «Da controllare» in cima (righe con `ExpiryBadge`), poi gruppi per luogo (Frigo, Freezer, Dispensa) come titoli eyebrow; azioni rapide Aperto/Finito/Butta come `ghost` compatti nel trailing. |
| **Dieta** | Hero anello kcal 84 px + `MacroLine`; pasti come sezioni con righe; macro sconosciute «—». |
| **Spese** | Hero totale del mese `text-3xl` + `BudgetBar`; ripartizione per categoria con barra sottile; righe con puntino categoria leading e importo `tabular-nums` trailing. |
| **Budget / progetti** | Card per budget con barra; progetti con `ListRow` + barra sotto il titolo (`--kind-project`). |
| **Watchlist** | Righe ticker in mono, widget TradingView in card senza bordo interno; nota «non è un consiglio di investimento» in meta. |
| **Guardaroba** | Griglia foto (§5.5); filtri stagione/categoria come `Segmented` o chip; dettaglio con foto grande `rounded-3xl`. |
| **Abitudini e obiettivi** | Tessere ad anello (§5.5) in Home; nelle liste `ListRow` con `DotTracker` o anello 40 px nel leading. |

---

## 9. Accessibilità e qualità

- Target ≥ 44 px (eccezione da eliminare: pulsante scarta del briefing `size-9`).
- Contrasto testo ≥ 4.5:1 su ogni tinta di stanza, chiara e scura; testo su `--ink` ≥ 7:1.
- Focus visibile ovunque (`ring-2 ring-accent/25` o `ring-accent`); mai `outline-none` senza sostituto.
- Ogni elemento grafico informativo ha `aria-label` (anelli, barre, puntini del calendario); i decorativi `aria-hidden`.
- Icone: set unico `components/icons.tsx`, 24 px, tratto 1.8, `currentColor`. **[target]** sostituire i glifi testuali `×`, `✓`, `▾`, `+`, `›` con icone del set.
- Safe area in alto (header) e in basso (barra, sheet); verifica a 360/390/768 px e desktop (fase 06).
- Tema scuro: ogni token nuovo nasce con la coppia scura; nessun colore fisso in JSX.

---

## 10. Debito attuale da allineare

Inventario al 2026-10-10 (da chiudere in fase 06, o prima quando si tocca il file):

| Dove | Problema | Correzione |
| --- | --- | --- |
| `briefing.tsx`, `finance.tsx`, `dieta/page.tsx` | `#c4553f` diverso da `--danger` | usare `--danger` |
| `aggiungi/page.tsx`, `calendario/page.tsx` | `#d9a33a` ripetuto per task e checkbox | `--kind-task` + componente `Check` |
| `room-dashboards.tsx`, `spese/page.tsx`, `dieta/page.tsx`, `budget/page.tsx` | `#3f9d8c`, `#7a6fd0` scelti a mano per kcal, budget, progetti | token di tipo/stato (§6–7) |
| `cucina/aggiungi/page.tsx` | colori Ricetta/Pasto in collisione con altri tipi | mappa unica §6 |
| `spese/page.tsx`, `briefing.tsx` | grigi `#8f8a80` / `#9a948a` | `--neutral-mark` |
| `ui.tsx` `Avatar` | pastelli esadecimali | token `--avatar-*` |
| `kitchen.tsx` `ExpiryBadge` | «scade presto» in tono `accent` (= successo) | tono `warning` |
| `page.tsx` (Home) | orario in `font-mono` | `tabular-nums` |
| tutte le liste | righe riscritte a mano, nessun chevron, altezze 12/14 miste | `ListRow` §5.3 |
| `modal.tsx` `Tabs` + nav tipi Aggiungi | due segmenti uguali | `Segmented` §5.8 |
| `room-dashboards.tsx` `Shortcut` | componente locale | spostare in `ui.tsx` |
| `forms.tsx` `CheckboxField` vs task | due caselle diverse | `Check` §5.4 |
| `buttonClass.primary` | `accent` invece di `--ink` del mockup | token `--ink` |
| `bottom-nav.tsx` | voce attiva senza icona piena | variante `filled` |

---

## 11. Checklist per ogni nuova schermata

1. Nessun esadecimale nel JSX; colori solo da token o dalla mappa dei tipi.
2. Colore di stanza solo sul contenitore; colore di tipo solo su puntini/bordi/chip; stato solo su badge/anelli/barre.
3. Liste con `ListRow`, card con `Card`, sezioni con `Section`, vuoti con `EmptyState`.
4. Un solo primario per card; ordine primario → secondario → terziario.
5. Raggi e spaziature dalla scala §2.3–2.4.
6. Testi in italiano, sentence case, formati it-IT, `tabular-nums` per numeri allineati.
7. Target 44 px, focus visibile, `aria-label` sugli elementi grafici, reduced motion rispettato.
8. Verificata in chiaro e scuro, in almeno due stanze.
