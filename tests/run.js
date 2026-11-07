/*
 * Check In — tests/run.js
 * ------------------------------------------------------------------
 * Zero-dependency unit tests for the game engine.
 * Run:  node tests/run.js      (from the repo root)
 *
 * Every expected value below was computed BY HAND from the design spec,
 * so a failing test means the engine drifted from the agreed rules.
 */
'use strict';

/* ---- tiny test harness ------------------------------------------------ */
var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; process.stdout.write('  ok  ' + name + '\n'); }
  catch (e) { failed++; failures.push({ name: name, err: e }); process.stdout.write('FAIL  ' + name + '  → ' + e.message + '\n'); }
}
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || 'eq') + ': expected ' + b + ', got ' + a);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy'); }

/* ---- load the game (plain scripts attach to globalThis) --------------- */
require('../js/config.js');
require('../js/data/cards.js');
require('../js/engine/scoring.js');
require('../js/engine/deck.js');
require('../js/engine/round.js');
require('../js/ai/bots.js');

var CheckIn = globalThis.CheckIn;
var S = CheckIn.Scoring;

/* ---- helpers ----------------------------------------------------------- */
var uidCounter = {};
function inst(id) {  // unique instance of a card definition
  uidCounter[id] = (uidCounter[id] || 0) + 1;
  return { uid: id + '#' + uidCounter[id], def: CheckIn.cardById(id) };
}
function hand(ids) { return ids.map(inst); }
function boardOf(ids) { return ids.map(function (id) { return { uid: id, def: CheckIn.cardById(id) }; }); }
function score(playedIds, boardIds, trades) {
  return S.scoreHand({ played: hand(playedIds), board: boardOf(boardIds), trades: trades || 0 });
}

process.stdout.write('\n=== SCORING: base rules ===\n');

test('empty hand scores 0 (chips 0, mult 1)', function () {
  var r = score([], []);
  eq(r.chips, 0); eq(r.mult, 1); eq(r.score, 0);
});

test('single self-care card: chips only', function () {
  var r = score(['T01'], []);         // 8 Hours of Sleep, BODY, +12
  eq(r.chips, 12); eq(r.mult, 1); eq(r.score, 12);
});

test('single help-seeking card: mult only, zero chips → 0 score', function () {
  var r = score(['T19'], []);         // Peer Support Group, +3 Mult
  eq(r.chips, 0); eq(r.mult, 4); eq(r.score, 0);
});

test('mixed hand: (12+8 chips) × (1+2+3 mult) = 120', function () {
  var r = score(['T01', 'T15', 'T19'], []);  // 12 chips, Vent 4+4 chips, +2/+3 mult
  eq(r.chips, 20); eq(r.mult, 6); eq(r.score, 120);
});

test('trade bonus: +2 per trade, capped at 2 stacks (+4)', function () {
  eq(score(['T01'], [], 0).mult, 1);
  eq(score(['T01'], [], 1).mult, 3);
  eq(score(['T01'], [], 2).mult, 5);
  eq(score(['T01'], [], 5).mult, 5, 'stacks beyond 2 give no extra bonus');
});

/* ---------------------------------------------------------------------- */
process.stdout.write('\n=== SCORING: symptom cards (debuff + recognition bonus) ===\n');

test('S01 Burnout: ACADEMIC cards zeroed; +5 per BODY/MIND', function () {
  var r = score(['T12', 'T01', 'T06'], ['S01']);  // Pomodoro(ACAD 9→0), Sleep(12), Journal(9)
  eq(r.chips, 0 + 12 + 9 + 10);
  eq(r.score, 31);
});

test('S02 Panic: −5 chips flat; +2 mult if a MIND card is played', function () {
  eq(score(['T01'], ['S02']).chips, 7);
  var r = score(['T01', 'T06'], ['S02']);
  eq(r.chips, 12 + 9 - 5); eq(r.mult, 3);
});

test('S02 Panic: chips floor at 0 (empty hand)', function () {
  eq(score([], ['S02']).chips, 0);
});

test('S03 Isolation: no SOCIAL → −2 mult but floored at 1×', function () {
  var r = score(['T01', 'T06'], ['S03']);
  eq(r.mult, 1); eq(r.score, 21);
});

