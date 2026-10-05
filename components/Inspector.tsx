"use client";

import { useGame } from "@/lib/game/store";
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
