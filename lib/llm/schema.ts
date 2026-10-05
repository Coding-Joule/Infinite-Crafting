import { z } from "zod";
import { CATEGORIES, SIZES, TRAITS, WORLD_TYPES } from "../types";

/** The structured result the model must return for a combination. */
export const CombinationSchema = z.object({
  name: z.string(),
  emoji: z.string(),
  category: z.enum(CATEGORIES),
  description: z.string(),
  worldType: z.enum(WORLD_TYPES),
  size: z.enum(SIZES),
  color: z.string(),
  traits: z.array(z.enum(TRAITS)),
});

export type CombinationOutput = z.infer<typeof CombinationSchema>;