test('S03 Isolation: each SOCIAL gives +5 chips and +1 mult', function () {
  var r = score(['T01', 'T06', 'T10'], ['S03']);   // T10 Call Family, SOCIAL 9
  eq(r.chips, 12 + 9 + 9 + 5); eq(r.mult, 2); eq(r.score, 70);
});

test('S04 All-Nighter: MIND/ACADEMIC −3 chips; +8 per BODY (T13 also pairs with MIND)', function () {
  var r = score(['T06', 'T13', 'T01'], ['S04']);   // 9−3, 8−3+4 (own bonus), 12
  eq(r.chips, 6 + 9 + 12 + 8); eq(r.score, 35);
});

test('S05 Imposter: self-care alone capped at 15 chips', function () {
  var r = score(['T01', 'T06', 'T04', 'T08'], ['S05']);  // 41 raw chips
  eq(r.chips, 15); eq(r.mult, 1); eq(r.score, 15);
});

test('S05 Imposter: any help card → +10 chips, no cap', function () {
  var r = score(['T01', 'T06', 'T04', 'T19'], ['S05']);
  eq(r.chips, 12 + 9 + 10 + 10); eq(r.mult, 4); eq(r.score, 164);
});

test('S06 Conflict: ACADEMIC −2 chips; +3 mult if traded (stacks with trade bonus)', function () {
  var r = score(['T12'], ['S06'], 1);
  eq(r.chips, 9); eq(r.mult, 1 + 3 + 2); eq(r.score, 54);
});

test('S07 Bottling: no help → mult locked at 1 even with trades', function () {
  var r = score(['T01', 'T06'], ['S07'], 2);
  eq(r.mult, 1); eq(r.score, 21);
});

test('S07 Bottling: +2 mult per help card played', function () {
  var r = score(['T01', 'T19'], ['S07'], 2);       // T19 +3, S07 +2, trade +4
  eq(r.mult, 1 + 3 + 2 + 4); eq(r.score, 120);
});

test('S08 Doomscroll: FIRST card zeroed; 3+ suits → +15', function () {
  var a = score(['T01', 'T06', 'T10', 'T04'], ['S08']);   // first = Sleep(12)
  eq(a.chips, 0 + 9 + 9 + 10 + 15, 'first card zeroed');
  var b = score(['T06', 'T01', 'T10', 'T04'], ['S08']);   // first = Journal(9)
  eq(b.chips, 0 + 12 + 9 + 10 + 15, 'selection order changes the sacrifice');
  ok(b.score > a.score, 'sacrificing the cheapest card first scores higher');
});

test('S08 Doomscroll: 2 suits only → no +15', function () {
  var r = score(['T01', 'T04', 'T06', 'T08'], ['S08']);   // BODY, BODY, MIND, MIND
  eq(r.chips, 0 + 10 + 9 + 10);
});

test('S09 Life Stress: self-care −2 each; WILD professional help → +4 mult', function () {
  eq(score(['T01', 'T06'], ['S09']).chips, 10 + 7);
  var r = score(['T01', 'T06', 'T21'], ['S09']);          // T21 Wellbeing, WILD +4 mult
  eq(r.chips, 10 + 7); eq(r.mult, 1 + 4 + 4); eq(r.score, 153);
});

test('S10 Slump: +8 per matching-suit pair (2+2 suits = 2 pairs)', function () {
  var r = score(['T01', 'T04', 'T06', 'T08'], ['S10']);   // BB MM
  eq(r.chips, 12 + 10 + 9 + 10 + 16);
});

test('S10 Slump: 3+1 suits = 1 pair only', function () {
  var r = score(['T01', 'T04', 'T06', 'T10'], ['S10']);   // B B M S
  eq(r.chips, 12 + 10 + 9 + 9 + 8);
});

test('stacked debuffs: S04 + S06 both hit ACADEMIC (11−3−2=6)', function () {
  eq(score(['T12'], ['S04', 'S06']).chips, 6);
});

/* ---------------------------------------------------------------------- */
process.stdout.write('\n=== SCORING: toolkit card bonuses ===\n');

