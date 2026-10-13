"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import type { LookItem, WardrobeItem } from "@/lib/db/types";
import { initialActionState, type ActionState } from "@/lib/errors";
import { CLOTHING_TYPES, DEFAULT_PLACEMENT } from "@/lib/wardrobe";
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

const CANVAS_W = 600;
const CANVAS_H = 800;
const ITEM_SIZE = 180; // Base draw size for items

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
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string>("top");
  const [title, setTitle] = useState(existingTitle ?? "");
  const dragRef = useRef<{ id: string; startX: number; startY: number; itemX: number; itemY: number } | null>(null);
  const pinchRef = useRef<{ id: string; startDist: number; startScale: number; startAngle: number; startRot: number } | null>(null);
  const imagesLoadedRef = useRef(false);

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

  // Mouse handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
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
      if (!dragRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const dx = (e.clientX - dragRef.current.startX) * scaleX / CANVAS_W;
      const dy = (e.clientY - dragRef.current.startY) * scaleY / CANVAS_H;

      setItems((prev) =>
        prev.map((it) =>
          it.id === dragRef.current!.id
            ? { ...it, x: Math.max(0, Math.min(1, dragRef.current!.itemX + dx)), y: Math.max(0, Math.min(1, dragRef.current!.itemY + dy)) }
            : it,
        ),
      );
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Touch handlers for pinch/rotate
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && selectedId) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
        const item = items.find((i) => i.id === selectedId);
        if (item) {
          pinchRef.current = { id: selectedId, startDist: dist, startScale: item.scale, startAngle: angle, startRot: item.rotation };
        }
      }
    },
    [selectedId, items],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
        const scaleFactor = dist / pinchRef.current.startDist;
        const newScale = Math.max(0.1, Math.min(3.0, pinchRef.current.startScale * scaleFactor));
        const newRotation = pinchRef.current.startRot + (angle - pinchRef.current.startAngle);

        setItems((prev) =>
          prev.map((it) => (it.id === pinchRef.current!.id ? { ...it, scale: newScale, rotation: newRotation } : it)),
        );
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
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
      setShowPicker(false);
      loadImage(wi.id);
    },
    [items, loadImage],
  );

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
      // Generate preview
      const preview = generatePreview();
      if (preview) formData.set("preview", new File([preview], "preview.jpg", { type: "image/jpeg" }));

      // Serialize item placements
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

  const filteredItems = wardrobeItems.filter(
    (w) => w.type === pickerCategory && w.status === "active" && !items.some((i) => i.id === w.id),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Canvas */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Item controls */}
      {selectedId ? (
        <div className="flex gap-2">
          <button type="button" className={cx(buttonClass.ghost, "flex-1 text-xs")} onClick={bringForward}>
            Porta avanti
          </button>
          <button type="button" className={cx(buttonClass.ghost, "flex-1 text-xs")} onClick={sendBackward}>
            Porta dietro
          </button>
          <button type="button" className={cx(buttonClass.danger, "flex-1 text-xs")} onClick={removeItem}>
            Rimuovi
          </button>
        </div>
      ) : null}

      {/* Add item button */}
      <button type="button" className={buttonClass.secondary} onClick={() => setShowPicker(true)}>
        <Icon name="add" className="size-5" /> Aggiungi capo
      </button>

      {/* Item picker */}
      {showPicker ? (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Scegli un capo</span>
            <button type="button" className="text-sm text-muted" onClick={() => setShowPicker(false)}>
              Chiudi
            </button>
          </div>
          {/* Category tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CLOTHING_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPickerCategory(t.id)}
                className={cx(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  pickerCategory === t.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Item grid */}
          {filteredItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nessun capo in questa categoria.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filteredItems.map((wi) => {
                const src = (wi.processed_path && urls.get(wi.processed_path)) || (wi.thumb_path && urls.get(wi.thumb_path));
                return (
                  <button key={wi.id} type="button" onClick={() => addItem(wi)} className="flex flex-col items-center gap-1 rounded-xl border border-border p-1 transition hover:border-accent">
                    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.03]">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
                      ) : (
                        <Icon name="hanger" className="size-6 text-muted" />
                      )}
                    </span>
                    <span className="line-clamp-1 text-xs">{wi.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Save form */}
      <form action={saveAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="look-title" className="text-sm font-medium">Nome del look</label>
          <input
            id="look-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Outfit casual estivo"
            required
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <input type="hidden" name="visibility" value="household" />
        <button type="submit" disabled={!title.trim() || items.length === 0} className={buttonClass.primary}>
          Salva
        </button>
        {!saveState.ok && saveState.message ? (
          <p role="alert" className="text-sm text-danger">{saveState.message}</p>
        ) : null}
        {saveState.ok && saveState.message ? (
          <p role="status" className="text-sm text-accent">{saveState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
