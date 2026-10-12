"use client";

import type { Greeting } from "@/lib/baptista/greetings";
import { BaptistaBubble } from "./bubble";

/** Baptista's opening line at the top of a room home: typed in, no options. */
export function BaptistaGreeting({ greeting }: { greeting: Greeting }) {
  return <BaptistaBubble expression={greeting.expression} text={greeting.text} animate compact />;
}
