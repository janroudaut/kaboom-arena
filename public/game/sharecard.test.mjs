import test from "node:test";
import assert from "node:assert/strict";
import { cardLayout, wrap, CARD_W, CARD_H } from "./sharecard.js";

const INFO = { head: "Daily challenge · 2026-10-16", title: "Three Hard Bots", rules: "Classic · classic arena · Grass · 3 hard bots", big: "6840", bigLabel: "SCORE", line: "Won · 1:12 · 2 kills", extra: "STREAK 5 DAYS", fighter: "ignatius", fighterName: "Ignatius", host: "kaboom.philament.club" };

test("wrap splits on words and caps lines", () => {
  assert.deepEqual(wrap("a bb ccc", 4), ["a bb", "ccc"]);
  assert.equal(wrap("x ".repeat(100), 10, 3).length, 3);
  assert.ok(wrap("supercalifragilisticexpialidocious", 8)[0].length <= 8);
  assert.deepEqual(wrap("", 5), []);
});

test("every drawn text and image stays inside the 1200x630 card, even for hostile lengths", () => {
  for (const info of [INFO, { ...INFO, title: "A very very long challenge name that wraps", rules: "x ".repeat(200), big: "123456789012", line: "L".repeat(200), extra: "E".repeat(80), host: "h".repeat(100), fighterName: "N".repeat(50) }, { head: "", title: "", rules: "", big: "", line: "" }, { ...INFO, fighter: null }]) {
    const ops = cardLayout(info);
    for (const o of ops) {
      const w = o.t === "text" ? o.str.length * o.s : o.w, x = o.t === "text" ? (o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x) : o.x;
      const h = o.t === "text" ? o.s : o.h;
      assert.ok(x >= 0 && x + w <= CARD_W && o.y >= 0 && o.y + h <= CARD_H, `${o.t} ${o.str ?? ""} at ${x},${o.y}`);
    }
    const texts = ops.filter((o) => o.t === "text").sort((a, b) => a.y - b.y).filter((o) => o.x < 700);
    for (let i = 1; i < texts.length; i++) if (texts[i].x < 700 && texts[i - 1].x < 700 && texts[i].y > 120) assert.ok(texts[i].y >= texts[i - 1].y + texts[i - 1].s * 0.9 - 1, `overlap ${texts[i - 1].str} / ${texts[i].str}`);
  }
});

test("the portrait is optional", () => {
  assert.ok(cardLayout(INFO).some((o) => o.t === "img"));
  assert.ok(!cardLayout({ ...INFO, fighter: null }).some((o) => o.t === "img"));
});
