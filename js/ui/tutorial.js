/*
 * Check In — js/ui/tutorial.js
 * ------------------------------------------------------------------
 * 3-step first-load walkthrough with a spotlight over each zone.
 * Shows automatically on the first game (localStorage flag) and can be
 * replayed any time via the "?" button in the top bar.
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};
  var STORAGE_KEY = 'checkin_tutorial_done_v1';

  var STEPS = [
    {
      target: '#zone-board',
      title: '1 · The shared board',
      html: 'These five slots fill up like a poker board — <b>flop (3) → turn (1) → river (1)</b> — ' +
        'with shared <b>Symptom cards</b>.<br><br>' +
        'Each symptom <span style="color:#c24545">debuffs</span> some plays and ' +
        '<span style="color:#3f9d6b">rewards</span> the coping strategies that actually fit it. ' +
        '<b>Read the board before you act.</b>',
    },
    {
      target: '#player-hand',
      title: '2 · Your toolkit (face-up!)',
      html: 'No hidden cards, no betting. Your 6 toolkit cards are open information:<br><br>' +
        '<b style="color:#2f6db8">Self-Care</b> cards bank <b>Chips</b>. ' +
        '<b style="color:#c24545">Help-Seeking</b> cards add <b>Multipliers</b>.<br><br>' +
        'Score = Chips × Mult — you need <b>both</b>. Self-care alone caps your recovery; ' +
        'reaching out multiplies it.',
    },
    {
      target: '#action-bar',
      title: '3 · Your moves',
      html: 'Each action phase, choose one:<br>' +
        '🔄 <b>Reroll</b> — discard & redraw up to 2 cards.<br>' +
        '🤝 <b>Offer Trade</b> — swap a card with a classmate. <b>Both of you get +2 Mult</b> — ' +
        'helping pays, literally.<br>' +
        '⏭️ <b>Keep Hand</b> — pass.<br><br>' +
        'After the river, <b>pick 4 of your 6 cards</b> and Play Hand. Watch the live calculator. ' +
        'Highest bank after 3 rounds wins!',
    },
  ];

  var Tutorial = {
    done: function () {
      try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
    },
    markDone: function () {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* private mode etc. */ }
    },

    /* Returns a promise that resolves when the walkthrough finishes/skips. */
    start: function () {
      return new Promise(function (resolve) {
        var layer = document.getElementById('tutorial-layer');
        var spotlight = document.getElementById('tutorial-spotlight');
        var card = document.getElementById('tutorial-card');
        var stepNum = document.getElementById('tutorial-step-num');
        var textEl = document.getElementById('tutorial-text');
        var btnNext = document.getElementById('tutorial-next');
        var btnSkip = document.getElementById('tutorial-skip');
        var idx = 0;

        function position() {
          var step = STEPS[idx];
          var target = document.querySelector(step.target);
          if (target) {
            var r = target.getBoundingClientRect();
            Object.assign(spotlight.style, {
              top: (r.top - 10) + 'px', left: (r.left - 10) + 'px',
              width: (r.width + 20) + 'px', height: (r.height + 20) + 'px',
            });
            // place the coach card under the spotlight if there's room, else above
            var below = r.bottom + 20;
            var roomBelow = window.innerHeight - below > 240;
            card.style.top = roomBelow
              ? Math.min(below, window.innerHeight - 260) + 'px'
              : Math.max(16, r.top - 210) + 'px';
            card.style.left = Math.max(16, Math.min(r.left, window.innerWidth - 420)) + 'px';
          }
          stepNum.textContent = step.title;
          textEl.innerHTML = step.html;
          btnNext.textContent = idx === STEPS.length - 1 ? "Let's play!" : 'Next';
        }

        function finish() {
          layer.classList.add('hidden');
          btnNext.removeEventListener('click', onNext);
          btnSkip.removeEventListener('click', finish);
          window.removeEventListener('resize', position);
          Tutorial.markDone();
          resolve();
        }
        function onNext() {
          if (idx < STEPS.length - 1) { idx++; position(); }
          else finish();
        }

        layer.classList.remove('hidden');
        position();
        btnNext.addEventListener('click', onNext);
        btnSkip.addEventListener('click', finish);
        window.addEventListener('resize', position);
      });
    },

    maybeAutoStart: function () {
      if (Tutorial.done()) return Promise.resolve();
      return Tutorial.start();
    },
  };

  CheckIn.Tutorial = Tutorial;
  CheckIn.Tutorial.STEPS = STEPS;   // reused by the title screen "How to play" modal
})(typeof self !== 'undefined' ? self : globalThis);
