"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import type { Discovery } from "@/lib/types";
import type { WorldObject } from "@/lib/world/types";
import { burnsOut, fuelFor, isLiving, isPlantLife, lifeStage, lifespanDays } from "@/lib/world/life";
import { useUI } from "@/lib/game/ui";
import { getEngine } from "@/lib/game/drag";
import { sfx } from "@/lib/game/sound";

const TYPE_LABEL: Record<string, string> = {
  terrain: "Terrain",
  plant: "Plant",
  tree: "Tree",
  building: "Building",
  human: "Person",
  animal: "Creature",
  vehicle: "Vehicle",
  weather: "Weather",
  celestial: "Sky",
  water: "Water",
  fire: "Fire",
  particle: "Effect",
  decoration: "Decoration",
  machine: "Machine",
  food: "Food",
  object: "Object",
  abstract: "Idea",
};

/** Small card describing the selected world object. */
export function Inspector() {
  const selectedId = useGame((s) => s.selectedObjectId);
  const discoveries = useGame((s) => s.discoveries);
  const favorites = useGame((s) => s.favorites);
  const toggleFavorite = useGame((s) => s.toggleFavorite);
  const addBenchChip = useGame((s) => s.addBenchChip);
  const setUI = useUI((s) => s.set);
  // The world changes every frame; refresh the live stats a few times a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => setTick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, [selectedId]);
  const engine = getEngine();
  const obj = selectedId ? engine?.getObject(selectedId) : undefined;
  if (!obj) return null;
  const item = discoveries[obj.itemId];
  if (!item) return null;
  const from = item.from ? item.from.map((id) => discoveries[id]) : null;
  const fav = !!favorites[item.id];

  return (
    <div className="inspector" data-drop-block role="dialog" aria-label={`${item.name} details`}>
      <button className="inspector__close" aria-label="Close" onClick={() => engine?.select(null)}>
        ×
      </button>
      <div className="inspector__hero" style={{ ["--accent" as string]: item.color }}>
        <span className="inspector__emoji">{item.emoji}</span>
        <div>
          <h3>{item.name}</h3>
          <div className="badges">
            <span className="badge">{item.category}</span>
            <span className="badge badge--soft">{TYPE_LABEL[item.worldType]}</span>
            <span className="badge badge--soft">{item.size}</span>
          </div>
        </div>
      </div>
      <p className="inspector__desc">“{item.description}”</p>
      <div className="inspector__from">
        <span className="label">Created from</span>
        {from && from[0] && from[1] ? (
          <button className="recipe-link" onClick={() => setUI({ recipeItemId: item.id })}>
            {from[0].emoji} {from[0].name} <b>+</b> {from[1].emoji} {from[1].name}
            <span className="trace">trace ›</span>
          </button>
        ) : (
          <span className="muted">One of the four starting elements</span>
        )}
      </div>
      <LiveStatus obj={obj} item={item} />
      {item.traits.length > 0 && (
        <div className="traits">
          {item.traits.map((t) => (
            <span key={t} className="trait">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="inspector__actions">
        <button onClick={() => engine?.duplicate(obj.id)}>⧉ Duplicate</button>
        <button className={fav ? "is-on" : ""} onClick={() => toggleFavorite(item.id)}>
          {fav ? "★ Favorited" : "☆ Favorite"}
        </button>
        <button
          onClick={() => {
            addBenchChip(item.id);
            sfx("drop");
          }}
        >
          🧪 To table
        </button>
        <button className="danger" onClick={() => engine?.deleteObject(obj.id)}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="bar">
      <span className="bar__label">{label}</span>
      <span className="bar__track">
        <span className="bar__fill" style={{ width: `${v}%`, background: v < 25 ? "#e5484d" : color }} />
      </span>
      <span className="bar__value">{Math.round(v)}</span>
    </div>
  );
}

/** Real-time state of the selected thing: vitals, growth, fuel, driver… */
function LiveStatus({ obj, item }: { obj: WorldObject; item: Discovery }) {
  const discoveries = useGame((s) => s.discoveries);
  const engine = getEngine();
  const st = obj.state;
  if (isLiving(item)) {
    const age = st.age ?? 2;
    const stage = lifeStage(item, age, obj.seed);
    const span = lifespanDays(item, obj.seed);
    const home = st.homeId ? engine?.getObject(st.homeId) : undefined;
    const homeName = home ? discoveries[home.itemId]?.name : undefined;
    return (
      <div className="live">
        <div className="live__activity">{st.activity ?? "Settling in"}</div>
        <Bar label="❤️ Health" value={st.hp ?? 100} color="#3fae5a" />
        <Bar label="🍗 Food" value={st.food ?? 80} color="#f2a33a" />
        <Bar label="⚡ Energy" value={st.rest ?? 90} color="#4f8de0" />
        <div className="live__meta">
          {stage === "baby" ? "👶 Baby" : stage === "elder" ? "🧓 Elder" : "Adult"} · {age.toFixed(1)} days old
          {Number.isFinite(span) ? ` · lives ~${Math.round(span)} days` : " · ageless"}
          {homeName ? ` · home: ${homeName}` : ""}
        </div>
      </div>
    );
  }
  if (isPlantLife(item)) {
    if (st.charred) return <div className="live"><div className="live__activity">🔥 Burnt — will regrow in time (faster with rain)</div></div>;
    if (st.growth !== undefined) return <div className="live"><div className="live__activity">🌱 Growing</div><Bar label="Growth" value={st.growth * 100} color="#5cb85c" /></div>;
    return <div className="live"><div className="live__activity">Fully grown · spreads seeds, faster near water</div></div>;
  }
  if (burnsOut(item)) {
    return <div className="live"><div className="live__activity">Burning — will run out of fuel</div><Bar label="🪵 Fuel" value={((st.fuel ?? fuelFor(item)) / fuelFor(item)) * 100} color="#ff8a3d" /></div>;
  }
  if (item.worldType === "vehicle" && !item.traits.includes("flying")) {
    const driver = st.riderItemId ? discoveries[st.riderItemId]?.name : undefined;
    return <div className="live"><div className="live__activity">{driver ? `🚦 Driven by a ${driver}` : "🅿️ Parked — needs a driver nearby"}</div></div>;
  }
  if (item.worldType === "building" && st.charred) {
    return <div className="live"><div className="live__activity">🔨 Burnt — people nearby will rebuild it</div><Bar label="Rebuilt" value={((st.regrow ?? 0) / (300 * 0.7)) * 100} color="#c8a46a" /></div>;
  }
  if (item.traits.includes("shelter") && (st.occupants ?? 0) > 0) {
    return <div className="live"><div className="live__activity">🏠 {st.occupants} inside</div></div>;
  }
  return null;
}
