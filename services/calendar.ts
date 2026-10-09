import "server-only";

import { z } from "zod";
import { addDays, isCivilDate, localDate, zonedToUtc } from "@/lib/dates";
import { throwIfDbError } from "@/lib/errors";
import type { CalendarEvent } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { checkbox, optionalText, requiredText, updateVersioned, versionField } from "@/services/shared";

const civilDate = z.string().refine(isCivilDate, "Data non valida.");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Data e ora non valide.");

export const calendarEventSchema = z
  .object({
    title: requiredText(120, "Inserisci un titolo."),
    description: optionalText(2000),
    visibility: visibilitySchema,
    all_day: checkbox,
    starts_at: localDateTime.optional(),
    ends_at: localDateTime.optional(),
    start_date: civilDate.optional(),
    end_date: civilDate.optional(), // inclusive in the UI
  })
  .superRefine((v, ctx) => {
    if (v.all_day) {
      if (!v.start_date) ctx.addIssue({ code: "custom", path: ["start_date"], message: "Inserisci il giorno." });
      if (v.start_date && v.end_date && v.end_date < v.start_date)
        ctx.addIssue({ code: "custom", path: ["end_date"], message: "La fine deve essere dopo l'inizio." });
    } else {
      if (!v.starts_at) ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Inserisci l'inizio." });
      if (!v.ends_at) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Inserisci la fine." });
      if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at)
        ctx.addIssue({ code: "custom", path: ["ends_at"], message: "La fine deve essere dopo l'inizio." });
    }
  });

export const updateCalendarEventSchema = calendarEventSchema.and(z.object({ version: versionField }));

type CalendarInput = z.infer<typeof calendarEventSchema>;

/** UI values (household wall clock, inclusive end date) → DB columns (instants, exclusive end). */
function toColumns(input: CalendarInput, timeZone: string) {
  if (input.all_day) {
    const start = input.start_date!;
    return {
      all_day: true,
      start_date: start,
      end_date: addDays(input.end_date ?? start, 1),
      starts_at: null,
      ends_at: null,
    };
  }
  return {
    all_day: false,
    starts_at: zonedToUtc(input.starts_at!, timeZone).toISOString(),
    ends_at: zonedToUtc(input.ends_at!, timeZone).toISOString(),
    start_date: null,
    end_date: null,
  };
}

export async function createCalendarEvent(ctx: ExecutionContext, input: CalendarInput) {
  const { error } = await ctx.supabase.from("calendar_events").insert({
    household_id: ctx.household.id,
    title: input.title,
    description: input.description,
    visibility: input.visibility,
    ...toColumns(input, ctx.household.timezone),
  });
  throwIfDbError(error);
}

export async function updateCalendarEvent(
  ctx: ExecutionContext,
  id: string,
  input: CalendarInput & { version: number },
) {
  await updateVersioned(ctx, "calendar_events", id, input.version, {
    title: input.title,
    description: input.description,
    visibility: input.visibility,
    ...toColumns(input, ctx.household.timezone),
  });
}

/** Sort key and local start day of an event. */
export function eventStartDay(event: CalendarEvent, timeZone: string): string {
  return event.all_day ? event.start_date! : localDate(new Date(event.starts_at!), timeZone);
}

function sortEvents(events: CalendarEvent[], timeZone: string) {
  return events.sort((a, b) => {
    const da = eventStartDay(a, timeZone);
    const db = eventStartDay(b, timeZone);
    if (da !== db) return da < db ? -1 : 1;
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    return (a.starts_at ?? "") < (b.starts_at ?? "") ? -1 : 1;
  });
}

/** Events overlapping the local days [fromDay, toDay). */
export async function listEventsBetween(
  ctx: ExecutionContext,
  fromDay: string,
  toDay: string,
  limit = 200,
): Promise<CalendarEvent[]> {
  const tz = ctx.household.timezone;
  const fromInstant = zonedToUtc(`${fromDay}T00:00`, tz).toISOString();
  const toInstant = zonedToUtc(`${toDay}T00:00`, tz).toISOString();
  const [timed, allDay] = await Promise.all([
    ctx.supabase
      .from("calendar_events")
      .select("*")
      .eq("household_id", ctx.household.id)
      .eq("all_day", false)
      .lt("starts_at", toInstant)
      .gt("ends_at", fromInstant)
      .order("starts_at")
      .limit(limit),
    ctx.supabase
      .from("calendar_events")
      .select("*")
      .eq("household_id", ctx.household.id)
      .eq("all_day", true)
      .lt("start_date", toDay)
      .gt("end_date", fromDay)
      .order("start_date")
      .limit(limit),
  ]);
  throwIfDbError(timed.error);
  throwIfDbError(allDay.error);
  return sortEvents([...(timed.data ?? []), ...(allDay.data ?? [])] as CalendarEvent[], tz);
}
