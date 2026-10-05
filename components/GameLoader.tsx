"use client";

import dynamic from "next/dynamic";

// The game relies on canvas, localStorage and pointer APIs, so it renders client-side only.
const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => (
    <div className="loading">
      <span>🌍</span>
    </div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
