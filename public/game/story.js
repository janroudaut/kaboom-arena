// Story mode text. banter(a, b) is deterministic: hand-written pair > relation template > personal taunts.
import { relation, BY_ID } from "./campaign.js";

export const PREMISE = "Twenty years ago Baron von Boom stole the Eternal Fuse, the artifact that powers every bomb. Tonight's tournament decides who gets it back. Also, grandpa is up and about.";

export const TEXT = {
  ignatius: {
    epithet: "One-Eyed Ex-Champ", age: "58",
    bio: "One eye, zero patience. Former champion of Kaboom Arena. Father of Dynamita, brother of Baron, and still owed one Eternal Fuse.",
    intro: "Twenty years I waited. Tonight the Eternal Fuse comes home, or I go to bed early.",
    taunt: "Kid, I've exploded bigger things than you before breakfast.",
    victory: "Not bad for an old man. Not bad at all.",
    defeat: "My eye! The other one! Ow!",
    ending: [
      "The Baron is beaten. The Eternal Fuse is finally back in the family.",
      "Ignatius lights a victory cigar. Dynamita takes it away. 'You are 58, Dad.'",
      "Dolores arrives with the divorce papers. Again. For old times' sake.",
      "Mama pinches his cheek: 'I always liked you better than Baron.' She says that to both of them.",
      "The old man smiles with his one good eye. Next year's tournament starts Monday.",
    ],
  },
  dynamita: {
    epithet: "The Hothead", age: "22",
    bio: "Twenty-two and already on fire. Raised by Ignatius, trained by her godfather the Baron. Mad at both of them, for different reasons.",
    intro: "Dad says be patient. The Baron says be smart. I say BOOM.",
    taunt: "Hope you brought a fire extinguisher. A big one.",
    victory: "Too slow! I'm gonna need a bigger bomb.",
    defeat: "Lucky shot! I demand a rematch. And snacks.",
    ending: [
      "Dynamita holds the Eternal Fuse over her head. The crowd goes wild. So does the fuse.",
      "Dad says he is proud. Then he asks her to put it down. Then he asks again, louder.",
      "Fizzle sends a bouquet. It explodes. Everyone agrees it was romantic.",
      "Her godfather the Baron is sentenced to a lifetime of Sunday dinners at Mama's.",
      "Dynamita is already designing a bigger bomb. The fuse is lit. It is always lit.",
    ],
  },
  baron: {
    epithet: "The Betrayer", age: "60s",
    bio: "Aristocrat, villain and brother who stole the Eternal Fuse 20 years ago. Fights in a monocle. Has never once said sorry.",
    intro: "The Eternal Fuse is mine. This tournament is a mere formality.",
    taunt: "Do try not to scuff the carpet when you explode.",
    victory: "Another one bites the dust. Exquisite.",
    defeat: "Impossible! I wore my good monocle!",
    ending: [
      "The Eternal Fuse glows in the Baron's hands. The family is stunned. He is not.",
      "'Betrayal is such a strong word,' he says. 'I prefer early retirement planning.'",
      "Ignatius tries to speak. The Baron has Tony turn up the radio.",
      "Mama sends a strongly worded casserole. It arrives at 90 miles an hour.",
      "The Baron buys the arena, renames it Von Boom Arena, and sends the bill to his brother.",
    ],
  },
  mama: {
    epithet: "Rolling Pin Queen", age: "74",
    bio: "Tiny, fierce, 74. Fights with a rolling pin and a grudge. Always said the Baron was a bad influence. Nobody listened.",
    intro: "Nobody leaves this family without dessert, and nobody keeps my husband's Fuse.",
    taunt: "Eat your vegetables, dear. Then eat my rolling pin.",
    victory: "Eat something. You are too thin to explode.",
    defeat: "In my day we lost with dignity. Where are my glasses?",
    ending: [
      "Mama Kaboom raises her rolling pin. The arena rises to its feet.",
      "'I told you the Baron was a bad influence.' Twenty years of 'I told you so' pay out at once.",
      "The Eternal Fuse goes home and into the cupboard, behind the good plates.",
      "Ignatius and Baron are grounded. They are 58 and 60-something. They accept this.",
      "Mama's last words to the crowd: 'Did everybody eat? Good. Now go home.'",
    ],
  },
  dolores: {
    epithet: "Bombshell", age: "45",
    bio: "Glamorous, deadly, between marriages. Ignatius's ex, Dynamita's mother and the Baron's business partner. It is complicated.",
    intro: "I'm here for the prize money. And maybe closure. Mostly the prize money.",
    taunt: "Darling, try not to bleed on the Valdez rug.",
    victory: "Darling, you were never going to win.",
    defeat: "My mascara! This is a disaster!",
    ending: [
      "Dolores walks off with the prize money, the Eternal Fuse and the best photo of the night.",
      "She ends her partnership with the Baron. He asks about the shared yacht. She sinks it.",
      "Ignatius sends flowers. Dynamita sends a thank-you note. Mama sends a rolling pin.",
      "Tony and Kapow open a restaurant with her winnings. It is called Auntie's. It is very loud.",
      "Dolores lights a cigarette with the Eternal Fuse. The fire marshal has questions.",
    ],
  },
  tony: {
    epithet: "Tick-Tock", age: "30",
    bio: "The Baron's chauffeur and enforcer. Green tracksuit, eleven watches, still late for everything.",
    intro: "Boss said win. Boss also said be on time. I'll do one of them.",
    taunt: "Nothing personal, pal. Just business. And traffic.",
    victory: "Nothing personal. Okay, a little personal.",
    defeat: "I'm late again. The boss is gonna kill me.",
    ending: [
      "Tony wins the tournament. He wipes a tear off his watch.",
      "The Baron fires him over the phone. Tony is thrilled: his first day off since 2009.",
      "Kapow gets Tony's autograph, then asks for a second one, then a hat.",
      "Aunt Dolores wants a cut. Cousin Dynamita wants a rematch. Tony wants a nap.",
      "He is on time for the ceremony at last. Nobody else is. Typical.",
    ],
  },
  fizzle: {
    epithet: "Knight, Sort Of", age: "35",
    bio: "Knight in a bucket helmet. Fired by the Baron, dumped by Dynamita, fizzled by life. Dreams of revenge. Trips a lot.",
    intro: "Today the Baron pays! Right after I find where I parked my horse.",
    taunt: "Have at thee! Wait, which way is thee?",
    victory: "I... won? Wait, really? Did anyone see that?",
    defeat: "At least I fizzled in style.",
    ending: [
      "Sir Fizzle takes off his bucket helmet. The crowd gasps. He has a really nice face.",
      "The Baron begs for mercy. 'You fizzled me first,' says Fizzle, and nobody gets the joke.",
      "Dynamita texts her congratulations. He reads it nine times and walks into a door.",
      "He carries the Eternal Fuse home on his horse. The horse is not impressed.",
      "Knight, champion and, for one night, a man who did not fizzle.",
    ],
  },
  kapow: {
    epithet: "Autograph Hunter", age: "12",
    bio: "Twelve years old. Skateboards in a helmet three sizes too big. Wants everyone's autograph and fights anyway, politely.",
    intro: "I'm here to win and to get autographs. Mostly autographs.",
    taunt: "Excuse me, can you hold still? It's for my collection!",
    victory: "Thanks! Can I get your autograph?",
    defeat: "No fair! I'm telling Tony!",
    ending: [
      "Kid Kapow wins the tournament and skates three victory laps around the arena.",
      "He gets autographs from the whole family. Even Grandpa. Especially Grandpa.",
      "Tony cries into his watches. Aunt Dolores buys him a helmet that fits.",
      "Cousin Dynamita says 'You're a legend.' Kapow says 'Cool, can you sign this?'",
      "The Eternal Fuse is now a skateboard trophy. It is very hard to grind.",
    ],
  },
  gunpowder: {
    epithet: "Ancient Patriarch", age: "dead",
    bio: "Dead, buried and furious about it. The patriarch of the Fuse dynasty, back from the Fuse's backlash with a flaming skull and a beard of smoke.",
    intro: "I have been dead for years. I have a bone to pick. Several.",
    taunt: "Kneel before your ancestor. Then explode.",
    victory: "Back to the grave? Not before dessert.",
    defeat: "Ashes to ashes. Again?",
    ending: [
      "The patriarch of the Fuse dynasty rises, flaming skull held high. The family faints.",
      "'Who ate my dessert?' he asks. Twenty years dead and he still remembers.",
      "Baron confesses everything. Ignatius cries. Mama hits them both with the rolling pin.",
      "The Eternal Fuse is back where it belongs: in a very old, very smoky beard.",
      "Gunpowder returns to his grave, satisfied. The tombstone says 'BRB'.",
    ],
  },
};

