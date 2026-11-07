/*
 * Check In — js/data/cards.js
 * ------------------------------------------------------------------
 * THE SINGLE SOURCE OF TRUTH for every card in the game.
 * Balance-tune here; the engine, UI, bots, tests and simulator all read
 * from these objects and never hard-code card behaviour.
 *
 * CARD COUNTS (MVP):
 *   10 unique Community Symptom cards  (5 are dealt to the board per round)
 *   24 unique Player Toolkit cards     (×2 copies = 48-card draw pile)
 *
 * ------------------------------------------------------------------
 * HOW CARD EFFECTS WORK (the hook contract)
 * ------------------------------------------------------------------
 * The scoring engine (js/engine/scoring.js) builds two objects and calls
 * each card's hooks in a FIXED ORDER — your spec's "Order of Operations":
 *
 *   1. Base values are loaded (chips for Self-Care, mult for Help-Seeking).
 *   2. Board DEBUFFS run  (symptom.def.debuff(ctx, m))  — unless suppressed
 *      by a played card's `special` (see below).
 *   3. Card OWN BONUSES run (card.def.bonus(ctx, m, self)).
 *   4. Board RECOGNITION BONUSES run (symptom.def.bonus(ctx, m)).
 *   5. Trade bonus is added, then caps/locks/floors, then Chips × Mult.
 *
 * ctx (read-only context given to every hook):
 *   ctx.played        played card instances IN SELECTION ORDER
 *                     each is { uid, def, suit } — `suit` is the RESOLVED
 *                     suit (WILD cards already assigned a real suit)
 *   ctx.board         the 5 community symptom instances ({ uid, def })
 *   ctx.trades        how many trades THIS player completed this round
 *   ctx.countSuit(s)  number of played cards resolving to suit s
 *   ctx.hasSuit(s)    countSuit(s) > 0
 *   ctx.uniqueSuits   how many distinct suits are in the played hand
 *   ctx.hasHelp       at least one Help-Seeking card is played
 *   ctx.hasSelfCare   at least one Self-Care card is played
 *   ctx.first         ctx.played[0]  (the "first card played")
 *   ctx.isProHelp(c)  c is a WILD-suit card by DEFINITION (professional help)
 *   ctx.boardHas(id)  a symptom with this id is on the board
 *
 * m (mutation API every hook writes through — also builds the score log):
 *   m.addCardChips(uid, delta, label)  modify ONE card's chips
 *   m.addCardMult(uid, delta, label)   modify ONE card's mult
 *   m.zeroCardChips(uid, label)        that card's FINAL chip contribution is 0
 *   m.addChips(delta, label)           flat chips to the hand total
 *   m.addMult(delta, label)            flat mult to the hand total
 *   m.capChipsAt(value, label)         cap the hand's total chips
 *   m.lockMultAt(value, label)         lock the hand's total mult
 *
 * toolkit `special` flags (suppress board debuffs — read by the engine):
 *   'IGNORE_ACADEMIC_DEBUFFS'  T20 Personal Tutor: debuffs from ACADEMIC
 *                              symptom cards (S01, S05, S06) do not apply.
 *   'CLEAR_CHIP_DEBUFFS'       T22 Counselling: every CHIP-type debuff on
 *                              the board does not apply (mult debuffs stay).
 *
 * Symptom `debuffKind` marks which debuffs T22 can clear:
 *   'chips' | 'mult' | null (no debuff)
 */
