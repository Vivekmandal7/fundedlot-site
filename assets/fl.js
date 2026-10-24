/*!
 * FundedLot site script, on every page.
 *
 *   FL.rec    the AI signal record as HTML, from the public catalog. The build
 *             runs these same functions to bake the record into each page
 *             (build.mjs evaluates this file with no `document`); the page
 *             then refreshes it from /api/web/mentor/catalog.
 *   FL.auth   sign-in with the app's own account (Firebase email + password),
 *             so a plan saved here is the plan the app reads.
 *   FL.api    calls to the FundedLot server, signed in when asked.
 *   the sign-in pop-up, the header's account button, and store routing:
 *   on a phone every "Get the app" goes straight to that phone's store.
 */
(function (root) {
  'use strict';
  var FL = (root.FL = root.FL || {});

  /* ------------------------------------------------- the record (pure) --- */

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var NAMES = { XAUUSD: 'Gold', XAGUSD: 'Silver', BTCUSD: 'Bitcoin', ETHUSD: 'Ethereum', SOLUSD: 'Solana', US30: 'Dow 30', NAS100: 'Nasdaq 100', SPX500: 'S&P 500' };
  var UNITS = { pips: 'pips', points: 'pts', percent: '%' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function round(n, d) { var f = Math.pow(10, d); return String(Math.round(n * f) / f); }
  function signed(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + round(Math.abs(n), d); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function when(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }
  function day(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function market(sym) {
    if (NAMES[sym]) return NAMES[sym];
    return /^[A-Z]{6}$/.test(sym) ? sym.slice(0, 3) + '/' + sym.slice(3) : sym;
  }
  function signals(c) { return (c && c.ai && Array.isArray(c.ai.signals)) ? c.ai.signals : []; }
  function decided(s) { return s.outcome === 'closed' || s.outcome === 'invalidated' || s.outcome === 'hit'; }
  function inCat(s, cat) { return !cat || s.category === cat; }

  /** The result chip: which level ended it and the R. */
  function outcome(s) {
    var r = num(s.outcomeR);
    var rr = r === null ? '' : ' · ' + signed(r, 2) + 'R';
    var tone = r === null ? '' : r > 0 ? 'is-win' : r < 0 ? 'is-loss' : '';
    switch (s.outcome) {
      case 'active': return { tone: 'is-live', label: 'Live now' };
      case 'expired': return { tone: '', label: 'No fill' };
      case 'invalidated': return { tone: 'is-loss', label: 'Stop' + rr };
      case 'hit': return { tone: 'is-win', label: 'TP' + (s.targetCount || 3) + rr };
      case 'closed': return { tone: tone, label: ((s.targetsHit || 0) > 0 ? 'TP' + s.targetsHit : 'Time limit') + rr };
      default: return { tone: '', label: esc(s.outcome) };
    }
  }
  function move(s) {
    var m = s.move;
    if (!m || num(m.value) === null) return '';
    return signed(m.value, 1) + (m.unit === 'percent' ? '%' : ' ' + (UNITS[m.unit] || m.unit));
  }
  function tallyOf(c, cat) {
    var t = { posted: 0, won: 0, lost: 0, netR: 0, open: 0 };
    signals(c).forEach(function (s) {
      if (!inCat(s, cat) || s.outcome === 'expired') return;
      t.posted += 1;
      if (s.outcome === 'active') { t.open += 1; return; }
      if (!decided(s)) return;
      var r = num(s.outcomeR) || 0;
      if (r > 0) t.won += 1; else if (r < 0) t.lost += 1;
      t.netR += r;
    });
    return t;
  }

  FL.rec = {
    tally: function (c, cat) {
      var t = tallyOf(c, cat);
      var since = c && c.ai && c.ai.since ? day(c.ai.since) : '';
      if (!t.posted) {
        return '<p class="rec-note">The record starts with the first AI signal' + (cat ? ' in this market' : '') +
          '. Every one stays on it, win or loss.</p>';
      }
      var net = t.netR;
      return '<div class="rec-tally">' +
        '<div class="rt"><b>' + t.posted + '</b><span>signals posted</span></div>' +
        '<div class="rt"><b>' + t.won + '</b><span>won</span></div>' +
        '<div class="rt"><b>' + t.lost + '</b><span>lost</span></div>' +
        '<div class="rt ' + (net > 0 ? 'is-win' : net < 0 ? 'is-loss' : '') + '"><b>' + signed(net, 2) + 'R</b><span>net, in risk units</span></div>' +
        '</div><p class="rec-note">Every AI signal' + (cat ? ' in this market' : '') + (since ? ' since ' + since : '') +
        (t.open ? ', ' + t.open + ' live now' : '') + '. Wins and losses, nothing removed. Past results never promise future ones.</p>';
    },
    tape: function (c) {
      var items = signals(c).filter(decided).slice(0, 12).map(function (s) {
        var o = outcome(s);
        return '<span class="tick"><span class="s">' + esc(market(s.instrument)) + '</span><span class="p">' +
          (s.side === 'short' ? 'SELL' : 'BUY') + '</span><span class="' + (o.tone === 'is-win' ? 'up' : o.tone === 'is-loss' ? 'dn' : 'p') + '">' +
          o.label + '</span><span class="p">' + esc(move(s)) + '</span></span>';
      });
      if (!items.length) return '';
      while (items.length < 8) items = items.concat(items);
      var run = items.join('');
      return '<div class="ticker-track">' + run + run + '</div>';
    },
    /** [member]: the caller's own open signals (FL.api ai/live), shown with their levels. */
    cards: function (c, cat, n, member) {
      var list = signals(c).filter(function (s) { return inCat(s, cat) && s.outcome !== 'expired'; }).slice(0, n || 6);
      if (!list.length) {
        return '<p class="rec-empty">No AI signal in this market yet. The scan runs every 15 minutes in its session, and the first one shows here with its result.</p>';
      }
      return list.map(function (s) {
        var o = outcome(s);
        var side = s.side === 'short' ? 'SELL' : 'BUY';
        var head = '<header><b>' + esc(market(s.instrument)) + '</b><span class="side ' + (s.side === 'short' ? 'is-sell' : 'is-buy') + '">' + side +
          '</span><time datetime="' + esc(s.postedAt) + '">' + esc(when(s.postedAt)) + '</time></header>';
        if (s.locked || (s.outcome === 'active' && !member)) {
          return '<article class="sig-card is-locked" data-cat="' + esc(s.category) + '">' + head +
            '<div class="lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Live now. Members see the entry, stop and targets in the app, sized to their account.</div>' +
            '<footer><span class="oc is-live">Live now</span></footer></article>';
        }
        var tps = (s.targets || []).map(function (t, i) {
          return '<div class="' + (t.hitAt ? 'hit' : '') + '"><dt>TP' + (i + 1) + '</dt><dd>' + esc(t.price) + (t.hitAt ? ' <i aria-label="reached">✓</i>' : '') + '</dd></div>';
        }).join('');
        return '<article class="sig-card" data-cat="' + esc(s.category) + '">' + head +
          '<dl class="lv"><div><dt>Entry</dt><dd>' + esc(s.entry) + '</dd></div><div class="stop' + (s.outcome === 'invalidated' ? ' hit' : '') + '"><dt>Stop</dt><dd>' + esc(s.stop) + '</dd></div>' + tps + '</dl>' +
          '<footer><span class="oc ' + o.tone + '">' + o.label + '</span><span class="mv">' + esc(move(s)) + '</span></footer></article>';
      }).join('');
    },
    telegram: function (c) {
      var on = !!(c && c.live && c.live.telegram);
      return on
        ? '<span class="dot is-on"></span>Open to members. The app gives you a one-time link.'
        : '<span class="dot"></span>Not open yet. Every signal reaches the app with a notification meanwhile.';
    },
    since: function (c) { return c && c.ai && c.ai.since ? 'since ' + day(c.ai.since) : ''; },
    /** Closed signals with every timestamp the tracker recorded, as JSON for the replay. */
    replay: function (c) {
      var list = signals(c).filter(function (s) {
        return decided(s) && num(s.entry) !== null && num(s.stop) !== null && s.outcomeAt;
      }).slice(0, 12).map(function (s) {
        return {
          id: s.id, instrument: s.instrument, name: market(s.instrument), category: s.category, side: s.side,
          entry: s.entry, stop: s.stop, exit: num(s.exitPrice), outcome: s.outcome, r: num(s.outcomeR),
          targets: (s.targets || []).map(function (t) { return { price: t.price, at: t.hitAt || null }; }),
          from: s.filledAt || s.postedAt, to: s.outcomeAt, when: when(s.postedAt), move: move(s),
        };
      });
      return JSON.stringify(list).replace(/</g, '\\u003c');
    },
    /** The newest closed signal per market, as JSON for the sizing calculator. */
    levels: function (c) {
      var out = {};
      signals(c).forEach(function (s) {
        if (!decided(s) || out[s.category] || num(s.entry) === null || num(s.stop) === null) return;
        out[s.category] = {
          instrument: s.instrument, name: market(s.instrument), side: s.side, entry: s.entry, stop: s.stop,
          targets: (s.targets || []).map(function (t) { return t.price; }), postedAt: s.postedAt, when: when(s.postedAt),
        };
      });
      return JSON.stringify(out).replace(/</g, '\\u003c');
    },
    guarantee: function (c) {
      var g = c && c.guarantee;
      if (!g || !g.enabled || !Array.isArray(g.terms) || !g.terms.length) return '';
      return '<ol class="gt-terms">' + g.terms.map(function (t) {
        return '<li>' + esc(String(t).split('{days}').join(String(g.days))) + '</li>';
      }).join('') + '</ol>';
    },
  };

  if (typeof document === 'undefined') return; // the build: renderers only

  /* -------------------------------------------------------- the page ---- */

  var html = document.documentElement;
  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.content : ''; }
  var API = meta('fl-api');
  var FKEY = meta('fl-key');
  var STORES = { ios: meta('fl-ios'), android: meta('fl-android') };
  var LOGO = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9.6" fill="#C9F158"/><path d="M9.55 14.6v11.4M16 10.4v14.9M22.45 6.2v18.1" stroke="#101109" stroke-width="1.5" stroke-linecap="round"/><rect x="7.6" y="17.3" width="3.9" height="7.6" rx="1.95" fill="#101109"/><rect x="14.05" y="13.4" width="3.9" height="10.9" rx="1.95" fill="#101109"/><rect x="20.5" y="9" width="3.9" height="13" rx="1.95" fill="#101109"/></svg>';

  /* ---- which phone, which store ---- */
  var ua = navigator.userAgent || '';
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  FL.device = isAndroid ? 'android' : isIOS ? 'ios' : 'desktop';
  FL.storeUrl = isAndroid ? STORES.android : isIOS ? STORES.ios : '';
  html.setAttribute('data-device', FL.device);

  function routeStores() {
    if (!FL.storeUrl) return;
    document.querySelectorAll('a[data-get-app], a[href="/download/"], a[href="/get/"]').forEach(function (a) {
      if (a.closest('.store-badges') || a.hasAttribute('data-keep')) return;
      a.href = FL.storeUrl;
      a.rel = 'noopener';
    });
    // Your phone's store first and highlighted; the other stays for a second device.
    document.querySelectorAll('.store-badges').forEach(function (box) {
      var mine = box.querySelector(isAndroid ? 'a[href*="play.google.com"]' : 'a[href*="apps.apple.com"]');
      if (!mine) return;
      box.insertBefore(mine, box.firstChild);
      mine.classList.add('is-mine');
      box.classList.add('has-mine');
    });
  }

  /* A slim "Get the app" bar on phones once the reader scrolls. Safari on
     iPhone shows Apple's own Smart App Banner, so it is skipped there. */
  function getBar() {
    if (!FL.storeUrl || document.querySelector('[data-no-getbar]')) return;
    var safari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\/|Telegram|Snapchat/.test(ua);
    if (safari) return;
    try { if (sessionStorage.getItem('fl-getbar') === 'off') return; } catch (e) { /* storage blocked */ }
    var bar = document.createElement('div');
    bar.className = 'get-bar';
    bar.innerHTML = '<a class="gb-link" href="' + esc(FL.storeUrl) + '" rel="noopener">' + LOGO +
      '<span class="gb-t"><b>FundedLot: Prop Firm Signals</b><small>Free on ' + (isAndroid ? 'Google Play' : 'the App Store') + '</small></span>' +
      '<span class="gb-btn">Get</span></a><button class="gb-x" type="button" aria-label="Hide">×</button>';
    document.body.appendChild(bar);
    bar.querySelector('.gb-x').addEventListener('click', function () {
      bar.remove();
      try { sessionStorage.setItem('fl-getbar', 'off'); } catch (e) { /* storage blocked */ }
    });
    var shown = false;
    function onScroll() {
      var want = window.scrollY > 420;
      if (want !== shown) { shown = want; bar.classList.toggle('is-in', want); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---- the account: Firebase email + password, the same as the app ---- */
  var IDP = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  var STS = 'https://securetoken.googleapis.com/v1/token?key=';
  var STORE_KEY = 'fl-auth';
  var MSG = {
    EMAIL_NOT_FOUND: 'That email and password do not match an account.',
    INVALID_PASSWORD: 'That email and password do not match an account.',
    INVALID_LOGIN_CREDENTIALS: 'That email and password do not match an account.',
    EMAIL_EXISTS: 'An account with this email exists. Sign in instead.',
    WEAK_PASSWORD: 'Use a password of at least 6 characters.',
    INVALID_EMAIL: 'Check the email address.',
    MISSING_PASSWORD: 'Enter your password.',
    MISSING_EMAIL: 'Enter your email.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes, then try again.',
    USER_DISABLED: 'This account is switched off. Write to support@fundedlot.com.',
    OPERATION_NOT_ALLOWED: 'Email sign-in is closed right now. Try again later.',
  };
  function readSession() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }
  var session = readSession();
  var listeners = [];
  function emit() {
    var u = FL.auth.user();
    html.setAttribute('data-auth', u ? 'in' : 'out');
    listeners.forEach(function (fn) { try { fn(u); } catch (e) { /* a listener's own problem */ } });
  }
  function keep(s) {
    session = s;
    try { if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s)); else localStorage.removeItem(STORE_KEY); } catch (e) { /* private mode: this tab only */ }
    emit();
  }
  function idp(method, body) {
    return fetch(IDP + method + '?key=' + encodeURIComponent(FKEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) return j;
        var code = String((j && j.error && j.error.message) || '').split(' ')[0];
        var e = new Error(MSG[code] || 'Something went wrong. Try again.');
        e.code = code;
        throw e;
      });
    }, function () { throw new Error('No connection. Check your internet and try again.'); });
  }
  function fromIdp(j) {
    return { uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (parseInt(j.expiresIn, 10) || 3600) * 1000 };
  }

  FL.auth = {
    user: function () { return session ? { uid: session.uid, email: session.email } : null; },
    signIn: function (email, password) {
      return idp('signInWithPassword', { email: email, password: password, returnSecureToken: true }).then(function (j) { keep(fromIdp(j)); return FL.auth.user(); });
    },
    signUp: function (email, password) {
      return idp('signUp', { email: email, password: password, returnSecureToken: true }).then(function (j) { keep(fromIdp(j)); return FL.auth.user(); });
    },
    reset: function (email) { return idp('sendOobCode', { requestType: 'PASSWORD_RESET', email: email }); },
    signOut: function () { keep(null); },
    /** A fresh ID token: refreshed a couple of minutes before it runs out. */
    token: function () {
      if (!session) return Promise.reject(new Error('Sign in first.'));
      if (session.exp - Date.now() > 120000) return Promise.resolve(session.idToken);
      return fetch(STS + encodeURIComponent(FKEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { keep(null); throw new Error('Your session ended. Sign in again.'); }
          keep({ uid: j.user_id, email: session.email, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000 });
          return session.idToken;
        });
      });
    },
    onChange: function (fn) { listeners.push(fn); },
  };
  window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) { session = readSession(); emit(); } });

  FL.api = function (path, opts) {
    opts = opts || {};
    function go(token) {
      var h = {};
      if (opts.body !== undefined) h['Content-Type'] = 'application/json';
      if (token) h.Authorization = 'Bearer ' + token;
      return fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok) return j;
            var e = new Error(j.error || 'Something went wrong. Try again.');
            e.status = r.status;
            e.code = j.code;
            throw e;
          });
        }, function () { throw new Error('No connection to FundedLot. Try again in a moment.'); });
    }
    return opts.auth ? FL.auth.token().then(go) : go(null);
  };

  FL.catalog = function () {
    if (!FL._catalog) FL._catalog = FL.api('/api/web/mentor/catalog').catch(function () { return null; });
    return FL._catalog;
  };

  /* The baked record stays until the live one arrives; a server that is
     down or switched off leaves the build's copy in place. */
  function refreshRecord() {
    var slots = document.querySelectorAll('[data-rec]');
    if (!slots.length) return;
    FL.catalog().then(function (c) {
      if (!c || !c.ai) return;
      slots.forEach(function (el) {
        var fn = FL.rec[el.getAttribute('data-rec')];
        if (!fn) return;
        var out = fn(c, el.getAttribute('data-cat') || '', parseInt(el.getAttribute('data-n') || '6', 10));
        el.innerHTML = out;
        if (el.hasAttribute('data-hide-empty')) el.hidden = !out;
      });
      document.dispatchEvent(new CustomEvent('fl:catalog', { detail: c }));
    });
  }

  /* ---- the sign-in pop-up ---- */
  var dlg = null;
  var mode = 'in';
  function setMode(m) {
    mode = m;
    if (!dlg) return;
    dlg.querySelector('#auth-title').textContent = m === 'up' ? 'Create your FundedLot account' : m === 'reset' ? 'Reset your password' : 'Sign in to FundedLot';
    dlg.querySelectorAll('.auth-tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); b.setAttribute('aria-selected', b.getAttribute('data-mode') === m ? 'true' : 'false'); });
    dlg.querySelector('.auth-tabs').hidden = m === 'reset';
    dlg.querySelector('.pw').hidden = m === 'reset';
    var pw = dlg.querySelector('input[name="password"]');
    pw.required = m !== 'reset';
    pw.autocomplete = m === 'up' ? 'new-password' : 'current-password';
    dlg.querySelector('.auth-go').textContent = m === 'up' ? 'Create account' : m === 'reset' ? 'Send the reset link' : 'Sign in';
    dlg.querySelector('.auth-forgot').textContent = m === 'reset' ? 'Back to sign in' : 'Forgot password?';
    dlg.querySelector('.auth-hint').hidden = m !== 'up';
    say('', false);
  }
  function say(text, good) {
    var p = dlg.querySelector('.auth-err');
    p.textContent = text;
    p.hidden = !text;
    p.classList.toggle('is-good', !!good);
  }
  function buildDialog() {
    dlg = document.createElement('dialog');
    dlg.className = 'auth-dialog';
    dlg.setAttribute('aria-labelledby', 'auth-title');
    dlg.innerHTML =
      '<button class="auth-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<div class="auth-mark">' + LOGO + '</div>' +
      '<h2 id="auth-title">Sign in to FundedLot</h2>' +
      '<p class="auth-sub">One account for the website and the app. Your plan, your signals and your membership follow you.</p>' +
      '<div class="auth-tabs" role="tablist"><button type="button" role="tab" data-mode="in" class="on">Sign in</button><button type="button" role="tab" data-mode="up">Create account</button></div>' +
      '<form class="auth-form" novalidate>' +
      '<label>Email<input type="email" name="email" autocomplete="email" inputmode="email" required></label>' +
      '<label class="pw">Password<input type="password" name="password" autocomplete="current-password" minlength="6" required></label>' +
      '<p class="auth-hint" hidden>At least 6 characters. Use the same email in the app to see your plan there.</p>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button class="btn btn-volt auth-go" type="submit">Sign in</button>' +
      '<button class="auth-forgot" type="button">Forgot password?</button>' +
      '</form>' +
      '<p class="auth-fine">By continuing you agree to the <a href="/terms/">terms</a> and the <a href="/privacy/">privacy policy</a>.</p>';
    document.body.appendChild(dlg);
    dlg.querySelector('.auth-x').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('.auth-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
    dlg.querySelector('.auth-forgot').addEventListener('click', function () { setMode(mode === 'reset' ? 'in' : 'reset'); });
    var form = dlg.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      var pw = form.password.value;
      if (!email) return say(MSG.MISSING_EMAIL);
      if (mode !== 'reset' && pw.length < 6) return say(mode === 'up' ? MSG.WEAK_PASSWORD : MSG.MISSING_PASSWORD);
      var go = form.querySelector('.auth-go');
      go.disabled = true;
      var job = mode === 'reset' ? FL.auth.reset(email) : mode === 'up' ? FL.auth.signUp(email, pw) : FL.auth.signIn(email, pw);
      job.then(function () {
        go.disabled = false;
        if (mode === 'reset') {
          say('Check ' + email + ' for a link to set a new password.', true);
          return;
        }
        var next = dlg._next;
        dlg.close();
        if (next) location.href = next;
        else if (!/^\/account\/?$/.test(location.pathname)) location.href = '/account/';
      }, function (err) {
        go.disabled = false;
        say(err.message);
      });
    });
  }
  FL.openSignIn = function (opts) {
    opts = opts || {};
    var probe = document.createElement('dialog');
    if (typeof probe.showModal !== 'function') { location.href = '/account/'; return; }
    if (!dlg) buildDialog();
    dlg._next = opts.next || null;
    setMode(opts.mode || 'in');
    dlg.showModal();
    var input = dlg.querySelector('input[name="email"]');
    setTimeout(function () { input.focus(); }, 30);
  };

  function accountButtons(u) {
    // Only the header's icon button carries its own label; a button with words keeps them.
    document.querySelectorAll('[data-signin] .lbl').forEach(function (label) {
      label.textContent = u ? 'My plan' : 'Sign in';
      label.parentElement.setAttribute('aria-label', u ? 'My plan' : 'Sign in');
    });
  }

  /* Video posters load only when the video comes near the screen. */
  function lazyPosters() {
    var vids = document.querySelectorAll('video[data-poster]');
    if (!vids.length) return;
    var set = function (v) { v.poster = v.getAttribute('data-poster'); v.removeAttribute('data-poster'); };
    if (!('IntersectionObserver' in window)) { vids.forEach(set); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); set(e.target); } });
    }, { rootMargin: '600px 0px' });
    vids.forEach(function (v) { io.observe(v); });
  }

  /* ---- a soft light that follows the pointer across dark panels ---- */
  function glow() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-glow]').forEach(function (el) {
      var raf = 0, x = 0, y = 0;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        x = e.clientX - r.left; y = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px'); });
      });
    });
  }

  /* ---- the replay: a real signal from the record, played out ----
     Entry, stop, targets, the times each target was reached and the close
     are the record's own. The line between those points is drawn (seeded,
     so a signal always draws the same), never tick data, and it never
     crosses a level the record says was not reached. */
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function unitValue(sig) {
    if (sig.category === 'forex') return /USD$/.test(sig.instrument) ? 100000 : 100000 / sig.entry;
    if (sig.category === 'metals') return /XAG/.test(sig.instrument) ? 5000 : 100;
    return 1;
  }
  function money(n) { return (n < 0 ? '−' : '+') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }

  function buildPath(sig) {
    var dir = sig.side === 'short' ? -1 : 1;
    var t0 = Date.parse(sig.from), t1 = Date.parse(sig.to);
    if (!(t1 > t0)) t1 = t0 + 3600e3;
    var risk = Math.abs(sig.entry - sig.stop);
    var exit = sig.exit != null ? sig.exit : sig.outcome === 'invalidated' ? sig.stop : sig.entry;
    var way = [{ t: t0, p: sig.entry, kind: 'fill' }];
    sig.targets.forEach(function (tg, i) { if (tg.at) way.push({ t: Math.max(t0, Math.min(t1, Date.parse(tg.at))), p: tg.price, kind: 'tp', i: i }); });
    way.sort(function (a, b) { return a.t - b.t; });
    way.push({ t: t1, p: exit, kind: 'close' });
    var rnd = seeded(sig.id || sig.instrument);
    var pts = [], stopNow = sig.stop, hits = 0;
    for (var w = 0; w < way.length - 1; w++) {
      var a = way[w], b = way[w + 1];
      if (a.kind === 'tp') { hits += 1; stopNow = hits === 1 ? sig.entry : sig.targets[hits - 2].price; }
      var nextTp = sig.targets[hits] ? sig.targets[hits].price : null;
      var n = Math.max(6, Math.round(22 * (b.t - a.t) / (t1 - t0)));
      for (var k = 0; k < n; k++) {
        var u = k / n;
        var p = a.p + (b.p - a.p) * u + (rnd() - .5) * risk * .7 * Math.sin(Math.PI * u) + Math.sin(u * 9 + w) * risk * .08 * Math.sin(Math.PI * u);
        // never touch the stop or the next target before the record says so
        var lo = dir > 0 ? stopNow + risk * .06 : (nextTp != null ? nextTp + risk * .06 : -Infinity);
        var hi = dir > 0 ? (nextTp != null ? nextTp - risk * .06 : Infinity) : stopNow - risk * .06;
        if (k > 0) p = Math.min(hi, Math.max(lo, p));
        pts.push({ t: a.t + (b.t - a.t) * u, p: p });
      }
    }
    pts.push({ t: t1, p: exit });
    return { pts: pts, way: way, t0: t0, t1: t1, exit: exit, dir: dir };
  }

  function replay(root) {
    var dataEl = root.querySelector('script[type="application/json"]');
    var list = [];
    try { list = JSON.parse(dataEl.textContent || '[]'); } catch (e) { list = []; }
    if (!list.length) { root.hidden = true; return; }
    var idx = 0, size = 100000, prog = 0, playing = false, raf = 0, last = 0, model = null, fired = {};
    var DUR = 9000;
    root.insertAdjacentHTML('beforeend',
      '<div class="rp-head"><div class="rp-title"><span class="rp-tag">Replay</span><b class="rp-name"></b><span class="side"></span><span class="rp-when"></span></div>' +
      '<div class="rp-acct" role="group" aria-label="Account size">' + [10000, 50000, 100000, 200000].map(function (v) {
        return '<button type="button" class="opt" data-v="' + v + '" aria-pressed="' + (v === size) + '">$' + (v / 1000) + 'K</button>';
      }).join('') + '</div></div>' +
      '<div class="rp-stage"><div class="rp-lines"></div><svg class="rp-svg" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true"><path class="rp-area"/><path class="rp-path"/></svg><span class="rp-dot"></span><div class="rp-toasts" aria-live="polite"></div></div>' +
      '<div class="rp-foot"><button type="button" class="rp-play" aria-label="Play">▶</button>' +
      '<input type="range" class="rp-scrub" min="0" max="1000" value="0" aria-label="Replay position">' +
      '<div class="rp-pnl"><span class="rp-on">On $100K</span><b class="rp-money">+$0</b><small class="rp-lots"></small></div>' +
      '<button type="button" class="rp-next">Next signal →</button></div>' +
      '<p class="rp-note">Real entry, stop, targets, the times they were reached and the close, from the AI record. The line between them is drawn, not tick data. Sized at 0.5% risk.</p>');
    var $ = function (s) { return root.querySelector(s); };
    var lines = $('.rp-lines'), path = $('.rp-path'), area = $('.rp-area'), dot = $('.rp-dot'), toasts = $('.rp-toasts');
    var lo, hi, levelEls = {};

    function y(p) { return (1 - (p - lo) / (hi - lo)) * 100; }
    function x(t) { return 3 + (t - model.t0) / (model.t1 - model.t0) * 94; }
    function lots() {
      var sig = list[idx], dist = Math.abs(sig.entry - sig.stop) * unitValue(sig);
      var l = Math.floor((size * 0.005 / dist + 1e-9) / 0.01) * 0.01;
      return Math.max(0.01, l);
    }
    function level(key, price, label, cls) {
      var el = document.createElement('div');
      el.className = 'rp-level ' + cls;
      el.innerHTML = '<span>' + label + ' <b>' + price + '</b></span>';
      el.style.top = y(price) + '%';
      lines.appendChild(el);
      levelEls[key] = el;
    }
    function load(i) {
      idx = (i + list.length) % list.length;
      var sig = list[idx];
      model = buildPath(sig);
      var prices = [sig.entry, sig.stop].concat(sig.targets.map(function (t) { return t.price; }), model.pts.map(function (q) { return q.p; }));
      lo = Math.min.apply(null, prices); hi = Math.max.apply(null, prices);
      var pad = (hi - lo) * .1; lo -= pad; hi += pad;
      $('.rp-name').textContent = sig.name;
      var side = $('.rp-head .side');
      side.textContent = sig.side === 'short' ? 'SELL' : 'BUY';
      side.className = 'side ' + (sig.side === 'short' ? 'is-sell' : 'is-buy');
      $('.rp-when').textContent = sig.when;
      lines.innerHTML = ''; levelEls = {}; toasts.innerHTML = '';
      sig.targets.forEach(function (t, k) { level('tp' + k, t.price, 'TP' + (k + 1), 'is-tp'); });
      level('entry', sig.entry, 'Entry', 'is-entry');
      level('stop', sig.stop, 'Stop', 'is-stop');
      root.setAttribute('data-cat', sig.category);
      fired = {};
      seek(0);
    }
    function stopAt(hits) {
      var sig = list[idx];
      return hits <= 0 ? sig.stop : hits === 1 ? sig.entry : sig.targets[hits - 2].price;
    }
    function seek(p) {
      prog = Math.max(0, Math.min(1, p));
      var sig = list[idx], tNow = model.t0 + (model.t1 - model.t0) * prog;
      var vis = model.pts.filter(function (q) { return q.t <= tNow; });
      if (!vis.length) vis = [model.pts[0]];
      var last = vis[vis.length - 1];
      // interpolate the head between points for a smooth ride
      var nxt = model.pts[vis.length];
      var head = last;
      if (nxt && nxt.t > last.t) { var u = (tNow - last.t) / (nxt.t - last.t); head = { t: tNow, p: last.p + (nxt.p - last.p) * u }; }
      var d = vis.map(function (q, k) { return (k ? 'L' : 'M') + (x(q.t) * 10).toFixed(1) + ' ' + (y(q.p) * 4).toFixed(1); }).join(' ') + ' L' + (x(head.t) * 10).toFixed(1) + ' ' + (y(head.p) * 4).toFixed(1);
      path.setAttribute('d', d);
      area.setAttribute('d', d + ' L' + (x(head.t) * 10).toFixed(1) + ' 400 L' + (x(model.t0) * 10).toFixed(1) + ' 400 Z');
      dot.style.left = x(head.t) + '%';
      dot.style.top = y(head.p) + '%';
      var hits = model.way.filter(function (w) { return w.kind === 'tp' && w.t <= tNow; }).length;
      var done = prog >= 1;
      // the stop follows the room's rule: TP1 → entry, TP2 → TP1
      var st = levelEls.stop;
      st.style.top = y(stopAt(hits)) + '%';
      st.querySelector('b').textContent = stopAt(hits);
      st.classList.toggle('moved', hits > 0);
      sig.targets.forEach(function (t, k) { levelEls['tp' + k].classList.toggle('hit', !!t.at && Date.parse(t.at) <= tNow); });
      var price = done ? model.exit : head.p;
      var pnl = (price - sig.entry) * model.dir * lots() * unitValue(sig);
      var m = $('.rp-money');
      m.textContent = money(pnl);
      m.className = 'rp-money ' + (pnl > 0 ? 'is-win' : pnl < 0 ? 'is-loss' : '');
      $('.rp-on').textContent = 'On $' + (size / 1000) + 'K';
      $('.rp-lots').textContent = (Math.round(lots() * 100) / 100) + (sig.category === 'crypto' ? ' coins' : ' lots');
      $('.rp-scrub').value = Math.round(prog * 1000);
      root.classList.toggle('is-done', done);
      // events, once per run
      model.way.forEach(function (w, k) {
        if (w.kind === 'fill' || w.t > tNow || fired[k]) return;
        fired[k] = true;
        if (!playing) return;
        if (w.kind === 'tp') {
          var gain = (w.p - sig.entry) * model.dir * lots() * unitValue(sig);
          toast('TP' + (w.i + 1) + ' reached ✓ ' + money(gain) + (w.i === 0 ? ' · stop to entry' : ' · stop to TP' + w.i), 'is-win');
          burst();
        } else if (w.kind === 'close') {
          var r = sig.r;
          var label = sig.outcome === 'invalidated' ? 'Stopped' : hits ? 'Closed at the trailed stop' : 'Closed at the time limit';
          toast(label + (r != null ? ' · ' + (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(Math.round(r * 100) / 100) + 'R' : '') + (sig.move ? ' · ' + sig.move : ''), r > 0 ? 'is-win' : r < 0 ? 'is-loss' : '');
        }
      });
    }
    function toast(text, tone) {
      var t = document.createElement('div');
      t.className = 'rp-toast ' + (tone || '');
      t.textContent = text;
      toasts.appendChild(t);
      setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 2600);
    }
    function burst() {
      if (REDUCED) return;
      var colors = ['#C9F158', '#FF4FAE', '#2FD3C6', '#F8E07C', '#8E5CFF'];
      for (var i = 0; i < 14; i++) {
        var s = document.createElement('i');
        s.className = 'rp-spark';
        s.style.left = dot.style.left; s.style.top = dot.style.top;
        s.style.background = colors[i % colors.length];
        var a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 50;
        s.style.setProperty('--dx', Math.cos(a) * r + 'px');
        s.style.setProperty('--dy', Math.sin(a) * r + 'px');
        $('.rp-stage').appendChild(s);
        setTimeout(function (el) { return function () { el.remove(); }; }(s), 900);
      }
    }
    function frame(ts) {
      if (!playing) return;
      if (!last) last = ts;
      var p = prog + (ts - last) / DUR;
      last = ts;
      seek(p);
      if (p >= 1) { pause(); return; }
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (prog >= 1) { fired = {}; toasts.innerHTML = ''; seek(0); }
      playing = true; last = 0;
      root.classList.add('is-playing');
      $('.rp-play').textContent = '❚❚'; $('.rp-play').setAttribute('aria-label', 'Pause');
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      playing = false; cancelAnimationFrame(raf);
      root.classList.remove('is-playing');
      $('.rp-play').textContent = prog >= 1 ? '↻' : '▶';
      $('.rp-play').setAttribute('aria-label', prog >= 1 ? 'Replay' : 'Play');
    }
    $('.rp-play').addEventListener('click', function () { if (playing) pause(); else play(); });
    $('.rp-next').addEventListener('click', function () { pause(); load(idx + 1); play(); });
    $('.rp-scrub').addEventListener('input', function (e) {
      pause();
      var p = e.target.value / 1000;
      if (p < prog) fired = {};
      seek(p);
      model.way.forEach(function (w, k) { if (w.t <= model.t0 + (model.t1 - model.t0) * p) fired[k] = true; });
    });
    root.querySelectorAll('.rp-acct .opt').forEach(function (b) {
      b.addEventListener('click', function () {
        size = parseInt(b.getAttribute('data-v'), 10);
        root.querySelectorAll('.rp-acct .opt').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        seek(prog);
      });
    });
    // open on the newest signal that reached a target: the most to watch
    var first = 0;
    for (var f = 0; f < list.length; f++) { if (list[f].targets.some(function (t) { return t.at; })) { first = f; break; } }
    load(first);
    if (REDUCED) { seek(1); pause(); return; }
    // plays itself the first time it scrolls into view
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); setTimeout(play, 350); } });
      }, { threshold: .45 });
      io.observe(root);
    }
  }

  /* ---- motion: 3D tilt on the colour boxes, magnetic buttons, sticker parallax ---- */
  function motion() {
    if (REDUCED) return;
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine) {
      document.querySelectorAll('.bx, .sig-card, a.mk, .cards > .card, .join > li, .post-card').forEach(function (el) {
        var raf2 = 0;
        el.addEventListener('pointermove', function (e) {
          el.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
          if (raf2) return;
          raf2 = requestAnimationFrame(function () {
            raf2 = 0;
            el.style.transform = 'perspective(900px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-4px)';
            el.style.setProperty('--gx', ((px + .5) * 100).toFixed(1) + '%');
            el.style.setProperty('--gy', ((py + .5) * 100).toFixed(1) + '%');
          });
        });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; });
        el.classList.add('tilt');
      });
      document.querySelectorAll('.btn-lg').forEach(function (b) {
        b.addEventListener('pointermove', function (e) {
          var r = b.getBoundingClientRect();
          b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .12).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * .2).toFixed(1) + 'px)';
        });
        b.addEventListener('pointerleave', function () { b.style.transform = ''; });
      });
    }
    var stickers = document.querySelectorAll('[data-par]');
    if (stickers.length) {
      var tick = false;
      window.addEventListener('scroll', function () {
        if (tick) return;
        tick = true;
        requestAnimationFrame(function () {
          tick = false;
          var sy = window.scrollY;
          stickers.forEach(function (s) { s.style.setProperty('--py', (sy * parseFloat(s.getAttribute('data-par'))).toFixed(1) + 'px'); });
        });
      }, { passive: true });
    }
  }

  function start() {
    routeStores();
    getBar();
    accountButtons(FL.auth.user());
    FL.auth.onChange(accountButtons);
    html.setAttribute('data-auth', FL.auth.user() ? 'in' : 'out');
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-signin]');
      if (!a || FL.auth.user()) return;
      e.preventDefault();
      FL.openSignIn({ next: a.getAttribute('data-next') || null });
    });
    refreshRecord();
    glow();
    document.querySelectorAll('[data-replay]').forEach(replay);
    motion();
    lazyPosters();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : this);
