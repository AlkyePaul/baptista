import Link from "next/link";
import { Icon } from "@/components/icons";
import { PrivateMark } from "@/components/ui";
import type { Look } from "@/lib/db/types";

/** Grid of look preview cards. */
export function LooksGrid({ looks, urls }: { looks: Look[]; urls: Map<string, string> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {looks.map((look) => {
        const src = look.preview_path ? urls.get(look.preview_path) : undefined;
        return (
          <li key={look.id}>
            <Link
              href={`/stanze/guardaroba/look/${look.id}`}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <span className="flex aspect-[3/4] items-center justify-center bg-foreground/[0.03]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="outfit" className="size-10 text-muted" />
                )}
              </span>
              <span className="flex items-center gap-2 px-3 py-2">
                <span className="line-clamp-1 flex-1 text-sm font-medium">{look.title}</span>
                <PrivateMark visibility={look.visibility} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
