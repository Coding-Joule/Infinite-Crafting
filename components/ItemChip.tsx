"use client";

import { memo } from "react";
import type { Discovery } from "@/lib/types";

interface Props {
  item: Discovery;
  pending?: boolean;
  highlight?: boolean;
  favorite?: boolean;
  isNew?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
}

/** The emoji + name pill used everywhere an item is shown. */
export const ItemChip = memo(function ItemChip({ item, pending, highlight, favorite, isNew, onToggleFavorite, className }: Props) {
  return (
    <span
      className={[
        "chip",
        pending ? "chip--pending" : "",
        highlight ? "chip--target" : "",
        isNew ? "chip--new" : "",
        className ?? "",
      ].join(" ")}
      style={{ ["--chip-accent" as string]: item.color }}
      title={item.description}
    >
      <span className="chip__emoji" aria-hidden>
        {item.emoji}
      </span>
      <span className="chip__name">{item.name}</span>
      {onToggleFavorite && (
        <button
          type="button"
          className={"chip__star" + (favorite ? " is-on" : "")}
          aria-label={favorite ? "Unfavorite" : "Favorite"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorite ? "★" : "☆"}
        </button>
      )}
    </span>
  );
});