// Said by the speaker with that role, {o} = opponent's name. Two variants each.
const TEMPLATES = {
  parent: ["I brought you into this world, {o}, and I can blow you out of it.", "Don't sulk, {o}. This hurts me more than it hurts you."],
  child: ["Sorry, {o}, but you're grounded. In my arena.", "You can't tell me what to do, {o}. Not with a bomb in my hand."],
  sibling: ["I'm still angry about the toy truck, {o}.", "Sibling rivalry, {o}. Let's take it outside. Into a bomb."],
  ex: ["{o}, I hope the breakup was worth it. I certainly am.", "We should talk, {o}. After I win."],
  mentor: ["I taught you everything, {o}. Not everything. I kept the good bombs.", "Class is in session, {o}. Today's lesson: exploding."],
  apprentice: ["Master {o}, I learned from the best. Sadly, that was also the problem.", "I finally graduated, {o}. The diploma is a bomb."],
  cousin: ["Family reunion, {o}! Everyone's invited to get blown up.", "Nothing personal, cousin {o}. Old family tradition."],
  boss: ["You're fired, {o}. After the fight. Maybe.", "Remember who signs your paychecks, {o}."],
  employee: ["Sorry, {o}. I'm clocking out. Permanently.", "This fight is going on your performance review, {o}."],
  spouse: ["{o}, after all these years you still can't dodge.", "Marriage is about compromise, {o}. I compromise: you lose."],
  godparent: ["As your godparent, {o}, I must say: you will lose.", "I only do this because I love you, {o}. And the Fuse."],
  godchild: ["I want all those birthday gifts back, {o}.", "Sorry, {o}. Godchild beats godparent. That's the rule."],
  partner: ["Business is business, {o}. Merger complete. By explosion.", "{o}, our partnership is terminated with extreme prejudice."],
  aunt: ["Auntie loves you, {o}. Auntie also loves winning.", "Don't cry, {o}. Auntie buys ice cream after."],
  nephew: ["Auntie {o}, please be gentle. Or don't. I'm winning anyway.", "Sorry, Auntie {o}. Family is family, but fire is fire."],
  grandparent: ["Come here, {o}. Time to pinch those cheeks. Before the bomb.", "At my age, {o}, all I can do is dodge. Luckily that's plenty."],
  grandchild: ["I don't want to hurt you, {o}. But I will.", "Sorry, {o}. Respect your elders. Also, move."],
  inlaw: ["{o}, I never liked you, and now I have a bomb.", "In-law or outlaw, {o}? I'm about to find out."],
};

