"use client";

import { useEffect, useRef } from "react";
import { WorldEngine } from "@/lib/world/engine";
import { getItem, useGame } from "@/lib/game/store";
import { combineItems } from "@/lib/game/combine";
import { setEngine, useDrag } from "@/lib/game/drag";
import { sfx } from "@/lib/game/sound";
import { KEYS, loadJSON, saveJSON } from "@/lib/game/persistence";
import { WORLD, type SavedWorld } from "@/lib/world/types";

export function WorldView({ firstVisit }: { firstVisit: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const worldCount = useGame((s) => s.worldCount);
  const dayCycle = useGame((s) => s.settings.dayCycle);
  const overWorld = useDrag((s) => s.overWorld);
  const worldDrag = useDrag((s) => s.worldDrag);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new WorldEngine(canvas, {
      getItem,
      onCombine: async (a, b) => {
        const res = await combineItems(a, b);
        return res?.item.id ?? null;
      },
      onSelect: (id) => useGame.getState().setSelectedObject(id),
      onSave: (data) => saveJSON(KEYS.world, data),
      onCountChange: (n) => useGame.getState().setWorldCount(n),
      onSound: (name) => sfx(name),
      getTrashRect: () => trashRef.current?.getBoundingClientRect() ?? null,
      onDragObject: (active, overTrash) => useDrag.getState().set({ worldDrag: { active, overTrash } }),
    });
    engine.dayCycle = useGame.getState().settings.dayCycle;
    engine.load(loadJSON<SavedWorld | null>(KEYS.world, null));
    if (firstVisit && engine.objects.length === 0) {
      // A tiny starting scene so the world never feels empty.
      engine.spawn("water", WORLD.W / 2 - 300, WORLD.HORIZON + 260);
      engine.spawn("earth", WORLD.W / 2 + 250, WORLD.HORIZON + 200);
    }
    engineRef.current = engine;
    setEngine(engine);
    // Handy for debugging from the console.
    (window as unknown as { __world?: WorldEngine }).__world = engine;
    return () => {
      setEngine(null);
      engine.destroy();
      engineRef.current = null;
    };
  }, [firstVisit]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.dayCycle = dayCycle;
  }, [dayCycle]);

  const zoom = (f: number) => engineRef.current?.zoomBy(f);

  return (
    <div className={"world" + (overWorld ? " is-over" : "")}>
      <canvas ref={canvasRef} className="world__canvas" aria-label="Your world" />
      {worldCount === 0 && (
        <div className="world__empty">
          <div>
            <strong>Your world is empty.</strong>
            <span>Drag anything you discover into it — it comes to life.</span>
          </div>
        </div>
      )}
      <div className="world__controls" data-drop-block>
        <button onClick={() => zoom(1.25)} aria-label="Zoom in" title="Zoom in">
          ＋
        </button>
        <button onClick={() => zoom(0.8)} aria-label="Zoom out" title="Zoom out">
          －
        </button>
        <button onClick={() => engineRef.current?.resetCamera()} aria-label="Reset camera" title="Reset camera">
          ⌖
        </button>
      </div>
      <div
        ref={trashRef}
        className={"world__trash" + (worldDrag.active ? " is-visible" : "") + (worldDrag.overTrash ? " is-hot" : "")}
        aria-hidden={!worldDrag.active}
      >
        🗑️ Drop here to remove
      </div>
    </div>
  );
}
