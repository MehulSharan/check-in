/*
 * Check In — js/ui/animations.js
 * ------------------------------------------------------------------
 * Small timing/animation helpers: sleeps, staggered deals, number
 * count-ups (Balatro-style), floating badges.
 */
(function (root) {
  'use strict';
  var CheckIn = root.CheckIn = root.CheckIn || {};

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Stagger a container's children flying in from the top. */
  function dealChildren(container, perCardMs) {
    var kids = Array.prototype.slice.call(container.children);
    kids.forEach(function (k, i) {
      k.classList.add('anim-deal');
      k.style.animationDelay = (i * (perCardMs || 55)) + 'ms';
    });
    return sleep(kids.length * (perCardMs || 55) + 380);
  }

  /* Number count-up with easing. Returns a promise. */
  function countUp(el, from, to, ms, suffix) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      el.classList.add('ticking');
      function frame(t) {
        var p = Math.min(1, (t - t0) / ms);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = Math.round(from + (to - from) * eased);
        el.textContent = val + (suffix || '');
        if (p < 1) requestAnimationFrame(frame);
        else { el.classList.remove('ticking'); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  /* One-shot pulse on any element (scales up + back). */
  function pulse(el) {
    if (!el) return;
    el.classList.remove('anim-pulse');
    void el.offsetWidth; // restart animation
    el.classList.add('anim-pulse');
  }

  /* Floating badge ("+2 MULT 🤝") that rises and fades above `anchor`. */
  function floatBadge(anchor, text) {
    if (!anchor) return;
    var badge = document.createElement('span');
    badge.className = 'float-badge';
    badge.textContent = text;
    if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
    anchor.appendChild(badge);
    setTimeout(function () { if (badge.parentNode) badge.parentNode.removeChild(badge); }, 1400);
  }

  CheckIn.Anim = { sleep: sleep, dealChildren: dealChildren, countUp: countUp, pulse: pulse, floatBadge: floatBadge };
})(typeof self !== 'undefined' ? self : globalThis);
