// The match itself: life, mana, hands, the three lanes, and the clash that
// ends every turn. One state object holds both sides; `side` is 'you' or
// 'foe'. A lane holds up to two wardens a side. The clash pairs them in
// order: paired wardens trade blows at once, an unpaired warden strikes the
// enemy's life directly.
import { buildDeck, KIND_SPELL, KIND_WARDEN, makeCard, windBeats, WINDS } from './cards.js';

export const SIDE_YOU = 'you';
export const SIDE_FOE = 'foe';
export const LANES = 3;
export const LANE_CAP = 2;
export const START_LIFE = 30;
export const MAX_MANA = 7;
export const MAX_HAND = 7;
export const OPENING_HAND = 3;
export const SURGE_NEED = 2;
export const SURGE_BONUS = 1;

export function otherSide(side) {
  return side === SIDE_YOU ? SIDE_FOE : SIDE_YOU;
}

function makeSide(random) {
  return {
    life: START_LIFE,
    mana: 0,
    manaMax: 0,
    deck: buildDeck(random),
    hand: [],
    lanes: [[], [], []],
    playedWinds: [],
    surgeWind: null,
  };
}

export function createMatch(random, seed) {
  const match = {
    seed,
    random,
    turn: 0,
    active: SIDE_YOU,
    over: false,
    winner: null,
    log: [],
    you: makeSide(random),
    foe: makeSide(random),
  };
  for (let i = 0; i < OPENING_HAND; i += 1) {
    drawCard(match, SIDE_YOU);
    drawCard(match, SIDE_FOE);
  }
  // The second caller opens with a Tailwind: one free mana, to balance the
  // first move. The opening turn draws no card: both sides open with three.
  match.foe.hand.push(makeCard('tailwind'));
  beginTurn(match, SIDE_YOU, false);
  return match;
}

export function sideOf(match, side) {
  return side === SIDE_YOU ? match.you : match.foe;
}

export function drawCard(match, side) {
  const holder = sideOf(match, side);
  if (holder.deck.length === 0) {
    holder.life -= 2;
    note(match, `${side === SIDE_YOU ? 'You' : 'Mistral'} draw from an empty deck and lose 2 life.`);
    if (holder.life <= 0) finish(match, otherSide(side));
    return null;
  }
  const card = holder.deck.pop();
  if (holder.hand.length >= MAX_HAND) {
    note(match, `${card.name} is discarded: hand is full.`);
    return null;
  }
  holder.hand.push(card);
  return card;
}

export function beginTurn(match, side, draw = true) {
  const holder = sideOf(match, side);
  match.turn += 1;
  match.active = side;
  holder.manaMax = Math.min(MAX_MANA, holder.manaMax + 1);
  holder.mana = holder.manaMax;
  holder.playedWinds = [];
  holder.surgeWind = null;
  if (draw) drawCard(match, side);
  if (match.over) return;
  note(match, side === SIDE_YOU ? `Turn ${match.turn}: your move.` : `Turn ${match.turn}: Mistral moves.`);
}

export function canPlay(match, side, card) {
  return !match.over && match.active === side && sideOf(match, side).mana >= card.cost;
}

export function laneHasRoom(match, side, lane) {
  return sideOf(match, side).lanes[lane].length < LANE_CAP;
}

// Power of a warden right now: base, plus surge, plus +2 when it beats the
// wind of the warden across from it.
export function wardenPower(match, side, lane, index) {
  const holder = sideOf(match, side);
  const warden = holder.lanes[lane][index];
  let power = warden.power;
  if (holder.surgeWind === warden.wind) power += SURGE_BONUS;
  const foeWarden = sideOf(match, otherSide(side)).lanes[lane][index];
  if (foeWarden && windBeats(warden.wind, foeWarden.wind)) power += 2;
  return power;
}

export function playWarden(match, side, cardUid, lane) {
  const holder = sideOf(match, side);
  const at = holder.hand.findIndex((card) => card.uid === cardUid);
  if (at < 0) return { ok: false, why: 'not in hand' };
  const card = holder.hand[at];
  if (card.kind !== KIND_WARDEN) return { ok: false, why: 'not a warden' };
  if (!canPlay(match, side, card)) return { ok: false, why: 'not enough mana' };
  if (!laneHasRoom(match, side, lane)) return { ok: false, why: 'lane is full' };
  holder.hand.splice(at, 1);
  holder.mana -= card.cost;
  holder.lanes[lane].push(card);
  holder.playedWinds.push(card.wind);
  checkSurge(match, side);
  note(match, `${side === SIDE_YOU ? 'You play' : 'Mistral plays'} ${card.name} in lane ${lane + 1}.`);
  return { ok: true, card };
}

function checkSurge(match, side) {
  const holder = sideOf(match, side);
  if (holder.surgeWind) return;
  for (const wind of WINDS) {
    if (holder.playedWinds.filter((w) => w === wind).length >= SURGE_NEED) {
      holder.surgeWind = wind;
      note(match, `${wind.toUpperCase()} SURGE: your ${wind} wardens gain +1 power this turn.`);
      return;
    }
  }
}

