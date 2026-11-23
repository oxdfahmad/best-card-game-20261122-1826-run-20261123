// Paints the table: hands, lanes, life and mana, banners and screens.
// The renderer rebuilds the board from the match on every change; cards
// that appear get an entrance animation (slide and flip), and the clash
// leaves floating damage numbers and a shake on the lane it hit. In shot
// mode the page carries .no-anim, so every frame is already settled.
import { WIND_NAMES } from './cards.js';
import { LANES, SIDE_FOE, SIDE_YOU, wardenPower } from './state.js';

const LANE_NAMES = ['West Lane', 'Middle Lane', 'East Lane'];

const GLYPHS = {
  gale: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 20 m0 -12 a12 12 0 1 1 -9 19 a8 8 0 1 0 12 -7 a4.5 4.5 0 1 1 -5 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  bloom: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34 C8 26 8 12 20 6 C32 12 32 26 20 34 Z M20 34 C20 24 20 16 20 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tide: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 16 q7 -9 14 0 t14 0 M6 26 q7 -9 14 0 t14 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};

function glyph(wind) {
  return GLYPHS[wind] ?? '';
}

function manaPips(filled, max) {
  let out = '';
  for (let i = 0; i < max; i += 1) out += `<span class="pip${i < filled ? ' on' : ''}">◆</span>`;
  return out;
}

export function cardHtml(card, options = {}) {
  const { power = card.power, selectable = false, selected = false, dimmed = false, playable = true } = options;
  const classes = ['card', `wind-${card.wind}`, card.kind];
  if (selectable) classes.push('selectable');
  if (selected) classes.push('selected');
  if (dimmed) classes.push('dimmed');
  if (!playable) classes.push('unplayable');
  const stats = card.kind === 'warden'
    ? `<div class="stats"><span class="power" title="Power">⚔ ${power}</span><span class="health" title="Health">♥ ${card.health}</span></div>`
    : `<div class="spell-text">${card.text}</div>`;
  return `<div class="${classes.join(' ')}" data-uid="${card.uid}" data-id="${card.id}" tabindex="0" role="button" aria-label="${card.name}, cost ${card.cost}">
    <div class="cost" title="Cost">${card.cost}</div>
    <div class="glyph">${glyph(card.wind)}</div>
    <div class="wind-name">${WIND_NAMES[card.wind]}</div>
    <div class="card-name">${card.name}</div>
    <div class="art">${glyph(card.wind)}</div>
    ${stats}
  </div>`;
}

