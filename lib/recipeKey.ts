/** Normalize an item name into its stable id. */
export function itemId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Commutative recipe key: Fire + Water and Water + Fire map to the same key.
 */
export function recipeKey(a: string, b: string): string {
  return [itemId(a), itemId(b)].sort().join("::");
}
