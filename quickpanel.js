// ============================================================
// 見え方の調整パネル（サイト訪問者向け）
// - iframe埋め込み時（Studio上）でも表示される
// - 既存の #controls 内スライダーに値を書き込み input イベントを
//   発火するだけの「プロキシ」方式。graph.js のロジックは変更しない
// - 設定は localStorage に保存し、次回訪問時も引き継ぐ
// ============================================================
(function () {
  const STORAGE_KEY = 'lmc-graph-settings-v1';

  // 訪問者に見せる項目（id = 既存スライダーのid）
  const ITEMS = [
    { id: 's-link',    label: 'つながりの長さ' },
    { id: 's-charge',  label: 'ちらばり具合' },
    { id: 's-radius',  label: '円の大きさ' },
    { id: 's-rotate',  label: 'まわる速さ' },
  ];

  // ---------- スタイル ----------
  const style = document.createElement('style');
  style.textContent = `
    #qp-toggle {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 30;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(255,255,255,0.92);
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      cursor: pointer;
      font-size: 19px;
      line-height: 1;
      color: #089900;
    }
    #qp-panel {
      position: absolute;
      top: 66px;
      right: 14px;
      z-index: 30;
      width: min(240px, calc(100vw - 28px));
      background: rgba(255,255,255,0.95);
      border-radius: 18px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.22);
      padding: 14px 16px 12px;
      font-family: "Hiragino Maru Gothic ProN", "BIZ UDGothic", sans-serif;
      font-size: 12px;
      color: #333;
    }
    #qp-panel[hidden] { display: none; }
    #qp-panel h2 {
      margin: 0 0 10px;
      font-size: 13px;
      color: #0b6100;
      letter-spacing: 0.05em;
    }
    .qp-row { margin-bottom: 10px; }
    .qp-row label {
      display: block;
      margin-bottom: 2px;
      font-weight: 600;
    }
    .qp-row input[type="range"] {
      width: 100%;
      accent-color: #089900;
      cursor: pointer;
    }
    #qp-reset {
      display: block;
      width: 100%;
      margin-top: 4px;
      padding: 7px 0;
      font: inherit;
      font-weight: 700;
      color: #0b6100;
      background: #eef6ec;
      border: none;
      border-radius: 999px;
      cursor: pointer;
    }
    #qp-toggle:focus-visible, #qp-panel :focus-visible {
      outline: 3px solid #089900;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);

  // ---------- グラフ初期化後にパネルを組み立てる ----------
  window.addEventListener('graph-ready', init, { once: true });

  function init() {
    const container = document.getElementById('graph-container');
    if (!container) return;

    // 既存スライダー（graph.jsのイベントリスナーが付いた実体）
    const targets = {};
    const defaults = {};
    for (const item of ITEMS) {
      const el = document.getElementById(item.id);
      if (!el) return; // 構成が変わっていたら何もしない（安全側）
      targets[item.id]  = el;
      defaults[item.id] = el.value; // この時点の値を「もとに戻す」先にする
    }

    // 開閉ボタン
    const toggle = document.createElement('button');
    toggle.id = 'qp-toggle';
    toggle.setAttribute('aria-label', '見え方を調整する');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☁';

    // パネル
    const panel = document.createElement('div');
    panel.id = 'qp-panel';
    panel.hidden = true;
    panel.innerHTML = `<h2>見え方をちょっと調整</h2>`;

    const sliders = {};
    for (const item of ITEMS) {
      const t = targets[item.id];
      const row = document.createElement('div');
      row.className = 'qp-row';
      const inputId = 'qp-' + item.id;
      row.innerHTML = `<label for="${inputId}">${item.label}</label>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.id   = inputId;
      input.min  = t.min;
      input.max  = t.max;
      input.step = t.step;
      input.value = t.value;
      input.addEventListener('input', () => apply(item.id, input.value));
      row.appendChild(input);
      panel.appendChild(row);
      sliders[item.id] = input;
    }

    const reset = document.createElement('button');
    reset.id = 'qp-reset';
    reset.textContent = 'もとに戻す';
    reset.addEventListener('click', () => {
      for (const item of ITEMS) {
        sliders[item.id].value = defaults[item.id];
        apply(item.id, defaults[item.id]);
      }
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    });
    panel.appendChild(reset);

    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });

    container.appendChild(toggle);
    container.appendChild(panel);

    // 既存スライダーへ値を反映（プロキシ）
    function apply(id, value, save = true) {
      const t = targets[id];
      t.value = value;
      t.dispatchEvent(new Event('input', { bubbles: false }));
      if (save) persist();
    }

    function persist() {
      const obj = {};
      for (const item of ITEMS) obj[item.id] = sliders[item.id].value;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
    }

    // 保存済み設定の復元
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        for (const item of ITEMS) {
          if (saved[item.id] != null) {
            sliders[item.id].value = saved[item.id];
            apply(item.id, saved[item.id], false);
          }
        }
      }
    } catch (e) {}
  }
})();