(function (root) {
  'use strict';
  const CheckIn = root.CheckIn = root.CheckIn || {};

  /* ------------------------------------------------------------------ */
  /* SUITS                                                               */
  /* ------------------------------------------------------------------ */
  CheckIn.SUITS = {
    MIND:     { key: 'MIND',     name: 'Mind',     emoji: '🧠', color: '#3E7CB1', blurb: 'Emotional & cognitive care' },
    BODY:     { key: 'BODY',     name: 'Body',     emoji: '🏃', color: '#3F9D6B', blurb: 'Physical self-care' },
    SOCIAL:   { key: 'SOCIAL',   name: 'Social',   emoji: '💬', color: '#D99E17', blurb: 'Connection & community' },
    ACADEMIC: { key: 'ACADEMIC', name: 'Academic', emoji: '📚', color: '#8256AD', blurb: 'Study & routine' },
    WILD:     { key: 'WILD',     name: 'Wild',     emoji: '🌟', color: '#C97D0C', blurb: 'Professional help — counts as any suit' },
  };
  CheckIn.REAL_SUITS = ['MIND', 'BODY', 'SOCIAL', 'ACADEMIC'];

  CheckIn.TYPE = { SYMPTOM: 'symptom', SELFCARE: 'selfcare', HELP: 'helpseeking' };

  /* ------------------------------------------------------------------ */
  /* A. COMMUNITY DECK — SYMPTOM CARDS (10 unique)                       */
  /* ------------------------------------------------------------------ */
  CheckIn.SYMPTOM_CARDS = [

    { id: 'S01', name: 'Academic Burnout', suit: 'ACADEMIC', icon: '🔥',
      debuffText: 'All played ACADEMIC cards give 0 Chips.',
      bonusText: 'Each played BODY or MIND card gives +5 Chips.',
      lesson: 'When burnt out, forcing more study fails; rest is required.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        ctx.played.forEach(function (c) {
          if (c.suit === 'ACADEMIC') m.zeroCardChips(c.uid, 'Burnout zeroes ACADEMIC cards');
        });
      },
      bonus: function (ctx, m) {
        var n = ctx.countSuit('BODY') + ctx.countSuit('MIND');
        if (n > 0) m.addChips(5 * n, 'Burnout recognition: ' + n + ' × BODY/MIND');
      } },

    { id: 'S02', name: 'Pre-Exam Panic', suit: 'MIND', icon: '😰',
      debuffText: 'Start the hand with −5 Chips (min 0).',
      bonusText: 'If you play at least one MIND card, gain +2 Mult.',
      lesson: 'Grounding and mindfulness counter acute anxiety.',
      debuffKind: 'chips',
      debuff: function (ctx, m) { m.addChips(-5, 'Panic: −5 Chips'); },
      bonus: function (ctx, m) {
        if (ctx.hasSuit('MIND')) m.addMult(2, 'Grounding: +2 Mult');
      } },

    { id: 'S03', name: 'Homesickness & Isolation', suit: 'SOCIAL', icon: '🏠',
      debuffText: 'If you play 0 SOCIAL cards, your Total Mult is −2 (min 1).',
      bonusText: 'Each SOCIAL card played gives +5 Chips and +1 Mult.',
      lesson: 'Isolation requires social connection to break.',
      debuffKind: 'mult',
      debuff: function (ctx, m) {
        if (ctx.countSuit('SOCIAL') === 0) m.addMult(-2, 'Isolation: −2 Mult');
      },
      bonus: function (ctx, m) {
        var n = ctx.countSuit('SOCIAL');
        if (n > 0) { m.addChips(5 * n, 'Connection: ' + n + ' × +5 Chips'); m.addMult(1 * n, 'Connection: ' + n + ' × +1 Mult'); }
      } },

    { id: 'S04', name: 'All-Nighter Exhaustion', suit: 'BODY', icon: '🌙',
      debuffText: 'All MIND and ACADEMIC cards give −3 Chips.',
      bonusText: 'Each BODY card played gives +8 Chips.',
      lesson: 'You cannot think or study when sleep-deprived.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        ctx.played.forEach(function (c) {
          if (c.suit === 'MIND' || c.suit === 'ACADEMIC') m.addCardChips(c.uid, -3, 'Exhaustion: −3 Chips');
        });
      },
      bonus: function (ctx, m) {
        var n = ctx.countSuit('BODY');
        if (n > 0) m.addChips(8 * n, 'Rested: ' + n + ' × +8 Chips');
      } },

    { id: 'S05', name: 'Imposter Syndrome', suit: 'ACADEMIC', icon: '🎭',
      debuffText: 'Self-Care (+Chips) cards alone are capped at 15 Chips max.',
      bonusText: 'Playing any Help-Seeking (+Mult) card gives +10 Chips.',
      lesson: 'Internal self-doubt needs external validation and perspective.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        if (!ctx.hasHelp) m.capChipsAt(15, 'Self-doubt caps Chips at 15');
      },
      bonus: function (ctx, m) {
        if (ctx.hasHelp) m.addChips(10, 'Reaching out: +10 Chips');
      } },

    { id: 'S06', name: 'Group Project Conflict', suit: 'SOCIAL', icon: '⚔️',
      debuffText: 'ACADEMIC cards give −2 Chips.',
      bonusText: 'If you Traded this round, gain +3 Mult.',
      lesson: 'Communication and peer collaboration resolve conflict.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        ctx.played.forEach(function (c) {
          if (c.suit === 'ACADEMIC') m.addCardChips(c.uid, -2, 'Conflict: −2 Chips');
        });
      },
      bonus: function (ctx, m) {
        if (ctx.trades > 0) m.addMult(3, 'Collaboration: +3 Mult');
      } },

    { id: 'S07', name: 'Emotional Bottling', suit: 'MIND', icon: '🤐',
      debuffText: 'If you play 0 Help-Seeking cards, your Total Mult is locked at 1×.',
      bonusText: 'Each Help-Seeking card played gets +2 extra Mult.',
      lesson: 'Bottling things up caps your recovery; reaching out multiplies it.',
      debuffKind: 'mult',
      debuff: function (ctx, m) {
        if (!ctx.hasHelp) m.lockMultAt(1, 'Bottling locks Mult at 1×');
      },
      bonus: function (ctx, m) {
        var n = ctx.played.filter(function (c) { return c.def.type === 'helpseeking'; }).length;
        if (n > 0) m.addMult(2 * n, 'Opening up: ' + n + ' × +2 Mult');
      } },

    { id: 'S08', name: 'Doomscrolling Fatigue', suit: 'BODY', icon: '📱',
      debuffText: 'The first card played gives 0 Chips.',
      bonusText: 'If your played hand has 3+ different suits, gain +15 Chips.',
      lesson: 'Breaking screen addiction requires a balanced routine.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        m.zeroCardChips(ctx.first.uid, 'Doomscroll: first card scores 0');
      },
      bonus: function (ctx, m) {
        if (ctx.uniqueSuits >= 3) m.addChips(15, 'Balanced routine: +15 Chips');
      } },

    { id: 'S09', name: 'Financial / Life Stress', suit: 'WILD', icon: '💸',
      debuffText: 'All base Self-Care cards give −2 Chips.',
      bonusText: 'Playing a Professional Help (WILD) card gives +4 extra Mult.',
      lesson: 'Severe external stressors benefit from campus support services.',
      debuffKind: 'chips',
      debuff: function (ctx, m) {
        ctx.played.forEach(function (c) {
          if (c.def.type === 'selfcare') m.addCardChips(c.uid, -2, 'Life stress: −2 Chips');
        });
      },
      bonus: function (ctx, m) {
        var n = ctx.played.filter(ctx.isProHelp).length;
        if (n > 0) m.addMult(4, 'Campus support: +4 Mult');
      } },

    { id: 'S10', name: 'Mid-Semester Slump', suit: 'MIND', icon: '🐌',
      debuffText: 'No direct penalty (neutral stressor).',
      bonusText: 'Every pair of matching suits in your played hand gives +8 Chips.',
      lesson: 'Consistency in habits builds resilience.',
      debuffKind: null,
      debuff: null,
      bonus: function (ctx, m) {
        var pairs = 0;
        CheckIn.REAL_SUITS.forEach(function (s) { pairs += Math.floor(ctx.countSuit(s) / 2); });
        if (pairs > 0) m.addChips(8 * pairs, 'Consistency: ' + pairs + ' pair' + (pairs > 1 ? 's' : '') + ' × +8');
      } },
  ];

  /* ------------------------------------------------------------------ */
  /* B. TOOLKIT DECK — SELF-CARE CARDS (+Chips), 14 unique               */
  /* ------------------------------------------------------------------ */
  CheckIn.SELFCARE_CARDS = [

    { id: 'T01', name: '8 Hours of Sleep', suit: 'BODY', icon: '🛏️', type: 'selfcare', chips: 12, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T02', name: 'Morning Walk Around Lake', suit: 'BODY', icon: '🚶', type: 'selfcare', chips: 8, mult: 0,
      bonusText: '+4 Chips if played with a MIND card.',
      bonus: function (ctx, m, self) {
        if (ctx.hasSuit('MIND')) m.addCardChips(self.uid, 4, 'Walk + MIND');
      } },

    { id: 'T03', name: 'Cook a Proper Meal', suit: 'BODY', icon: '🍳', type: 'selfcare', chips: 8, mult: 0,
      bonusText: '+4 Chips if played with a SOCIAL card.',
      bonus: function (ctx, m, self) {
        if (ctx.hasSuit('SOCIAL')) m.addCardChips(self.uid, 4, 'Meal + SOCIAL');
      } },

    { id: 'T04', name: 'Gym / Sports Session', suit: 'BODY', icon: '🏋️', type: 'selfcare', chips: 10, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T05', name: '5-Minute Box Breathing', suit: 'MIND', icon: '🧘', type: 'selfcare', chips: 8, mult: 0,
      bonusText: '+1 Mult if Pre-Exam Panic is on the board.',
      bonus: function (ctx, m, self) {
        if (ctx.boardHas('S02')) m.addCardMult(self.uid, 1, 'Breathing grounds panic');
      } },

    { id: 'T06', name: 'Gratitude Journaling', suit: 'MIND', icon: '📓', type: 'selfcare', chips: 9, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T07', name: 'Digital Detox (Phone Off)', suit: 'MIND', icon: '📵', type: 'selfcare', chips: 7, mult: 0,
      bonusText: '+6 Chips if played with a BODY card.',
      bonus: function (ctx, m, self) {
        if (ctx.hasSuit('BODY')) m.addCardChips(self.uid, 6, 'Detox + BODY');
      } },

    { id: 'T08', name: 'Setting Healthy Boundaries', suit: 'MIND', icon: '🚧', type: 'selfcare', chips: 10, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T09', name: 'Mamak Session with Friends', suit: 'SOCIAL', icon: '🍛', type: 'selfcare', chips: 8, mult: 0,
      bonusText: '+5 Chips if you Traded this round.',
      bonus: function (ctx, m, self) {
        if (ctx.trades > 0) m.addCardChips(self.uid, 5, 'Mamak after trading');
      } },

    { id: 'T10', name: 'Call Family Back Home', suit: 'SOCIAL', icon: '📞', type: 'selfcare', chips: 9, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T11', name: 'Join a Student Club Event', suit: 'SOCIAL', icon: '🎉', type: 'selfcare', chips: 7, mult: 0,
      bonusText: '+3 Chips for every OTHER SOCIAL card played.',
      bonus: function (ctx, m, self) {
        var others = ctx.countSuit('SOCIAL') - 1; // self is SOCIAL
        if (others > 0) m.addCardChips(self.uid, 3 * others, 'Club + ' + others + ' more SOCIAL');
      } },

    { id: 'T12', name: 'Pomodoro Study Technique', suit: 'ACADEMIC', icon: '⏲️', type: 'selfcare', chips: 11, mult: 0,
      bonusText: null, bonus: null },

    { id: 'T13', name: 'Break Tasks into Small Steps', suit: 'ACADEMIC', icon: '🪜', type: 'selfcare', chips: 8, mult: 0,
      bonusText: '+4 Chips if played with a MIND card.',
      bonus: function (ctx, m, self) {
        if (ctx.hasSuit('MIND')) m.addCardChips(self.uid, 4, 'Small steps + MIND');
      } },

    { id: 'T14', name: 'Clean Desk & Organize Notes', suit: 'ACADEMIC', icon: '🧹', type: 'selfcare', chips: 12, mult: 0,
      bonusText: null, bonus: null },
  ];

  /* ------------------------------------------------------------------ */
  /* C. TOOLKIT DECK — HELP-SEEKING CARDS (+Mult), 10 unique             */
  /* ------------------------------------------------------------------ */
  CheckIn.HELP_CARDS = [

    { id: 'T15', name: 'Vent to a Roommate', suit: 'SOCIAL', icon: '🗣️', type: 'helpseeking', chips: 4, mult: 2,
      bonusText: '+4 Chips.',
      bonus: function (ctx, m, self) {
        m.addCardChips(self.uid, 4, 'Venting helps');
      } },

    { id: 'T16', name: 'Form a Study Group', suit: 'ACADEMIC', icon: '👥', type: 'helpseeking', chips: 0, mult: 2,
      bonusText: '+2 Mult if played with another ACADEMIC card.',
      bonus: function (ctx, m, self) {
        if (ctx.countSuit('ACADEMIC') >= 2) m.addCardMult(self.uid, 2, 'Study group synergy');
      } },

    { id: 'T17', name: 'Workout Buddy', suit: 'BODY', icon: '🤝', type: 'helpseeking', chips: 0, mult: 2,
      bonusText: '+2 Mult if played with another BODY card.',
      bonus: function (ctx, m, self) {
        if (ctx.countSuit('BODY') >= 2) m.addCardMult(self.uid, 2, 'Buddy synergy');
      } },

    { id: 'T18', name: 'Check In on a Friend', suit: 'SOCIAL', icon: '💛', type: 'helpseeking', chips: 0, mult: 1,
      bonusText: '+3 Mult if you Traded this round (otherwise +1 Mult).',
      bonus: function (ctx, m, self) {
        if (ctx.trades > 0) m.addCardMult(self.uid, 2, 'You checked in first');
      } },

    { id: 'T19', name: 'Peer Support Group', suit: 'MIND', icon: '🤗', type: 'helpseeking', chips: 0, mult: 3,
      bonusText: null, bonus: null },

    { id: 'T20', name: 'Consult Academic Personal Tutor', suit: 'ACADEMIC', icon: '🎓', type: 'helpseeking', chips: 0, mult: 3,
      bonusText: 'Ignores all ACADEMIC debuffs on the board!',
      bonus: null,
      special: 'IGNORE_ACADEMIC_DEBUFFS' },

    { id: 'T21', name: 'UNM Wellbeing Office Drop-In', suit: 'WILD', icon: '🤲', type: 'helpseeking', chips: 0, mult: 4,
      bonusText: 'Counts as any suit.',
      bonus: null },

    { id: 'T22', name: 'Campus Counselling Service', suit: 'WILD', icon: '🛋️', type: 'helpseeking', chips: 0, mult: 5,
      bonusText: 'Removes all negative Chip penalties from Community Cards for your hand!',
      bonus: null,
      special: 'CLEAR_CHIP_DEBUFFS' },

    { id: 'T23', name: 'Student Association Welfare Helpline', suit: 'WILD', icon: '☎️', type: 'helpseeking', chips: 5, mult: 3,
      bonusText: '+3 Mult and +5 Chips.',
      bonus: function (ctx, m, self) {
        m.addCardChips(self.uid, 5, 'Helpline support');
      } },

    { id: 'T24', name: 'Medical / Health Centre Visit', suit: 'BODY', icon: '🩺', type: 'helpseeking', chips: 0, mult: 2,
      bonusText: '+4 Mult if played with at least one other BODY card (otherwise +2 Mult).',
      bonus: function (ctx, m, self) {
        if (ctx.countSuit('BODY') >= 2) m.addCardMult(self.uid, 2, 'Doctor + body care');
      } },
  ];

  /* ------------------------------------------------------------------ */
  /* D. Convenience accessors (used by engine, UI, bots, tests)          */
  /* ------------------------------------------------------------------ */
  CheckIn.TOOLKIT_CARDS = CheckIn.SELFCARE_CARDS.concat(CheckIn.HELP_CARDS);

  CheckIn.cardById = function (id) {
    return CheckIn.SYMPTOM_CARDS.concat(CheckIn.TOOLKIT_CARDS).filter(function (c) { return c.id === id; })[0] || null;
  };

  /* Sanity assertions — fail loudly at load time if the database is edited
   * inconsistently (e.g. a suit typo after tuning). */
  (function validate() {
    var suitSet = Object.keys(CheckIn.SUITS);
    var all = CheckIn.SYMPTOM_CARDS.concat(CheckIn.TOOLKIT_CARDS);
    var ids = {};
    all.forEach(function (c) {
      if (ids[c.id]) throw new Error('cards.js: duplicate id ' + c.id);
      ids[c.id] = true;
      if (suitSet.indexOf(c.suit) === -1) throw new Error('cards.js: bad suit on ' + c.id);
    });
    if (CheckIn.SYMPTOM_CARDS.length !== 10) throw new Error('cards.js: expected 10 symptom cards');
    if (CheckIn.SELFCARE_CARDS.length !== 14) throw new Error('cards.js: expected 14 self-care cards');
    if (CheckIn.HELP_CARDS.length !== 10) throw new Error('cards.js: expected 10 help-seeking cards');
    // every self-care card must carry chips; every help-seeking card mult
    CheckIn.SELFCARE_CARDS.forEach(function (c) { if (typeof c.chips !== 'number') throw new Error('cards.js: ' + c.id + ' missing chips'); });
    CheckIn.HELP_CARDS.forEach(function (c) { if (typeof c.mult !== 'number') throw new Error('cards.js: ' + c.id + ' missing mult'); });
  })();
})(typeof self !== 'undefined' ? self : globalThis);
