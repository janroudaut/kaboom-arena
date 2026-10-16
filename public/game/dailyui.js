import { dayKey, specOf, summary, score, resultLine, load, save, record, streakOn } from "./daily.js";
import { unpack, pack } from "./replay.js";
import { shareReplay, notify, ERR } from "./replayui.js";
import { shareCard } from "./sharecard.js";

const $ = (id) => document.getElementById(id);

export function dailyInfo(spec, day, streak, host) {
  return {
    kind: "daily", head: `Daily challenge · ${spec.key}`, title: spec.rule.name, rules: summary(spec), bigLabel: "BEST SCORE", big: String(day?.best ?? 0), line: day?.line ?? "",
    extra: streak ? `STREAK ${streak} DAY${streak > 1 ? "S" : ""}` : "", fighter: spec.fighter.id, fighterName: spec.fighter.name, host,
  };
}

export function createDailyUi({ storage, play, watch, now = Date.now }) {
  const state = () => {
    const key = dayKey(now()), st = load(storage), spec = specOf(key), day = st.days[key] ?? null;
    return { key, st, spec, day, streak: streakOn(st, key) };
  };

  function render() {
    const { spec, day, streak } = state(), card = $("dailyCard");
    const img = Object.assign(document.createElement("img"), { src: `/portraits/${spec.fighter.id}.webp`, alt: "", width: 96, height: 96 });
    img.style.setProperty("--c", spec.fighter.color);
    img.onerror = () => (img.style.visibility = "hidden");
    const text = document.createElement("div");
    text.append(Object.assign(document.createElement("h3"), { textContent: spec.rule.name }), Object.assign(document.createElement("p"), { textContent: spec.rule.tag }), Object.assign(document.createElement("p"), { textContent: `You play ${spec.fighter.name}. ${summary(spec)}.` }));
    const dl = document.createElement("dl");
    for (const [k, v] of [["Today", spec.key], ["Best", day ? `${day.best} pts` : "not yet"], ["Result", day?.line || "-"], ["Tries", String(day?.tries ?? 0)], ["Streak", streak ? `${streak} day${streak > 1 ? "s" : ""}` : "0"]]) {
      dl.append(Object.assign(document.createElement("dt"), { textContent: k }), Object.assign(document.createElement("dd"), { textContent: v }));
    }
    card.replaceChildren(img, text, dl);
    $("dailyPlay").textContent = day ? "Try again" : "Play today's challenge";
    $("dailyWatch").disabled = $("dailyLink").disabled = !day?.data;
    $("dailyCardBtn").disabled = !day;
  }

  async function bestMatch() {
    const { day } = state();
    const r = day?.data ? await unpack(day.data) : { error: "corrupt" };
    if (!r.match) notify(ERR[r.error]);
    return r.match;
  }

  $("dailyPlay").onclick = () => play(state().spec);
  $("dailyWatch").onclick = async () => { const m = await bestMatch(); if (m) watch(m, "daily"); };
  $("dailyLink").onclick = async () => { const m = await bestMatch(); if (m) shareReplay(m); };
  $("dailyCardBtn").onclick = async () => {
    const { spec, day, streak } = state();
    const r = await shareCard(dailyInfo(spec, day, streak, location.host), { text: `${spec.rule.name}: ${day.best} points on today's Kaboom Arena challenge.`, url: location.origin });
    if (r === "saved") notify("Score card saved as a PNG.");
  };

  return {
    render,
    // result: { won, ticks, kills, waves, points }. Returns what the end screen shows.
    async submit(spec, result, match) {
      const st = load(storage), value = score(spec.rule, result), line = resultLine(spec.rule, result);
      const day = st.days[spec.key], data = !day || value > day.best ? await pack(match) : undefined;
      const better = record(st, spec.key, { value, line, data });
      save(storage, st);
      return { value, line, better, best: st.days[spec.key].best, streak: streakOn(st, spec.key), tries: st.days[spec.key].tries };
    },
    card: (spec, res) => shareCard({ ...dailyInfo(spec, { best: res.value, line: res.line }, res.streak, location.host), bigLabel: "SCORE" }, { text: `${spec.rule.name}: ${res.value} points on today's Kaboom Arena challenge.`, url: location.origin }),
  };
}
