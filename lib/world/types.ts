export const WORLD = {
  W: 6000,
  H: 1700,
  /** y of the horizon line; ground goes from HORIZON to H */
  HORIZON: 1000,
} as const;

export type Layer = "sky" | "weather" | "background" | "flat" | "ground" | "air";

/** Per-instance simulation state. Everything optional so saves stay small. */
export interface ObjState {
  burning?: number; // seconds of fire left
  charred?: boolean;
  raining?: number; // seconds of rain left (clouds)
  frozen?: number; // seconds frozen (water)
  growth?: number; // 0..1 for seeds
  hidden?: boolean; // inside a building / vehicle
  insideId?: string; // building or vehicle the creature is in
  exitAt?: number; // world time to come out
  riderItemId?: string; // vehicle: who is driving
  riderId?: string;
  doused?: number; // fire being put out
  pending?: boolean; // waiting for a combination result
  boltAt?: number; // next lightning strike (storms)
  heart?: number; // just ate something
  fleeing?: number;
  goalX?: number;
  goalY?: number;
  pause?: number;
  occupants?: number; // building: creatures inside
  intent?: "enter" | "ride" | "eat";
  targetId?: string;
}

export interface WorldObject {
  id: string;
  itemId: string;
  x: number; // anchor x (center)
  y: number; // anchor y (foot for ground layers, center for sky/weather/air)
  dir: 1 | -1;
  seed: number;
  born: number; // world time when placed (spawn animation)
  state: ObjState;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "puff" | "spark" | "ember" | "drop" | "heart" | "star" | "ring";
  gravity?: number;
}

export interface SavedWorld {
  v: 1;
  objects: Array<Pick<WorldObject, "id" | "itemId" | "x" | "y" | "dir" | "seed"> & { state?: ObjState }>;
  camera: { x: number; y: number; zoom: number };
  time: number;
  dayClock: number;
}
