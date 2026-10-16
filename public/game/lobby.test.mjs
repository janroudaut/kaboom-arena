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

test("cleanRooms rebuilds every field and drops malformed rows", async () => {
  const { cleanRooms, quickPick } = await import("./lobby.js");
  assert.deepEqual(cleanRooms("x"), []);
  const rows = cleanRooms([
    { code: "ABCD", host: "  Zoe\u0000\n<b>very long name</b>", mode: "<script>", tiles: 3, chaos: "yes", bombs: true, open: 99, specs: -2, live: 1, extra: { a: 1 } },
    { code: "abcd" }, { code: "ABCDE" }, { code: 5 }, null, "ABCD",
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { code: "ABCD", host: "Zoe <b>very", mode: "classic", tiles: "off", chaos: false, bombs: true, abilities: false, open: 3, specs: 0, live: false });
  assert.equal(cleanRooms(Array.from({ length: 50 }, () => ({ code: "ABCD" }))).length, 20);
  const room = (code, open, live = false) => ({ code, open, live });
  assert.deepEqual(quickPick([room("AAAA", 3), room("BBBB", 1), room("CCCC", 0), room("DDDD", 2, true), room("EEEE", 2)]).map((r) => r.code), ["BBBB", "EEEE", "AAAA"]);
  assert.deepEqual(quickPick([]), []);
  assert.equal(quickPick(Array.from({ length: 9 }, (_, i) => room("R" + i, 1))).length, 3);
});
