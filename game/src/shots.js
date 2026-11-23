// The screenshot scenes behind ?shot=title|table|win|loss. The table scene
// stages a mid-game board through the game's own play functions: named
// cards are pulled from the decks and played for real, mana and life are
// set to mid-duel values, and the frame the browser paints is the real
// table. The win and loss scenes play full duels forward and search a few
// seeds for a hard-fought ending. The same seed always gives the same
// frame.
import { createRandom } from './random.js';
import { SIDE_FOE, SIDE_YOU, beginTurn, clash, createMatch, playSpell, playWarden, sideOf } from './state.js';
import { takeAutoTurn } from './ai.js';

function playHalfTurn(match, side, skill) {
  takeAutoTurn(match, side, playWarden, playSpell, skill);
  clash(match);
  if (!match.over) beginTurn(match, side === SIDE_YOU ? SIDE_FOE : SIDE_YOU);
}

// Find a named card in a side's hand, or move it there from its deck.
function pullFromDeck(match, side, id) {
  const holder = sideOf(match, side);
  const inHand = holder.hand.find((card) => card.id === id);
  if (inHand) return inHand;
  const at = holder.deck.findIndex((card) => card.id === id);
  if (at < 0) return null;
  const [card] = holder.deck.splice(at, 1);
  holder.hand.push(card);
  return card;
}

// A busy mid-game, staged through real plays: three of your wardens
// against two of Mistral's, life already traded, five mana in hand.
function stageTable(seed) {
  const match = createMatch(createRandom(seed), seed);
  match.turn = 9;
  const you = match.you;
  const foe = match.foe;
  you.manaMax = 6;
  you.mana = 6;
  match.active = SIDE_YOU;
  const yourPlays = [
    ['grove-guardian', 0],
    ['thornvine', 1],
    ['droplet', 2],
  ];
  for (const [id, lane] of yourPlays) {
    const card = pullFromDeck(match, SIDE_YOU, id);
    if (card) playWarden(match, SIDE_YOU, card.uid, lane);
  }
  foe.manaMax = 6;
  foe.mana = 6;
  match.active = SIDE_FOE;
  const foePlays = [
    ['storm-herald', 0],
    ['current-rider', 1],
  ];
  for (const [id, lane] of foePlays) {
    const card = pullFromDeck(match, SIDE_FOE, id);
    if (card) playWarden(match, SIDE_FOE, card.uid, lane);
  }
  match.active = SIDE_YOU;
  you.manaMax = 5;
  you.mana = 5;
  you.life = 24;
  foe.life = 19;
  while (you.hand.length < 5) {
    const drawn = you.deck.pop();
    if (!drawn) break;
    you.hand.push(drawn);
  }
  pullFromDeck(match, SIDE_YOU, 'gust');
  return { match, screen: 'play' };
}

// A full duel where one side plays at full strength and the other holds
// back, until the strong side wins — preferably a close one.
function stageDuel(seed, strongSide) {
  const weakSide = strongSide === SIDE_YOU ? SIDE_FOE : SIDE_YOU;
  let fallback = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const match = createMatch(createRandom(seed + attempt * 101), seed + attempt * 101);
    for (let turn = 0; turn < 120 && !match.over; turn += 1) {
      playHalfTurn(match, match.active, match.active === strongSide ? 1 : 0.75);
    }
    if (match.over && match.winner === strongSide) {
      if (!fallback) fallback = match;
      const winnerLife = strongSide === SIDE_YOU ? match.you.life : match.foe.life;
      if (winnerLife >= 1 && winnerLife <= 18) return { match, screen: 'over' };
    }
  }
  if (fallback) return { match: fallback, screen: 'over' };
  const match = createMatch(createRandom(seed), seed);
  while (!match.over) {
    const side = match.active;
    if (side === strongSide) playHalfTurn(match, side, 1);
    else { clash(match); if (!match.over) beginTurn(match, strongSide); }
  }
  return { match, screen: 'over' };
}

/**
 * Stage the named scene from `seed` and return the match to draw and the
 * screen over it. Unknown names stage the title.
 */
export function stageShot(name, seed) {
  if (name === 'table') return stageTable(seed);
  if (name === 'win') return stageDuel(seed, SIDE_YOU);
  if (name === 'loss') return stageDuel(seed, SIDE_FOE);
  return { match: createMatch(createRandom(seed), seed), screen: 'title' };
}