// key "a>b": [a's line, b's line]
const SPECIAL = {
  "ignatius>baron": ["Twenty years, Baron. Twenty years since you stole my Fuse and my sock drawer.", "Brother, brother. You always did hold a grudge. And a Fuse. Mostly the Fuse."],
  "dynamita>baron": ["You taught me everything, Godfather! Starting with how to light a fuse. Watch this.", "I taught you, child, so you'd be a worthy opponent for my retirement."],
  "mama>baron": ["Baron Boom, you come here. I did not raise a thief. I raised a tall, ungrateful baby.", "Mother, please. I am sixty-something. And is that the rolling pin?"],
  "ignatius>dolores": ["Dolores. Of all the arenas in all the world, you walk into mine. With him.", "Ignatius. You still owe me for the divorce lawyer. And the sofa."],
  "dynamita>fizzle": ["Fizzle? You still wear that bucket? We broke up two years ago!", "It's a helmet! And you said 'let's stay friends' by throwing a bomb at me."],
  "ignatius>gunpowder": ["Dad?! You've been dead for years! Mom still sets your plate!", "Son. Death was quiet. Then the Fuse called. I never ignore a call."],
  "dynamita>gunpowder": ["Grandpa?! You have a flaming skull! That is so cool!", "Granddaughter. Fire in the blood, I see. Now show me your best bomb."],
  "baron>gunpowder": ["Father! I can explain! It was... a tax thing!", "You stole the Fuse from your own brother. Now I take it back. And your allowance."],
  "mama>gunpowder": ["Gunpowder, you old goat! Twenty years and you don't even call!", "My darling. Ghosts have no signal. Now put down the rolling pin."],
  "dolores>gunpowder": ["Papa-in-law? I'm on the clock. Can this wait until after the divorce?", "Dolores. The family always did have nice cheekbones. Fight me anyway."],
  "tony>gunpowder": ["Uh, sir? You're my boss's dad? Is that smoke or a beard?", "Both. Move along, little watch-wearer, or burn."],
  "fizzle>gunpowder": ["Spooky! But I stood up to the Baron, I can stand up to a skeleton. Sir.", "A fizzled knight challenges me? Delightful. I shall fizzle you further."],
  "kapow>gunpowder": ["Whoa! Can I have your autograph? Is the skull real?", "I sign with fire, kid. Hold still."],
};

