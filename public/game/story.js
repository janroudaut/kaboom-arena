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
