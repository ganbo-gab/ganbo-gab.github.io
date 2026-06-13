/* ==========================================================================
   main.js — 交互动效系统
   打字机 / 数字计数 / 滚动入场 / 导航高亮 / 进度条 / 复制微信
   ========================================================================== */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ① 打字机 ---------- */
  var phrases = [
    '一个热爱使用 AI 的大学生',
    'AI 二创 / AI 抽象小视频创作者',
    '全网播放 5000万+，单条最高 2731万',
    '133⭐ 开源工具 open-storyboard-canvas 作者',
    '网名 y不y · UltramanSaga',
    '计算机科学与技术在读'
  ];
  var twEl = document.getElementById('typewriter');

  if (twEl) {
    if (prefersReduced) {
      twEl.textContent = phrases[0];
    } else {
      var pi = 0, ci = 0, deleting = false;
      (function tick() {
        var word = phrases[pi];
        ci += deleting ? -1 : 1;
        twEl.textContent = word.slice(0, ci);

        var delay = deleting ? 38 : 92;
        if (!deleting && ci === word.length) { delay = 2100; deleting = true; }
        else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 420; }
        setTimeout(tick, delay);
      })();
    }
  }

  /* ---------- ② 数字滚动计数 ---------- */
  function easeOutExpo(x) { return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); }

  function runCounter(el) {
    var target = parseFloat(el.dataset.target);
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    var suffix = el.dataset.suffix || '';
    if (prefersReduced) { el.textContent = target.toFixed(decimals) + suffix; return; }

    var dur = 1900, t0 = null;
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min((now - t0) / dur, 1);
      var val = target * easeOutExpo(p);
      el.textContent = val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- ②b 环形图生长动画 ---------- */
  function runDonut(el) {
    if (prefersReduced) { el.style.setProperty('--deg', '360deg'); return; }
    var dur = 1600, t0 = null;
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min((now - t0) / dur, 1);
      el.style.setProperty('--deg', (360 * easeOutExpo(p)).toFixed(1) + 'deg');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- ③ 滚动入场（含计数触发） ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');

  // 同一容器内的兄弟元素自动 stagger
  var groups = {};
  revealEls.forEach(function (el) {
    var key = el.parentElement ? Array.prototype.indexOf.call(document.querySelectorAll('*'), el.parentElement) : 0;
    groups[key] = groups[key] || 0;
    el.style.setProperty('--d', (groups[key] * 0.12).toFixed(2) + 's');
    groups[key]++;
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('visible');
      el.querySelectorAll('.count').forEach(function (c) {
        if (!c.dataset.done) { c.dataset.done = '1'; runCounter(c); }
      });
      var donut = el.querySelector('.donut');
      if (donut && !donut.dataset.done) { donut.dataset.done = '1'; runDonut(donut); }
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(function (el) { io.observe(el); });

  /* ---------- ④ 导航：滚动态 + 当前幕高亮 ---------- */
  var nav = document.getElementById('nav');
  var navLinks = document.querySelectorAll('.nav-link');
  var sections = document.querySelectorAll('section[id]');

  var sectionIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var id = entry.target.id;
      navLinks.forEach(function (l) {
        l.classList.toggle('active', l.getAttribute('href') === '#' + id);
      });
    });
  }, { threshold: 0.4 });

  sections.forEach(function (s) { sectionIO.observe(s); });

  /* ---------- ⑤ 进度条 + 导航背景（rAF 节流） ---------- */
  var bar = document.getElementById('progressBar');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
      nav.classList.toggle('scrolled', window.scrollY > 40);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- ⑥ 点击复制微信号 ---------- */
  var wx = document.getElementById('wechatCode');
  var hint = document.getElementById('copyHint');

  if (wx) {
    wx.addEventListener('click', function () {
      var text = wx.textContent.trim();
      function ok() {
        hint.textContent = '✓ 已复制';
        hint.classList.add('copied');
        setTimeout(function () {
          hint.textContent = '点击复制微信号';
          hint.classList.remove('copied');
        }, 2200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok).catch(function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  }

  /* ---------- ⑦ GitHub 实时 star / fork ---------- */
  var GH_REPO = 'ganbo-gab/open-storyboard-canvas';
  var GH_CACHE = 'gh-stats-osc';

  function applyGh(stars, forks) {
    document.querySelectorAll('[data-gh-stars]').forEach(function (el) { el.textContent = stars; });
    document.querySelectorAll('[data-gh-forks]').forEach(function (el) { el.textContent = forks; });
    if (typeof phrases !== 'undefined') {
      for (var i = 0; i < phrases.length; i++) {
        phrases[i] = phrases[i].replace(/\d+⭐/, stars + '⭐');
      }
    }
  }

  (function loadGh() {
    var fresh = false;
    try {
      var c = JSON.parse(localStorage.getItem(GH_CACHE) || 'null');
      if (c && typeof c.s === 'number') { applyGh(c.s, c.f); fresh = (Date.now() - c.t < 3600000); }
    } catch (e) {}
    if (fresh) return; // 缓存仍新鲜，跳过请求
    fetch('https://api.github.com/repos/' + GH_REPO)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.stargazers_count !== 'number') return;
        applyGh(d.stargazers_count, d.forks_count);
        try { localStorage.setItem(GH_CACHE, JSON.stringify({ s: d.stargazers_count, f: d.forks_count, t: Date.now() })); } catch (e) {}
      })
      .catch(function () {}); // 静默失败，保留 HTML 里的静态值
  })();
})();
