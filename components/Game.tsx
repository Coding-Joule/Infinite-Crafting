"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { useUI } from "@/lib/game/ui";
import { KEYS, loadJSON } from "@/lib/game/persistence";
import { TopBar } from "./TopBar";
import { Inventory } from "./Inventory";
import { WorldView } from "./WorldView";
import { CraftBench } from "./CraftBench";
import { Inspector } from "./Inspector";
import { ConfirmDialog, DiscoveryToasts, DragLayer, RecipeModal } from "./Overlays";

export default function Game() {
  const hydrated = useGame((s) => s.hydrated);
  const drawerOpen = useUI((s) => s.drawerOpen);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    const isFirst = loadJSON<unknown>(KEYS.discoveries, null) === null;
    useGame.getState().hydrate();
    if (isFirst) {
      setFirstVisit(true);
      const g = useGame.getState();
      if (g.bench.length === 0) {
        g.addBenchChip("earth", 0.2, 0.55);
        g.addBenchChip("water", 0.4, 0.45);
        g.addBenchChip("fire", 0.6, 0.55);
        g.addBenchChip("air", 0.8, 0.45);
      }
    }
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: { ai: boolean }) => useGame.getState().setAiEnabled(!!d.ai))
      .catch(() => useGame.getState().setAiEnabled(false));
  }, []);

  if (!hydrated) {
    return (
      <div className="loading">
        <span>🌍</span>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Inventory />
        {drawerOpen && <div className="drawer-scrim" onClick={() => useUI.getState().set({ drawerOpen: false })} />}
        <div className="stage">
          <div className="stage__world">
            <WorldView firstVisit={firstVisit} />
            <Inspector />
          </div>
          <CraftBench />
        </div>
      </div>
      <DiscoveryToasts />
      <RecipeModal />
      <ConfirmDialog />
      <DragLayer />
    </div>
  );
}
