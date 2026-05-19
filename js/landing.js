// landing.js — interactive riso starfield for the landing page only.
// Vanilla, self-contained, offline. A clean, even dot grid (matching the
// original CSS speckle) that drifts slowly, gently twinkles, and eases out
// of the way of the cursor, then settles straight back.
// Honors prefers-reduced-motion (static grid, no motion, no repulsion).

(function () {
  var canvas = document.getElementById('stars');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  // Mark the doc so CSS drops the ::before fallback (no double dots).
  document.documentElement.classList.add('canvas-stars');

  // Dot color = the theme's ink, drawn at low alpha so it stays well below
  // text contrast (readability) regardless of brand/B&W theme.
  function inkRGB() {
    var v = getComputedStyle(document.documentElement)
      .getPropertyValue('--ink').trim() || '#2b2620';
    var m = v.replace('#', '');
    if (m.length === 3) m = m[0]+m[0]+m[1]+m[1]+m[2]+m[2];
    var n = parseInt(m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var rgb = inkRGB();

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var S = 24;          // grid pitch (px) — same density as the old speckle
  var DOT = 1;         // uniform dot radius (px)
  var BASE_A = 0.14;   // uniform base alpha (well under text)
  var R = 130;         // cursor influence radius
  var PUSH = 34;       // max displacement away from cursor
  var EASE = 0.16;     // how fast the repulsion offset eases in / back

  var dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  var W = 0, H = 0, cols = 0, rows = 0, ox = [], oy = [];
  var driftY = 0, tw = 0;
  var mx = -9999, my = -9999;

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / S) + 2;
    rows = Math.ceil(H / S) + 2;
    ox = new Float32Array(cols * rows);   // eased repel offset per dot
    oy = new Float32Array(cols * rows);
  }

  function paint(moving) {
    ctx.clearRect(0, 0, W, H);
    var span = H + S * 2;
    var a = moving ? BASE_A * (0.8 + 0.2 * Math.sin(tw)) : BASE_A * 0.85;
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
    ctx.beginPath();                       // one path for the whole field
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        var bx = c * S;
        // base y drifts down, wrapped at DRAW time (no easing across the
        // wrap → no streaks). 1px dots make the wrap imperceptible.
        var by = ((r * S + driftY) % span + span) % span - S;

        if (moving) {
          var dx = (bx + ox[i]) - mx;
          var dy = (by + oy[i]) - my;
          var d = Math.sqrt(dx * dx + dy * dy);
          var tx = 0, ty = 0;
          if (d < R && d > 0.01) {
            var f = (R - d) / R;
            tx = (dx / d) * f * PUSH;
            ty = (dy / d) * f * PUSH;
          }
          ox[i] += (tx - ox[i]) * EASE;
          oy[i] += (ty - oy[i]) * EASE;
        }

        var px = bx + ox[i], py = by + oy[i];
        ctx.moveTo(px + DOT, py);          // moveTo so dots don't connect
        ctx.arc(px, py, DOT, 0, 6.2832);
      }
    }
    ctx.fill();
  }

  var raf = 0;
  function frame() {
    driftY += 0.12;     // slow downward drift (~matches the old animation)
    tw += 0.03;         // gentle global twinkle
    paint(true);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  build();

  if (reduce) {
    paint(false);                         // static, no motion, no repulsion
  } else {
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
    }, { passive: true });
    // Only reset when the cursor truly leaves the viewport (mouseleave on
    // the document does NOT bubble per-element — unlike pointerout).
    document.addEventListener('mouseleave', function () { mx = my = -9999; });
    window.addEventListener('blur', function () { mx = my = -9999; });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    start();
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      build();
      if (reduce) paint(false);
    }, 150);
  });
})();
