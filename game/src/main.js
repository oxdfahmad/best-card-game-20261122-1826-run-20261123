// Boot and the one loop: the table is drawn from the match on every change,
// the player acts on their turn, Mistral answers on hers, and the clash at
// the end of each turn is animated blow by blow. ?seed=N fixes the deck
// order. ?shot=title|table|win|loss (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { createRandom } from './random.js';
import { KIND_SPELL, KIND_WARDEN } from './cards.js';
import {
  SIDE_FOE, SIDE_YOU, beginTurn, clash, createMatch, endTurn, playSpell,
  playWarden,
} from './state.js';
import { takeFoeTurn, telegraph } from './ai.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const doc = document;
let match = createMatch(createRandom(seed), seed);
const renderer = createRenderer(doc);
const sound = createSound();

const view = {
  screen: shot ? 'play' : 'title',
  selectedUid: null,
  targeting: null,
  intent: telegraph(match),
  busy: false,
};

const statusEl = doc.getElementById('status');

function announce(message) {
  statusEl.textContent = message;
}

function selectedCard() {
  return match.you.hand.find((card) => card.uid === view.selectedUid) ?? null;
}

function clearSelection() {
  view.selectedUid = null;
  view.targeting = null;
}

function needsTarget(card) {
  return card.kind === KIND_SPELL && (card.id === 'gust' || card.id === 'rainfall');
}

function refresh() {
  renderer.draw(match, view);
}

function surgeBanner() {
  if (match.you.surgeWind) {
    renderer.showBanner(`${match.you.surgeWind.toUpperCase()} SURGE — your ${match.you.surgeWind} wardens gain +1 power!`, 'surge');
    sound.surge();
  } else if (match.foe.surgeWind) {
    renderer.showBanner(`Mistral calls a ${match.foe.surgeWind.toUpperCase()} SURGE!`, 'surge');
    sound.surge();
  }
}

function animateClash(blows, done) {
  if (!blows || blows.length === 0) { done(); return; }
  view.busy = true;
  sound.clash();
  blows.forEach((blow, i) => {
    window.setTimeout(() => {
      renderer.shakeLane(blow.lane);
      if (blow.face) {
        renderer.floatDamage(blow.lane, `-${blow.power} ♥`, blow.face === SIDE_YOU ? 'hurt-you' : 'hurt-foe');
      } else {
        renderer.floatDamage(blow.lane, `⚔ ${blow.yourPower} / ${blow.foePower}`, 'clash');
      }
      refresh();
      if (i === blows.length - 1) {
        window.setTimeout(() => { view.busy = false; done(); }, 420);
      }
    }, i * 380);
  });
}

function afterClash() {
  refresh();
  if (match.over) { endDuel(); return; }
  if (match.active === SIDE_FOE) foePhase();
  else { view.intent = telegraph(match); refresh(); }
}

function foePhase() {
  view.busy = true;
  announce('Mistral is thinking…');
  refresh();
  window.setTimeout(() => {
    takeFoeTurn(match, playWarden, playSpell);
    surgeBanner();
    refresh();
    const blows = clash(match);
    animateClash(blows, () => {
      view.busy = false;
      if (match.over) { endDuel(); return; }
      beginTurn(match, SIDE_YOU);
      view.intent = telegraph(match);
      announce('Your turn.');
      refresh();
    });
  }, 650);
}

function endDuel() {
  view.screen = 'over';
  clearSelection();
  if (match.winner === SIDE_YOU) sound.win();
  else if (match.winner === SIDE_FOE) sound.lose();
  announce(match.winner === SIDE_YOU ? 'Victory! The winds bow to you.' : 'Defeat. Mistral keeps the table.');
  refresh();
}

function playerEndTurn() {
  if (view.busy || match.over || match.active !== SIDE_YOU) return;
  clearSelection();
  const blows = endTurn(match);
  animateClash(blows, afterClash);
}

function pickCard(uid) {
  if (view.busy || match.over || match.active !== SIDE_YOU || view.screen !== 'play') return;
  const card = match.you.hand.find((c) => c.uid === uid);
  if (!card) return;
  if (view.selectedUid === uid) {
    // A second click on a spell that needs no target casts it at once.
    if (card.kind === KIND_SPELL && !needsTarget(card)) { castNoTarget(); return; }
    clearSelection(); refresh(); return;
  }
  if (match.you.mana < card.cost) {
    renderer.showBanner(`Not enough mana for ${card.name}.`, 'warn');
    return;
  }
  view.selectedUid = uid;
  view.targeting = needsTarget(card) ? { card } : null;
  sound.unlock();
  if (view.targeting) announce(`${card.name}: choose a warden.`);
  refresh();
}

