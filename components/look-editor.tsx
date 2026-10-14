"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { LookItem, WardrobeItem } from "@/lib/db/types";
import { initialActionState, type ActionState } from "@/lib/errors";
import { CLOTHING_TYPES, CLOTHING_TYPE_IMAGE, DEFAULT_PLACEMENT } from "@/lib/wardrobe";
import { createLookAction, saveLookItemsAction } from "@/app/actions/looks";

type CanvasItem = {
  id: string; // wardrobe_item_id
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zOrder: number;
  image: HTMLImageElement | null;
  name: string;
  type: string;
};

type Props = {
  wardrobeItems: WardrobeItem[];
  urls: Map<string, string>;
  /** Existing look ID (null = creating new). */
  lookId?: string | null;
  lookVersion?: number;
  existingTitle?: string;
  existingItems?: LookItem[];
};

const CANVAS_W = 800;
const CANVAS_H = 1050;
const ITEM_SIZE = 280; // Base draw size for items

function CtrlBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "flex size-9 items-center justify-center rounded-lg transition",
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-foreground/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

export function LookEditor({ wardrobeItems, urls, lookId, lookVersion, existingTitle, existingItems }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<CanvasItem[]>(() => {
    if (!existingItems?.length) return [];
    return existingItems.map((li) => {
      const wi = wardrobeItems.find((w) => w.id === li.wardrobe_item_id);
      return {
        id: li.wardrobe_item_id,
        x: Number(li.x),
        y: Number(li.y),
        scale: Number(li.scale),
        rotation: Number(li.rotation),
        zOrder: li.z_order,
        image: null,
        name: wi?.name ?? "?",
        type: wi?.type ?? "other",
      };
    });
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null);
  const [title, setTitle] = useState(existingTitle ?? "");
  const dragRef = useRef<{ id: string; startX: number; startY: number; itemX: number; itemY: number } | null>(null);
  const pinchRef = useRef<{ id: string; startDist: number; startScale: number; startAngle: number; startRot: number } | null>(null);
  const imagesLoadedRef = useRef(false);
  // Refs for touch handlers (avoid stale closures in non-passive listeners)
  const itemsRef = useRef(items);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Load images for pre-existing items on mount (external system: Image network fetch).
  useEffect(() => {
    if (imagesLoadedRef.current || !existingItems?.length) return;
    imagesLoadedRef.current = true;
    for (const li of existingItems) {
      const wi = wardrobeItems.find((w) => w.id === li.wardrobe_item_id);
      if (!wi) continue;
      const url = (wi.processed_path && urls.get(wi.processed_path)) || (wi.thumb_path && urls.get(wi.thumb_path));
      if (!url) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setItems((prev) => prev.map((it) => (it.id === li.wardrobe_item_id ? { ...it, image: img } : it)));
      };
      img.src = url;
    }
  }, [existingItems, wardrobeItems, urls]);

  const loadImage = useCallback(
    (wardrobeItemId: string) => {
      const wi = wardrobeItems.find((w) => w.id === wardrobeItemId);
      if (!wi) return;
      const url = (wi.processed_path && urls.get(wi.processed_path)) || (wi.thumb_path && urls.get(wi.thumb_path));
      if (!url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setItems((prev) => prev.map((it) => (it.id === wardrobeItemId ? { ...it, image: img } : it)));
      };
      img.src = url;
    },
    [wardrobeItems, urls],
  );

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const sorted = [...items].sort((a, b) => a.zOrder - b.zOrder);

    for (const item of sorted) {
      const cx = item.x * CANVAS_W;
      const cy = item.y * CANVAS_H;
      const size = ITEM_SIZE * item.scale;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((item.rotation * Math.PI) / 180);

      if (item.image) {
        const aspect = item.image.width / item.image.height;
        let w: number;
        let h: number;
        if (aspect > 1) {
          w = size;
          h = size / aspect;
        } else {
          h = size;
          w = size * aspect;
        }
        ctx.drawImage(item.image, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = "#f0f0f0";
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.fillStyle = "#999";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(item.name, 0, 4);
      }

      // Selection indicator
      if (item.id === selectedId) {
        const half = size / 2 + 4;
        ctx.strokeStyle = "#2f62c4";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  }, [items, selectedId]);

  // Hit test
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;

      // Check from top z-order down
      const sorted = [...items].sort((a, b) => b.zOrder - a.zOrder);
      for (const item of sorted) {
        const cx = item.x * CANVAS_W;
        const cy = item.y * CANVAS_H;
        const size = ITEM_SIZE * item.scale;
        const half = size / 2;
        // Simple AABB (ignoring rotation for simplicity)
        if (px >= cx - half && px <= cx + half && py >= cy - half && py <= cy + half) {
          return item.id;
        }
      }
      return null;
    },
    [items],
  );

  // Pointer handlers (single-finger drag)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) return; // already dragging (e.g. second finger)
      const canvas = canvasRef.current;
      if (!canvas) return;

      const hit = hitTest(e.clientX, e.clientY);
      setSelectedId(hit);
      if (!hit) return;

      const item = items.find((i) => i.id === hit);
      if (!item) return;

      dragRef.current = {
        id: hit,
        startX: e.clientX,
        startY: e.clientY,
        itemX: item.x,
        itemY: item.y,
      };
      canvas.setPointerCapture(e.pointerId);
    },
    [hitTest, items],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const dx = (e.clientX - drag.startX) * scaleX / CANVAS_W;
      const dy = (e.clientY - drag.startY) * scaleY / CANVAS_H;

      setItems((prev) =>
        prev.map((it) =>
          it.id === drag.id
            ? { ...it, x: Math.max(0, Math.min(1, drag.itemX + dx)), y: Math.max(0, Math.min(1, drag.itemY + dy)) }
            : it,
        ),
      );
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Non-passive touch listeners for pinch/rotate (attached via DOM to avoid React passive default)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      dragRef.current = null; // cancel any single-finger drag
      const sid = selectedIdRef.current;
      if (!sid) return;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      const item = itemsRef.current.find((i) => i.id === sid);
      if (item) {
        pinchRef.current = { id: sid, startDist: dist, startScale: item.scale, startAngle: angle, startRot: item.rotation };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      const scaleFactor = dist / pinch.startDist;
      const newScale = Math.max(0.1, Math.min(3.0, pinch.startScale * scaleFactor));
      const newRotation = pinch.startRot + (angle - pinch.startAngle);
      setItems((prev) =>
        prev.map((it) => (it.id === pinch.id ? { ...it, scale: newScale, rotation: newRotation } : it)),
      );
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Item actions
  const bringForward = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => {
      const maxZ = Math.max(...prev.map((i) => i.zOrder));
      return prev.map((it) => (it.id === selectedId ? { ...it, zOrder: maxZ + 1 } : it));
    });
  }, [selectedId]);

  const sendBackward = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => {
      const minZ = Math.min(...prev.map((i) => i.zOrder));
      return prev.map((it) => (it.id === selectedId ? { ...it, zOrder: minZ - 1 } : it));
    });
  }, [selectedId]);

  const removeItem = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const setItemScale = useCallback(
    (value: number) => {
      if (!selectedId) return;
      setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, scale: value } : it)));
    },
    [selectedId],
  );

  const adjustRotation = useCallback(
    (degrees: number) => {
      if (!selectedId) return;
      setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, rotation: it.rotation + degrees } : it)));
    },
    [selectedId],
  );

  const addItem = useCallback(
    (wi: WardrobeItem) => {
      const placement = DEFAULT_PLACEMENT[wi.type] ?? DEFAULT_PLACEMENT.other;
      const maxZ = items.length > 0 ? Math.max(...items.map((i) => i.zOrder)) : 0;
      const newItem: CanvasItem = {
        id: wi.id,
        x: placement.x,
        y: placement.y,
        scale: placement.scale,
        rotation: 0,
        zOrder: maxZ + 1,
        image: null,
        name: wi.name,
        type: wi.type,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(wi.id);
      setDrawerCategory(null);
      loadImage(wi.id);
    },
    [items, loadImage],
  );

  const randomize = useCallback(() => {
    // Pick one random active item per available category, replace canvas entirely
    const byType = new Map<string, WardrobeItem[]>();
    for (const wi of wardrobeItems) {
      if (wi.status !== "active") continue;
      const list = byType.get(wi.type) ?? [];
      list.push(wi);
      byType.set(wi.type, list);
    }
    const picked: CanvasItem[] = [];
    let z = 0;
    for (const [type, pool] of byType) {
      const wi = pool[Math.floor(Math.random() * pool.length)];
      const placement = DEFAULT_PLACEMENT[type] ?? DEFAULT_PLACEMENT.other;
      picked.push({
        id: wi.id,
        x: placement.x,
        y: placement.y,
        scale: placement.scale,
        rotation: 0,
        zOrder: z++,
        image: null,
        name: wi.name,
        type: wi.type,
      });
    }
    setItems(picked);
    setSelectedId(null);
    setDrawerCategory(null);
    for (const it of picked) loadImage(it.id);
  }, [wardrobeItems, loadImage]);

  // Close drawer on ESC
  useEffect(() => {
    if (!drawerCategory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerCategory(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerCategory]);

  // Generate preview and save
  const generatePreview = useCallback((): Blob | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const binary = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: "image/jpeg" });
  }, []);

  const [saveState, saveAction] = useActionState(
    async (_: ActionState, formData: FormData) => {
      // Clear selection so the blue dashed rect doesn't appear in the preview
      setSelectedId(null);
      // Redraw synchronously without selection indicator
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          const sorted = [...items].sort((a, b) => a.zOrder - b.zOrder);
          for (const item of sorted) {
            const cx = item.x * CANVAS_W;
            const cy = item.y * CANVAS_H;
            const size = ITEM_SIZE * item.scale;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((item.rotation * Math.PI) / 180);
            if (item.image) {
              const aspect = item.image.width / item.image.height;
              const [w, h] = aspect > 1 ? [size, size / aspect] : [size * aspect, size];
              ctx.drawImage(item.image, -w / 2, -h / 2, w, h);
            }
            ctx.restore();
          }
        }
      }
      const preview = generatePreview();
      if (preview) formData.set("preview", new File([preview], "preview.jpg", { type: "image/jpeg" }));

      const placements = items.map((it) => ({
        wardrobe_item_id: it.id,
        x: Math.round(it.x * 1000) / 1000,
        y: Math.round(it.y * 1000) / 1000,
        scale: Math.round(it.scale * 100) / 100,
        rotation: Math.round(it.rotation * 10) / 10,
        z_order: it.zOrder,
      }));
      formData.set("items", JSON.stringify(placements));
      formData.set("title", title);

      if (lookId) {
        formData.set("version", String(lookVersion ?? 1));
        return saveLookItemsAction(lookId, _, formData);
      }
      return createLookAction(_, formData);
    },
    initialActionState,
  );

  // Derived
  const availableCounts = new Map(CLOTHING_TYPES.map((t) => [
    t.id,
    wardrobeItems.filter((w) => w.type === t.id && w.status === "active" && !items.some((i) => i.id === w.id)).length,
  ]));

  const drawerItems = drawerCategory
    ? wardrobeItems.filter((w) => w.type === drawerCategory && w.status === "active" && !items.some((i) => i.id === w.id))
    : [];

  const drawerLabel = drawerCategory ? CLOTHING_TYPES.find((t) => t.id === drawerCategory)?.label ?? "" : "";
  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))]">
        <Link
          href="/stanze/guardaroba/look"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-foreground/[0.06]"
          aria-label="Torna ai look"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5" aria-hidden>
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome del look"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={randomize}
          className="shrink-0 rounded-md bg-violet-800 text-white  border border-border px-2 py-1 text-xs font-medium text-muted transition hover:bg-foreground/[0.06]"
        >
          Random
        </button>
        <form action={saveAction} className="shrink-0">
          {!lookId && (
            <select
              name="visibility"
              defaultValue="private"
              aria-label="Chi può vedere il look"
              className="mr-2 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="private">Solo io</option>
              <option value="household">Tutta la casa</option>
            </select>
          )}
          <button
            type="submit"
            disabled={!title.trim() || items.length === 0}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition disabled:opacity-40"
          >
            Salva
          </button>
        </form>
      </div>

      {/* Canvas + icon strip */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Canvas — full width */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* Category icon strip — overlaid on right edge */}
        {!drawerCategory && (
          <div className="absolute bottom-0 right-0 top-0 z-10 flex w-11 flex-col justify-center gap-4 overflow-y-auto p-1 bg-violet-200">
            {CLOTHING_TYPES.map((t) => {
              const count = availableCounts.get(t.id) ?? 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={`${t.label}: ${count} disponibili`}
                  aria-label={`${t.label}: ${count} disponibili`}
                  disabled={count === 0}
                  onClick={() => setDrawerCategory(t.id)}
                  className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted backdrop-blur-sm transition hover:bg-surface disabled:pointer-events-none disabled:opacity-60"
                >
                  <NextImage src={CLOTHING_TYPE_IMAGE[t.id]} alt="" width={28} height={28} className="size-7 object-contain" />
                  <span aria-hidden="true" className="absolute bottom-0 right-0 rounded-full bg-surface px-0.5 text-[10px] leading-3 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Drawer backdrop + panel */}
        {drawerCategory && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 z-20 bg-black/30"
              onClick={() => setDrawerCategory(null)}
            />
            {/* Sliding panel */}
            <div className="absolute bottom-0 right-0 top-0 z-30 w-[70%] max-w-[290px] animate-[slide-in-right_200ms_ease-out] overflow-y-auto border-l border-border bg-surface">
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-3 py-2">
                <span className="text-sm font-medium">{drawerLabel}</span>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-foreground/[0.06]"
                  onClick={() => setDrawerCategory(null)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Item list */}
              <div className="flex flex-col gap-1 p-2">
                {drawerItems.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Nessun capo disponibile.</p>
                ) : (
                  drawerItems.map((wi) => {
                    const src = (wi.processed_path && urls.get(wi.processed_path)) || (wi.thumb_path && urls.get(wi.thumb_path));
                    return (
                      <button
                        key={wi.id}
                        type="button"
                        onClick={() => addItem(wi)}
                        className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-foreground/[0.04]"
                      >
                        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.03]">
                          {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
                          ) : (
                            <Icon name="hanger" className="size-5 text-muted" />
                          )}
                        </span>
                        <span className="line-clamp-2 text-left text-sm">{wi.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div className="border-t border-border bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {selectedItem ? (
          <div className="flex items-center gap-1">
            {/* Z-order */}
            <CtrlBtn onClick={sendBackward} title="Porta dietro">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                <path d="M7 13l5 5 5-5M7 7l5 5 5-5" />
              </svg>
            </CtrlBtn>
            <CtrlBtn onClick={bringForward} title="Porta avanti">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                <path d="M7 11l5-5 5 5M7 17l5-5 5 5" />
              </svg>
            </CtrlBtn>

            {/* Scale slider */}
            <input
              type="range"
              min={0.1}
              max={3.0}
              step={0.05}
              value={selectedItem.scale}
              onChange={(e) => setItemScale(Number(e.target.value))}
              className="mx-1 flex-1 accent-[var(--accent)]"
              aria-label="Scala"
            />

            {/* Rotate */}
            <CtrlBtn onClick={() => adjustRotation(-15)} title="Ruota −15°">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                <path d="M3 12a9 9 0 1 0 9-9" />
                <path d="M3 3v6h6" />
              </svg>
            </CtrlBtn>
            <CtrlBtn onClick={() => adjustRotation(15)} title="Ruota +15°">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                <path d="M21 12a9 9 0 1 1-9-9" />
                <path d="M21 3v6h-6" />
              </svg>
            </CtrlBtn>

            {/* Remove */}
            <CtrlBtn onClick={removeItem} title="Rimuovi" danger>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </CtrlBtn>
          </div>
        ) : (
          <p className="py-1 text-center text-sm text-muted">Tocca un capo per selezionarlo</p>
        )}
        {!saveState.ok && saveState.message ? (
          <p role="alert" className="mt-1 text-center text-sm text-danger">{saveState.message}</p>
        ) : null}
        {saveState.ok && saveState.message ? (
          <p role="status" className="mt-1 text-center text-sm text-accent">{saveState.message}</p>
        ) : null}
      </div>
    </div>
  );
}