export function createRenderer(doc) {
  const el = (id) => doc.getElementById(id);
  const foeLife = el('foe-life');
  const foeMana = el('foe-mana');
  const foeDeck = el('foe-deck');
  const youLife = el('you-life');
  const youMana = el('you-mana');
  const youDeck = el('you-deck');
  const intent = el('intent');
  const handEl = el('hand');
  const foeHandEl = el('foe-hand');
  const lanesEl = el('lanes');
  const bannerEl = el('banner');
  const logEl = el('log');
  const fxEl = el('fx');
  const roundEl = el('round');
  const endTurnBtn = el('end-turn');
  const screens = {
    title: el('screen-title'),
    over: el('screen-over'),
    paused: el('screen-paused'),
  };
  const overTitle = el('over-title');
  const overText = el('over-text');
  const overStats = el('over-stats');

  let lastHandUids = new Set();

  function drawSide(holder, lifeEl, manaEl, deckEl) {
    lifeEl.textContent = Math.max(0, holder.life);
    lifeEl.classList.toggle('low', holder.life <= 10);
    manaEl.innerHTML = manaPips(holder.mana, holder.manaMax);
    deckEl.textContent = holder.deck.length;
  }

  function drawLanes(match, view) {
    let html = '';
    for (let lane = 0; lane < LANES; lane += 1) {
      const foeCards = match.foe.lanes[lane].map((card, i) => {
        const power = wardenPower(match, SIDE_FOE, lane, i);
        return cardHtml(card, { power, dimmed: view.targeting?.kind === 'spell' });
      }).join('');
      const youCards = match.you.lanes[lane].map((card, i) => {
        const power = wardenPower(match, SIDE_YOU, lane, i);
        return cardHtml(card, { power });
      }).join('');
      const open = view.selected && match.active === SIDE_YOU && match.you.lanes[lane].length < 2;
      html += `<div class="lane${open ? ' drop-open' : ''}" data-lane="${lane}">
        <div class="lane-slots foe">${foeCards || '<div class="slot-empty">·</div>'}</div>
        <div class="lane-mid"><span class="lane-name">${LANE_NAMES[lane]}</span><span class="lane-clash">⚔</span></div>
        <div class="lane-slots you">${youCards || '<div class="slot-empty">·</div>'}</div>
      </div>`;
    }
    lanesEl.innerHTML = html;
  }

  function drawHand(match, view) {
    const holder = match.you;
    const targeting = view.targeting;
    const html = holder.hand.map((card, i) => {
      const playable = match.active === SIDE_YOU && !match.over && holder.mana >= card.cost;
      const selected = view.selectedUid === card.uid;
      return cardHtml(card, { selectable: true, selected, playable });
    }).join('');
    handEl.innerHTML = html;
    handEl.classList.toggle('many', holder.hand.length > 5);
    for (const node of handEl.querySelectorAll('.card')) {
      if (!lastHandUids.has(node.dataset.uid)) node.classList.add('dealt');
    }
    lastHandUids = new Set(holder.hand.map((c) => c.uid));
    endTurnBtn.disabled = match.active !== SIDE_YOU || match.over;
    endTurnBtn.textContent = targeting ? 'Cancel ✕' : 'End Turn ⏎';
    // Mistral's hand, face down: the table shows both hands.
    foeHandEl.innerHTML = Array.from({ length: match.foe.hand.length }, () => '<div class="card-back" title="Mistral\u2019s card">🌀</div>').join('');
  }

  function drawLog(match) {
    const last = match.log.slice(-3);
    logEl.innerHTML = last.map((line) => `<div>${line}</div>`).join('');
  }

  function showBanner(text, kind = '') {
    if (!text) { bannerEl.textContent = ''; bannerEl.className = ''; return; }
    bannerEl.textContent = text;
    bannerEl.className = `show ${kind}`;
    window.clearTimeout(showBanner.timer);
    showBanner.timer = window.setTimeout(() => { bannerEl.className = ''; }, 2200);
  }

  function floatDamage(lane, text, kind) {
    const laneEl = lanesEl.querySelector(`.lane[data-lane="${lane}"]`);
    if (!laneEl) return;
    const rect = laneEl.getBoundingClientRect();
    const host = fxEl.getBoundingClientRect();
    const span = doc.createElement('div');
    span.className = `float-num ${kind}`;
    span.textContent = text;
    span.style.left = `${rect.left - host.left + rect.width / 2}px`;
    span.style.top = `${rect.top - host.top + rect.height / 2}px`;
    fxEl.appendChild(span);
    window.setTimeout(() => span.remove(), 1400);
  }

  function shakeLane(lane) {
    const laneEl = lanesEl.querySelector(`.lane[data-lane="${lane}"]`);
    if (!laneEl) return;
    laneEl.classList.remove('shake');
    void laneEl.offsetWidth;
    laneEl.classList.add('shake');
  }

  function draw(match, view) {
    drawSide(match.foe, foeLife, foeMana, foeDeck);
    drawSide(match.you, youLife, youMana, youDeck);
    roundEl.textContent = `Round ${Math.ceil(match.turn / 2)}`;
    intent.textContent = view.intent ?? '';
    drawLanes(match, view);
    drawHand(match, view);
    drawLog(match);
    for (const [name, node] of Object.entries(screens)) {
      node.classList.toggle('hidden', view.screen !== name);
    }
    if (view.screen === 'over') {
      const won = match.winner === SIDE_YOU;
      const drew = match.winner === null;
      overTitle.textContent = drew ? 'A DRAW' : won ? 'VICTORY' : 'DEFEAT';
      overTitle.className = drew ? 'draw' : won ? 'win' : 'lose';
      overText.textContent = drew
        ? 'Both callers fall as the last wind dies. The duel ends even.'
        : won
          ? 'The three winds bow to you. Mistral yields the table.'
          : 'The winds turn against you. Mistral keeps the table — this time.';
      overStats.textContent = `Rounds played: ${Math.ceil(match.turn / 2)} · Your life: ${Math.max(0, match.you.life)} · Mistral's life: ${Math.max(0, match.foe.life)}`;
    }
  }

  return { draw, showBanner, floatDamage, shakeLane };
}