test('T02 Morning Walk: +4 with a MIND card', function () {
  eq(score(['T02', 'T06'], []).chips, 8 + 4 + 9);
  eq(score(['T02'], []).chips, 8);
});
test('T03 Cook a Meal: +4 with a SOCIAL card', function () {
  eq(score(['T03', 'T10'], []).chips, 8 + 4 + 9);
});
test('T05 Box Breathing: +1 mult when S02 is on the board (and counts as the MIND card for S02)', function () {
  var r = score(['T05'], ['S02']);
  eq(r.chips, 8 - 5); eq(r.mult, 1 + 2 + 1, 'S02 recognition +2 AND T05 bonus +1');
});
test('T07 Digital Detox: +6 with a BODY card', function () {
  eq(score(['T07', 'T01'], []).chips, 7 + 6 + 12);
});
test('T09 Mamak: +5 chips if you traded', function () {
  var r = score(['T09'], [], 1);
  eq(r.chips, 13); eq(r.mult, 3);
});
test('T11 Club Event: +3 per OTHER social card', function () {
  eq(score(['T11', 'T10', 'T09'], []).chips, 7 + 6 + 9 + 8);
  eq(score(['T11'], []).chips, 7);
});
test('T13 Small Steps: +4 with a MIND card', function () {
  eq(score(['T13', 'T06'], []).chips, 8 + 4 + 9);
});
test('T15 Vent: +4 chips on top of +2 mult', function () {
  var r = score(['T15'], []);
  eq(r.chips, 8); eq(r.mult, 3);
});
test('T16 Study Group: +2 mult with another ACADEMIC', function () {
  eq(score(['T16', 'T12'], []).mult, 5);
  eq(score(['T16'], []).mult, 3);
});
test('T17 Workout Buddy: +2 mult with another BODY', function () {
  eq(score(['T17', 'T01'], []).mult, 5);
});
test('T18 Check In on a Friend: +1 base, +3 if traded', function () {
  eq(score(['T18'], [], 0).mult, 2);
  eq(score(['T18'], [], 1).mult, 1 + 3 + 2);
});
test('T20 Personal Tutor: ignores ACADEMIC symptom debuffs (S01)', function () {
  var r = score(['T20', 'T12'], ['S01']);   // Pomodoro NOT zeroed
  eq(r.chips, 11); eq(r.mult, 4);
});
test('T20 Personal Tutor: ignores ACADEMIC-category symptoms only — S06 is SOCIAL, S04 is BODY', function () {
  eq(score(['T20', 'T12'], ['S06']).chips, 9, 'S06 is a SOCIAL symptom → its −2 applies');
  eq(score(['T20', 'T12'], ['S04']).chips, 8, 'S04 is a BODY symptom → applies');
});
test('T22 Counselling: clears every CHIP debuff (S02 −5, S04 −3 gone; wild picks BODY for +8)', function () {
  var r = score(['T22', 'T06'], ['S02', 'S04']);
  eq(r.chips, 9 + 8, 'no −5, no −3, S04 recognition +8'); eq(r.mult, 1 + 5 + 2);
});
test('T22 Counselling: does NOT clear the S03 mult debuff (wild pinned to MIND)', function () {
  var pinned = {};
  pinned[hand(['T22'])[0].uid] = 'MIND';
  var r = S.scoreHand({ played: hand(['T22', 'T01']), board: boardOf(['S03']), trades: 0, wildAssign: pinned });
  eq(r.mult, 1 + 5 - 2, 'S03 −2 applies even with Counselling in play');
});
test('T23 Helpline: +3 mult and +5 chips', function () {
  var r = score(['T23'], []);
  eq(r.chips, 10); eq(r.mult, 4);
});
test('T24 Health Centre: +4 mult with another BODY card, else +2', function () {
  eq(score(['T24', 'T01'], []).mult, 1 + 4);
  eq(score(['T24'], []).mult, 1 + 2);
});

/* ---------------------------------------------------------------------- */
process.stdout.write('\n=== SCORING: WILD suit resolution (counts as any suit) ===\n');

test('WILD completes 3+ suits for S08 (assigned BODY/ACADEMIC)', function () {
  var r = score(['T21', 'T06', 'T10'], ['S08']);   // first=T21(0 chips anyway)
  eq(r.chips, 0 + 9 + 9 + 15);
});
test('WILD counts as SOCIAL for S03 (bonus, and avoids isolation)', function () {
  var r = score(['T21'], ['S03']);
  eq(r.chips, 5); eq(r.mult, 1 + 4 + 1); eq(r.score, 30);
});
test('WILD completes a pair for S10', function () {
  eq(score(['T21', 'T01'], ['S10']).chips, 12 + 8);
});
test('WILD counts as BODY for S04 recognition', function () {
  var r = score(['T21', 'T06'], ['S04']);   // wild→BODY: +8 chips; T06 −3
  eq(r.chips, 9 - 3 + 8);
});
test('two WILDs resolve independently (both SOCIAL for S03)', function () {
  var r = score(['T21', 'T23'], ['S03']);   // both SOCIAL: +5+5 chips, +1+1 mult
  eq(r.chips, 10 + 10); eq(r.mult, 1 + 4 + 3 + 2);
});
test('professional-help check uses DEFINED suit even when assigned (S09)', function () {
  var r = score(['T21'], ['S09']);   // T21 assigned to any suit — still pro help
  eq(r.mult, 1 + 4 + 4);
});

