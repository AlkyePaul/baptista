/**
 * Opening line of Baptista at the top of each room home (user 2026-10-12). Deterministic,
 * computed from the room's own data; wording is a first draft to be refined later.
 */
import { formatItalianNumber } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import type { Expression } from "./expressions";

export type Greeting = { text: string; expression: Expression };

// Wardrobe -----------------------------------------------------------------------------------

export type WeatherNow = {
  place: string | null;
  /** Where the position came from: the device (GPS, allowed by the user), the IP, the time zone. */
  source: "device" | "ip" | "zone";
  temperature: number;
  min: number;
  max: number;
  /** WMO weather code (Open-Meteo). */
  code: number;
  /** Max probability of precipitation today, 0–100 (null when unknown). */
  rainChance: number | null;
};

/** Short Italian description of a WMO weather code. */
export function describeWeather(code: number): string {
  if (code === 0) return "sereno";
  if (code <= 2) return "poco nuvoloso";
  if (code === 3) return "coperto";
  if (code === 45 || code === 48) return "nebbia";
  if (code >= 51 && code <= 57) return "pioviggine";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "pioggia";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if (code >= 95) return "temporale";
  return "variabile";
}

function wet(w: WeatherNow): boolean {
  return (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.code >= 95 || (w.rainChance ?? 0) >= 50;
}

/** What to wear from the day's temperatures and rain. */
export function dressAdvice(w: WeatherNow): string {
  const feel = (w.max + w.min) / 2;
  const base =
    feel < 5
      ? "cappotto pesante, sciarpa e strati caldi"
      : feel < 12
        ? "un giaccone e un maglione"
        : feel < 18
          ? "una giacca leggera o un maglioncino"
          : feel < 24
            ? "maniche lunghe leggere, magari con una felpa per la sera"
            : "abiti leggeri e traspiranti";
  const snow = (w.code >= 71 && w.code <= 77) || w.code === 85 || w.code === 86;
  const extra = snow ? " e scarpe adatte alla neve" : wet(w) ? ", e non dimenticare l'ombrello" : "";
  const spread = w.max - w.min >= 10 ? " Forte escursione termica: meglio vestirsi a strati." : "";
  return `${base}${extra}.${spread}`;
}

export function wardrobeGreeting(weather: WeatherNow | null): Greeting {
  if (!weather) {
    return { expression: "thoughtful", text: "Oggi non riesco a leggere il meteo: dai un'occhiata fuori prima di scegliere cosa indossare." };
  }
  const where = weather.place ? ` a ${weather.place}` : weather.source === "device" ? " dove ti trovi" : "";
  const t = (n: number) => `${formatItalianNumber(Math.round(n))}°`;
  return {
    expression: "suggestion",
    text: `Il meteo${where} è ${describeWeather(weather.code)}: ora ${t(weather.temperature)}, oggi tra ${t(weather.min)} e ${t(weather.max)}. Puoi vestirti con ${dressAdvice(weather)}`,
  };
}

// Kitchen ------------------------------------------------------------------------------------

export function kitchenGreeting(meals: number, kcal: number, target: number | null): Greeting {
  if (meals === 0) {
    return { expression: "thoughtful", text: "Oggi non hai ancora segnato nessun pasto. Aggiungili nel diario: così tengo il conto delle calorie per te." };
  }
  const recorded = `Hai segnato ${meals === 1 ? "1 pasto" : `${meals} pasti`} oggi, per un totale di ${formatItalianNumber(kcal)} kcal.`;
  if (kcal < 500) {
    return { expression: "thoughtful", text: `${recorded} È ancora poco: se hai mangiato altro, ricordati di inserirlo.` };
  }
  if (!target) {
    return { expression: "suggestion", text: `${recorded} Imposta un obiettivo di calorie nei Pasti e ti dirò come stai andando.` };
  }
  const share = kcal / target;
  const left = Math.round(target - kcal);
  if (share < 0.75) {
    return { expression: "suggestion", text: `${recorded} Sei al ${Math.round(share * 100)}% del tuo obiettivo: restano ${formatItalianNumber(left)} kcal.` };
  }
  if (share <= 1) {
    return { expression: "confirmation", text: `${recorded} Sei vicino all'obiettivo: restano ${formatItalianNumber(left)} kcal, scegli qualcosa di leggero.` };
  }
  return { expression: "alert", text: `${recorded} Hai superato l'obiettivo di ${formatItalianNumber(-left)} kcal: domani si riparte.` };
}

// Finance ------------------------------------------------------------------------------------

/** `elapsed` is the share of the month gone by (0–1), `spent` what the household spent so far. */
export function financeGreeting(elapsed: number, spent: number, budget: number | null, currency: string): Greeting {
  const monthPct = Math.round(elapsed * 100);
  const spentText = formatMoney(spent, currency);
  if (!budget) {
    return {
      expression: "thoughtful",
      text: `Siamo al ${monthPct}% del mese e hai speso ${spentText}. Imposta un budget totale del mese e ti dirò se sei in linea.`,
    };
  }
  const budgetPct = Math.round((100 * spent) / budget);
  const head = `Siamo al ${monthPct}% del mese e hai usato il ${budgetPct}% del budget (${spentText} su ${formatMoney(budget, currency)}).`;
  if (spent > budget) return { expression: "alert", text: `${head} Il budget è superato: meglio rimandare le spese non necessarie.` };
  if (budgetPct > monthPct + 10) return { expression: "alert", text: `${head} Stai spendendo più in fretta del mese: rallenta un po'.` };
  if (budgetPct < monthPct - 10) return { expression: "confirmation", text: `${head} Ottimo, sei sotto il ritmo previsto.` };
  return { expression: "confirmation", text: `${head} Sei in linea con il mese.` };
}
