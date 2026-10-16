import test from "node:test";
import assert from "node:assert/strict";
import { cleanName, esc, displayNames, roomFromSearch, inviteUrl, admit, release } from "./lobby.js";

test("cleanName caps, strips control chars, rejects non-strings", () => {
  assert.equal(cleanName("  Al\u0000ice\n\t B "), "Al ice B");
  assert.equal(cleanName("abcdefghijklmnopqrstuvwxyz"), "abcdefghijkl");
  assert.equal(cleanName("a‮b​c"), "a b c");
  for (const v of [null, 5, {}, ["x"], undefined]) assert.equal(cleanName(v), "");
});

test("esc neutralises markup", () => {
  assert.equal(esc(`<img src=x onerror="a">&'`), "&#60;img src=x onerror=&#34;a&#34;&#62;&#38;&#39;");
});

test("displayNames: fallbacks and bot numbering", () => {
  assert.deepEqual(displayNames(4, [true, true, false, false], ["Zed", ""]), ["Zed", "Black", "Bot 1", "Bot 2"]);
  assert.deepEqual(displayNames(3, [true, true, true], [], ["P1", "P2", "P3"]), ["P1", "P2", "P3"]);
});

test("roomFromSearch / inviteUrl", () => {
  assert.equal(roomFromSearch("?room=abcd&lag=5"), "ABCD");
  for (const q of ["", "?room=", "?room=ABC", "?room=ABCDE", "?room=AB%20D", "?room=<b>"]) assert.equal(roomFromSearch(q), null);
  assert.equal(inviteUrl("https://x.y", "ABCD"), "https://x.y/?room=ABCD");
});

test("slot reservation and rejoin", () => {
  const slots = ["h", "g1", "g2"], names = ["H", "G1", "G2"];
  assert.equal(admit(slots, "g3", false), "new");
  assert.equal(admit([...slots, "g3"], "g4", false), "full");
  assert.equal(admit(slots, "g3", true), "full");
  assert.equal(admit(slots, "g1", true), "back");
  assert.equal(release(slots, names, "g1", true), 1);
  assert.deepEqual(slots, ["h", "g1", "g2"]);
  assert.equal(release(slots, names, "g1", false), 1);
  assert.deepEqual(slots, ["h", "g2"]);
  assert.deepEqual(names, ["H", "G2"]);
  assert.equal(release(slots, names, "h", false), 0);
  assert.deepEqual(slots, ["h", "g2"]);
});
