/*
 * Check In — tools/sim.js
 * ------------------------------------------------------------------
 * Headless bot-vs-bot balance simulator. No browser needed.
 *
 *   node tools/sim.js           → 200 games
 *   node tools/sim.js 500       → 500 games
 *
 * What it measures (and why):
 *   - score distribution per round  → are rounds worth escalating amounts?
 *   - strategy mix                  → does the game reward mixing self-care
 *                                     with help-seeking? (the core lesson)
 *   - trade uptake                  → is the trade mechanic actually used?
 *   - symptom impact                → which community cards swing scores
 *                                     hardest (delta vs not-on-board)?
 *   - card contributions            → which toolkit cards over/under-perform?
 *
 * Findings and any value changes they prompt are recorded in
 * BALANCE_CHANGELOG.md at the repo root.
 */
'use strict';

var GAMES = parseInt(process.argv[2], 10);
if (!GAMES || GAMES < 1) GAMES = 200;

require('../js/config.js');
require('../js/data/cards.js');
require('../js/engine/scoring.js');
require('../js/engine/deck.js');
require('../js/engine/round.js');
require('../js/ai/bots.js');

var CheckIn = globalThis.CheckIn;

/* ---- collectors -------------------------------------------------------- */
var roundScores = [[], [], []];            // scores by round index
var handStats = { hands: 0, helpCards: 0, selfCareCards: 0, handsWithHelp: 0, handsAllHelp: 0, handsAllSelfCare: 0 };
var tradeStats = { games: 0, trades: 0, playersTrading: 0, playerSlots: 0 };
var symptomStats = {};                     // id -> { present: [], absent: [] }
var cardStats = {};                        // id -> { plays, chips, mult, handScores }
var winnerBanks = [];

CheckIn.SYMPTOM_CARDS.forEach(function (s) { symptomStats[s.id] = { present: [], absent: [], name: s.name }; });
CheckIn.TOOLKIT_CARDS.forEach(function (c) {
  cardStats[c.id] = { plays: 0, chips: 0, mult: 0, handScores: [], name: c.name };
});

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  var idx = Math.min(sortedArr.length - 1, Math.floor(p * sortedArr.length));
  return sortedArr[idx];
}
function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
function fmt(n) { return Math.round(n * 10) / 10; }

/* ---- run games ---------------------------------------------------------- */
var t0 = Date.now();
for (var g = 0; g < GAMES; g++) {
  var game = new CheckIn.Game({ players: [
    { name: 'Bot A', isBot: true }, { name: 'Bot B', isBot: true }, { name: 'Bot C', isBot: true },
  ] });

  tradeStats.games += 1;
  var tradedPlayers = 0;
  game.players.forEach(function (p) {
    tradeStats.playerSlots += 1;
    var tradedBefore = p.tradesThisRound;
    // track per-player trade participation via stats delta after the game
  });

  while (!game.isOver) {
    var roundIdx = game.round;
    game.startRound();
    game.players.forEach(function (_, i) { game.botAct(i); });  // ACTION_1
    game.players.forEach(function (_, i) { game.botAct(i); });  // ACTION_2
    var boardIds = game.community.map(function (c) { return c.def.id; });
    game.players.forEach(function (_, i) { game.botPlayHand(i); });

    game.players.forEach(function (p) {
      var r = p.lastResult;
      roundScores[roundIdx].push(r.score);
      handStats.hands += 1;
      var help = 0, self = 0;
      r.cardScores.forEach(function (cs) {
        var st = cardStats[cs.defId];
        st.plays += 1; st.chips += cs.chips; st.mult += cs.mult; st.handScores.push(r.score);
        if (CheckIn.cardById(cs.defId).type === 'helpseeking') help += 1; else self += 1;
      });
      handStats.helpCards += help;
      handStats.selfCareCards += self;
      if (help > 0) handStats.handsWithHelp += 1;
      if (help === 4) handStats.handsAllHelp += 1;
      if (self === 4) handStats.handsAllSelfCare += 1;

      CheckIn.SYMPTOM_CARDS.forEach(function (s) {
        if (boardIds.indexOf(s.id) !== -1) symptomStats[s.id].present.push(r.score);
        else symptomStats[s.id].absent.push(r.score);
      });
    });
    game.finishRound();
  }

  tradeStats.trades += game.stats.trades;
  game.players.forEach(function (p) { if (game.stats.trades > 0 && p.tradesThisRound > 0) tradedPlayers += 1; });
  winnerBanks.push(game.ranking()[0].bank);
}

