"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import { useUI } from "@/lib/game/ui";
import { beginChipDrag } from "@/lib/game/drag";
import { sfx } from "@/lib/game/sound";
import { CATEGORIES, type Category, type Discovery } from "@/lib/types";
import { ItemChip } from "./ItemChip";

type Tab = "all" | "recent" | "favorites";
type Sort = "oldest" | "newest" | "az";

const CATEGORY_LABEL: Record<Category, string> = {
  element: "🜁 Elements",
  material: "🧱 Materials",
  nature: "🌿 Nature",
  life: "🐾 Life",
  people: "🧑 People",
  place: "🗺️ Places",
  structure: "🏛️ Structures",
  vehicle: "🚗 Vehicles",
  weather: "⛅ Weather",
  space: "🪐 Space",
  food: "🍎 Food",
  tool: "🔨 Tools",
  tech: "💡 Tech",
  magic: "✨ Magic",
  concept: "💭 Ideas",
};

export function Inventory() {
  const discoveries = useGame((s) => s.discoveries);
  const favorites = useGame((s) => s.favorites);
  const toggleFavorite = useGame((s) => s.toggleFavorite);
  const addBenchChip = useGame((s) => s.addBenchChip);
  const drawerOpen = useUI((s) => s.drawerOpen);
  const setUI = useUI((s) => s.set);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("oldest");
  const [category, setCategory] = useState<Category | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());

  const all = useMemo(() => Object.values(discoveries), [discoveries]);
  const total = all.length;

  const presentCategories = useMemo(() => {
    const set = new Set(all.map((d) => d.category));
    return CATEGORIES.filter((c) => set.has(c));
  }, [all]);

  const list = useMemo(() => {
    let items: Discovery[] = all;
    if (tab === "favorites") items = items.filter((d) => favorites[d.id]);
    if (category) items = items.filter((d) => d.category === category);
    if (q) items = items.filter((d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
    if (tab === "recent") {
      return [...items].filter((d) => !d.starter).sort((a, b) => b.discoveredAt - a.discoveredAt).slice(0, 40);
    }
    const sorted = [...items];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "newest") sorted.sort((a, b) => b.discoveredAt - a.discoveredAt);
    else sorted.sort((a, b) => a.discoveredAt - b.discoveredAt);
    return sorted;
  }, [all, tab, category, q, sort, favorites]);

  const newest = useMemo(() => {
    let best: Discovery | null = null;
    for (const d of all) if (!d.starter && (!best || d.discoveredAt > best.discoveredAt)) best = d;
    return best && Date.now() - best.discoveredAt < 8000 ? best.id : null;
  }, [all]);

  const closeDrawerIfNarrow = () => {
    if (window.matchMedia("(max-width: 820px)").matches) setUI({ drawerOpen: false });
  };

  return (
    <aside className={"inventory" + (drawerOpen ? " is-open" : "")} data-drop-block>
      <div className="inventory__head">
        <div className="inventory__title">
          <span>Discoveries</span>
          <span className="pill">{total}</span>
        </div>
        <label className="search">
          <span aria-hidden>🔍</span>
          <input
            type="search"
            placeholder={`Search ${total} things…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="tabs" role="tablist">
          {(["all", "recent", "favorites"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t === "all" ? "All" : t === "recent" ? "Recent" : "★ Favs"}
            </button>
          ))}
          {tab !== "recent" && (
            <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="oldest">First found</option>
              <option value="newest">Newest</option>
              <option value="az">A–Z</option>
            </select>
          )}
        </div>
        {presentCategories.length > 1 && (
          <div className="cats">
            <button className={!category ? "is-active" : ""} onClick={() => setCategory(null)}>
              Everything
            </button>
            {presentCategories.map((c) => (
              <button key={c} className={category === c ? "is-active" : ""} onClick={() => setCategory(category === c ? null : c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="inventory__list">
        {list.map((item) => (
          <div
            key={item.id}
            className="inventory__item"
            onPointerDown={(e) =>
              beginChipDrag(
                e,
                { itemId: item.id, source: "inventory" },
                () => {
                  addBenchChip(item.id);
                  sfx("drop");
                },
                closeDrawerIfNarrow,
              )
            }
          >
            <ItemChip
              item={item}
              favorite={!!favorites[item.id]}
              isNew={item.id === newest}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          </div>
        ))}
        {list.length === 0 && (
          <p className="empty">
            {tab === "favorites" ? "Star things you love to keep them here." : q ? "Nothing matches yet — keep crafting!" : "Nothing here yet."}
          </p>
        )}
      </div>
      <p className="inventory__tip">Drag onto the table to craft · drag into the world to place · tap to add to the table</p>
    </aside>
  );
}
