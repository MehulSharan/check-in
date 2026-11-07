/*
 * Check In — js/engine/deck.js
 * ------------------------------------------------------------------
 * Decks and shuffling. Card INSTANCES are { uid, def } — the uid is
 * globally unique for the whole game so per-card scoring mods and UI
 * element keys never collide (two copies of the same card in one hand
 * must remain distinguishable).
 *
 *   ToolkitDeck  — 24 uniques × CONFIG.TOOLKIT_COPIES (48 cards).
 *                  draw() auto-reshuffles the discard pile when empty;
 *                  call discard(cards) when cards leave play (rerolls,
 *                  hands collected at the end of a round).
 *   CommunityDeck— 10 symptom cards, freshly shuffled every round
 *                  (5 of 10 appear per round, never duplicated).
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var CONFIG = CheckIn.CONFIG;

  var uidSeq = 0;
  function makeInstance(def) {
    uidSeq += 1;
    return { uid: def.id + '*' + uidSeq, def: def };
  }

  function shuffle(arr) { // Fisher–Yates
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function ToolkitDeck() {
    this.drawPile = [];
    this.discardPile = [];
    var self = this;
    CheckIn.TOOLKIT_CARDS.forEach(function (def) {
      for (var i = 0; i < CONFIG.TOOLKIT_COPIES; i++) self.drawPile.push(makeInstance(def));
    });
    shuffle(this.drawPile);
  }
  ToolkitDeck.prototype.draw = function () {
    if (this.drawPile.length === 0 && this.discardPile.length > 0) {
      this.drawPile = shuffle(this.discardPile.splice(0));
    }
    return this.drawPile.pop() || null;
  };
  ToolkitDeck.prototype.discard = function (cards) {
    var self = this;
    (cards || []).forEach(function (c) { self.discardPile.push(c); });
  };
  ToolkitDeck.prototype.remaining = function () { return this.drawPile.length; };
  ToolkitDeck.prototype.peekAll = function () { return this.drawPile.concat(this.discardPile); };

  function CommunityDeck() {
    this.pile = shuffle(CheckIn.SYMPTOM_CARDS.map(makeInstance));
  }
  CommunityDeck.prototype.draw = function () { return this.pile.pop() || null; };

  CheckIn.Deck = { ToolkitDeck: ToolkitDeck, CommunityDeck: CommunityDeck, _makeInstance: makeInstance };
})(typeof self !== 'undefined' ? self : globalThis);