/* ---------------------------------------------------------------------- */
process.stdout.write('\n=== SCORING: bestPlay (bot showdown logic) ===\n');

test('bestPlay picks help card into Imposter Syndrome board', function () {
  var best = S.bestPlay(hand(['T01', 'T04', 'T08', 'T06', 'T19', 'T12']), boardOf(['S05']), 0);
  eq(best.result.score, 172); // Sleep+Gym+Pomodoro = 33 chips +10, ×(1+3 T19)
  ok(best.cards.some(function (c) { return c.def.id === 'T19'; }), 'must include T19');
});

test('bestPlay handles S08 by sacrificing the cheapest card first', function () {
  var best = S.bestPlay(hand(['T01', 'T06', 'T10', 'T04', 'T12', 'T08']), boardOf(['S08']), 0);
  eq(best.result.score, 48);              // 12+10+11 survive, +15, cheapest zeroed
  eq(best.cards[0].def.id, 'T06', 'Journal (9) is sacrificed, not Sleep (12) or Pomodoro (11)');
});

test('bestPlay respects trade bonus in evaluation', function () {
  var h = hand(['T01', 'T04', 'T08', 'T06', 'T19', 'T12']);
  var b0 = S.bestPlay(h, boardOf(['S05']), 0);
  var b2 = S.bestPlay(h, boardOf(['S05']), 2);
  ok(b2.result.score > b0.result.score);
});

/* ---------------------------------------------------------------------- */
process.stdout.write('\n=== DECK & ROUND STATE MACHINE ===\n');

