// A small seeded random source, so a match can be replayed exactly from its
// seed. Screenshots stage a match with a fixed seed and always get the same
// board, and the two players share the one stream in turn order.
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  function integer(bound) {
    return Math.floor(next() * bound);
  }
  function pick(list) {
    return list[integer(list.length)];
  }
  // Fisher-Yates, in place, driven by this stream.
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = integer(i + 1);
      const held = list[i];
      list[i] = list[j];
      list[j] = held;
    }
    return list;
  }
  return { next, integer, pick, shuffle };
}
