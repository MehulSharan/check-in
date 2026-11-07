/*
 * Check In — js/engine/scoring.js
 * ------------------------------------------------------------------
 * The scoring algorithm. Pure, deterministic, UI-free — the same code
 * scores human hands, bot hands, the live in-game calculator, the unit
 * tests and the balance simulator.
 *
 * ORDER OF OPERATIONS (from the design spec — do not reorder casually):
 *   1. Load base values  (Self-Care → +Chips, Help-Seeking → +Mult)
 *   2. Apply board DEBUFFS  (unless suppressed by a played card's `special`)
 *   3. Apply each played card's OWN conditional bonus
 *   4. Apply board RECOGNITION BONUSES
 *   5. Add the Trade bonus (+2 Mult per trade, max 2 stacks per round)
 *   6. Aggregate: per-card chips (zeroed cards = 0, floor 0 each) + flat
 *      chips → apply chip cap → floor chips at 0;  base 1× + per-card
 *      mult + flat mult → apply mult lock → floor mult at 1.
 *   7. Final_Score = Total_Chips × Total_Mult
 *
 * WILD SUITS: every WILD toolkit card is assigned the real suit that
 * maximizes the final score (it "counts as any suit"). The engine brute-
 * forces all 4^n assignments (n = wilds played, ≤ 4 → ≤ 256 runs, fast).
 * Professional-help checks (e.g. S09's bonus) look at the card's DEFINED
 * suit, so they fire no matter the assignment.
 *
 * API:
 *   CheckIn.Scoring.scoreHand({ played, board, trades, wildAssign? })
 *     played : [{ uid, def }] in SELECTION order (first = played first)
 *     board  : [{ uid, def }] the community symptom cards
 *     trades : trades completed by this player this round (bonus caps at 2)
 *     wildAssign : optional { uid: 'SUIT' } to pin wild cards (used by tests)
 *     → { chips, mult, score, log: [...], wildAssign }
 *
 *   CheckIn.Scoring.bestPlay(hand, board, trades)
 *     Evaluates every 4-of-6 combination (and, when Doomscrolling S08 is
 *     on the board, every choice of "first card") and returns the best:
 *     → { cards: [ordered {uid, def}], result: <scoreHand result> }
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var CONFIG = CheckIn.CONFIG;
  var REAL_SUITS = CheckIn.REAL_SUITS;

  /* ------------------------------------------------------------------ */
  /* Mutation object — every hook writes through this, and it doubles as */
  /* the score-breakdown log the UI shows after the Showdown.            */
  /* ------------------------------------------------------------------ */
  function Mutation() {
    this.cardChips = {};  // uid -> current chips (starts at def.chips)
    this.cardMult = {};   // uid -> current mult  (starts at def.mult)
    this.zeroed = {};     // uid -> label (final chip contribution = 0)
    this.flatChips = [];  // { delta, label }
    this.flatMult = [];   // { delta, label }
    this.chipCap = null;  // number | null
    this.multLock = null; // number | null
    this.log = [];        // ordered breakdown entries
  }
  Mutation.prototype.logBase = function (card) {
    this.cardChips[card.uid] = card.def.chips;
    this.cardMult[card.uid] = card.def.mult;
    this.log.push({ kind: 'base', cardUid: card.uid, label: card.def.icon + ' ' + card.def.name,
      chips: card.def.chips, mult: card.def.mult });
  };
  Mutation.prototype.addCardChips = function (uid, delta, label) {
    this.cardChips[uid] = (this.cardChips[uid] || 0) + delta;
    this.log.push({ kind: 'mod', cardUid: uid, label: label, chips: delta, mult: 0 });
  };
  Mutation.prototype.addCardMult = function (uid, delta, label) {
    this.cardMult[uid] = (this.cardMult[uid] || 0) + delta;
    this.log.push({ kind: 'mod', cardUid: uid, label: label, chips: 0, mult: delta });
  };
  Mutation.prototype.zeroCardChips = function (uid, label) {
    this.zeroed[uid] = label;
    this.log.push({ kind: 'zero', cardUid: uid, label: label, chips: 0, mult: 0 });
  };
  Mutation.prototype.addChips = function (delta, label) {
    this.flatChips.push({ delta: delta, label: label });
    this.log.push({ kind: 'flat', label: label, chips: delta, mult: 0 });
  };
  Mutation.prototype.addMult = function (delta, label) {
    this.flatMult.push({ delta: delta, label: label });
    this.log.push({ kind: 'flat', label: label, chips: 0, mult: delta });
  };
  Mutation.prototype.capChipsAt = function (value, label) {
    if (this.chipCap === null || value < this.chipCap) this.chipCap = value;
    this.log.push({ kind: 'cap', label: label, chips: 0, mult: 0 });
  };
  Mutation.prototype.lockMultAt = function (value, label) {
    if (this.multLock === null || value < this.multLock) this.multLock = value;
    this.log.push({ kind: 'lock', label: label, chips: 0, mult: 0 });
  };
  Mutation.prototype.logSuppress = function (sym, label) {
    this.log.push({ kind: 'suppressed', label: label + ' — ' + sym.def.name, chips: 0, mult: 0 });
  };

  /* ------------------------------------------------------------------ */
  /* Context — read-only view handed to every card hook (see cards.js)   */
  /* ------------------------------------------------------------------ */
  function buildCtx(played, board, trades, assign) {
    var cards = played.map(function (p) {
      return { uid: p.uid, def: p.def,
        suit: (p.def.suit === 'WILD' && assign[p.uid]) ? assign[p.uid] : p.def.suit };
    });
    var suitCount = {};
    cards.forEach(function (c) { suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; });
    var helpCount = 0;
    cards.forEach(function (c) { if (c.def.type === 'helpseeking') helpCount++; });
    return {
      played: cards,
      board: board,
      trades: trades | 0,
      countSuit: function (s) { return suitCount[s] || 0; },
      hasSuit: function (s) { return (suitCount[s] || 0) > 0; },
      uniqueSuits: Object.keys(suitCount).length,
      hasHelp: helpCount > 0,
      hasSelfCare: cards.length - helpCount > 0,
      first: cards[0] || null,
      isProHelp: function (c) { return c.def.suit === 'WILD'; },
      boardHas: function (id) {
        return board.some(function (s) { return s.def.id === id; });
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* One full scoring run with wild cards pinned to `assign`              */
  /* ------------------------------------------------------------------ */
  function scoreOnce(played, board, trades, assign) {
    var ctx = buildCtx(played, board, trades, assign);
    var m = new Mutation();

    // 1. base values -------------------------------------------------
    played.forEach(function (p) { m.logBase(p); });

    // 2. board debuffs (with suppression) ----------------------------
    var ignoreAcademic = played.some(function (p) { return p.def.special === 'IGNORE_ACADEMIC_DEBUFFS'; });
    var clearChipDebuffs = played.some(function (p) { return p.def.special === 'CLEAR_CHIP_DEBUFFS'; });
    board.forEach(function (sym) {
      if (!sym.def.debuff) return;
      if (ignoreAcademic && sym.def.suit === 'ACADEMIC') {
        m.logSuppress(sym, '🎓 Personal Tutor'); return;
      }
      if (clearChipDebuffs && sym.def.debuffKind === 'chips') {
        m.logSuppress(sym, '🛋️ Counselling'); return;
      }
      sym.def.debuff(ctx, m);
    });

    // 3. each played card's own conditional bonus ---------------------
    ctx.played.forEach(function (c) {
      if (c.def.bonus) c.def.bonus(ctx, m, c);
    });

    // 4. board recognition bonuses ------------------------------------
    board.forEach(function (sym) {
      if (sym.def.bonus) sym.def.bonus(ctx, m);
    });

    // 5. trade bonus ----------------------------------------------------
    var stacks = Math.min(ctx.trades, CONFIG.TRADE_BONUS_MAX_STACKS);
    if (stacks > 0) m.addMult(CONFIG.TRADE_BONUS_MULT * stacks, '🤝 Trade bonus × ' + stacks);

    // 6. aggregate ------------------------------------------------------
    var chips = 0;
    ctx.played.forEach(function (c) {
      var cc = m.zeroed[c.uid] ? 0 : Math.max(0, m.cardChips[c.uid] || 0);
      chips += cc;
    });
    m.flatChips.forEach(function (f) { chips += f.delta; });
    if (m.chipCap !== null) chips = Math.min(chips, m.chipCap);
    chips = Math.max(chips, CONFIG.MIN_CHIPS);

    var mult = CONFIG.BASE_MULT;
    ctx.played.forEach(function (c) { mult += (m.cardMult[c.uid] || 0); });
    m.flatMult.forEach(function (f) { mult += f.delta; });
    if (m.multLock !== null) mult = m.multLock;
    mult = Math.max(mult, CONFIG.MIN_MULT);

    // 7. final ----------------------------------------------------------
    var score = chips * mult;
    var wildsPlayed = ctx.played.filter(function (c) { return c.def.suit === 'WILD'; });
    if (wildsPlayed.length > 0) {
      var note = wildsPlayed.map(function (c) {
        return c.def.icon + ' ' + c.def.name + ' counted as ' + c.suit;
      }).join('; ');
      m.log.push({ kind: 'wild', label: note, chips: 0, mult: 0 });
    }
    m.log.push({ kind: 'result', label: 'Final', chips: chips, mult: mult, score: score });

    return { chips: chips, mult: mult, score: score, log: m.log, wildAssign: assign, ctx: ctx };
  }

  /* ------------------------------------------------------------------ */
  /* Public: scoreHand — brute-forces the best wild assignment           */
  /* ------------------------------------------------------------------ */
  function scoreHand(opts) {
    var played = opts.played, board = opts.board;
    var trades = opts.trades || 0;
    if (opts.wildAssign) return scoreOnce(played, board, trades, opts.wildAssign);

    var wildUids = played.filter(function (p) { return p.def.suit === 'WILD'; })
      .map(function (p) { return p.uid; });
    if (wildUids.length === 0) return scoreOnce(played, board, trades, {});

    var best = null, total = Math.pow(REAL_SUITS.length, wildUids.length);
    for (var i = 0; i < total; i++) {
      var assign = {}, v = i;
      for (var k = 0; k < wildUids.length; k++) {
        assign[wildUids[k]] = REAL_SUITS[v % REAL_SUITS.length];
        v = Math.floor(v / REAL_SUITS.length);
      }
      var r = scoreOnce(played, board, trades, assign);
      if (!best || r.score > best.score) best = r;
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers: combinations & best play (used by bots, sim, tests)        */
  /* ------------------------------------------------------------------ */
  function combinations(arr, k) {
    var out = [], n = arr.length;
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i <= n - (k - cur.length); i++) {
        cur.push(arr[i]); rec(i + 1, cur); cur.pop();
      }
    })(0, []);
    return out;
  }

  function withFirst(combo, idx) {
    // combo with combo[idx] moved to the front, others keep their order
    var rest = combo.slice(); var first = rest.splice(idx, 1)[0];
    return [first].concat(rest);
  }

  function bestPlay(hand, board, trades) {
    var k = Math.min(CONFIG.PLAYED_SIZE, hand.length);
    var combos = combinations(hand, k);
    var hasS08 = board.some(function (s) { return s.def.id === 'S08'; });
    var best = null;
    combos.forEach(function (combo) {
      var orders = hasS08
        ? combo.map(function (_, i) { return withFirst(combo, i); })
        : [combo];
      orders.forEach(function (order) {
        var r = scoreHand({ played: order, board: board, trades: trades });
        if (!best || r.score > best.result.score) best = { cards: order, result: r };
      });
    });
    return best;
  }

  CheckIn.Scoring = {
    scoreHand: scoreHand,
    bestPlay: bestPlay,
    combinations: combinations,
    _scoreOnce: scoreOnce,   // exposed for unit tests (pinned wilds)
  };
})(typeof self !== 'undefined' ? self : globalThis);
