/*
 * Check In — js/engine/round.js
 * ------------------------------------------------------------------
 * The 1-round state machine (3 rounds = 1 full game). Pure logic, no DOM.
 *
 *   IDLE ──startRound()──▶ ACTION_1 ──(all players acted)──▶ [deal Turn]
 *        ──▶ ACTION_2 ──(all players acted)──▶ [deal River] ──▶ SHOWDOWN
 *        ──(all hands played)──▶ SCORING ──finishRound()──▶ ROUND_END
 *                                    │
 *                                    └─ after round 3 ──▶ GAME_OVER
 *
 * Player actions during ACTION_1 / ACTION_2 (one per player per phase):
 *   doReroll(idx, uids)  discard up to 2 cards, draw the same count
 *   doTrade(from, to, giveUid, takeUid)
 *                        swap one card with another player. BOTH players'
 *                        trade credit increases (capped at scoring time:
 *                        +2 Mult per trade, max 2 stacks). Initiating
 *                        spends your action; RECEIVING is free — accepting
 *                        help should never cost you (see README rulings).
 *
 * Bot integration:
 *   botAct(idx)                 runs one bot's action. Bot→bot trades are
 *                               resolved immediately. If the bot wants to
 *                               trade with a HUMAN, returns
 *                               { pendingOffer: {...} } for the UI to show
 *                               (accept → doTrade, decline → resolveBotOffer
 *                               makes the bot reroll instead).
 *   botPlayHand(idx)            plays the bot's best 4-of-6 at Showdown.
 *   playFullGameBotVsBot()      headless full game (used by tools/sim.js).
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var CONFIG = CheckIn.CONFIG;

  function Game(opts) {
    this.players = (opts && opts.players || []).map(function (p) {
      return {
        name: p.name, isBot: !!p.isBot,
        hand: [], bank: 0,
        tradesThisRound: 0, actedThisPhase: false, hasPlayed: false,
        playedCards: null, lastResult: null,
      };
    });
    this.round = 0;              // completed rounds
    this.state = 'IDLE';
    this.community = [];
    this.toolkitDeck = new CheckIn.Deck.ToolkitDeck();
    this.communityDeck = null;
    this.isOver = false;
    this.stats = { trades: 0, rerolls: 0, helpCardsPlayed: 0, selfCarePlayed: 0 };
    this.eventLog = [];
  }

  Game.prototype.log = function (msg) {
    this.eventLog.push({ round: this.round + 1, msg: msg });
    if (this.eventLog.length > 120) this.eventLog.splice(0, this.eventLog.length - 120);
  };

  Game.prototype._drawToolkit = function (n) {
    var out = [], d = this.toolkitDeck;
    for (var i = 0; i < n; i++) { var c = d.draw(); if (c) out.push(c); }
    return out;
  };

  Game.prototype.startRound = function () {
    if (this.state !== 'IDLE' && this.state !== 'ROUND_END') {
      throw new Error('startRound called during ' + this.state);
    }
    var g = this;
    // collect the previous round's hands into the toolkit discards
    this.players.forEach(function (p) {
      g.toolkitDeck.discard(p.hand.splice(0));
      p.tradesThisRound = 0; p.actedThisPhase = false; p.hasPlayed = false;
      p.playedCards = null; p.lastResult = null;
    });
    this.communityDeck = new CheckIn.Deck.CommunityDeck();
    this.community = [];
    this.players.forEach(function (p) { p.hand = g._drawToolkit(CONFIG.HAND_SIZE); });
    for (var i = 0; i < CONFIG.FLOP; i++) this.community.push(this.communityDeck.draw());
    this.state = 'ACTION_1';
    this.log('🃏 Round ' + (this.round + 1) + ' — the flop shows ' +
      this.community.map(function (c) { return c.def.name; }).join(', '));
  };

  Game.prototype._inActionPhase = function () {
    return this.state === 'ACTION_1' || this.state === 'ACTION_2';
  };

  Game.prototype._checkAdvance = function () {
    var g = this;
    if (!g.players.every(function (p) { return p.actedThisPhase; })) return;
    if (g.state === 'ACTION_1') {
      g.community.push(g.communityDeck.draw());           // the Turn
      g.players.forEach(function (p) { p.actedThisPhase = false; });
      g.state = 'ACTION_2';
      g.log('🔄 Turn dealt: ' + g.community[g.community.length - 1].def.name);
    } else if (g.state === 'ACTION_2') {
      g.community.push(g.communityDeck.draw());           // the River
      g.players.forEach(function (p) { p.actedThisPhase = false; });
      g.state = 'SHOWDOWN';
      g.log('🌊 River dealt: ' + g.community[g.community.length - 1].def.name + ' — Showdown!');
    }
  };

  Game.prototype.doReroll = function (idx, uids) {
    var p = this.players[idx];
    if (!this._inActionPhase()) throw new Error('reroll only during action phases');
    if (p.actedThisPhase) throw new Error(p.name + ' already acted this phase');
    uids = uids || [];
    if (uids.length > CONFIG.REROLL_MAX_CARDS) throw new Error('reroll allows max ' + CONFIG.REROLL_MAX_CARDS + ' cards');
    var byUid = {};
    p.hand.forEach(function (c) { byUid[c.uid] = c; });
    var discarded = [];
    for (var i = 0; i < uids.length; i++) {
      if (!byUid[uids[i]]) throw new Error('card not in hand: ' + uids[i]);
      discarded.push(byUid[uids[i]]);
    }
    var keep = p.hand.filter(function (c) { return uids.indexOf(c.uid) === -1; });
    var fresh = this._drawToolkit(discarded.length);
    this.toolkitDeck.discard(discarded);
    p.hand = keep.concat(fresh);
    p.actedThisPhase = true;
    this.stats.rerolls += discarded.length;
    if (discarded.length > 0) {
      this.log('🔄 ' + p.name + ' rerolls ' + discarded.length + ' card' + (discarded.length > 1 ? 's' : ''));
    } else {
      this.log('⏭️ ' + p.name + ' keeps their hand');
    }
    this._checkAdvance();
  };

  Game.prototype.doTrade = function (fromIdx, toIdx, giveUid, takeUid) {
    var from = this.players[fromIdx], to = this.players[toIdx];
    if (!this._inActionPhase()) throw new Error('trades only during action phases');
    if (fromIdx === toIdx) throw new Error('cannot trade with yourself');
    if (from.actedThisPhase) throw new Error(from.name + ' already acted this phase');
    var give = from.hand.filter(function (c) { return c.uid === giveUid; })[0];
    var take = to.hand.filter(function (c) { return c.uid === takeUid; })[0];
    if (!give) throw new Error('give card not in ' + from.name + "'s hand");
    if (!take) throw new Error('take card not in ' + to.name + "'s hand");
    from.hand = from.hand.filter(function (c) { return c.uid !== giveUid; }).concat([take]);
    to.hand = to.hand.filter(function (c) { return c.uid !== takeUid; }).concat([give]);
    from.tradesThisRound += 1;
    to.tradesThisRound += 1;         // receiving is free — and still pays the bonus
    from.actedThisPhase = true;
    this.stats.trades += 1;
    this.log('🤝 ' + from.name + ' trades ' + give.def.name + ' for ' + to.name + "'s " + take.def.name +
      ' — both gain trade bonus');
    this._checkAdvance();
  };

  /* ---- bot plumbing --------------------------------------------------- */

  Game.prototype.botAct = function (idx) {
    var p = this.players[idx];
    if (!this._inActionPhase()) return null;
    if (!p.isBot) throw new Error('botAct on human player');
    if (p.actedThisPhase) return null;
    var decision = CheckIn.Bots.decide(this, idx);
    if (decision.type === 'reroll') {
      this.doReroll(idx, decision.uids);
      return null;
    }
    // trade
    if (this.players[decision.toIdx].isBot) {
      this.doTrade(idx, decision.toIdx, decision.giveUid, decision.takeUid);
      return null;
    }
    // bot wants to trade with a human — hand the offer to the UI
    return { pendingOffer: { fromIdx: idx, toIdx: decision.toIdx, giveUid: decision.giveUid, takeUid: decision.takeUid } };
  };

  Game.prototype.resolveBotOffer = function (offer, accepted) {
    if (accepted) {
      this.doTrade(offer.fromIdx, offer.toIdx, offer.giveUid, offer.takeUid);
    } else {
      this.log('🙅 ' + this.players[offer.toIdx].name + ' declined the trade — ' +
        this.players[offer.fromIdx].name + ' rerolls instead');
      this.doReroll(offer.fromIdx, CheckIn.Bots.rerollPicks(this, offer.fromIdx));
    }
  };

  /* ---- showdown -------------------------------------------------------- */

  Game.prototype.playHand = function (idx, orderedUids) {
    var p = this.players[idx];
    if (this.state !== 'SHOWDOWN') throw new Error('playHand only at the Showdown');
    if (p.hasPlayed) throw new Error(p.name + ' already played');
    var n = Math.min(CONFIG.PLAYED_SIZE, p.hand.length);
    if (orderedUids.length !== n) throw new Error('play exactly ' + n + ' cards');
    var byUid = {};
    p.hand.forEach(function (c) { byUid[c.uid] = c; });
    var ordered = orderedUids.map(function (uid) {
      if (!byUid[uid]) throw new Error('card not in hand: ' + uid);
      return byUid[uid];
    });
    var result = CheckIn.Scoring.scoreHand({
      played: ordered, board: this.community, trades: p.tradesThisRound,
    });
    p.bank += result.score;
    p.playedCards = ordered;
    p.lastResult = result;
    p.hasPlayed = true;
    var self = this;
    ordered.forEach(function (c) {
      if (c.def.type === 'helpseeking') self.stats.helpCardsPlayed += 1;
      else self.stats.selfCarePlayed += 1;
    });
    this.log('▶️ ' + p.name + ' plays a hand worth ' + result.score + ' (' + result.chips + ' × ' + result.mult + ')');
    if (this.players.every(function (q) { return q.hasPlayed; })) this.state = 'SCORING';
    return result;
  };

  Game.prototype.botPlayHand = function (idx) {
    var p = this.players[idx];
    var best = CheckIn.Scoring.bestPlay(p.hand, this.community, p.tradesThisRound);
    return this.playHand(idx, best.cards.map(function (c) { return c.uid; }));
  };

  Game.prototype.finishRound = function () {
    if (this.state !== 'SCORING') throw new Error('finishRound only after all hands are played');
    this.round += 1;
    if (this.round >= CONFIG.ROUNDS_PER_GAME) {
      this.state = 'GAME_OVER';
      this.isOver = true;
      this.log('🏆 Game over');
    } else {
      this.state = 'ROUND_END';
    }
  };

  Game.prototype.ranking = function () {
    return this.players.map(function (p, i) { return { idx: i, name: p.name, bank: p.bank }; })
      .sort(function (a, b) { return b.bank - a.bank; });
  };

  /* Headless full game — every seat is a bot. Used by tests + simulator. */
  Game.prototype.playFullGameBotVsBot = function () {
    if (!this.players.every(function (p) { return p.isBot; })) {
      throw new Error('playFullGameBotVsBot requires all-bot players');
    }
    var g = this;
    while (!g.isOver) {
      g.startRound();
      g.players.forEach(function (_, i) { g.botAct(i); });   // ACTION_1 → Turn
      g.players.forEach(function (_, i) { g.botAct(i); });   // ACTION_2 → River
      g.players.forEach(function (_, i) { g.botPlayHand(i); });
      g.finishRound();
    }
  };

  CheckIn.Game = Game;
})(typeof self !== 'undefined' ? self : globalThis);
