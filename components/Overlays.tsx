"use client";

import { useEffect } from "react";
import { useGame } from "@/lib/game/store";
import { useUI } from "@/lib/game/ui";
import { useDrag } from "@/lib/game/drag";
import type { Discovery } from "@/lib/types";
import { ItemChip } from "./ItemChip";

/** Ghost chip that follows the pointer while dragging, plus burst effects. */
export function DragLayer() {
  const drag = useDrag((s) => s.drag);
  const hoverChip = useDrag((s) => s.hoverChip);
  const overWorld = useDrag((s) => s.overWorld);
  const bursts = useDrag((s) => s.bursts);
  const item = useGame((s) => (drag ? s.discoveries[drag.itemId] : undefined));
  return (
    <>
      {drag && item && (
        <div
          className={"ghost" + (hoverChip ? " is-combining" : "") + (overWorld ? " is-world" : "")}
          style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
        >
          <ItemChip item={item} />
        </div>
      )}
      {bursts.map((b) => (
        <div key={b.id} className="burst" style={{ left: b.x, top: b.y, ["--burst" as string]: b.color }}>
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ ["--a" as string]: `${i * 30}deg` }} />
          ))}
        </div>
      ))}
    </>
  );
}

/** "FIRST DISCOVERY" cards for brand-new items. */
export function DiscoveryToasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dismiss(toasts[0].id), 2600);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  const t = toasts[0];
  if (!t) return null;
  return (
    <div className="toast" key={t.id} onClick={() => dismiss(t.id)} style={{ ["--accent" as string]: t.item.color }}>
      <div className="toast__rays" aria-hidden />
      <span className="toast__label">First discovery</span>
      <span className="toast__emoji">{t.item.emoji}</span>
      <span className="toast__name">{t.item.name}</span>
      <span className="toast__desc">{t.item.description}</span>
    </div>
  );
}

function RecipeNode({ id, depth, seen }: { id: string; depth: number; seen: Set<string> }) {
  const discoveries = useGame((s) => s.discoveries);
  const item: Discovery | undefined = discoveries[id];
  if (!item) return null;
  const parents = item.from && !seen.has(id) && depth < 12 ? item.from : null;
  const nextSeen = new Set(seen).add(id);
  return (
    <li>
      <ItemChip item={item} className={item.starter ? "chip--starter" : ""} />
      {parents && (
        <ul>
          <RecipeNode id={parents[0]} depth={depth + 1} seen={nextSeen} />
          <RecipeNode id={parents[1]} depth={depth + 1} seen={nextSeen} />
        </ul>
      )}
    </li>
  );
}

/** Trace an item back through the recipes that created it. */
export function RecipeModal() {
  const id = useUI((s) => s.recipeItemId);
  const set = useUI((s) => s.set);
  const item = useGame((s) => (id ? s.discoveries[id] : undefined));
  const recipes = useGame((s) => s.recipes);
  const discoveries = useGame((s) => s.discoveries);
  if (!id || !item) return null;
  // Every known way to make this item (the graph can have many parents).
  const ways = Object.entries(recipes)
    .filter(([, r]) => r === id)
    .map(([k]) => k.split("::").map((n) => discoveries[n]))
    .filter((p): p is [Discovery, Discovery] => !!p[0] && !!p[1]);
  return (
    <div className="modal-backdrop" onClick={() => set({ recipeItemId: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`How ${item.name} was made`}>
        <button className="inspector__close" aria-label="Close" onClick={() => set({ recipeItemId: null })}>
          ×
        </button>
        <h2>
          {item.emoji} How you made {item.name}
        </h2>
        <ul className="tree">
          <RecipeNode id={id} depth={0} seen={new Set()} />
        </ul>
        {ways.length > 1 && (
          <div className="ways">
            <span className="label">All recipes you know for it</span>
            {ways.map(([a, b], i) => (
              <div key={i} className="way">
                {a.emoji} {a.name} + {b.emoji} {b.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const confirm = useUI((s) => s.confirm);
  const set = useUI((s) => s.set);
  if (!confirm) return null;
  return (
    <div className="modal-backdrop" onClick={() => set({ confirm: null })}>
      <div className="modal modal--small" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h2>{confirm.title}</h2>
        <p>{confirm.body}</p>
        <div className="modal__actions">
          <button className="ghost-btn" onClick={() => set({ confirm: null })}>
            Cancel
          </button>
          <button
            className={confirm.danger ? "danger-btn" : "primary-btn"}
            onClick={() => {
              confirm.onConfirm();
              set({ confirm: null });
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