// In-fight bubbles, one short line per event (<= 26 chars): first bomb, close call, dying, winning a round.
const FIGHT = {
  ignatius: { bomb: "Fire in the hole, kid!", close: "My good eye! Phew.", die: "Tell Mama I tried.", win: "Old man still got it." },
  dynamita: { bomb: "BOOM time!", close: "Too close! Rude!", die: "Not fair! Rematch!", win: "Bigger bomb next!" },
  baron: { bomb: "Mind the carpet.", close: "Unseemly. Truly.", die: "My monocle!", win: "Exquisite." },
  mama: { bomb: "Rolling pin, assemble!", close: "Too old for this!", die: "Where are my glasses?", win: "Now eat something." },
  dolores: { bomb: "Darling, duck.", close: "My mascara!", die: "Disaster, darling!", win: "Never doubt a diva." },
  tony: { bomb: "Nothing personal.", close: "Watch the suit!", die: "Boss'll kill me...", win: "Told ya. On time." },
  fizzle: { bomb: "Have at thee!", close: "Where did that come from?", die: "I fizzled. Again.", win: "I... won? Really?" },
  kapow: { bomb: "Sign here, please!", close: "Eek! My helmet!", die: "Telling Tony!", win: "Autograph please!" },
  gunpowder: { bomb: "Rise and explode.", close: "I'm already dead!", die: "BRB. Back to the grave.", win: "Back to your grave." },
};
export const fightLine = (id, ev) => FIGHT[id]?.[ev] ?? null;

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const fill = (t, o) => t.replace("{o}", o);

// [a's line, b's line]
export function banter(a, b) {
  if (SPECIAL[`${a}>${b}`]) return SPECIAL[`${a}>${b}`];
  if (SPECIAL[`${b}>${a}`]) return [...SPECIAL[`${b}>${a}`]].reverse();
  const r = relation(a, b);
  if (!r) return [TEXT[a].taunt, TEXT[b].taunt];
  return [fill(TEMPLATES[r.roles[0]][hash(a + b) % 2], BY_ID[b].name), fill(TEMPLATES[r.roles[1]][hash(b + a) % 2], BY_ID[a].name)];
}
export const TEMPLATE_ROLES = Object.keys(TEMPLATES);

// Co-op: what each opponent says when two heroes walk in, and the sidekick's lines (picked by hash, same every time).
export const DUO = {
  ignatius: "Two of you? I only brought one good eye. You'll have to share.",
  dynamita: "Two of you? Fine, double the fuse!",
  baron: "A pair of pests. Do try to explode in an orderly queue.",
  mama: "Two? Sit down, both of you. There's enough rolling pin for everyone.",
  dolores: "Two of you, darling? I charge by the head.",
  tony: "Two of you? Boss never said anything about doubles.",
  fizzle: "Two heroes! Wait, which one's the hero? Is one of you my horse?",
  kapow: "Two autographs at once? Oh no, sorry, fighting. Fighting!",
  gunpowder: "Two descendants. I lit a double fuse just for you. Don't touch it.",
};
const SIDE = [
  "I'm Sparky! I carry the bombs and the opinions.",
  "Don't worry, I brought snacks and a fire extinguisher. Mostly snacks.",
  "Second player reporting! Please don't blow me up. Much.",
  "I call dibs on the shiny power-ups. And the blame.",
];
export const SIDE_CHEER = ["We did it! Did we do it? We did it!", "High five! Careful, it's hot."];
export const SIDE_LOSE = ["Okay, that one was my fault. And yours. Mostly mine.", "Can we blame the lag? There is no lag. Still."];
export const sideLine = (id) => SIDE[hash(id) % SIDE.length];
export const sideCheer = (id) => SIDE_CHEER[hash(id) % 2];
export const sideLose = (id) => SIDE_LOSE[hash(id) % 2];

