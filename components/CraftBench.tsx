"use client";

import { useGame } from "@/lib/game/store";
import { beginChipDrag, useDrag } from "@/lib/game/drag";
import { sfx } from "@/lib/game/sound";
import { ItemChip } from "./ItemChip";

/** The crafting table: a free-form board where chips are dropped onto each other. */
export function CraftBench() {
  const bench = useGame((s) => s.bench);
  const discoveries = useGame((s) => s.discoveries);
  const clearBench = useGame((s) => s.clearBench);
  const addBenchChip = useGame((s) => s.addBenchChip);
  const hoverChip = useDrag((s) => s.hoverChip);
  const overBench = useDrag((s) => s.overBench);
  const dragging = useDrag((s) => !!s.drag);

  return (
    <section className={"bench" + (overBench ? " is-over" : "") + (dragging ? " is-dragging" : "")} data-bench>
      <header className="bench__head">
        <span className="bench__title">🧪 Crafting table</span>
        <span className="bench__hint">drop one thing onto another to combine</span>
        {bench.length > 0 && (
          <button
            className="ghost-btn"
            onClick={() => {
              clearBench();
              sfx("delete");
            }}
          >
            Clear
          </button>
        )}
      </header>
      {bench.length === 0 && (
        <div className="bench__empty">
          <span>Tap or drag discoveries here, then drag one onto another ✨</span>
        </div>
      )}
      {bench.map((chip) => {
        const item = discoveries[chip.itemId];
        if (!item) return null;
        return (
          <div
            key={chip.uid}
            className="bench__chip"
            data-bench-chip={chip.uid}
            style={{ left: `${chip.x * 100}%`, top: `${chip.y * 100}%` }}
            onPointerDown={(e) => {
              if (chip.pending) return;
              beginChipDrag(e, { itemId: chip.itemId, source: "bench", benchUid: chip.uid });
            }}
            onDoubleClick={() => {
              addBenchChip(chip.itemId, Math.min(0.95, chip.x + 0.08), chip.y);
              sfx("drop");
            }}
          >
            <ItemChip item={item} pending={chip.pending} highlight={hoverChip === chip.uid} />
          </div>
        );
      })}
    </section>
  );
}
