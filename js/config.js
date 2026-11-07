/*
 * Check In — a coping card game (TLIG Board Game 2026, University of Nottingham Malaysia)
 * ------------------------------------------------------------------
 * config.js — game constants you can tune without touching engine logic.
 *
 * Load order: config.js must load before any engine/ai/ui file.
 * Everything attaches to a single global namespace `CheckIn` so the game runs
 * from file:// with plain <script> tags (no build step, no modules — keeps the
 * demo double-clickable; see README "For developers").
 */
(function (root) {
  'use strict';
  const CheckIn = root.CheckIn = root.CheckIn || {};

  CheckIn.CONFIG = {
    // Identity -------------------------------------------------------------
    GAME_NAME: 'Check In',
    TAGLINE: 'a coping card game',
    SUBTITLE: 'Mental Health Toolkit 2.0 · TLIG Board Game 2026 · UNM',

    // Game shape -----------------------------------------------------------
    ROUNDS_PER_GAME: 3,
    HAND_SIZE: 6,            // toolkit cards dealt face-up each round
    PLAYED_SIZE: 4,          // cards selected at the Showdown
    COMMUNITY_PER_ROUND: 5,  // flop 3 + turn 1 + river 1
    FLOP: 3, TURN: 1, RIVER: 1,
    TOOLKIT_COPIES: 2,       // each unique toolkit card appears this many times

    // Scoring --------------------------------------------------------------
    BASE_CHIPS: 0,
    BASE_MULT: 1,
    MIN_CHIPS: 0,
    MIN_MULT: 1,

    // Peer Support Trading ---------------------------------------------------
    TRADE_BONUS_MULT: 2,       // +Mult per completed trade
    TRADE_BONUS_MAX_STACKS: 2, // bonus stacks at most this many times per round
    REROLL_MAX_CARDS: 2,       // max cards discarded & redrawn per action

    // Bots (MVP: they always accept trade offers so judges can test the mechanic)
    BOTS: [
      { name: 'Aiman', emoji: '🙂' },
      { name: 'Balqis', emoji: '😄' }
    ],
    BOT_TRADE_CHANCE: 0.6,   // chance a bot initiates a trade in Action Phase 1
    BOT_TRADE_CHANCE_2: 0.3, // ...in Action Phase 2 (only if it has not traded yet)

    // Real support footer (kept in the game on purpose — it is the point)
    REAL_HELP_NOTE: 'This is a game. If you are struggling for real, the UNM Wellbeing Office drop-in is free.',
  };
})(typeof self !== 'undefined' ? self : globalThis);
