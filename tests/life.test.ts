import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../lib/fallback/catalog";
import {
  burnsOut,
  canEat,
  canHunt,
  canSwim,
  dietOf,
  isAquatic,
  isLiving,
  isPlantLife,
  isThreat,
  lifeStage,
  lifespanDays,
  ageScale,
} from "../lib/world/life";

const I = (id: string) => {
  const it = CATALOG.get(id);
  assert.ok(it, id);
  return it;
};

test("who is alive", () => {
  assert.ok(isLiving(I("human")));
  assert.ok(isLiving(I("dog")));
  assert.ok(!isLiving(I("robot")));
  assert.ok(!isLiving(I("tree")));
  assert.ok(isPlantLife(I("tree")) && isPlantLife(I("grass")) && !isPlantLife(I("seed")));
});

test("diets follow the food chain", () => {
  assert.equal(dietOf(I("lion")), "carnivore");
  assert.equal(dietOf(I("cow")), "herbivore");
  assert.equal(dietOf(I("human")), "omnivore");
  // herbivores graze, carnivores don't
  assert.ok(canEat(I("cow"), I("grass")));
  assert.ok(!canEat(I("lion"), I("grass")));
  // people eat prepared food and harvest crops
  assert.ok(canEat(I("human"), I("bread")));
  assert.ok(canEat(I("human"), I("wheat")));
  assert.ok(canEat(I("human"), I("apple tree")));
  assert.ok(!canEat(I("human"), I("grass")), "people don't graze");
  assert.ok(!canEat(I("lion"), I("bread")));
  // predators hunt smaller animals, not their equals
  assert.ok(canHunt(I("lion"), I("sheep")));
  assert.ok(canHunt(I("lion"), I("human")));
  assert.ok(!canHunt(I("cat"), I("human")));
  assert.ok(canHunt(I("cat"), I("chicken")));
  assert.ok(!canHunt(I("cat"), I("dog")), "small hunters only take smaller prey");
  assert.ok(!canHunt(I("cat"), I("cow")));
  assert.ok(canHunt(I("lion"), I("cow")), "big hunters take prey their own size");
  assert.ok(!canHunt(I("lion"), I("bear")));
  // land predators can't catch birds in the air or fish in the sea
  assert.ok(!canHunt(I("lion"), I("bird")));
  assert.ok(!canHunt(I("lion"), I("fish")));
  assert.ok(canHunt(I("shark"), I("fish")));
  // people catch chickens, not lions
  assert.ok(canHunt(I("human"), I("chicken")));
  assert.ok(!canHunt(I("human"), I("lion")));
  assert.ok(isThreat(I("human"), I("lion")));
  assert.ok(!isThreat(I("lion"), I("human")));
});

test("water rules", () => {
  assert.ok(isAquatic(I("fish")) && !isAquatic(I("frog")));
  assert.ok(canSwim(I("frog")) && canSwim(I("bird")) && !canSwim(I("human")));
});

test("aging", () => {
  const dog = I("dog");
  assert.equal(lifeStage(dog, 0.2, 1), "baby");
  assert.equal(lifeStage(dog, 3, 1), "adult");
  assert.equal(lifeStage(dog, lifespanDays(dog, 1) * 0.9, 1), "elder");
  assert.ok(lifespanDays(I("human"), 5) > lifespanDays(I("chicken"), 5));
  assert.equal(lifespanDays(I("dragon"), 5), Infinity);
  assert.ok(ageScale(0) < ageScale(0.5) && ageScale(2) === 1);
});

test("fires burn out, lava doesn't", () => {
  assert.ok(burnsOut(I("campfire")) && burnsOut(I("fire")));
  assert.ok(!burnsOut(I("lava")));
});