(function () {
  var Deck = CheckIn.Deck;

  function newGame() {
    return new CheckIn.Game({ players: [
      { name: 'You', isBot: true }, { name: 'Aiman', isBot: true }, { name: 'Balqis', isBot: true },
    ] });
  }

  test('toolkit deck: 48 cards, 24 uniques × 2 copies', function () {
    var d = new Deck.ToolkitDeck();
    eq(d.remaining(), 24 * 2);
    var seen = {};
    d.peekAll().forEach(function (c) { seen[c.def.id] = (seen[c.def.id] || 0) + 1; });
    var ids = Object.keys(seen);
    eq(ids.length, 24);
    ids.forEach(function (id) { eq(seen[id], 2, id + ' appears twice'); });
  });

  test('community deck: 10 symptoms, no duplicates within a round draw', function () {
    var d = new Deck.CommunityDeck();
    eq(d.pile.length, 10);
    var drawn = [];
    for (var i = 0; i < 5; i++) drawn.push(d.draw().def.id);
    eq(new Set(drawn).size, 5, 'all five community cards unique');
  });

  test('toolkit deck reshuffles discards when exhausted', function () {
    var d = new Deck.ToolkitDeck();
    var discards = [];
    while (d.remaining() > 0) discards.push(d.draw());
    eq(d.remaining(), 0);
    d.discard(discards.slice(0, 10));
    ok(d.draw() !== null, 'draws again after reshuffle');
  });

  test('game setup: 3 players, banks at 0, round 0', function () {
    var g = newGame();
    eq(g.players.length, 3);
    eq(g.round, 0);
    g.players.forEach(function (p) { eq(p.bank, 0); });
  });

  test('startRound: 6-card hands, 3-card flop, fresh trade credit', function () {
    var g = newGame();
    g.startRound();
    eq(g.state, 'ACTION_1');
    g.players.forEach(function (p) { eq(p.hand.length, 6); });
    eq(g.community.length, 3);
    g.players.forEach(function (p) { eq(p.tradesThisRound, 0); });
    var ids = g.community.map(function (c) { return c.def.id; });
    eq(new Set(ids).size, 3, 'flop has no duplicate symptoms');
  });

  test('state machine: action phases auto-deal Turn and River', function () {
    var g = newGame();
    g.startRound();
    eq(g.state, 'ACTION_1');
    g.doReroll(0, [g.players[0].hand[0].uid]);
    eq(g.state, 'ACTION_1', 'phase waits for every player to act');
    g.botAct(1); g.botAct(2);
    eq(g.state, 'ACTION_2', 'Turn dealt automatically after all players act');
    eq(g.community.length, 4);
    g.doReroll(0, []); g.botAct(1); g.botAct(2);
    eq(g.state, 'SHOWDOWN', 'River dealt automatically');
    eq(g.community.length, 5);
    g.botPlayHand(0); g.botPlayHand(1); g.botPlayHand(2);
    eq(g.state, 'SCORING', 'all hands played');
    g.finishRound();
    eq(g.round, 1);
    ok(g.players.some(function (p) { return p.bank > 0; }), 'someone banked chips');
  });

  test('reroll: discards selected cards and draws the same count', function () {
    var g = newGame();
    g.startRound();
    var p = g.players[0];
    var goneUids = p.hand.slice(0, 2).map(function (c) { return c.uid; });
    g.doReroll(0, goneUids);
    eq(p.hand.length, 6);
    goneUids.forEach(function (uid) {
      ok(!p.hand.some(function (c) { return c.uid === uid; }), uid + ' discarded');
    });
  });

  test('reroll is once per action phase (second attempt rejected)', function () {
    var g = newGame();
    g.startRound();
    g.doReroll(0, [g.players[0].hand[0].uid]);
    var threw = false;
    try { g.doReroll(0, [g.players[0].hand[0].uid]); } catch (e) { threw = true; }
    ok(threw, 'engine refuses a second action in the same phase');
  });

  test('trade: swaps cards and gives BOTH players trade credit', function () {
    var g = newGame();
    g.startRound();
    var a = g.players[0], b = g.players[1];
    var give = a.hand[0], take = b.hand[0];
    g.doTrade(0, 1, give.uid, take.uid);
    ok(a.hand.some(function (c) { return c.uid === take.uid; }), 'receiver got the card');
    ok(b.hand.some(function (c) { return c.uid === give.uid; }), 'initiator passed the card on');
    eq(a.tradesThisRound, 1); eq(b.tradesThisRound, 1);
    var r = S.scoreHand({ played: [a.hand[0]], board: [], trades: a.tradesThisRound });
    eq(r.mult, 3, '1× base + 2× trade bonus');
  });

  test('trade credit stacks to a maximum of 2 per round (initiate + receive)', function () {
    var g = newGame();
    g.startRound();
    g.doTrade(0, 1, g.players[0].hand[0].uid, g.players[1].hand[0].uid);   // 0 initiates
    g.doTrade(2, 0, g.players[2].hand[0].uid, g.players[0].hand[0].uid);   // 0 receives (free)
    eq(g.players[0].tradesThisRound, 2);
    var r = S.scoreHand({ played: [g.players[0].hand[0]], board: [], trades: g.players[0].tradesThisRound });
    eq(r.mult, 5, '1× + 2×2 trade');
  });

  test('full 3-round game completes and produces a sorted ranking', function () {
    var g = newGame();
    g.playFullGameBotVsBot();
    eq(g.isOver, true);
    eq(g.state, 'GAME_OVER');
    var total = g.players.reduce(function (s, p) { return s + p.bank; }, 0);
    ok(total > 0, 'chips were banked');
    var ranking = g.ranking();
    eq(ranking.length, 3);
    ok(ranking[0].bank >= ranking[1].bank && ranking[1].bank >= ranking[2].bank, 'sorted');
  });

  test('per-game stats track trades and help-seeking plays', function () {
    var g = newGame();
    g.playFullGameBotVsBot();
    ok(g.stats.trades > 0, 'trades counted');
    ok(g.stats.helpCardsPlayed > 0, 'help-seeking plays counted');
  });
})();

/* ---- summary ----------------------------------------------------------- */
process.stdout.write('\n=======================================\n');
process.stdout.write(passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) {
  failures.forEach(function (f) { process.stdout.write('  ✗ ' + f.name + ': ' + f.err.message + '\n'); });
  process.exit(1);
}
process.stdout.write('ALL TESTS PASS ✔\n\n');
