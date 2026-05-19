// Pressdown analytics — Google Analytics 4, consent-gated.
//
// NOTE: Pressdown is no longer a zero-network app. Your newsletter content
// (Markdown, issues, brands, logos) still never leaves the browser — it lives
// in IndexedDB and is never uploaded. The site loads Google Analytics to
// measure anonymous usage, but ONLY after the visitor accepts the consent
// banner. This is disclosed in privacy.html.
//
// Single source of truth for the GA4 Measurement ID. Until a real ID is set
// here, this file loads NOTHING and shows no banner — the stage is wired,
// dormant. Replace the placeholder with your real ID (G-XXXXXXXXXX).

(function () {
  var GA4_ID = 'G-8YN8SD8GSZ'; // <-- set your GA4 Measurement ID
  var KEY = 'pressdown_consent';

  // Not configured yet: no banner, no script, no network call.
  if (!GA4_ID || GA4_ID === 'G-XXXXXXXXXX') return;

  function loadGA() {
    if (window.__pdGA) return;
    window.__pdGA = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA4_ID);
  }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'granted') { loadGA(); return; }
  if (choice === 'denied') { return; }

  // No decision yet — show a local consent banner (no third-party code).
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function showBanner() {
    var bar = document.createElement('div');
    bar.className = 'consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.innerHTML =
      '<p class="consent-text">Pressdown uses Google Analytics to measure ' +
      'anonymous usage. Your newsletter content is never read or sent. ' +
      '<a href="privacy.html">Details</a>.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="btn btn-ghost" data-c="deny">Decline</button>' +
      '<button type="button" class="btn btn-primary" data-c="allow">Accept</button>' +
      '</div>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      if (b.dataset.c === 'allow') { setChoice('granted'); loadGA(); }
      else { setChoice('denied'); }
      bar.remove();
    });
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
