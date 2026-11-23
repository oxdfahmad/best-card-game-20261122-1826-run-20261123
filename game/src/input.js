// Mouse and keyboard: click a card to pick it up, click a lane to play it,
// click a warden to aim a spell at it. Keys: 1-7 pick a hand card, 1-3 pick
// a lane, Space or Enter ends the turn, Escape pauses.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_END = 4;

export function createInput(doc, hooks) {
  let pendingKeys = [];
  let endPressed = false;
  let pausePressed = false;
  let confirmPressed = false;

  function laneFromEvent(event) {
    const laneEl = event.target.closest('.lane');
    return laneEl ? Number(laneEl.dataset.lane) : -1;
  }

  function cardFromEvent(event) {
    const cardEl = event.target.closest('.card');
    return cardEl ? cardEl.dataset.uid : null;
  }

  function onClick(event) {
    const uid = cardFromEvent(event);
    const lane = laneFromEvent(event);
    if (event.target.closest('#end-turn')) { endPressed = true; return; }
    if (uid && event.target.closest('#hand')) { hooks.pickCard(uid); return; }
    if (uid && event.target.closest('.lane-slots')) { hooks.aimAt(uid); return; }
    if (lane >= 0) { hooks.pickLane(lane); return; }
  }

  function onKey(event) {
    const key = event.key;
    if (key === 'Escape') { pausePressed = true; return; }
    if (key === ' ' || key === 'Enter') {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      endPressed = true;
      event.preventDefault();
      return;
    }
    if (key >= '1' && key <= '7') { pendingKeys.push({ type: 'card', index: Number(key) - 1 }); return; }
    if (key === 'q' || key === 'w' || key === 'e') {
      pendingKeys.push({ type: 'lane', index: { q: 0, w: 1, e: 2 }[key] });
    }
  }

  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);

  function take() {
    const out = { keys: pendingKeys, end: endPressed, pause: pausePressed, confirm: confirmPressed };
    pendingKeys = [];
    endPressed = false;
    pausePressed = false;
    confirmPressed = false;
    return out;
  }

  function pressConfirm() { confirmPressed = true; }

  return { take, pressConfirm };
}
