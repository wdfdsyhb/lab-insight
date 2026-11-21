/* =========================================================
   dashboard.js — 虚拟仪表盘（v4.0，纯 SVG 拟物，无外部依赖）
   实时串口采集时的"活仪表台"：把采集面板的实时数值变成三个
   会动的仪表——温度计（液柱）、指针表盘、七段数码管。
   · 通道语义未知，所以按归一化标度显示：液柱/指针位置取
     (v − min) / (max − min)，min/max 用当前采集的滑动范围
   · 毛刺告警时对应仪表描边红色呼吸光（与采集面板 spike 联动）
   · 每个仪表下方标注对应通道名，数据全部来自采集管线，无假数据
   ========================================================= */

const LabDashboard = (() => {

  const NS = 'http://www.w3.org/2000/svg';
  let root = null;
  let gauges = []; // [{key, type, svg, els…, lastKey}]

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function clear() {
    if (root) root.innerHTML = '';
    gauges = [];
  }

  /* ---------- 温度计 ---------- */

  function buildThermometer(key) {
    const svg = el('svg', { viewBox: '0 0 80 190', width: '84', height: '200' });
    // 玻璃管
    svg.appendChild(el('rect', { x: 32, y: 10, width: 16, height: 140, rx: 8, fill: '#f4f6fa', stroke: '#c8ccd4' }));
    // 底泡
    svg.appendChild(el('circle', { cx: 40, cy: 162, r: 16, fill: '#f4f6fa', stroke: '#c8ccd4' }));
    // 液柱（scaleY 由 update 控制，transform-origin 底部）
    const liquid = el('rect', { x: 35, y: 14, width: 10, height: 132, rx: 5, fill: '#2563eb' });
    svg.appendChild(liquid);
    const bulb = el('circle', { cx: 40, cy: 162, r: 11, fill: '#2563eb' });
    svg.appendChild(bulb);
    // 刻度
    for (let i = 0; i <= 4; i++) {
      const y = 150 - i * 33;
      svg.appendChild(el('line', { x1: 50, y1: y, x2: 60, y2: y, stroke: '#9b9b9b', 'stroke-width': 1 }));
    }
    const g = { key: key, type: 'thermo', svg: svg, liquid: liquid, bulb: bulb,
      value: null };
    const vt = el('text', { x: 40, y: 188, 'text-anchor': 'middle', 'font-size': 11, fill: '#37352f' });
    vt.textContent = '—';
    svg.appendChild(vt);
    g.valueText = vt;
    return g;
  }

  function updateThermometer(g, v, min, max, spike) {
    const span = (max - min) || 1;
    const t = Math.max(0, Math.min(1, (v - min) / span));
    const h = Math.max(4, t * 132);
    g.liquid.setAttribute('height', h.toFixed(1));
    g.liquid.setAttribute('y', (146 - h).toFixed(1));
    const hue = Math.round(210 - t * 210); // 蓝(210) → 红(0)
    const col = `hsl(${hue}, 78%, 48%)`;
    g.liquid.setAttribute('fill', col);
    g.bulb.setAttribute('fill', col);
    g.valueText.textContent = g.label + ' ' + fmtVal(v);
    setSpike(g, spike);
  }

  /* ---------- 指针表盘 ---------- */

  function buildDial(key) {
    const svg = el('svg', { viewBox: '0 0 170 120', width: '180', height: '128' });
    svg.appendChild(el('path', { d: 'M20 100 A 68 68 0 0 1 150 100', fill: 'none', stroke: '#c8ccd4', 'stroke-width': 6 }));
    // 刻度
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1 + i / 8);
      const x1 = 85 + Math.cos(a) * 60, y1 = 100 + Math.sin(a) * 60;
      const x2 = 85 + Math.cos(a) * 66, y2 = 100 + Math.sin(a) * 66;
      svg.appendChild(el('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: '#9b9b9b', 'stroke-width': 1.5 }));
    }
    const needle = el('line', { x1: 85, y1: 100, x2: 85, y2: 42, stroke: '#d97706', 'stroke-width': 3, 'stroke-linecap': 'round' });
    svg.appendChild(needle);
    svg.appendChild(el('circle', { cx: 85, cy: 100, r: 5, fill: '#37352f' }));
    const g = { key: key, type: 'dial', svg: svg, needle: needle, value: null };
    const vt = el('text', { x: 85, y: 116, 'text-anchor': 'middle', 'font-size': 11, fill: '#37352f' });
    vt.textContent = '—';
    svg.appendChild(vt);
    g.valueText = vt;
    return g;
  }

  function updateDial(g, v, min, max, spike) {
    const span = (max - min) || 1;
    const t = Math.max(0, Math.min(1, (v - min) / span));
    const ang = -120 + t * 240; // -120° … +120°
    const rad = (ang - 90) * Math.PI / 180;
    g.needle.setAttribute('x2', (85 + Math.cos(rad) * 58).toFixed(1));
    g.needle.setAttribute('y2', (100 + Math.sin(rad) * 58).toFixed(1));
    g.valueText.textContent = g.label + ' ' + fmtVal(v);
    setSpike(g, spike);
  }

  /* ---------- 七段数码管 ---------- */

  const SEG = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    '-': 'g'
  };

  function buildDigits(key) {
    const svg = el('svg', { viewBox: '0 0 260 84', width: '268', height: '92' });
    svg.appendChild(el('rect', { x: 2, y: 2, width: 256, height: 80, rx: 8, fill: '#10131a' }));
    const g = { key: key, type: 'digits', svg: svg, groups: [], value: null };
    const vt = el('text', { x: 130, y: 82, 'text-anchor': 'middle', 'font-size': 0, fill: '#37352f' });
    svg.appendChild(vt);
    g.valueText = vt;
    return g;
  }

  // 单个 7 段数字：w=14,h=26，段厚 3
  function drawDigit(parent, x, y, ch, on) {
    const segs = on && SEG[ch] !== undefined ? SEG[ch] : '';
    const L = {
      a: [x + 2, y, x + 15, y], b: [x + 16, y + 2, x + 16, y + 13],
      c: [x + 16, y + 15, x + 16, y + 26], d: [x + 2, y + 27, x + 15, y + 27],
      e: [x + 1, y + 15, x + 1, y + 26], f: [x + 1, y + 2, x + 1, y + 13],
      g: [x + 2, y + 13.5, x + 15, y + 13.5]
    };
    for (const k in L) {
      const [x1, y1, x2, y2] = L[k];
      parent.appendChild(el('line', {
        x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: segs.indexOf(k) >= 0 ? '#ff5d3a' : '#23272f',
        'stroke-width': 3, 'stroke-linecap': 'round'
      }));
    }
  }

  function updateDigits(g, v, min, max, spike) {
    // 重画整个数字区（段数固定，直接重建开销可忽略：≤6 字符 × 7 段）
    while (g.svg.lastChild && g.svg.lastChild.tagName === 'g') g.svg.removeChild(g.svg.lastChild);
    const wrap = document.createElementNS(NS, 'g');
    const str = (v < 0 ? '-' : '') + Math.abs(v).toFixed(1);
    const chars = str.slice(0, 6).split('');
    let x = 130 - chars.length * 20;
    for (const ch of chars) {
      if (ch === '.') { x += 8; continue; }
      drawDigit(wrap, x, 28, ch, true);
      x += 22;
    }
    g.svg.appendChild(wrap);
    g.valueText.textContent = g.label;
    setSpike(g, spike);
  }

  /* ---------- 公共 ---------- */

  function fmtVal(v) {
    return Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);
  }

  function setSpike(g, spike) {
    g.svg.style.filter = spike ? 'drop-shadow(0 0 6px rgba(220,38,38,0.9))' : '';
  }

  // 依据当前 liveSeries 的通道数选择仪表组合：
  //   1 通道 → 大温度计；2 通道 → 温度计 + 表盘；≥3 → 温度计 + 表盘 + 数码管
  function update(seriesMap, keyOrder, spikeKeys) {
    if (!root) return;
    const keys = keyOrder.slice(0, 3);
    // 组数变化时重建
    if (keys.length !== gauges.length || gauges.some((g, i) => keys[i] !== g.key)) {
      clear();
      keys.forEach((key, i) => {
        const type = i === 0 ? 'thermo' : i === 1 ? 'dial' : 'digits';
        const g = type === 'thermo' ? buildThermometer(key)
          : type === 'dial' ? buildDial(key) : buildDigits(key);
        g.label = key;
        root.appendChild(g.svg);
        gauges.push(g);
      });
    }
    keys.forEach((key, i) => {
      const g = gauges[i];
      const s = seriesMap.get(key);
      if (!s || !s.data.length) return;
      const v = s.data[s.data.length - 1].y;
      let min = Infinity, max = -Infinity;
      for (const p of s.data) { if (p.y < min) min = p.y; if (p.y > max) max = p.y; }
      if (!isFinite(min)) { min = v - 1; max = v + 1; }
      if (max === min) { max = min + 1; }
      const spike = !!(spikeKeys && spikeKeys.indexOf(key) >= 0);
      if (g.type === 'thermo') updateThermometer(g, v, min, max, spike);
      else if (g.type === 'dial') updateDial(g, v, min, max, spike);
      else updateDigits(g, v, min, max, spike);
    });
  }

  function mount(container) {
    root = container;
    root.innerHTML = '';
  }

  return { mount: mount, update: update, clear: clear };
})();