/* ---- report -------------------------------------------------------------- */
function line() { process.stdout.write('─'.repeat(72) + '\n'); }

process.stdout.write('\nCHECK IN — balance simulation report\n');
line();
process.stdout.write('games: ' + GAMES + '   players: 3 bots   rounds: 3   (' +
  handStats.hands + ' hands scored in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)\n');

process.stdout.write('\n■ Score per round (all hands)\n');
roundScores.forEach(function (arr, i) {
  var s = arr.slice().sort(function (a, b) { return a - b; });
  process.stdout.write('  Round ' + (i + 1) + ':  avg ' + fmt(avg(s)) +
    '   median ' + percentile(s, 0.5) +
    '   p10 ' + percentile(s, 0.10) + ' … p90 ' + percentile(s, 0.90) + '\n');
});

process.stdout.write('\n■ Strategy mix (per 4-card hand)\n');
process.stdout.write('  avg help-seeking cards: ' + fmt(handStats.helpCards / handStats.hands) +
  '   avg self-care cards: ' + fmt(handStats.selfCareCards / handStats.hands) + '\n');
process.stdout.write('  hands with ≥1 help card: ' + fmt(100 * handStats.handsWithHelp / handStats.hands) + '%' +
  '   all-help: ' + fmt(100 * handStats.handsAllHelp / handStats.hands) + '%' +
  '   all-self-care: ' + fmt(100 * handStats.handsAllSelfCare / handStats.hands) + '%\n');

process.stdout.write('\n■ Trading\n');
process.stdout.write('  trades per game: ' + fmt(tradeStats.trades / tradeStats.games) +
  '   (max possible ≈ ' + (3 * 2 * 2) + ' offers across 2 action phases × 3 players)\n');

process.stdout.write('\n■ Symptom impact (avg hand score when on the board vs not)\n');
var symRows = CheckIn.SYMPTOM_CARDS.map(function (s) {
  var st = symptomStats[s.id];
  return { id: s.id, name: st.name, delta: avg(st.present) - avg(st.absent),
    present: avg(st.present), n: st.present.length };
}).sort(function (a, b) { return b.delta - a.delta; });
symRows.forEach(function (r) {
  process.stdout.write('  ' + r.id + ' ' + (r.name + ' '.repeat(28)).slice(0, 28) +
    (r.delta >= 0 ? '+' : '') + fmt(r.delta) + '   (' + fmt(r.present) + ' when present)\n');
});

process.stdout.write('\n■ Toolkit cards (sorted by avg hand score when played)\n');
var cardRows = CheckIn.TOOLKIT_CARDS.map(function (c) {
  var st = cardStats[c.id];
  return { id: c.id, name: st.name, plays: st.plays,
    chips: st.plays ? st.chips / st.plays : 0, mult: st.plays ? st.mult / st.plays : 0,
    hand: avg(st.handScores) };
}).sort(function (a, b) { return a.hand - b.hand; });
cardRows.forEach(function (r) {
  process.stdout.write('  ' + r.id + ' ' + (r.name + ' '.repeat(38)).slice(0, 38) +
    'plays ' + (r.plays + ''.padEnd(5)).slice(0, 5) +
    'chips ' + (fmt(r.chips) + '    ').slice(0, 7) +
    'mult ' + (fmt(r.mult) + '    ').slice(0, 6) +
    'hand ' + fmt(r.hand) + '\n');
});

process.stdout.write('\n■ Winner banks: avg ' + fmt(avg(winnerBanks)) +
  '   min ' + percentile(winnerBanks.slice().sort(function (a, b) { return a - b; }), 0) +
  '   max ' + percentile(winnerBanks.slice().sort(function (a, b) { return a - b; }), 0.999) + '\n');
line();
process.stdout.write('Tuning rule of thumb: flag cards whose avg-hand score sits far from the\n');
process.stdout.write('pack, and symptoms with |delta| > ~25. Log every change in BALANCE_CHANGELOG.md.\n\n');