export function playSpell(match, side, cardUid, target) {
  const holder = sideOf(match, side);
  const at = holder.hand.findIndex((card) => card.uid === cardUid);
  if (at < 0) return { ok: false, why: 'not in hand' };
  const card = holder.hand[at];
  if (card.kind !== KIND_SPELL) return { ok: false, why: 'not a spell' };
  if (!canPlay(match, side, card)) return { ok: false, why: 'not enough mana' };
  const enemy = sideOf(match, otherSide(side));
  if (card.id === 'gust' && !target) return { ok: false, why: 'gust needs a target' };
  if (card.id === 'gust' && target && !findWarden(match, otherSide(side), target.uid)) return { ok: false, why: 'gust needs an enemy warden' };
  if (card.id === 'rainfall' && target && !findWarden(match, side, target.uid)) return { ok: false, why: 'rainfall heals your own warden' };
  holder.hand.splice(at, 1);
  holder.mana -= card.cost;
  holder.playedWinds.push(card.wind);
  checkSurge(match, side);
  const events = resolveSpell(match, side, card, target, enemy);
  note(match, `${side === SIDE_YOU ? 'You cast' : 'Mistral casts'} ${card.name}.`);
  return { ok: true, card, events };
}

function findWarden(match, side, uid) {
  const holder = sideOf(match, side);
  for (let lane = 0; lane < LANES; lane += 1) {
    const at = holder.lanes[lane].findIndex((card) => card.uid === uid);
    if (at >= 0) return { lane, index: at, card: holder.lanes[lane][at] };
  }
  return null;
}

function hurtWarden(match, side, uid, amount) {
  const found = findWarden(match, side, uid);
  if (!found) return false;
  found.card.health -= amount;
  if (found.card.health <= 0) {
    sideOf(match, side).lanes[found.lane].splice(found.index, 1);
    note(match, `${found.card.name} falls.`);
  }
  return true;
}

function resolveSpell(match, side, card, target, enemy) {
  const events = [];
  if (card.id === 'gust') {
    hurtWarden(match, otherSide(side), target.uid, 3);
    events.push({ type: 'damage', side: otherSide(side), uid: target.uid, amount: 3 });
  } else if (card.id === 'rainfall') {
    if (target) {
      const found = findWarden(match, side, target.uid);
      if (found) {
        found.card.health = Math.min(found.card.maxHealth, found.card.health + 4);
        events.push({ type: 'heal', side, uid: target.uid, amount: 4 });
      }
    } else {
      sideOf(match, side).life = Math.min(START_LIFE, sideOf(match, side).life + 3);
      events.push({ type: 'heal-life', side, amount: 3 });
    }
  } else if (card.id === 'deep-draw') {
    drawCard(match, side);
    drawCard(match, side);
    events.push({ type: 'draw', side, amount: 2 });
  } else if (card.id === 'windfall') {
    sideOf(match, side).mana += 2;
    events.push({ type: 'mana', side, amount: 2 });
  } else if (card.id === 'tailwind') {
    sideOf(match, side).mana += 1;
    events.push({ type: 'mana', side, amount: 1 });
  } else if (card.id === 'cyclone') {
    for (let lane = 0; lane < LANES; lane += 1) {
      for (const warden of [...enemy.lanes[lane]]) hurtWarden(match, otherSide(side), warden.uid, 2);
    }
    events.push({ type: 'storm', side: otherSide(side), amount: 2 });
  }
  return events;
}

// The clash: every lane settles at once. Paired wardens trade blows with
// their current power (surge and wind advantage included); a warden with
// nobody across from it strikes the enemy's life. Returns a list of blows
// for the renderer to animate.
export function clash(match) {
  const blows = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const youLane = match.you.lanes[lane];
    const foeLane = match.foe.lanes[lane];
    const pairs = Math.max(youLane.length, foeLane.length);
    for (let i = 0; i < pairs; i += 1) {
      const yours = youLane[i];
      const theirs = foeLane[i];
      if (yours && theirs) {
        const yourPower = wardenPower(match, SIDE_YOU, lane, i);
        const foePower = wardenPower(match, SIDE_FOE, lane, i);
        blows.push({ lane, youUid: yours.uid, foeUid: theirs.uid, yourPower, foePower });
      } else if (yours) {
        const power = wardenPower(match, SIDE_YOU, lane, i);
        blows.push({ lane, youUid: yours.uid, face: SIDE_FOE, power });
      } else if (theirs) {
        const power = wardenPower(match, SIDE_FOE, lane, i);
        blows.push({ lane, foeUid: theirs.uid, face: SIDE_YOU, power });
      }
    }
  }
  for (const blow of blows) {
    if (blow.face) {
      const holder = sideOf(match, blow.face);
      holder.life -= blow.power;
      note(match, `${blow.face === SIDE_YOU ? 'Mistral' : 'Your warden'} strikes for ${blow.power} life.`);
    } else {
      hurtWarden(match, SIDE_FOE, blow.foeUid, blow.yourPower);
      hurtWarden(match, SIDE_YOU, blow.youUid, blow.foePower);
    }
  }
  if (match.you.life <= 0 && match.foe.life <= 0) finish(match, match.you.life === match.foe.life ? null : (match.you.life > match.foe.life ? SIDE_YOU : SIDE_FOE));
  else if (match.you.life <= 0) finish(match, SIDE_FOE);
  else if (match.foe.life <= 0) finish(match, SIDE_YOU);
  return blows;
}

export function endTurn(match) {
  if (match.over || match.active !== SIDE_YOU) return null;
  const blows = clash(match);
  if (!match.over) beginTurn(match, SIDE_FOE);
  return blows;
}

export function foeTurnDone(match) {
  if (match.over || match.active !== SIDE_FOE) return null;
  const blows = clash(match);
  if (!match.over) beginTurn(match, SIDE_YOU);
  return blows;
}

function finish(match, winner) {
  match.over = true;
  match.winner = winner;
  note(match, winner === SIDE_YOU ? 'You win the duel.' : winner === SIDE_FOE ? 'Mistral wins the duel.' : 'The duel ends in a draw.');
}

function note(match, text) {
  match.log.push(text);
  if (match.log.length > 40) match.log.shift();
}
