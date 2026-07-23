/*
 * nav.js（app/版） — ラッキーもくもくチャンス 共通ナビゲーションメニュー
 *
 * ルート直下の nav.js と見た目・挙動は同じ。app/ サブフォルダから使うため、
 * 他ページへのリンクは ../ 付き、EP LISTだけは他ページに飛ばず、
 * このページ内のテーブルビュー（#tab-table）を開く特殊項目にしてある。
 *
 * このファイルだけで完結しています（CSSも中に入っています）。
 */
(function () {
  'use strict';

  // ── ページ一覧（ここを編集すればメニューが増える）────────────────
  var PAGES = [
    { href: '../index.html',    label: 'TOP',      match: ['index.html', '', '/'] },
    { href: '../about.html',    label: 'ABOUT',    match: ['about.html'] },
    { href: '#',                label: 'EP LIST',  action: 'table' },
    { href: '../concepts.html', label: 'CONCEPTS', match: ['concepts.html', 'concept.html'] },
    { href: '../inspired.html', label: 'INSPIRED', match: ['inspired.html'] },
    { href: '../log.html',      label: 'LOG',      match: ['log.html'] },
    { href: '../contact.html',  label: 'CONTACT',  match: ['contact.html'] }
  ];

  // ── 今どのページを見ているかを判定（EP LISTは判定対象外。テーブルビューの
  //    開閉状態に合わせて別途ハイライトする） ─────────────────
  var here = location.pathname.split('/').pop();
  function isCurrent(page) {
    return !!(page.match && page.match.indexOf(here) !== -1);
  }

  // ── スタイル（ルート版 nav.js と同一） ───────────────────────
  var css = [
    '#lm-nav{position:fixed;z-index:9999;',
    'right:calc(20px + env(safe-area-inset-right,0px));',
    'bottom:calc(20px + env(safe-area-inset-bottom,0px));',
    'display:flex;flex-direction:column;align-items:center;',
    'max-height:calc(100svh - 32px);',
    'font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Yu Gothic",sans-serif;}',

    /* 開閉ボタン */
    '#lm-nav-btn{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;',
    'background:#6b6b6b;color:#fff;position:relative;padding:0;flex:none;',
    'display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 2px 10px rgba(0,0,0,.15);transition:transform .2s ease,background .2s ease;}',
    '#lm-nav-btn:hover{background:#4d4d4d;transform:scale(1.06);}',
    '#lm-nav-btn:focus-visible{outline:3px solid #089900;outline-offset:3px;}',

    '#lm-nav-btn .lm-bar{position:absolute;display:block;width:20px;height:2px;',
    'background:#fff;border-radius:2px;transition:transform .25s ease,opacity .2s ease;}',
    '#lm-nav-btn .lm-bar:nth-child(1){transform:translateY(-6px);}',
    '#lm-nav-btn .lm-bar:nth-child(3){transform:translateY(6px);}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(1){transform:rotate(45deg);}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(2){opacity:0;}',
    '#lm-nav.open #lm-nav-btn .lm-bar:nth-child(3){transform:rotate(-45deg);}',

    /* 丸ノードのリスト */
    '#lm-nav-list{list-style:none;margin:0 0 12px 0;padding:3px;',
    'display:flex;flex-direction:column;align-items:center;gap:9px;',
    'overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0;',
    'scrollbar-width:none;}',
    '#lm-nav-list::-webkit-scrollbar{display:none;}',

    '#lm-nav-list li{opacity:0;transform:translateY(10px) scale(.85);pointer-events:none;',
    'flex:none;',
    'transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.4,.64,1);}',
    '#lm-nav.open #lm-nav-list li{opacity:1;transform:none;pointer-events:auto;}',
    /* 下（ボタンに近い方）から順に出るよう、上のノードほど遅らせる。7個ぶん。 */
    '#lm-nav.open #lm-nav-list li:nth-child(1){transition-delay:.18s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(2){transition-delay:.15s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(3){transition-delay:.12s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(4){transition-delay:.09s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(5){transition-delay:.06s;}',
    '#lm-nav.open #lm-nav-list li:nth-child(6){transition-delay:.03s;}',

    '#lm-nav-list a{width:58px;height:58px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center;text-align:center;',
    'background:#a3a3a3;color:#fff;text-decoration:none;',
    'font-size:10.5px;font-weight:700;letter-spacing:.05em;line-height:1.2;',
    'box-shadow:0 2px 10px rgba(0,0,0,.12);',
    'transition:background .18s ease,transform .18s ease;}',
    '#lm-nav-list a:hover{background:#787878;transform:scale(1.07);}',
    '#lm-nav-list a:focus-visible{outline:3px solid #089900;outline-offset:3px;}',

    /* 今いるページ */
    '#lm-nav-list a[aria-current="page"]{background:#089900;}',
    '#lm-nav-list a[aria-current="page"]:hover{background:#0b6100;}',

    '@media (prefers-reduced-motion:reduce){',
    '#lm-nav *{animation:none!important;transition:none!important;}}',

    '@media (max-width:480px){',
    '#lm-nav{right:calc(14px + env(safe-area-inset-right,0px));',
    'bottom:calc(16px + env(safe-area-inset-bottom,0px));}',
    '#lm-nav-btn{width:50px;height:50px;}',
    '#lm-nav-list{gap:7px;}',
    '#lm-nav-list a{width:52px;height:52px;font-size:9.5px;}}',

    '@media (max-height:640px){',
    '#lm-nav-list{gap:6px;}',
    '#lm-nav-list a{width:46px;height:46px;font-size:9px;}}'
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

  var epListLink = null;

  PAGES.forEach(function (page) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = page.href;
    a.textContent = page.label;
    if (isCurrent(page)) a.setAttribute('aria-current', 'page');
    if (page.action === 'table') {
      epListLink = a;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var tabT = document.getElementById('tab-table');
        if (tabT) tabT.click();
        setOpen(false);
      });
    }
    li.appendChild(a);
    list.appendChild(li);
  });

  var btn = document.createElement('button');
  btn.id = 'lm-nav-btn';
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'メニューを開く');
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

  // ── EP LISTのハイライトを、テーブルビューの開閉状態に合わせる ──────
  function syncEpListCurrent() {
    if (!epListLink) return;
    var tabT = document.getElementById('tab-table');
    if (tabT && tabT.classList.contains('active')) {
      epListLink.setAttribute('aria-current', 'page');
    } else {
      epListLink.removeAttribute('aria-current');
    }
  }
  var tabN = document.getElementById('tab-network');
  var tabT = document.getElementById('tab-table');
  if (tabN) tabN.addEventListener('click', syncEpListCurrent);
  if (tabT) tabT.addEventListener('click', syncEpListCurrent);

  function mount() { document.body.appendChild(nav); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
