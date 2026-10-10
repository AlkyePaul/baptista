import Link from "next/link";
import { Icon } from "@/components/icons";
import { PrivateMark } from "@/components/ui";
import { Swatch } from "@/components/wardrobe";
import type { WardrobeItem } from "@/lib/db/types";

/** Photo grid of clothes; `urls` maps thumb paths to short-lived signed URLs. */
export function WardrobeGrid({ items, urls }: { items: WardrobeItem[]; urls: Map<string, string> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const src = item.thumb_path ? urls.get(item.thumb_path) : undefined;
        return (
          <li key={item.id}>
            <Link href={`/stanze/guardaroba/capi/${item.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
              <span className="flex aspect-[4/5] items-center justify-center bg-foreground/[0.03]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private object
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="hanger" className="size-10 text-muted" />
                )}
              </span>
              <span className="flex items-center gap-2 px-3 py-2">
                {item.primary_color ? <Swatch color={item.primary_color} className="size-3 shrink-0" /> : null}
                <span className="line-clamp-1 flex-1 text-sm font-medium">{item.name}</span>
                <PrivateMark visibility={item.visibility} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
