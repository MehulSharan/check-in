/*
 * Check In — js/main.js
 * ------------------------------------------------------------------
 * The flow controller: owns the UI state machine, wires buttons to
 * engine calls, and sequences the round loop with animations.
 *
 *   startGame → playRound ×3 → podium
 *   playRound: deal → ACTION_1 → [Turn] → ACTION_2 → [River] →
 *              SHOWDOWN (human scores, then bots) → lessons → results
 *
 * The human always acts FIRST in each action phase (MVP simplification —
 * bots then respond, which keeps the demo pacey and judges in control).
 */
(function () {
  'use strict';
  var C = CheckIn.CONFIG, R = CheckIn.Render, A = CheckIn.Anim, T = CheckIn.Tutorial;

  var game = null;

  /* ---- UI state ----------------------------------------------------------- */
  var ui = {
    mode: 'idle',                 // idle | select-reroll | select-give | select-target | select-take | showdown
    rerollSel: [],
    showdownSel: [],
    tradeGive: null,
    tradeTarget: null,
    phaseText: '',
    preview: null,
    activeBot: null,
    onHandCardClick: null,
    onOpponentCardClick: null,
    onOpponentClick: null,
  };
  var humanResolve = null;        // resolves while we wait for the human's move

  function awaitHuman() { return new Promise(function (res) { humanResolve = res; }); }
  function resolveHuman() { var r = humanResolve; humanResolve = null; if (r) r(); }

  /* ---- preview (live calculator) ------------------------------------------ */
  function computePreview() {
    if (!game) { ui.preview = { chips: 0, mult: 1, score: 0, note: '' }; return; }
    var human = game.players[0];
    if (ui.mode === 'showdown' && !human.hasPlayed) {
      var sel = ui.showdownSel.map(function (uid) {
        return human.hand.filter(function (c) { return c.uid === uid; })[0];
      }).filter(Boolean);
      var r = CheckIn.Scoring.scoreHand({
        played: sel, board: game.community, trades: human.tradesThisRound,
      });
      ui.preview = { chips: r.chips, mult: r.mult, score: r.score,
        note: 'your selection (' + sel.length + '/' + C.PLAYED_SIZE + ') — first pick plays first' };
    } else if (human.hand.length > 0 && !human.hasPlayed) {
      var best = CheckIn.Scoring.bestPlay(human.hand, game.community, human.tradesThisRound);
      if (best) {
        ui.preview = { chips: best.result.chips, mult: best.result.mult, score: best.result.score,
          note: 'your best hand right now' };
      }
    } else {
      ui.preview = { chips: 0, mult: 1, score: 0, note: '' };
    }
  }

  /* ---- rendering + button state ------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  function render() {
    computePreview();
    R.full(game, ui);
    updateButtons();
    updateHint();
  }

  function updateButtons() {
    var human = game.players[0];
    var myTurn = game.inActionPhase() && !human.actedThisPhase && ui.mode === 'idle';
    var bR = $('btn-reroll'), bT = $('btn-trade'), bK = $('btn-keep'), bP = $('btn-play-hand');

    bR.disabled = bT.disabled = bK.disabled = true;
    bR.textContent = '🔄 Reroll';
    bT.textContent = '🤝 Offer Trade';
    bK.textContent = '⏭️ Keep Hand';
    bP.disabled = true;
    bP.textContent = '▶ Play Hand (' + ui.showdownSel.length + '/' + C.PLAYED_SIZE + ')';

    if (ui.mode === 'idle') {
      if (myTurn) bR.disabled = bT.disabled = bK.disabled = false;
    } else if (ui.mode === 'select-reroll') {
      bR.disabled = false;
      bR.textContent = ui.rerollSel.length > 0
        ? '✅ Confirm Reroll (' + ui.rerollSel.length + ')'
        : '↩️ Back';
    } else if (ui.mode === 'select-give') {
      bT.disabled = false; bT.textContent = '1/3 · your card…';
      bK.disabled = false; bK.textContent = '❌ Cancel';
    } else if (ui.mode === 'select-target') {
      bT.disabled = false; bT.textContent = '2/3 · pick classmate…';
      bK.disabled = false; bK.textContent = '❌ Cancel';
    } else if (ui.mode === 'select-take') {
      bT.disabled = false; bT.textContent = '3/3 · their card…';
      bK.disabled = false; bK.textContent = '❌ Cancel';
    } else if (ui.mode === 'showdown') {
      bP.disabled = ui.showdownSel.length !== C.PLAYED_SIZE;
    }
  }

  function updateHint() {
    var human = game.players[0];
    var text;
    switch (ui.mode) {
      case 'select-reroll':
        text = 'Tap up to ' + C.REROLL_MAX_CARDS + ' cards to discard & redraw, then Confirm.'; break;
      case 'select-give':
        text = '🤝 Trading — tap the card from YOUR hand to offer.'; break;
      case 'select-target':
        text = '🤝 Trading — tap the classmate you want to trade with.'; break;
      case 'select-take': {
        var name = game.players[ui.tradeTarget] ? game.players[ui.tradeTarget].name : '';
        text = '🤝 Trading — tap the card you want from ' + name + "'s hand."; break;
      }
      case 'showdown':
        text = '🌊 Showdown! Pick ' + C.PLAYED_SIZE + ' of your ' + C.HAND_SIZE +
          ' cards to play. First pick plays first (matters vs Doomscrolling).'; break;
      default:
        if (game.inActionPhase() && !human.actedThisPhase) {
          text = 'Your action — 🔄 Reroll up to 2 cards, 🤝 Offer Trade (+2 Mult for BOTH traders), or ⏭️ Keep Hand.';
        } else if (game.state === 'SCORING') text = 'Scoring…';
        else if (game.state === 'SHOWDOWN') text = 'Showdown…';
        else text = 'Your classmates are thinking…';
    }
    R.hint(text);
  }

  /* ---- card click routing ---------------------------------------------------- */
  ui.onHandCardClick = function (card) {
    if (ui.mode === 'select-reroll') {
      var i = ui.rerollSel.indexOf(card.uid);
      if (i !== -1) ui.rerollSel.splice(i, 1);
      else if (ui.rerollSel.length < C.REROLL_MAX_CARDS) ui.rerollSel.push(card.uid);
      render();
    } else if (ui.mode === 'select-give') {
      ui.tradeGive = card.uid;
      ui.mode = 'select-target';
      render();
    } else if (ui.mode === 'showdown' && !game.players[0].hasPlayed) {
      var j = ui.showdownSel.indexOf(card.uid);
      if (j !== -1) ui.showdownSel.splice(j, 1);
      else if (ui.showdownSel.length < C.PLAYED_SIZE) ui.showdownSel.push(card.uid);
      render();
    }
  };

  ui.onOpponentClick = function (idx) {
    if (ui.mode !== 'select-target') return;
    ui.tradeTarget = idx;
    ui.mode = 'select-take';
    render();
  };

  ui.onOpponentCardClick = function (card) {
    if (ui.mode !== 'select-take') return;
    var give = game.players[0].hand.filter(function (c) { return c.uid === ui.tradeGive; })[0];
    confirmTradeModal(give, card, game.players[ui.tradeTarget]);
  };

  /* ---- trade helpers ------------------------------------------------------------ */
  function confirmTradeModal(give, take, targetPlayer) {
    var card = R.modal(
      '<h2>🤝 Confirm trade with ' + targetPlayer.name + '</h2>' +
      '<p>Both of you gain <b>+2 Mult</b> this round. Trade bonuses stack up to +4.</p>' +
      '<div class="score-wrap" style="justify-content:center;align-items:center">' +
      '<div class="score-cards" id="m-give"></div>' +
      '<div style="font-size:2rem">⇄</div>' +
      '<div class="score-cards" id="m-take"></div>' +
      '</div>' +
      '<div class="modal-buttons">' +
      '<button id="m-cancel" class="btn btn-secondary">Cancel</button>' +
      '<button id="m-ok" class="btn btn-primary">Trade! (+2 Mult)</button></div>');
    card.querySelector('#m-give').appendChild(R.toolkitCard(give, {}));
    card.querySelector('#m-take').appendChild(R.toolkitCard(take, {}));
    card.querySelector('#m-cancel').onclick = function () {
      R.closeModal(); ui.mode = 'idle'; ui.tradeGive = null; ui.tradeTarget = null; render();
    };
    card.querySelector('#m-ok').onclick = function () {
      R.closeModal();
      game.doTrade(0, ui.tradeTarget, give.uid, take.uid);
      ui.mode = 'idle'; ui.tradeGive = null; ui.tradeTarget = null;
      render();
      A.floatBadge($('player-strip'), '+2 MULT 🤝');
      A.pulse($('player-bank'));
      resolveHuman();
    };
  }

  function showTradeOffer(offer) {
    return new Promise(function (res) {
      var from = game.players[offer.fromIdx];
      var give = from.hand.filter(function (c) { return c.uid === offer.giveUid; })[0];
      var take = game.players[offer.toIdx].hand.filter(function (c) { return c.uid === offer.takeUid; })[0];
      var card = R.modal(
        '<h2>🤝 ' + from.name + ' offers a trade</h2>' +
        '<p>' + from.name + ' offers <b>' + give.def.name + '</b> and asks for your <b>' + take.def.name +
        '</b>. Accepting gives you <b>both +2 Mult</b> this round — accepting help never costs your action.</p>' +
        '<div class="score-wrap" style="justify-content:center;align-items:center">' +
        '<div class="score-cards" id="m-give"></div>' +
        '<div style="font-size:2rem">⇄</div>' +
        '<div class="score-cards" id="m-take"></div>' +
        '</div>' +
        '<div class="modal-buttons">' +
        '<button id="m-no" class="btn btn-secondary">Decline</button>' +
        '<button id="m-yes" class="btn btn-primary">Accept (+2 Mult)</button></div>');
      card.querySelector('#m-give').appendChild(R.toolkitCard(give, {}));
      card.querySelector('#m-take').appendChild(R.toolkitCard(take, {}));
      card.querySelector('#m-yes').onclick = function () { R.closeModal(); res(true); };
      card.querySelector('#m-no').onclick = function () { R.closeModal(); res(false); };
    });
  }

  /* ---- game flow ------------------------------------------------------------------- */

  async function startGame() {
    game = new CheckIn.Game({
      players: [{ name: 'You', isBot: false, emoji: '🫵' }].concat(
        C.BOTS.map(function (b) { return { name: b.name, isBot: true, emoji: b.emoji }; })),
    });
    ui.mode = 'idle'; ui.rerollSel = []; ui.showdownSel = [];
    ui.tradeGive = null; ui.tradeTarget = null; ui.activeBot = null;
    $('real-help-footer').textContent = C.REAL_HELP_NOTE;
    R.screen('game');
    render();
    await T.maybeAutoStart();
    await playRound();
  }

  async function playRound() {
    game.startRound();
    ui.mode = 'idle'; ui.rerollSel = []; ui.showdownSel = [];
    ui.phaseText = 'Dealing…';
    render();
    await A.dealChildren($('community-slots'), 120);
    await A.dealChildren($('player-hand'), 55);
    var oppHands = document.querySelectorAll('#zone-opponents .opp-hand');
    Array.prototype.forEach.call(oppHands, function (h) { A.dealChildren(h, 35); });
    await A.sleep(250);

    await actionPhase(1);
    ui.phaseText = 'Turn dealt!';
    render();
    R.board(game, true);            // flip the 4th community card
    await A.sleep(900);

    await actionPhase(2);
    ui.phaseText = 'River — Showdown!';
    render();
    R.board(game, true);            // flip the 5th community card
    await A.sleep(900);

    await showdownPhase();
  }

  async function actionPhase(n) {
    ui.phaseText = 'Action Phase ' + n + ' — Reroll · Trade · Keep';
    ui.mode = 'idle'; ui.rerollSel = []; ui.tradeGive = null; ui.tradeTarget = null;
    render();
    await awaitHuman();
    await botTurn(1);
    await botTurn(2);
  }

  async function botTurn(idx) {
    if (!game.inActionPhase()) return;
    ui.activeBot = idx;
    render();
    await A.sleep(500);
    var res = game.botAct(idx);
    if (res && res.pendingOffer) {
      var accepted = await showTradeOffer(res.pendingOffer);
      game.resolveBotOffer(res.pendingOffer, accepted);
      if (accepted) A.floatBadge($('player-strip'), '+2 MULT 🤝');
    }
    ui.activeBot = null;
    render();
    await A.sleep(400);
  }

  async function showdownPhase() {
    ui.phaseText = 'Showdown — pick 4 of your 6';
    ui.mode = 'showdown';
    ui.showdownSel = [];
    render();
    await awaitHuman();                    // human plays + sees scoring overlay

    for (var i = 1; i < game.players.length; i++) {
      ui.activeBot = i;
      render();
      await A.sleep(800);
      game.botPlayHand(i);
      ui.activeBot = null;
      render();
      await A.sleep(400);
    }

    await showLessons();
    game.finishRound();
    await showRoundResults();
  }

  /* ---- human showdown + scoring overlay ------------------------------------------- */

  async function onPlayHand() {
    if (ui.showdownSel.length !== C.PLAYED_SIZE) return;
    var result = game.playHand(0, ui.showdownSel);
    ui.mode = 'idle';
    render();
    A.pulse($('player-bank'));

    // build the scoring overlay
    var human = game.players[0];
    var playedHtml = '<div class="score-cards" id="sc-cards"></div>';
    var bdHtml = '<div class="breakdown"><div class="breakdown-title">Score breakdown</div>' +
      '<div id="bd-lines"></div><div class="bd-total" id="bd-total"></div></div>';
    var modal = R.modal('<h2>🌊 Your hand scores!</h2><div class="score-wrap">' + playedHtml + bdHtml + '</div>' +
      '<div class="modal-buttons"><button id="m-cont" class="btn btn-primary" style="visibility:hidden">Continue</button></div>');

    var cardsEl = modal.querySelector('#sc-cards');
    human.playedCards.forEach(function (c) {
      var cs = null, cm = null;
      result.cardScores.forEach(function (x) { if (x.uid === c.uid) { cs = x.chips; cm = x.mult; } });
      cardsEl.appendChild(R.toolkitCard(c, { finalChips: cs, finalMult: cm }));
    });

    var linesEl = modal.querySelector('#bd-lines');
    var delay = 0;
    result.log.forEach(function (entry) {
      if (entry.kind === 'base' || entry.kind === 'result') return;
      var line = document.createElement('div');
      line.className = 'bd-line kind-' + entry.kind;
      var label = document.createElement('span');
      label.className = 'bd-label'; label.textContent = entry.label;
      var delta = document.createElement('span');
      delta.className = 'bd-delta';
      if (entry.mult) { delta.className += ' d-mult'; delta.textContent = (entry.mult > 0 ? '+' : '') + entry.mult + '×'; }
      else if (entry.chips) { delta.className += ' d-chips'; delta.textContent = (entry.chips > 0 ? '+' : '') + entry.chips; }
      else delta.textContent = '—';
      line.appendChild(label); line.appendChild(delta);
      line.style.animationDelay = delay + 'ms';
      delay += 90;
      linesEl.appendChild(line);
    });

    // count-up finale
    var totalEl = modal.querySelector('#bd-total');
    await A.sleep(delay + 250);
    await A.countUp(totalEl, 0, result.chips, 600, ' chips');
    await A.sleep(120);
    totalEl.textContent = result.chips + ' chips × ' + result.mult + '×';
    await A.sleep(350);
    await A.countUp(totalEl, 0, result.score, 900, ' points!');
    A.pulse(totalEl);
    modal.querySelector('#m-cont').style.visibility = 'visible';
    await new Promise(function (res) {
      modal.querySelector('#m-cont').onclick = function () { R.closeModal(); res(); };
    });
    resolveHuman();
  }

  /* ---- lessons + results ------------------------------------------------------------ */

  function showLessons() {
    return new Promise(function (res) {
      var items = game.community.map(function (sym, i) {
        return '<div class="lesson-item" style="animation-delay:' + (i * 140) + 'ms">' +
          '<div class="lesson-icon">' + sym.def.icon + '</div>' +
          '<div><div class="lesson-name">' + sym.def.name + '</div>' +
          '<div class="lesson-text">' + sym.def.lesson + '</div></div></div>';
      }).join('');
      var modal = R.modal('<h2>🧠 What this round taught us</h2>' +
        '<p style="margin-bottom:10px">Every symptom carries the coping lesson it rewards:</p>' +
        '<div class="lesson-list">' + items + '</div>' +
        '<div class="modal-buttons"><button id="m-cont" class="btn btn-primary">Continue</button></div>');
      modal.querySelector('#m-cont').onclick = function () { R.closeModal(); res(); };
    });
  }

  function showRoundResults() {
    return new Promise(function (res) {
      var last = game.isOver;
      var rows = game.players.map(function (p) {
        return '<tr><td>' + (p.emoji || '') + ' ' + p.name + '</td>' +
          '<td class="num">' + (p.lastResult ? p.lastResult.score : 0) + '</td>' +
          '<td class="num">' + p.bank + '</td></tr>';
      }).join('');
      var modal = R.modal(
        '<h2>' + (last ? '🏁 Final results' : '📊 Round ' + game.round + ' banked') + '</h2>' +
        '<table class="results-table"><tr><th>Player</th><th>This round</th><th>Bank</th></tr>' + rows + '</table>' +
        (last ? podiumHtml() : '') +
        '<div class="modal-buttons">' +
        (last ? '<button id="m-again" class="btn btn-primary">🔁 Play Again</button>' +
               '<button id="m-title" class="btn btn-secondary">Title screen</button>'
             : '<button id="m-next" class="btn btn-primary">Next Round ▶</button>') +
        '</div>');

      if (last) {
        modal.querySelector('#m-again').onclick = function () { R.closeModal(); startGame(); };
        modal.querySelector('#m-title').onclick = function () { R.closeModal(); R.screen('title'); };
      } else {
        modal.querySelector('#m-next').onclick = function () { R.closeModal(); res(); };
      }
    });
  }

  function podiumHtml() {
    var medals = ['🥇', '🥈', '🥉', '🏅'];
    var ranking = game.ranking();
    var list = ranking.map(function (p, i) {
      return '<div style="text-align:center;margin:8px 0">' +
        '<div class="podium-medal">' + (medals[i] || '🏅') + '</div>' +
        '<b>' + game.players[p.idx].emoji + ' ' + p.name + '</b>' +
        '<div style="color:#2f6db8;font-weight:900">' + p.bank + ' chips</div></div>';
    }).join('');
    var s = game.stats;
    return '<div style="text-align:center">' + list + '</div>' +
      '<div class="game-stats" style="justify-content:center">' +
      '<span class="stat-chip">🤝 <b>' + s.trades + '</b> trades</span>' +
      '<span class="stat-chip">🙋 <b>' + s.helpCardsPlayed + '</b> help-seeking plays</span>' +
      '<span class="stat-chip">🧘 <b>' + s.selfCarePlayed + '</b> self-care plays</span>' +
      '</div>' +
      '<p style="text-align:center;color:#3e7cb1;font-size:0.8rem">' + C.REAL_HELP_NOTE + '</p>';
  }

  /* ---- button wiring -------------------------------------------------------------------- */

  $('btn-play').addEventListener('click', startGame);
  $('btn-how').addEventListener('click', function () {
    var html = '<h2>How to play Check In</h2>' +
      T.STEPS.map(function (s) { return '<h3 style="margin:14px 0 4px">' + s.title + '</h3><p>' + s.html + '</p>'; }).join('') +
      '<div class="modal-buttons"><button id="m-ok" class="btn btn-primary">Got it</button></div>';
    var modal = R.modal(html);
    modal.querySelector('#m-ok').onclick = R.closeModal;
  });
  $('btn-tutorial').addEventListener('click', function () { T.start(); });

  $('btn-reroll').addEventListener('click', function () {
    if (ui.mode === 'idle' && !game.players[0].actedThisPhase && game.inActionPhase()) {
      ui.mode = 'select-reroll'; ui.rerollSel = []; render();
    } else if (ui.mode === 'select-reroll') {
      if (ui.rerollSel.length === 0) { ui.mode = 'idle'; render(); return; }  // "Back"
      game.doReroll(0, ui.rerollSel);
      ui.mode = 'idle'; ui.rerollSel = [];
      render();
      resolveHuman();
    }
  });

  $('btn-trade').addEventListener('click', function () {
    if (ui.mode === 'idle' && !game.players[0].actedThisPhase && game.inActionPhase()) {
      ui.mode = 'select-give'; ui.tradeGive = null; render();
    }
  });

  $('btn-keep').addEventListener('click', function () {
    if (ui.mode.indexOf('select-') === 0) {          // cancel trade flow / back out of reroll
      ui.mode = 'idle'; ui.rerollSel = []; ui.tradeGive = null; ui.tradeTarget = null;
      render(); return;
    }
    if (ui.mode === 'idle' && !game.players[0].actedThisPhase && game.inActionPhase()) {
      game.doReroll(0, []);                          // pass
      ui.mode = 'idle';
      render();
      resolveHuman();
    }
  });

  $('btn-play-hand').addEventListener('click', onPlayHand);
})();
