/*
 * Check In — js/ui/render.js
 * ------------------------------------------------------------------
 * DOM painters. Every function takes plain game/ui state and returns or
 * mutates elements — no game logic lives here (that's the engine's job),
 * so the rendering layer can be swapped (React port etc.) freely.
 *
 * UI state shape (owned by main.js):
 *   ui.mode          'idle' | 'select-reroll' | 'select-give' |
 *                    'select-target' | 'select-take' | 'showdown'
 *   ui.rerollSel     [uid] cards marked for reroll
 *   ui.showdownSel   [uid] ordered selection at showdown
 *   ui.tradeGive     uid of the card the human is offering
 *   ui.tradeTarget   player index the human is trading with
 *   ui.phaseText     human-readable phase label
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var SUITS = CheckIn.SUITS;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var Render = {

    /* ---- screens & chrome ------------------------------------------------ */

    screen: function (name) {
      document.getElementById('screen-title').classList.toggle('hidden', name !== 'title');
      document.getElementById('screen-game').classList.toggle('hidden', name !== 'game');
    },

    roundBar: function (game, phaseText) {
      var C = CheckIn.CONFIG;
      document.getElementById('round-indicator').innerHTML =
        'Round ' + Math.min(game.round + 1, C.ROUNDS_PER_GAME) + ' of ' + C.ROUNDS_PER_GAME +
        ' · <span id="phase-label">' + (phaseText || '…') + '</span>';
    },

    hint: function (text) {
      var bar = document.getElementById('hint-bar');
      clear(bar); bar.textContent = text;
    },

    /* ---- card elements ----------------------------------------------------- */

    toolkitCard: function (card, opts) {
      opts = opts || {};
      var suit = SUITS[card.def.suit];
      var e = el('div', 'card toolkit-card suit-' + card.def.suit);
      e.dataset.uid = card.uid;

      var head = el('div', 'tk-head');
      head.appendChild(el('span', 'tk-suit', suit.emoji));
      head.appendChild(el('span', 'tk-name', card.def.name));
      e.appendChild(head);

      var value = el('div', 'tk-value');
      if (card.def.type === 'selfcare') {
        value.classList.add('chips');
        value.textContent = '+' + card.def.chips;
        var sub = el('small', null, ' chips');
        value.appendChild(sub);
      } else {
        value.classList.add('mult');
        value.textContent = '+' + card.def.mult;
        value.appendChild(el('small', null, '× mult'));
      }
      e.appendChild(value);

      var bonus = el('div', 'tk-bonus', card.def.bonusText || '');
      e.appendChild(bonus);

      if (opts.orderBadge) {
        var badge = el('div', 'tk-order', String(opts.orderBadge));
        e.appendChild(badge);
      }
      if (opts.rerollMark) e.classList.add('pickable');
      if (opts.selected) e.classList.add('selected');
      if (opts.dim) e.classList.add('dim');
      if (opts.finalChips != null) {
        var fin = el('div', 'tk-final');
        fin.textContent = (opts.finalChips ? '+' + opts.finalChips + ' chips' : '') +
          (opts.finalMult ? ' +' + opts.finalMult + '×' : '');
        if (!fin.textContent) fin.textContent = '0 chips';
        e.appendChild(fin);
      }
      if (opts.onclick) {
        e.classList.add('clickable-card');
        e.addEventListener('click', function () { opts.onclick(card); });
      }
      return e;
    },

    miniCard: function (card, opts) {
      opts = opts || {};
      var e = el('div', 'mini-card suit-' + card.def.suit);
      e.dataset.uid = card.uid;
      e.appendChild(el('span', 'm-icon', card.def.icon));
      var val = el('span', 'm-val');
      if (card.def.type === 'selfcare') { val.classList.add('chips'); val.textContent = '+' + card.def.chips; }
      else { val.classList.add('mult'); val.textContent = '+' + card.def.mult + '×'; }
      e.appendChild(val);
      if (opts.dim) e.classList.add('dim');
      if (opts.clickable) {
        e.classList.add('clickable');
        e.addEventListener('click', function () { opts.onclick(card); });
      }
      return e;
    },

    symptomCard: function (sym, opts) {
      opts = opts || {};
      var suit = SUITS[sym.def.suit];
      var e = el('div', 'card symptom-card suit-' + sym.def.suit);
      e.dataset.uid = sym.uid;
      var name = el('div', 'sym-name');
      name.appendChild(el('span', 'sym-icon', sym.def.icon));
      name.appendChild(document.createTextNode(sym.def.name));
      e.appendChild(name);
      var deb = el('div', 'sym-row sym-debuff');
      deb.appendChild(el('b', null, 'Symptom'));
      deb.appendChild(document.createTextNode(sym.def.debuffText));
      e.appendChild(deb);
      var bon = el('div', 'sym-row sym-bonus');
      bon.appendChild(el('b', null, 'Recognition'));
      bon.appendChild(document.createTextNode(sym.def.bonusText));
      e.appendChild(bon);
      if (opts.flip) e.classList.add('anim-flip');
      return e;
    },

    /* ---- zones --------------------------------------------------------------- */

    opponents: function (game, ui) {
      var zone = document.getElementById('zone-opponents');
      clear(zone);
      game.players.forEach(function (p, i) {
        if (i === 0) return; // human is the bottom zone
        var panel = el('div', 'opponent');
        panel.dataset.playerIdx = String(i);
        if (ui.activeBot === i) panel.classList.add('active');
        if (ui.tradeTarget === i && (ui.mode === 'select-target' || ui.mode === 'select-take')) {
          panel.classList.add('active');
        }

        var head = el('div', 'opp-head');
        head.appendChild(el('span', 'opp-emoji', p.emoji || '🤖'));
        head.appendChild(el('span', 'opp-name', p.name));
        var badges = el('span', 'opp-trade-badges', p.tradesThisRound > 0 ? '🤝×' + p.tradesThisRound : '');
        head.appendChild(badges);
        head.appendChild(el('span', 'opp-bank', '🏦 ' + p.bank));
        panel.appendChild(head);

        var handRow = el('div', 'opp-hand');
        p.hand.forEach(function (c) {
          handRow.appendChild(Render.miniCard(c, {
            dim: ui.mode === 'select-take' && ui.tradeTarget !== i,
            clickable: ui.mode === 'select-take' && ui.tradeTarget === i,
            onclick: ui.onOpponentCardClick,
          }));
        });
        panel.appendChild(handRow);

        if (p.lastResult) {
          panel.appendChild(el('div', 'opp-last',
            'played ' + p.lastResult.chips + ' × ' + p.lastResult.mult + ' = ' +
            p.lastResult.score + ' chips'));
        }
        if (ui.mode === 'select-target') {
          panel.style.cursor = 'pointer';
          panel.addEventListener('click', function () { if (ui.onOpponentClick) ui.onOpponentClick(i); });
        }
        zone.appendChild(panel);
      });
    },

    board: function (game, flipLast) {
      var slots = document.getElementById('community-slots');
      clear(slots);
      for (var i = 0; i < CheckIn.CONFIG.COMMUNITY_PER_ROUND; i++) {
        var sym = game.community[i];
        if (sym) {
          slots.appendChild(Render.symptomCard(sym, { flip: flipLast && i === game.community.length - 1 }));
        } else {
          var placeholder = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'][i] || '';
          var slot = el('div', 'community-slot', i < 3 ? placeholder : placeholder);
          slots.appendChild(slot);
        }
      }
    },

    playerHand: function (game, ui) {
      var handEl = document.getElementById('player-hand');
      clear(handEl);
      var human = game.players[0];
      human.hand.forEach(function (c) {
        var orderIdx = ui.showdownSel.indexOf(c.uid);
        var isPlayed = human.hasPlayed && human.playedCards &&
          human.playedCards.some(function (x) { return x.uid === c.uid; });
        var opts = {
          selected: (ui.mode === 'showdown' && orderIdx !== -1) ||
                    (ui.mode === 'select-reroll' && ui.rerollSel.indexOf(c.uid) !== -1) ||
                    (ui.mode === 'select-give' && ui.tradeGive === c.uid) ||
                    isPlayed,
          orderBadge: ui.mode === 'showdown' && orderIdx !== -1 ? orderIdx + 1 : null,
          rerollMark: ui.mode === 'select-reroll' && ui.rerollSel.indexOf(c.uid) === -1,
          dim: (ui.mode === 'select-give' && ui.tradeGive !== c.uid) ||
               (human.hasPlayed && !isPlayed),
          onclick: ui.onHandCardClick,
        };
        if (human.hasPlayed) {
          var cs = null, cm = null;
          if (isPlayed && human.lastResult) {
            human.lastResult.cardScores.forEach(function (x) {
              if (x.uid === c.uid) { cs = x.chips; cm = x.mult; }
            });
          }
          opts.finalChips = cs; opts.finalMult = cm;
        }
        handEl.appendChild(Render.toolkitCard(c, opts));
      });
    },

    playerStrip: function (game) {
      document.getElementById('player-bank').textContent = '🏦 ' + game.players[0].bank;
      var t = game.players[0].tradesThisRound;
      document.getElementById('player-trades').textContent = t > 0 ? '🤝 Trade bonus +' + (Math.min(t, 2) * 2) + '× this round' : '';
    },

    calc: function (preview) {
      document.getElementById('calc-chips').textContent = preview.chips;
      document.getElementById('calc-mult').textContent = preview.mult + '×';
      document.getElementById('calc-score').textContent = preview.score;
      var note = document.getElementById('calc-note');
      clear(note); note.textContent = preview.note || '';
    },

    log: function (game) {
      var logEl = document.getElementById('event-log');
      clear(logEl);
      var lines = game.eventLog.slice(-4);
      lines.forEach(function (l, i) {
        var line = el('div', 'log-line' + (i === lines.length - 1 ? ' latest' : ''), l.msg);
        logEl.appendChild(line);
      });
    },

    full: function (game, ui) {
      Render.roundBar(game, ui.phaseText);
      Render.opponents(game, ui);
      Render.board(game, false);
      Render.playerHand(game, ui);
      Render.playerStrip(game);
      Render.log(game);
      if (ui.preview) Render.calc(ui.preview);
    },

    /* ---- modal ------------------------------------------------------------------ */

    modal: function (html) {
      var overlay = document.getElementById('modal-overlay');
      var card = document.getElementById('modal-card');
      overlay.classList.remove('hidden');
      card.innerHTML = html;
      return card;
    },

    closeModal: function () {
      document.getElementById('modal-overlay').classList.add('hidden');
      document.getElementById('modal-card').innerHTML = '';
    },
  };

  CheckIn.Render = Render;
  CheckIn.Render._el = el;
})(typeof self !== 'undefined' ? self : globalThis);
