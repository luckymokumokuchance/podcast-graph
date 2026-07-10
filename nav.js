/*
 * nav.js — ラッキーもくもくチャンス 共通ナビゲーションメニュー
 *
 * 使い方：各HTMLの </body> の直前に次の1行を書き足すだけ。
 *   <script src="nav.js"></script>
 *
 * このファイルだけで完結しています（CSSも中に入っています）。
 * ページを増やしたくなったら、下の PAGES 配列に1行足してください。
 */
(function () {
  'use strict';

  // ── ページ一覧（ここを編集すればメニューが増える）────────────────
  var PAGES = [
    { file: 'index.html', label: 'グラフ',     alsoMatch: ['', '/'] },
    { file: 'episodes.html', label: 'エピソード' },
    { file: 'log.html',   label: 'LOG' }
  ];

  // ── 今どのページを見ているかを判定 ──────────────────────────
  var here = location.pathname.split('/').pop();
  function isCurrent(page) {
    if (here === page.file) return true;
    if (page.alsoMatch && page.alsoMatch.indexOf(here) !== -1) return true;
    return false;
  }

  // ── スタイル ───────────────────────────────────────────
  var css = [
    '#lm-nav{position:fixed;right:20px;bottom:20px;z-index:9999;',
    'font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Yu Gothic",sans-serif;}',

    '#lm-nav-btn{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
    'background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 2px 12px rgba(0,0,0,.18);transition:transform .2s ease;padding:0;}',
    '#lm-nav-btn:hover{transform:scale(1.06);}',
    '#lm-nav-btn:focus-visible{outline:3px solid #089900;outline-offset:3px;}',

    '#lm-nav-btn .lm-bar{display:block;width:20px;height:2px;background:#fff;border-radius:2px;',
    'position:absolute;transition:transform .25s ease,opacity .2s ease;}',
    '#lm-nav-btn .lm-bar:nth-child(1){transform:translateY(-6px);}',
    '#lm-nav-btn .lm-bar:nth-child(3){transform:translateY(6px);}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(1){transform:rotate(45deg);}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(2){opacity:0;}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(3){transform:rotate(-45deg);}',

    '#lm-nav-list{list-style:none;margin:0 0 14px 0;padding:0;',
    'display:flex;flex-direction:column;align-items:flex-end;gap:10px;}',

    '#lm-nav-list li{opacity:0;transform:translateY(8px);pointer-events:none;',
    'transition:opacity .22s ease,transform .22s ease;}',
    '#lm-nav.open #lm-nav-list li{opacity:1;transform:none;pointer-events:auto;}',
    '#lm-nav.open #lm-nav-list li:nth-child(1){transition-delay:.06s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(2){transition-delay:.03s;}',

    '#lm-nav-list a{display:flex;align-items:center;gap:10px;text-decoration:none;',
    'background:#fff;color:#1a1a1a;font-size:15px;padding:9px 16px 9px 13px;',
    'border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.12);white-space:nowrap;',
    'transition:transform .15s ease;}',
    '#lm-nav-list a:hover{transform:translateX(-3px);}',
    '#lm-nav-list a:focus-visible{outline:3px solid #089900;outline-offset:2px;}',

    '.lm-dot{width:12px;height:12px;border-radius:50%;background:#d6d6d6;flex:none;}',
    '#lm-nav-list a[aria-current="page"] .lm-dot{background:#089900;}',
    '#lm-nav-list a[aria-current="page"]{font-weight:700;}',

    '@keyframes lm-pulse{0%{box-shadow:0 0 0 0 rgba(8,153,0,.45);}',
    '70%{box-shadow:0 0 0 7px rgba(8,153,0,0);}100%{box-shadow:0 0 0 0 rgba(8,153,0,0);}}',
    '#lm-nav-list a[aria-current="page"] .lm-dot{animation:lm-pulse 2s ease-out infinite;}',

    '@media (prefers-reduced-motion:reduce){',
    '#lm-nav *{animation:none!important;transition:none!important;}}',

    '@media (max-width:480px){#lm-nav{right:14px;bottom:14px;}',
    '#lm-nav-btn{width:50px;height:50px;}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── HTMLを組み立て ─────────────────────────────────────
  var nav = document.createElement('nav');
  nav.id = 'lm-nav';
  nav.setAttribute('aria-label', 'ページ移動');

  var list = document.createElement('ul');
  list.id = 'lm-nav-list';

  PAGES.forEach(function (page) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = page.file;
    if (isCurrent(page)) a.setAttribute('aria-current', 'page');

    var dot = document.createElement('span');
    dot.className = 'lm-dot';
    dot.setAttribute('aria-hidden', 'true');

    a.appendChild(dot);
    a.appendChild(document.createTextNode(page.label));
    li.appendChild(a);
    list.appendChild(li);
  });

  var btn = document.createElement('button');
  btn.id = 'lm-nav-btn';
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'メニューを開く');
  btn.style.position = 'relative';
  for (var i = 0; i < 3; i++) {
    var bar = document.createElement('span');
    bar.className = 'lm-bar';
    bar.setAttribute('aria-hidden', 'true');
    btn.appendChild(bar);
  }

  nav.appendChild(list);
  nav.appendChild(btn);

  // ── 開閉の動き ─────────────────────────────────────────
  function setOpen(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  }

  btn.addEventListener('click', function () {
    setOpen(!nav.classList.contains('open'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      btn.focus();
    }
  });

  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) setOpen(false);
  });

  function mount() { document.body.appendChild(nav); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
