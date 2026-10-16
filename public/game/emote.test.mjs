import test from "node:test";
import assert from "node:assert/strict";
import { EMOTES, COOLDOWN_MS, SHOW_MS, validEmote, createEmotes, emoteLook } from "./emote.js";

test("eight emotes, ids validated as plain integers", () => {
  assert.equal(EMOTES.length, 8);
  for (const ok of [0, 3, 7]) assert.ok(validEmote(ok));
  for (const bad of [-1, 8, 99, 1.5, "1", null, undefined, NaN, Infinity, [1], {}]) assert.ok(!validEmote(bad), String(bad));
});

test("cooldown starts at send and lasts COOLDOWN_MS", () => {
  const e = createEmotes();
  assert.ok(e.ready(0));
  e.sent(1000);
  assert.ok(!e.ready(1000 + COOLDOWN_MS - 1));
  assert.ok(e.ready(1000 + COOLDOWN_MS));
  e.reset();
  assert.ok(e.ready(0));
});

test("shown emotes expire, ignore bad input and hide others' on request", () => {
  const e = createEmotes();
  e.show(1, 2, 100, false);
  e.show(2, 5, 100, true);
  e.show(9, 1, 100, true);
  e.show(0, 99, 100, true);
  const v = e.view(100 + SHOW_MS - 1, true);
  assert.deepEqual([v[0], v[3]], [null, null]);
  assert.equal(v[1].e, 2);
  assert.equal(v[2].e, 5);
  assert.deepEqual(e.view(150, false).map((x) => x?.e ?? null), [null, null, 5, null]);
  assert.deepEqual(e.view(100 + SHOW_MS, true), [null, null, null, null]);
  assert.equal(e.view(0, true), e.view(1, true), "the view array is reused");
});

test("look: pop-in and fade, static with reduced motion", () => {
  const out = { k: 0, a: 0 }, em = { at: 0, until: SHOW_MS };
  assert.equal(emoteLook(out, em, 0, false).k, 0.5);
  assert.equal(emoteLook(out, em, 1000, false).k, 1);
  assert.equal(emoteLook(out, em, 1000, false).a, 1);
  assert.ok(emoteLook(out, em, SHOW_MS - 100, false).a < 0.5);
  assert.deepEqual(emoteLook(out, em, SHOW_MS - 100, true), { k: 1, a: 1 });
});
