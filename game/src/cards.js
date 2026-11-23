// The catalogue of Three Winds: every card the game can deal, and the deck
// both players draw from. Three winds chase each other in a circle:
//   GALE scatters BLOOM, BLOOM drinks TIDE, TIDE grounds GALE.
// A warden fighting a warden of the wind it beats strikes with +2 power.
// Playing two cards of one wind in a single turn calls a Surge: every
// friendly warden of that wind gains +1 power until the turn ends.
export const WIND_GALE = 'gale';
export const WIND_BLOOM = 'bloom';
export const WIND_TIDE = 'tide';
export const WINDS = [WIND_GALE, WIND_BLOOM, WIND_TIDE];

// wind -> the wind it beats
export const BEATS = {
  [WIND_GALE]: WIND_BLOOM,
  [WIND_BLOOM]: WIND_TIDE,
  [WIND_TIDE]: WIND_GALE,
};

export const WIND_NAMES = {
  [WIND_GALE]: 'Gale',
  [WIND_BLOOM]: 'Bloom',
  [WIND_TIDE]: 'Tide',
};

// Wardens stand in a lane and clash. Spells resolve at once and leave.
export const KIND_WARDEN = 'warden';
export const KIND_SPELL = 'spell';

// Each row: id, wind, cost, power, health (wardens) or effect (spells).
const WARDENS = [
  { id: 'zephyr-pup', name: 'Zephyr Pup', wind: WIND_GALE, cost: 1, power: 1, health: 2 },
  { id: 'sky-dancer', name: 'Sky Dancer', wind: WIND_GALE, cost: 2, power: 2, health: 3 },
  { id: 'storm-herald', name: 'Storm Herald', wind: WIND_GALE, cost: 4, power: 4, health: 5 },
  { id: 'tempest-roc', name: 'Tempest Roc', wind: WIND_GALE, cost: 5, power: 5, health: 6 },
  { id: 'seedling', name: 'Seedling', wind: WIND_BLOOM, cost: 1, power: 1, health: 3 },
  { id: 'thornvine', name: 'Thornvine', wind: WIND_BLOOM, cost: 2, power: 2, health: 2 },
  { id: 'grove-guardian', name: 'Grove Guardian', wind: WIND_BLOOM, cost: 3, power: 3, health: 5 },
  { id: 'ancient-oak', name: 'Ancient Oak', wind: WIND_BLOOM, cost: 5, power: 4, health: 8 },
  { id: 'droplet', name: 'Droplet', wind: WIND_TIDE, cost: 1, power: 2, health: 1 },
  { id: 'current-rider', name: 'Current Rider', wind: WIND_TIDE, cost: 2, power: 3, health: 2 },
  { id: 'wave-serpent', name: 'Wave Serpent', wind: WIND_TIDE, cost: 3, power: 3, health: 4 },
  { id: 'leviathan', name: 'Leviathan', wind: WIND_TIDE, cost: 5, power: 6, health: 5 },
];

const SPELLS = [
  { id: 'gust', name: 'Gust', wind: WIND_GALE, cost: 2, text: 'Deal 3 damage to any warden.' },
  { id: 'rainfall', name: 'Rainfall', wind: WIND_TIDE, cost: 2, text: 'Restore 4 health to a friendly warden, or gain 3 life.' },
  { id: 'deep-draw', name: 'Deep Draw', wind: WIND_BLOOM, cost: 2, text: 'Draw 2 cards.' },
  { id: 'windfall', name: 'Windfall', wind: WIND_GALE, cost: 3, text: 'Gain 2 mana this turn.' },
  { id: 'cyclone', name: 'Cyclone', wind: WIND_TIDE, cost: 4, text: 'Deal 2 damage to all enemy wardens.' },
  // Tailwind is never drawn from the deck: the player who moves second
  // opens with it, one free gust of mana to balance the first move.
  { id: 'tailwind', name: 'Tailwind', wind: WIND_GALE, cost: 0, text: 'Gain 1 mana this turn.' },
];

export const CATALOGUE = {};
for (const row of WARDENS) CATALOGUE[row.id] = { ...row, kind: KIND_WARDEN };
for (const row of SPELLS) CATALOGUE[row.id] = { ...row, kind: KIND_SPELL };

// The deck: 15 wardens and 9 spells, 24 cards in all.
const DECK_LIST = [
  'zephyr-pup', 'zephyr-pup', 'sky-dancer', 'storm-herald', 'tempest-roc',
  'seedling', 'seedling', 'thornvine', 'grove-guardian', 'ancient-oak',
  'droplet', 'droplet', 'current-rider', 'wave-serpent', 'leviathan',
  'gust', 'gust', 'rainfall', 'rainfall', 'deep-draw', 'deep-draw',
  'windfall', 'cyclone', 'cyclone',
];

let serial = 0;

export function makeCard(id) {
  const base = CATALOGUE[id];
  serial += 1;
  return {
    uid: `c${serial}`,
    id: base.id,
    name: base.name,
    wind: base.wind,
    kind: base.kind,
    cost: base.cost,
    power: base.power ?? 0,
    health: base.health ?? 0,
    maxHealth: base.health ?? 0,
    text: base.text ?? '',
  };
}

export function buildDeck(random) {
  return random.shuffle(DECK_LIST.map((id) => makeCard(id)));
}

export function windBeats(attackerWind, defenderWind) {
  return BEATS[attackerWind] === defenderWind;
}
