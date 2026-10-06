import type { ItemDef } from "../types";
import { sanitizeItem } from "../sanitize";
import { itemId } from "../recipeKey";

// Built-in item catalog used by the offline fallback engine.
// Format: Name | emoji | worldType | size | category | color | traits | description
const RAW = `
Earth|🌍|terrain|medium|element|#8b6b4a||Solid ground beneath everything.
Water|💧|water|medium|element|#3f8fd8|wet|Clear, flowing liquid.
Fire|🔥|fire|small|element|#ff7a1a|hot,light|Hot, bright, hungry flames.
Air|💨|weather|small|element|#dbe8f5|flying|An invisible, restless breeze.
Mud|🟤|terrain|small|material|#6e4b2e|wet|Squishy wet earth.
Steam|♨️|particle|small|material|#e6edf3|hot,flying,wet|Hot water vapor.
Lava|🌋|fire|medium|element|#ff4b1f|hot,light,heavy|Molten rock, glowing red.
Cloud|☁️|weather|medium|weather|#f2f6fb|flying|A soft drifting puff of vapor.
Dust|🌫️|particle|small|material|#c9b79a|flying|Tiny dry particles in the air.
Energy|⚡|abstract|small|concept|#ffe14d|electric,light,flying|Raw power, crackling.
Lake|🏞️|water|large|place|#3a86c8|wet|A calm body of fresh water.
Volcano|🌋|terrain|huge|place|#5a3a2c|hot,heavy|A mountain with a fiery heart.
Wind|🌬️|weather|small|weather|#e3eef8|flying|Moving air you can feel.
Pressure|🗜️|abstract|small|concept|#8a8fa8||A great squeezing force.
Stone|🪨|terrain|small|material|#8f8a85|heavy|A hard, heavy rock.
Rain|🌧️|weather|medium|weather|#9fb4c8|wet,flying|Drops falling from the sky.
Sea|🌊|water|huge|place|#2f74c0|wet|Endless salty water.
Ocean|🌊|water|huge|place|#245fa8|wet|The vast deep blue.
Plant|🌱|plant|small|nature|#5cb85c|flammable,edible,living|A small green growing thing.
Seed|🌰|plant|tiny|nature|#a0743c|seed|A tiny promise of a plant.
Sand|🏖️|terrain|small|material|#e8d29a||Countless tiny grains.
Glass|🔲|object|small|material|#bfe3ee||Clear, hard and fragile.
Brick|🧱|object|small|material|#b5523b|heavy|A baked block of clay.
Clay|🏺|terrain|small|material|#c47a4f|wet|Soft earth you can shape.
Wall|🧱|building|small|structure|#b06045|heavy|A sturdy wall of bricks.
House|🏠|building|medium|structure|#e3a46b|shelter,heavy,flammable|A cozy home.
Village|🏘️|building|large|place|#d79a62|shelter,heavy|A few houses together.
City|🏙️|building|huge|place|#7a8ba6|shelter,heavy,light|A glittering sprawl of towers.
Skyscraper|🏢|building|large|structure|#6f87a8|shelter,heavy,light|A tower scraping the clouds.
Castle|🏰|building|large|structure|#a7a39a|shelter,heavy|A fortress of stone.
Tree|🌳|tree|medium|nature|#3f9a4a|flammable|A tall woody plant.
Forest|🌲|tree|large|place|#2f7a3c|flammable|Many trees growing together.
Pine|🌲|tree|medium|nature|#2e6f45|flammable|An evergreen with needles.
Wood|🪵|object|small|material|#9b6a3c|flammable|Chopped lumber.
Ash|🩶|particle|small|material|#8c8c8c||What is left after fire.
Smoke|💨|particle|small|material|#7d7d86|flying|Grey, drifting, smelly.
Charcoal|⚫|object|tiny|material|#2d2a28|flammable|Blackened wood, still useful.
Life|🧬|abstract|small|concept|#7fdc8a|living|The spark that animates things.
Human|🧍|human|small|people|#4f7bd9|living|A curious two-legged builder.
Family|👪|human|small|people|#e07a5f|living|People who belong together.
Farmer|🧑‍🌾|human|small|people|#7a9a3c|living|Grows food from the land.
Wizard|🧙|human|small|magic|#6a4fc4|living|A wise wielder of magic.
Knight|🛡️|human|small|people|#9aa3ad|living|An armored hero.
King|🤴|human|small|people|#c9302c|living|Ruler of the realm.
Astronaut|🧑‍🚀|human|small|people|#e8eef5|living|An explorer of space.
Firefighter|🧑‍🚒|human|small|people|#d9452c|living,wet|Rushes in to put out fires.
Chef|🧑‍🍳|human|small|people|#f4f4f4|living|A master of food.
Robot|🤖|machine|small|tech|#9aa7b8|electric|A thinking machine.
Animal|🐾|animal|small|life|#b88a5a|living|A wild creature.
Dog|🐕|animal|small|life|#c08a4a|living|A loyal friend.
Cat|🐈|animal|small|life|#e6a04a|living,predator|Independent and fluffy.
Fish|🐟|animal|tiny|life|#4aa3d8|living,swimming,edible,aquatic|A slippery swimmer.
Bird|🐦|animal|tiny|life|#4a90d9|living,flying|A feathered flyer.
Chicken|🐔|animal|tiny|life|#f2f2f2|living,edible|Clucks and lays eggs.
Egg|🥚|food|tiny|food|#f6eedc|edible,seed|Something might hatch.
Cow|🐄|animal|medium|life|#f5f5f5|living|Gives milk, says moo.
Horse|🐎|animal|medium|life|#8b5a2b|living,rideable|Fast and strong.
Sheep|🐑|animal|small|life|#f2efe8|living|Fluffy and woolly.
Dragon|🐉|animal|large|magic|#3fae5a|living,flying,hot,predator|A winged fire-breathing legend.
Dinosaur|🦖|animal|large|life|#5f9a4a|living,heavy,predator|An ancient giant lizard.
Whale|🐋|animal|large|life|#4a7ab8|living,swimming,aquatic|The giant of the sea.
Shark|🦈|animal|medium|life|#7f97ad|living,swimming,aquatic,predator|Fins and teeth.
Butterfly|🦋|animal|tiny|life|#5ab0f0|living,flying|Delicate fluttering wings.
Bee|🐝|animal|tiny|life|#f2c12e|living,flying|Busy maker of honey.
Snake|🐍|animal|small|life|#6a9a3c|living,predator|Slithers silently.
Lizard|🦎|animal|tiny|life|#7ab648|living|A sun-loving reptile.
Turtle|🐢|animal|small|life|#5c8a4a|living,swimming|Slow and steady.
Frog|🐸|animal|tiny|life|#5cbf4a|living,swimming|Hops and croaks.
Penguin|🐧|animal|small|life|#2b2f3a|living,swimming,cold|A tuxedoed swimmer.
Unicorn|🦄|animal|medium|magic|#f2b8e6|living,rideable,light|A horse with a magic horn.
Phoenix|🐦‍🔥|animal|medium|magic|#ff6a1a|living,flying,hot,light|Reborn from its own ashes.
Monkey|🐒|animal|small|life|#a0703c|living|Playful and clever.
Bear|🐻|animal|medium|life|#7a4f2a|living,predator|Big, furry and strong.
Sun|☀️|celestial|large|space|#ffd34d|light,hot|The bright star of day.
Moon|🌙|celestial|medium|space|#e9e6d8|night,cold|The silver light of night.
Star|⭐|celestial|small|space|#fff2a8|light|A distant burning sun.
Night|🌃|abstract|small|concept|#2a3266|night,flying|The dark half of the day.
Day|🌤️|abstract|small|concept|#ffe08a|light,flying|Bright hours of sunlight.
Sky|🌌|celestial|large|space|#7ab8f0|flying|The great blue above.
Space|🌌|celestial|large|space|#1a1f3d|night|The dark between the stars.
Planet|🪐|celestial|large|space|#d9a35a||A world orbiting a star.
Mars|🔴|celestial|medium|space|#d0583a||The rusty red planet.
Galaxy|🌌|celestial|huge|space|#8a6ae0|light|Billions of stars swirling.
Black Hole|🕳️|celestial|large|space|#120f1f|night,heavy|Nothing escapes it.
Comet|☄️|celestial|small|space|#bfe4ff|light,flying|A snowball with a glowing tail.
Meteor|☄️|celestial|small|space|#ff8a3a|hot,light|A falling star.
Rainbow|🌈|weather|large|weather|#ff6ad5|light,flying|Colors arching across the sky.
Storm|⛈️|weather|large|weather|#5d6a7d|wet,electric,flying|Thunder, lightning and rain.
Lightning|🌩️|weather|medium|weather|#fff27a|electric,light,flying|A flash of raw electricity.
Snow|❄️|weather|medium|weather|#f5fbff|cold,flying|Soft frozen flakes.
Ice|🧊|object|small|material|#bfe8ff|cold|Frozen water, slippery.
Glacier|🏔️|terrain|huge|place|#cfeefd|cold,heavy|A slow river of ice.
Snowman|⛄|decoration|small|structure|#ffffff|cold|A frosty friend.
Fog|🌫️|weather|large|weather|#cfd6dd|wet,flying|A thick grey veil.
Tornado|🌪️|weather|large|weather|#8f98a3|flying|A furious spinning wind.
Sandstorm|🌪️|weather|large|weather|#d7b77a|flying|A desert gone airborne.
Mountain|⛰️|terrain|huge|place|#7d7568|heavy|A massive rocky peak.
Hill|🏞️|terrain|large|place|#6aa84f|heavy|A gentle rise of land.
Island|🏝️|terrain|large|place|#e3c27a|heavy|Land surrounded by water.
Desert|🏜️|terrain|huge|place|#e0b96a|hot|Endless dunes of sand.
Beach|🏖️|terrain|large|place|#efd9a0||Where sand meets the sea.
Swamp|🐊|water|large|place|#4f6b3a|wet|A murky, muddy wetland.
River|🏞️|water|large|place|#4a96d8|wet|Water on the move.
Pond|🪷|water|medium|place|#4f9fd0|wet|A small still water.
Puddle|💧|water|small|element|#6aa8d8|wet|A small splash of water.
Geyser|⛲|water|medium|place|#9fd3f0|hot,wet|Erupting hot water.
Metal|🔩|object|small|material|#a3acb8|heavy|Strong and shiny.
Iron|⛓️|object|small|material|#7f8794|heavy|A tough grey metal.
Gold|🪙|object|tiny|material|#ffcc33|light|Precious and gleaming.
Diamond|💎|object|tiny|material|#9fe8ff|light|The hardest gem.
Tool|🔨|object|small|tool|#9a7a5a||Something to build with.
Wheel|🛞|object|small|tool|#3a3a3a||Round and rolling.
Car|🚗|vehicle|medium|vehicle|#e0534a|rideable|Four wheels and a road trip.
Bicycle|🚲|vehicle|small|vehicle|#3fa0d8|rideable|Two wheels, pedal power.
Train|🚂|vehicle|large|vehicle|#c0392b|rideable,rails,heavy|Chugs along on rails.
Track|🛤️|decoration|large|structure|#6b5a4a|rail,heavy|Rails for trains to ride.
Boat|⛵|vehicle|medium|vehicle|#f2e6c8|rideable,swimming|Floats across water.
Ship|🚢|vehicle|large|vehicle|#d8dde3|rideable,swimming,heavy|A great vessel of the sea.
Airplane|✈️|vehicle|medium|vehicle|#e8eef5|rideable,flying|Wings of steel.
Rocket|🚀|vehicle|medium|vehicle|#e8e8e8|rideable,flying,hot|Blasts off to the stars.
Bus|🚌|vehicle|large|vehicle|#f2b42e|rideable|Room for everyone.
Tractor|🚜|vehicle|medium|vehicle|#d9452c|rideable|Plows the fields.
Engine|⚙️|machine|small|tech|#7d8796|hot|Turns fuel into motion.
Steam Engine|🚂|machine|medium|tech|#5a5f6a|hot,heavy|Puffing, powerful machine.
Electricity|⚡|abstract|small|tech|#ffe14d|electric,light,flying|Flowing electric power.
Computer|💻|machine|small|tech|#5f6f86|electric,light|Thinks in ones and zeros.
Internet|🌐|abstract|small|tech|#4fa3e0|electric,flying|Everything, connected.
Lamp|💡|decoration|small|tech|#ffe9a0|light,electric|A little light in the dark.
Lighthouse|🗼|building|large|structure|#f0f0f0|light,shelter,heavy|Guides ships home.
Windmill|🌬️|machine|large|structure|#e8dcc8|heavy|Turns wind into work.
Farm|🚜|building|large|place|#c98a4a|shelter,heavy|Fields, barns and crops.
Field|🌾|plant|medium|food|#d9b44a|flammable,edible|Rows of golden grain.
Wheat|🌾|plant|small|food|#e0bf5a|flammable,edible|Grain for bread.
Bread|🍞|food|tiny|food|#d9a25a|edible|Fresh from the oven.
Apple|🍎|food|tiny|food|#e0443c|edible|Crisp and red.
Banana|🍌|food|tiny|food|#f5d63a|edible|A curved yellow snack.
Cheese|🧀|food|tiny|food|#f5c842|edible|Aged milk, delicious.
Milk|🥛|food|tiny|food|#f7f7f2|edible,wet|Fresh and white.
Honey|🍯|food|tiny|food|#f2a71b|edible|Sweet gold from bees.
Pizza|🍕|food|small|food|#f2b44a|edible|A cheesy slice of joy.
Cake|🍰|food|small|food|#f5c6d6|edible|Sweet, layered celebration.
Soup|🍲|food|small|food|#d9763a|edible,hot|Warm comfort in a bowl.
Coffee|☕|food|tiny|food|#6f4a2e|edible,hot|Liquid morning.
Flower|🌸|plant|tiny|nature|#f28ab2|flammable,edible|A bloom of color.
Mushroom|🍄|plant|tiny|food|#d9443c|edible|A fungus with a cap.
Cactus|🌵|plant|small|nature|#4a9a4a||Prickly desert survivor.
Grass|🌿|plant|small|nature|#5cb85c|flammable,edible|Soft green ground cover.
Vine|🌿|plant|small|nature|#4a9a3c|flammable|A climbing plant.
Palm Tree|🌴|tree|medium|nature|#3fa05a|flammable|Swaying by the beach.
Apple Tree|🍎|tree|medium|food|#4a9a3c|flammable,edible|Fruit for the picking.
Tent|⛺|building|small|structure|#e07a3a|shelter,flammable|A portable home.
Campfire|🔥|fire|small|structure|#ff8a2a|hot,light|Warmth under the stars.
Bonfire|🔥|fire|medium|structure|#ff6a1a|hot,light|A roaring big fire.
Explosion|💥|particle|medium|element|#ff9a2a|hot,light|A sudden, violent burst.
Bomb|💣|object|small|tool|#2d2d34||Handle with care.
Fireworks|🎆|particle|medium|element|#ff6ad5|light,flying,hot|Sparkles bursting in the sky.
Magic|✨|abstract|small|magic|#c58af2|light,flying|Wonder you cannot explain.
Time|⏳|abstract|small|concept|#c9a86a|flying|It keeps on ticking.
Love|❤️|abstract|small|concept|#f2557a|flying|The warmest feeling.
Music|🎵|abstract|small|concept|#7a8af2|flying|Sound arranged into joy.
Ghost|👻|human|small|magic|#f2f2ff|flying,night|A spooky floating spirit.
Zombie|🧟|human|small|magic|#7a9a6a|living,predator|Shambling and hungry.
Vampire|🧛|human|small|magic|#5a1a2a|living,night|Avoids the sun.
Statue|🗿|decoration|medium|structure|#9a978f|heavy|A figure carved in stone.
Fountain|⛲|decoration|medium|structure|#a8c8e0|wet,heavy|Water dancing in a basin.
Bridge|🌉|building|large|structure|#9a7a5a|heavy|Spans across water.
Road|🛣️|decoration|large|structure|#55585e|heavy|A way for cars to go.
Fence|🚧|decoration|small|structure|#c49a6a||Keeps things in or out.
Flag|🚩|decoration|small|object|#e04a3a||Waves in the wind.
Book|📖|object|tiny|object|#8a5a3a|flammable|Full of stories.
Paper|📄|object|tiny|material|#f5f2ea|flammable|Thin and blank.
Pyramid|🔺|building|huge|structure|#e0c27a|heavy|A wonder of the ancient world.
Tower|🗼|building|large|structure|#a8a3b5|shelter,heavy|Tall and proud.
Factory|🏭|building|large|structure|#8a8f98|shelter,heavy,hot|Machines making machines.
UFO|🛸|vehicle|medium|space|#9ad8a0|flying,light,rideable|A visitor from beyond.
Alien|👽|human|small|space|#8ae07a|living|Not from around here.
Banana King|🍌|human|small|people|#f5d63a|living|Long may he peel.
Cheese Moon|🧀|celestial|medium|space|#f5c842|night,edible|Made of cheese after all.
Technomancer|🧙|human|small|magic|#4fd0e0|living,electric|Casts spells in code.
Mermaid|🧜|human|small|magic|#3fbfb0|living,swimming|Half human, half fish.
Werewolf|🐺|animal|medium|magic|#5a5560|living,night,predator|Beware the full moon.
Snowstorm|🌨️|weather|large|weather|#e6eef7|cold,wet,flying|A whirl of snow and wind.
Hurricane|🌀|weather|huge|weather|#7a8ea8|wet,flying|A giant spinning storm.
Oasis|🏝️|water|medium|place|#3fb0a8|wet|Water in the desert.
Coral|🪸|plant|small|nature|#f2726a|swimming|Living reef of the sea.
Pearl|🦪|object|tiny|material|#f2ecf2|light|A gem from an oyster.
Salt|🧂|food|tiny|food|#f5f5f5|edible|Makes everything tastier.
Hot Dog|🌭|food|tiny|food|#d9763a|edible,hot|Not actually a dog.
Sushi|🍣|food|tiny|food|#f28a6a|edible|Fish on rice, rolled with care.
Sandwich|🥪|food|tiny|food|#e0bf6a|edible|Stuff between bread.
Nest|🪺|decoration|tiny|nature|#a07a4a|flammable|A cozy home for eggs.
Sprout|🌱|plant|tiny|nature|#7ad06a|living,flammable|A plant just getting started.
Hay|🌾|object|small|material|#e6c86a|flammable,edible|Dried grass for animals.
Blizzard|🌨️|weather|huge|weather|#eaf2fb|cold,wet,flying|A blinding snowstorm.
Thunder|🔊|abstract|small|weather|#6a7a9a|electric,flying|The rumble after lightning.
Electric Eel|🐍|animal|small|life|#4ab0d0|living,swimming,electric,aquatic|Shocking swimmer.
Cyborg|🦾|human|small|tech|#7a8fa8|living,electric|Part human, part machine.
Rail Car|🚃|vehicle|medium|vehicle|#3a7ac0|rideable,rails|A carriage on rails.
Harbor|⚓|building|large|place|#6a8aa8|shelter,heavy|Where ships rest.
Garden|🌷|plant|medium|nature|#f28ab2|flammable,edible|Flowers in neat rows.
Jungle|🌴|tree|large|place|#2f8a3c|flammable,wet|Dense, wild and green.
Spider|🕷️|animal|tiny|life|#3a3a3a|living,predator|Spins silky webs.
Web|🕸️|decoration|small|object|#e8e8e8||Sticky silk trap.
Owl|🦉|animal|small|life|#9a7a5a|living,flying,night|Wise watcher of the night.
Bat|🦇|animal|tiny|life|#4a3a5a|living,flying,night|Flies by echo.
Camel|🐫|animal|medium|life|#d4a15a|living,rideable|Ship of the desert.
Elephant|🐘|animal|large|life|#9aa0a8|living,heavy,rideable|Never forgets.
Lion|🦁|animal|medium|life|#e0a03a|living,predator|King of the savanna.
Ant|🐜|animal|tiny|life|#4a2a1a|living|Tiny and tireless.
Crab|🦀|animal|tiny|life|#e0503a|living,swimming,edible|Walks sideways.
Octopus|🐙|animal|small|life|#e06a8a|living,swimming,aquatic|Eight clever arms.
Robot Dog|🐕‍🦺|machine|small|tech|#9aa7b8|electric|Good boy, batteries included.
Spaceship|🚀|vehicle|large|space|#dfe6ee|rideable,flying|Built for the stars.
Satellite|🛰️|celestial|small|space|#c0c8d4|electric|Orbits and listens.
Lantern|🏮|decoration|small|object|#e0443c|light|A warm hanging glow.
Torch|🔦|object|tiny|tool|#f2c84a|light|Light you can carry.
Candle|🕯️|decoration|tiny|object|#f5ecd6|light,hot|A small steady flame.
Rock|🪨|terrain|small|material|#8a8580|heavy|A plain old rock.
Boulder|🪨|terrain|medium|material|#7a756f|heavy|A rock too big to lift.
Crystal|🔮|decoration|small|magic|#b48cf2|light|A glowing magic crystal.
Potion|🧪|object|tiny|magic|#8af27a|light|Bubbling and suspicious.
Treasure|💰|object|small|object|#ffcc33|light|Riches beyond measure.
Pirate|🏴‍☠️|human|small|people|#3a3a3a|living|Arr, treasure ahoy.
Ninja|🥷|human|small|people|#2a2a33|living,night|Silent and swift.
Scientist|🧑‍🔬|human|small|people|#f2f2f2|living|Asks how everything works.
Doctor|🧑‍⚕️|human|small|people|#6ac0e0|living|Heals the sick.
Baby|👶|human|tiny|people|#f2c2a2|living|Small, new, and loud.
Peanut Butter|🥜|food|tiny|food|#c98a4a|edible|Sticky nut paste.
Swamp Monster|🐊|animal|large|magic|#4a6a3a|living,swimming,predator|Lurks beneath the bog.
`;

export const CATALOG: Map<string, ItemDef> = new Map();

for (const line of RAW.split("\n")) {
  const t = line.trim();
  if (!t) continue;
  const [name, emoji, worldType, size, category, color, traits, description] = t.split("|");
  const item = sanitizeItem({
    name,
    emoji,
    worldType,
    size,
    category,
    color,
    traits: traits ? traits.split(",") : [],
    description,
  });
  if (item) CATALOG.set(item.id, item);
}

export function catalogItem(name: string): ItemDef | undefined {
  return CATALOG.get(itemId(name));
}

export const STARTER_NAMES = ["Earth", "Water", "Fire", "Air"] as const;
