"use client";

import type { ReactNode } from "react";
import type { Greeting } from "@/lib/baptista/greetings";
import { BaptistaBubble } from "./bubble";

/** Baptista's opening line at the top of a room home: typed in; optional controls below. */
export function BaptistaGreeting({ greeting, children }: { greeting: Greeting; children?: ReactNode }) {
  return (
    <BaptistaBubble expression={greeting.expression} text={greeting.text} animate compact>
      {children}
    </BaptistaBubble>
  );
}
