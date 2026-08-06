/*
 * logo.js（app/版） — ラッキーもくもくチャンス 共通ロゴ（左上・全ページ共通）
 *
 * ルート直下の logo.js と見た目・挙動は同じ。app/ サブフォルダから使うため、
 * 画像パスだけ ../image/ にしてある（クリック時の遷移先 index.html は
 * 相対解決でそのまま app/index.html になるので変更不要）。
 *
 * index.html（グラフページ）だけは導入しない。D3内で graph.js が
 * 独自にロゴを描画する仕組み（ASSET_BASEパッチ済み）が既にあるため。
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
    img.src = '../image/' + encodeURIComponent(p.file);
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
