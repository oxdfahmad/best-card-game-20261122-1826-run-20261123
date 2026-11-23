// Mistral, the rival caller — and the same brain drives either side when the
// game stages its screenshots. A greedy brain: every playable card is scored
// by what it does to the board right now, the best play is taken, and the
// brain keeps going while mana remains. The telegraph is the brain's own
// plan read off the board at the start of your turn: which lane it eyes,
// or whether it is saving mana for a bigger card.
import { KIND_SPELL, KIND_WARDEN } from './cards.js';
import { LANES, SIDE_FOE, laneHasRoom, otherSide, sideOf } from './state.js';

function laneTotal(match, side, lane) {
  let total = 0;
  for (const warden of sideOf(match, side).lanes[lane]) total += warden.power + warden.health;
  return total;
}

function scoreWardenPlay(match, side, card, lane) {
  const them = otherSide(side);
  let score = card.power + card.health * 0.6 - card.cost * 0.4;
  const enemy = sideOf(match, them).lanes[lane][0];
  if (enemy) {
    // Answering a threat is worth more than an empty lane.
    score += Math.min(3, laneTotal(match, them, lane) * 0.5);
    // A warden that survives the trade is worth more than one that dies.
    if (card.health > enemy.power) score += 1.5;
    if (card.power >= enemy.health) score += 1;
  } else {
    // An open lane means damage to life at the next clash.
    score += card.power * 0.8;
  }
  // Lanes where this side is already strong are less urgent.
  score -= laneTotal(match, side, lane) * 0.2;
  return score;
}

function scoreSpellPlay(match, side, card) {
  const me = sideOf(match, side);
  const them = sideOf(match, otherSide(side));
  if (card.id === 'gust') {
    let best = null;
    let bestValue = 0;
    for (let lane = 0; lane < LANES; lane += 1) {
      for (const warden of them.lanes[lane]) {
        const value = warden.power + warden.health * 0.5 + (warden.health <= 3 ? 2 : 0);
        if (value > bestValue) { bestValue = value; best = { uid: warden.uid }; }
      }
    }
    return best ? { score: 2 + bestValue * 0.5, target: best } : { score: -1 };
  }
  if (card.id === 'rainfall') {
    let best = null;
    let bestValue = 0;
    for (let lane = 0; lane < LANES; lane += 1) {
      for (const warden of me.lanes[lane]) {
        const missing = warden.maxHealth - warden.health;
        if (missing >= 2 && missing > bestValue) { bestValue = missing; best = { uid: warden.uid }; }
      }
    }
    if (best) return { score: 1.5 + bestValue * 0.4, target: best };
    return me.life < 24 ? { score: 1.2, target: null } : { score: -1 };
  }
  if (card.id === 'deep-draw') {
    return { score: me.hand.length <= 3 ? 2.2 : 0.8, target: null };
  }
  if (card.id === 'windfall') {
    const big = me.hand.some((c) => c.cost >= 4 && c.cost > me.mana);
    return { score: big ? 2.5 : -1, target: null };
  }
  if (card.id === 'tailwind') {
    // Free mana: worth it whenever a card in hand costs exactly one more
    // than the mana available, or when mana would otherwise go unspent.
    const stretch = me.hand.some((c) => c.cost === me.mana + 1 && c.kind === KIND_WARDEN);
    return { score: stretch ? 2.4 : 0.6, target: null };
  }
  if (card.id === 'cyclone') {
    let value = 0;
    for (let lane = 0; lane < LANES; lane += 1) value += them.lanes[lane].length;
    return { score: value >= 2 ? 2 + value * 0.6 : -1, target: null };
  }
  return { score: -1 };
}

// One greedy pass for a side: the single best affordable play, or null when
// nothing is worth its mana.
export function bestPlayFor(match, side) {
  const me = sideOf(match, side);
  let best = null;
  for (const card of me.hand) {
    if (card.cost > me.mana) continue;
    if (card.kind === KIND_WARDEN) {
      for (let lane = 0; lane < LANES; lane += 1) {
        if (!laneHasRoom(match, side, lane)) continue;
        const score = scoreWardenPlay(match, side, card, lane);
        if (!best || score > best.score) best = { score, card, lane };
      }
    } else if (card.kind === KIND_SPELL) {
      const judged = scoreSpellPlay(match, side, card);
      if (judged.score > 0 && (!best || judged.score > best.score)) {
        best = { score: judged.score, card, target: judged.target ?? null };
      }
    }
  }
  return best;
}

export function bestPlay(match) {
  return bestPlayFor(match, SIDE_FOE);
}

// The telegraph: read the brain's plan off the board before your turn, so
// you can see what Mistral is about to do and answer it.
export function telegraph(match) {
  const play = bestPlay(match);
  if (!play) return 'Mistral is holding mana, waiting for a bigger card.';
  if (play.card.kind === KIND_WARDEN) {
    const laneNames = ['the west lane', 'the middle lane', 'the east lane'];
    return `Mistral eyes ${laneNames[play.lane]} — a ${play.card.name} is coming.`;
  }
  if (play.card.id === 'gust') return 'Mistral is lining up a Gust at your strongest warden.';
  if (play.card.id === 'cyclone') return 'Mistral is gathering a Cyclone — spread your wardens out.';
  if (play.card.id === 'rainfall') return 'Mistral is about to mend a wounded warden.';
  if (play.card.id === 'deep-draw') return 'Mistral is drawing deeper into the deck.';
  return 'Mistral is about to cast a spell.';
}

// Play a whole turn for a side: greedy plays until none is worth it, with
// a small chance to hold back and keep a card for later. `skill` 1 plays
// at full strength; lower values pass more often, for staging a loss.
export function takeAutoTurn(match, side, playWarden, playSpell, skill = 1) {
  let guard = 0;
  while (guard < 12) {
    guard += 1;
    const play = bestPlayFor(match, side);
    if (!play || play.score < 0.5) break;
    if (play.score < 1.2 && match.random.next() < 0.35 * (2 - skill)) break;
    if (skill < 1 && match.random.next() > skill) break;
    if (play.card.kind === KIND_WARDEN) {
      const done = playWarden(match, side, play.card.uid, play.lane);
      if (!done.ok) break;
    } else {
      const done = playSpell(match, side, play.card.uid, play.target ?? null);
      if (!done.ok) break;
    }
  }
}

export function takeFoeTurn(match, playWarden, playSpell) {
  takeAutoTurn(match, SIDE_FOE, playWarden, playSpell, 1);
}
