import { capitalize, countWord, dayPhrase, num, str, vocative, type Script } from "./types";

const later = { id: "later", label: "Più tardi", kind: "snooze", snooze: 4 } as const;

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

export const overdueTask: Script = {
  room: "soggiorno",
  opening: (o, v) => {
    const title = str(o.data.title, o.title.replace(/^In ritardo: /, ""));
    const due = str(o.data.due_date);
    return [
      `${vocative(v)}«${title}» era per ${dayPhrase(due, v.today)}. L'hai già sbrigata?`,
      `${vocative(v)}c'è ancora «${title}», in sospeso da ${dayPhrase(due, v.today)}. Fatto?`,
    ];
  },
  options: () => [
    { id: "done", label: "Sì, fatto", primary: true, kind: "execute" },
    { id: "tomorrow", label: "Spostala a domani", kind: "execute" },
    later,
  ],
};

export const upcomingCalendar: Script = {
  room: "soggiorno",
  opening: (o, v) => {
    if (o.data.all_day === true || typeof o.data.start_date === "string") {
      const day = str(o.data.start_date, v.today);
      return [`${capitalize(dayPhrase(day, v.today))}: ${o.title}, tutto il giorno.`];
    }
    const at = str(o.data.starts_at);
    const day = at ? new Intl.DateTimeFormat("en-CA", { timeZone: v.timeZone }).format(new Date(at)) : v.today;
    return [`${capitalize(dayPhrase(day, v.today))} alle ${timeOf(at, v.timeZone)}: ${o.title}.`, `Promemoria: ${o.title}, ${dayPhrase(day, v.today)} alle ${timeOf(at, v.timeZone)}.`];
  },
  options: () => [
    { id: "ok", label: "Grazie", primary: true, kind: "dismiss" },
    { id: "open", label: "Apri il calendario", kind: "link", href: "/calendario" },
  ],
};

export const calendarOverlap: Script = {
  room: "soggiorno",
  opening: (o) => [`«${str(o.data.first)}» e «${str(o.data.second)}» si sovrappongono: ${o.description ?? ""}.`],
  options: () => [
    { id: "open", label: "Apri il calendario", primary: true, kind: "link", href: "/calendario" },
    { id: "ok", label: "Lo so, va bene così", kind: "dismiss" },
  ],
};

/** Habit 4/5 example (B-2): first time, last day of the week, or just logged. */
export const habitProgress: Script = {
  room: "soggiorno",
  opening: (o) => {
    const title = str(o.data.title, o.title);
    const logged = num(o.data.logged);
    const target = num(o.data.target, 1);
    const left = target - logged;
    const daysLeft = num(o.data.days_left, 7);
    if (left === 1 && daysLeft === 1) return [`${capitalize(title)}: ancora una volta oggi e l'obiettivo della settimana è fatto.`];
    if (left === 1) return [`${capitalize(title)}: ${countWord(logged)} su ${target} questa settimana. Ne manca una.`];
    if (logged === 0) return [`${capitalize(title)}: questa settimana non c'è ancora nessuna registrazione. Ne servono ${target}.`];
    return [`${capitalize(title)}: ${countWord(logged)} su ${target} questa settimana. Ne mancano ${left}, ${daysLeft === 1 ? "resta un giorno" : `restano ${daysLeft} giorni`}.`];
  },
  options: (o) =>
    o.data.done_today === true
      ? [
          { id: "ok", label: "Va bene", primary: true, kind: "snooze", snooze: "morning" },
          { id: "open", label: "Apri le abitudini", kind: "link", href: "/abitudini" },
        ]
      : [
          { id: "today", label: "Fatto oggi", primary: true, kind: "execute" },
          { id: "notyet", label: "Non ancora", kind: "snooze", snooze: 6 },
        ],
};

export const missedHabit: Script = {
  room: "soggiorno",
  opening: (o) => [
    `La settimana scorsa ${str(o.data.title)}: ${num(o.data.logged)} su ${num(o.data.target)}. Se l'hai fatto senza segnarlo, puoi ancora aggiungerlo.`,
  ],
  options: () => [
    { id: "open", label: "Apri le abitudini", primary: true, kind: "link", href: "/abitudini" },
    { id: "ok", label: "Va bene", kind: "dismiss" },
  ],
};

export const goalProgress: Script = {
  room: "soggiorno",
  facts: (o) => ({ celebrate: num(o.data.percent) >= 100 }),
  opening: (o) => {
    const title = str(o.data.title, o.title);
    const percent = num(o.data.percent);
    return percent >= 100
      ? [`${capitalize(title)}: traguardo raggiunto. Impeccabile.`, `${capitalize(title)}: fatto. Complimenti, davvero.`]
      : [`${capitalize(title)} è al ${percent}%. Un passo alla volta.`];
  },
  options: () => [
    { id: "ok", label: "Grazie", primary: true, kind: "dismiss" },
    { id: "open", label: "Vedi l'obiettivo", kind: "link", href: "/abitudini#obiettivi" },
  ],
};