function pickLane(lane) {
  if (view.busy || match.over || match.active !== SIDE_YOU || view.screen !== 'play') return;
  const card = selectedCard();
  if (!card || view.targeting) return;
  if (card.kind !== KIND_WARDEN) {
    renderer.showBanner(`${card.name} is a spell — it needs no lane.`, 'warn');
    return;
  }
  const done = playWarden(match, SIDE_YOU, card.uid, lane);
  if (!done.ok) {
    renderer.showBanner(done.why === 'lane is full' ? 'That lane is full.' : 'You cannot play that now.', 'warn');
    return;
  }
  sound.play();
  surgeBanner();
  clearSelection();
  refresh();
}

function aimAt(uid) {
  if (view.busy || match.over || match.active !== SIDE_YOU || view.screen !== 'play') return;
  const card = selectedCard();
  if (!card || !view.targeting) return;
  const done = playSpell(match, SIDE_YOU, card.uid, { uid });
  if (!done.ok) {
    renderer.showBanner('That is not a valid target.', 'warn');
    return;
  }
  sound.play();
  surgeBanner();
  clearSelection();
  refresh();
}

function castNoTarget() {
  const card = selectedCard();
  if (!card || card.kind !== KIND_SPELL) return false;
  if (card.id === 'gust' || card.id === 'rainfall') {
    // Rainfall with no wounded warden heals your life instead.
    if (card.id === 'rainfall') {
      const wounded = match.you.lanes.flat().some((w) => w.health < w.maxHealth);
      if (!wounded) {
        const done = playSpell(match, SIDE_YOU, card.uid, null);
        if (done.ok) { sound.play(); surgeBanner(); clearSelection(); refresh(); return true; }
      }
    }
    return false;
  }
  const done = playSpell(match, SIDE_YOU, card.uid, null);
  if (!done.ok) return false;
  sound.play();
  surgeBanner();
  clearSelection();
  refresh();
  return true;
}

const input = createInput(doc, {
  pickCard,
  pickLane,
  aimAt,
});

function handleKeys() {
  const actions = input.take();
  for (const key of actions.keys) {
    if (view.screen !== 'play' || view.busy) continue;
    if (key.type === 'card') {
      const card = match.you.hand[key.index];
      if (card) pickCard(card.uid);
    } else if (key.type === 'lane') {
      if (view.selectedUid && !view.targeting) pickLane(key.index);
    }
  }
  if (actions.end) {
    if (view.targeting) { clearSelection(); refresh(); }
    else if (view.screen === 'play') playerEndTurn();
  }
  if (actions.pause) {
    if (view.screen === 'play') { view.screen = 'paused'; refresh(); }
    else if (view.screen === 'paused') { view.screen = 'play'; refresh(); }
  }
}

function bindButtons() {
  doc.getElementById('play-btn').addEventListener('click', () => {
    sound.unlock();
    view.screen = 'play';
    announce('Your turn. Play a card, then end your turn.');
    refresh();
  });
  doc.getElementById('again-btn').addEventListener('click', () => {
    window.location.search = '';
  });
  doc.getElementById('resume-btn').addEventListener('click', () => {
    view.screen = 'play';
    refresh();
  });
  doc.getElementById('restart-btn').addEventListener('click', () => {
    window.location.search = '';
  });
  doc.getElementById('how-btn').addEventListener('click', () => {
    doc.getElementById('howto').classList.toggle('hidden');
  });
  doc.getElementById('mute-btn').addEventListener('click', (event) => {
    const muted = sound.toggleMute();
    event.currentTarget.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
  });
  doc.getElementById('end-turn').addEventListener('click', () => {
    if (view.targeting) { clearSelection(); refresh(); return; }
    playerEndTurn();
  });
  doc.getElementById('hand').addEventListener('dblclick', () => {
    castNoTarget();
  });
}

function runShot(name) {
  doc.body.classList.add('no-anim');
  const staged = stageShot(name, seed);
  match = staged.match;
  view.screen = staged.screen;
  view.intent = match.over ? '' : telegraph(match);
  let painted = 0;
  function paint() {
    refresh();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  bindButtons();
  refresh();
  function loop() {
    handleKeys();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

if (shot) runShot(shot);
else runGame();