// Choices: {foe} = the next opponent, {prev} = the one just beaten, {me} = your fighter. res[k] answers option k.
export const CHOICE_TEXT = {
  vendor: {
    title: "Street vendor", text: "A vendor waves a fuse at you. 'Lucky! Only slightly cursed!'",
    opts: ["Buy the lucky fuse", "Politely decline"],
    res: ["It sparks happily. The next arena is stuffed with bricks and goodies.", "He gives you a sticker anyway. You feel warm. Suspiciously warm."],
  },
  spare: {
    title: "Down for the count", text: "{prev} is flat on the floor, helmet spinning. The crowd wants a show.",
    opts: ["Help {prev} up", "Swipe their snacks"],
    res: ["{prev} grins: 'I'll put in a good word with {foe}.' Nice.", "Crunchy! {prev} will remember this. {foe} will remember the crumbs."],
  },
  path: {
    title: "Fork in the road", text: "Three corridors and one sign: 'To the arena (probably)'.",
    opts: ["Slippery shortcut", "Fireworks alley", "Boring main road"],
    res: ["Wheee! Snow, ice and a mild sense of regret.", "Special bombs and a night sky. Someone left the fireworks unlocked.", "Nobody is here. No crowd, no loot, no fuss."],
  },
  bribe: {
    title: "An envelope", text: "{foe}'s agent slides you an envelope. 'Take the day off, champ.'",
    opts: ["Take the envelope", "Refuse, loudly"],
    res: ["Cash! {foe} hears about it and trains all night, out of spite.", "The crowd cheers. The agent weeps. Your pockets stay empty and your head stays high."],
  },
  riddle: {
    title: "The janitor's riddle", text: "A janitor blocks the door. 'I have a short fuse and a long list of regrets. What am I?'",
    opts: ["A candle", "A family reunion", "Uncle Baron"],
    res: ["'Candles have no regrets,' he sighs, and mops your hopes.", "Correct! He hands you a map to the best loot spots.", "'He has regrets, but no fuse,' he sighs. Wrong, and the mop is wet."],
  },
  lunch: {
    title: "Mama's lunch box", text: "Mama pushes a lunch box into your hands. It hums slightly.",
    opts: ["Eat it all", "Share with {foe}", "Sell it, no questions"],
    res: ["Delicious. Explosive. You now burp special bombs.", "{foe} cries a little and goes easy on you. Mama approves from afar.", "A stranger pays double. Mama hears of it. Mama always hears of it."],
  },
  fuse: {
    title: "The Eternal Fuse", text: "It glows. The crowd leans in. {foe} twitches.",
    opts: ["Grab it", "Share it", "Toss it to the crowd"],
    res: ["It is warm. Too warm. The arena starts misbehaving.", "You hold it together, with both hands. Everyone sighs, relieved.", "A grandma catches it. Chaos erupts. The loot rains down."],
  },
};

export const ENDING_TEXT = {
  champion: { title: "Family Champion", note: "Finish the story with anyone." },
  flawless: {
    title: "Flawless", note: "No continues, no lost rounds.",
    lines: [
      "Not one continue. Not one round dropped. The scoreboard weeps with joy.",
      "The Baron reviews the footage for cheating. He finds only talent and is furious.",
      "Mama frames the scoreboard and hangs it in the kitchen, above the rolling pin.",
      "A trophy is awarded. It is slightly on fire. Nobody mentions it.",
      "Somewhere, a bomb files a complaint about being dodged. It is denied.",
    ],
  },
  peace: {
    title: "Peacemaker", note: "Be kind in three choices.",
    lines: [
      "You never had to win the argument. You just kept being nice, which is terrifying.",
      "The whole family sits at one table. Nobody holds a bomb. Several hold a fork.",
      "Ignatius and Baron share the last dumpling. The Eternal Fuse lights a candle.",
      "Gunpowder sighs from the grave: 'So that's what dinner is for.'",
      "Mama calls it the best tournament ever. Nothing exploded. She is suspicious.",
    ],
  },
  tycoon: {
    title: "Tycoon", note: "Take the money in three choices.",
    lines: [
      "Every envelope, snack and lucky fuse adds up. You own the arena.",
      "The Baron is hired as head of security. He asks to be paid in monocles.",
      "Tickets cost one bomb each. Popcorn costs two. Fire insurance is a rumour.",
      "Dolores offers a merger. You counter with a bigger one.",
      "Your face is on the poster, the cup and one very expensive fuse. Cha-ching goes boom.",
    ],
  },
};

export const fillText = (t, v) => t.replace(/\{(foe|prev|me)\}/g, (_, k) => v[k] ?? "");
