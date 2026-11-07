/*
 * Check In — js/ai/bots.js
 * ------------------------------------------------------------------
 * Deliberately simple, well-documented bot brains. The MVP goal is a
 * reliable demo opponent, not a research project — every rule below is
 * a clear heuristic your dev friend can upgrade in isolation.
 *
 * Trade behaviour (spec: "program the bot to always accept trades once
 * per round so the judges can easily test the mechanic"):
 *   - Bots ACCEPT every incoming trade offer (accepting is free anyway).
 *   - Bots INITIATE a trade with probability BOT_TRADE_CHANCE (phase 1) /
 *     BOT_TRADE_CHANCE_2 (phase 2), at most once per round each.
 *     Target is a random other player — if that's the human, the engine
 *     returns a pendingOffer and the UI shows the accept/decline modal.
 *
 * Card evaluation heuristic (cheap, good enough for the MVP):
 *   Standalone value of a card = scoreHand([that card]).score on the
 *   current board. For reroll/trade-give decisions we protect the four
 *   cards that appear in the bot's best 4-of-6 (Scoring.bestPlay) and
 *   order the leftovers by standalone value.
 *
 * Showdown: no heuristics — the bot enumerates every 4-of-6 combination
 * (and every "first card" when Doomscrolling is on the board) and plays
 * the mathematically best hand. See Scoring.bestPlay.
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var CONFIG = CheckIn.CONFIG;

  function standaloneValue(game, card) {
    return CheckIn.Scoring.scoreHand({
      played: [card], board: game.community, trades: 0,
    }).score;
  }

  /* The two cards a bot would happily let go: everything NOT in its best
   * 4-of-6, ordered by standalone value (weakest first). */
  function spareCards(game, idx) {
    var p = game.players[idx];
    var best = CheckIn.Scoring.bestPlay(p.hand, game.community, p.tradesThisRound);
    var keep = {};
    best.cards.forEach(function (c) { keep[c.uid] = true; });
    var spares = p.hand.filter(function (c) { return !keep[c.uid]; });
    spares.sort(function (a, b) { return standaloneValue(game, a) - standaloneValue(game, b); });
    return spares;
  }

  var Bots = {

    rerollPicks: function (game, idx) {
      var spares = spareCards(game, idx);
      return spares.slice(0, CONFIG.REROLL_MAX_CARDS).map(function (c) { return c.uid; });
    },

    decide: function (game, idx) {
      var p = game.players[idx];
      var others = game.players.map(function (_, i) { return i; })
        .filter(function (i) { return i !== idx; });

      var tradedAlready = p.tradesThisRound > 0;
      var chance = game.state === 'ACTION_1' ? CONFIG.BOT_TRADE_CHANCE : CONFIG.BOT_TRADE_CHANCE_2;

      if (!tradedAlready && Math.random() < chance && others.length > 0) {
        var toIdx = others[Math.floor(Math.random() * others.length)];
        var spares = spareCards(game, idx);
        var give = spares.length > 0 ? spares[0] : p.hand[0];
        var theirHand = game.players[toIdx].hand;
        var take = theirHand[Math.floor(Math.random() * theirHand.length)];
        return { type: 'trade', toIdx: toIdx, giveUid: give.uid, takeUid: take.uid };
      }

      return { type: 'reroll', uids: this.rerollPicks(game, idx) };
    },
  };

  CheckIn.Bots = Bots;
})(typeof self !== 'undefined' ? self : globalThis);
