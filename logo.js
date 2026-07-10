/*
 * logo.js — ラッキーもくもくチャンス 共通ロゴ（左上・全ページ共通）
 *
 * 使い方：各HTMLの </body> の直前に、nav.js と並べて書き足すだけ。
 *   <script src="nav.js"></script>
 *   <script src="logo.js"></script>
 *
 * このファイルだけで完結しています（CSSも中に入っています）。
 * クリック/タップで index.html（TOP）へ戻ります。
 *
 * サイズ設計の考え方：
 *   3枚のロゴ画像を横に並べた「合計の幅」が画面幅を超えるとハミ出す。
 *   なので高さは vmin（画面の短い方の辺）ではなく vw（画面の"幅"）基準で
 *   決める。横幅が主役の素材だから。
 */
(function () {
  'use strict';

  var css = [
    '#lm-logo{position:fixed;z-index:10;',
    'top:calc(12px + env(safe-area-inset-top,0px));',
    'left:calc(12px + env(safe-area-inset-left,0px));',
    'display:flex;align-items:center;',
    'gap:clamp(6px, 1.6vw, 20px);',
    'text-decoration:none;line-height:0;}',

    '#lm-logo img{height:clamp(32px, 8.5vw, 50px);width:auto;display:block;}',

    '#lm-logo:focus-visible{outline:3px solid #089900;outline-offset:4px;',
    'border-radius:4px;}',

    '@media (min-width:900px){',
    '#lm-logo img{height:clamp(46px, 3.4vw, 64px);}',
    '#lm-logo{gap:clamp(10px, 1.4vw, 20px);',
    'top:calc(20px + env(safe-area-inset-top,0px));',
    'left:calc(20px + env(safe-area-inset-left,0px));}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var a = document.createElement('a');
  a.id = 'lm-logo';
  a.href = 'index.html';
  a.setAttribute('aria-label', 'ラッキーもくもくチャンス トップへ');

  var parts = [
    { file: 'ラキモクチャン_ロゴ_ラッキー.png', alt: 'ラッキー' },
    { file: 'ラキモクチャン_ロゴ_もくもく.png', alt: 'もくもく' },
    { file: 'ラキモクチャン_ロゴ_チャンス.png', alt: 'チャンス' }
  ];

  parts.forEach(function (p) {
    var img = document.createElement('img');
    img.src = 'image/' + encodeURIComponent(p.file);
    img.alt = p.alt;
    a.appendChild(img);
  });

  function mount() { document.body.appendChild(a); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
