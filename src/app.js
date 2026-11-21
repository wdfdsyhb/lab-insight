/* =========================================================
   app.js — 界面交互（页签、导入、预览、图表、结论、报告）
   ========================================================= */

const state = {
  ds: null,          // 解析后的数据集
  stats: null,       // 统计结果
  conclusion: null,  // { text, html }
  reportText: '',
  pending: null,     // { text? aoa? fileName sourceType } 待解析输入
  pendingNote: '',   // 编码提示等
  pendingOps: null,  // 项目恢复时暂存的操作流水，解析成功后接回 state.ops
  ops: [],           // 可复现操作流水（解析/换算/滤波/清洗记录，写进报告）
  chart: null,
  filterChart: null,
  fftChart: null,
  filterSel: null,
  chartMode: 'line',
  activeSeries: new Set(),
  deepBusy: false,
  calibMode: 'ntc',  // 当前换算模式 ntc / adc / mq
  calibLog: [],      // 已执行的换算记录（追溯用）
   replay: null,      // 回放状态（null = 未在回放）
   healthBackup: null, // 数据体检一键处理前的快照（撤销用）
   histChart: null,   // 直方图实例（v2.4）
   histSel: null,     // 直方图当前列 index
   rangeSel: null,    // 区间统计当前范围 {from,to}（图表缩放联动）
   ntcTheoryChart: null, // NTC R-T 标定图实例（v2.4）
   outlierMethod: 'mad', // 异常判定口径 mad / sigma3 / iqr（v2.4）
   events: [],           // 实验事件标注 [{x, label}]（v2.5）
   compareSets: [],      // 多组并列对比：[{label, ds}]，第一组=当前数据（v2.8）
   compareChart: null,   // 对比图实例（v2.8）
   showErrBars: true,    // 主图是否叠加不确定度误差棒（v2.9）
   spcSel: null,         // SPC 控制图当前列 index（v3.0）
   spcN: 5,              // SPC 子组大小（v3.0）
   spcXChart: null,      // SPC 均值图实例（v3.0）
   spcRChart: null,      // SPC 极差图实例（v3.0）
   dashOn: true          // 虚拟仪表盘开关（v4.0；放 state 里，采集与设置两处共用）
  };

const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const REPLAY_DURATION = 6000; // 1× 速度下完整回放时长（ms）

// Okabe-Ito 色盲友好色板（蓝为首色，与站内主色协调）；异常点红色高亮为语义色，不在此列
const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#999999', '#F0E442'];

const LTTB_THRESHOLD = 5000; // 主图表显示点数上限（仅画图降采样，统计/结论仍用全量）

/* ---------------- Toast ---------------- */

function toast(msg, type = 'info', ms = 2600) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ---------------- 页签切换 ---------------- */

function refreshTabVisibility() {
  const active = document.querySelector('.tab-panel.active');
  if (!active) return;
  const name = active.id.replace('tab-', '');
  if (name !== 'import' && name !== 'calib' && name !== 'toolbox') {
    const has = !!state.ds;
    document.getElementById(name + '-empty').classList.toggle('hidden', has);
    document.getElementById(name + '-content').classList.toggle('hidden', !has);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name !== 'import' && name !== 'calib' && name !== 'toolbox' && !state.ds) {
    toast('请先导入数据或加载示例数据');
  }
  refreshTabVisibility();
  if (name === 'calib') {
    $('calib-no-data').classList.toggle('hidden', !!state.ds);
    renderCalibColumns();
  }
  if (name === 'toolbox') {
    renderUncertaintyCols();
  }
  if (name === 'analysis' && state.ds) {
    renderUncertaintyCols();
  }
  if (name === 'filter' && state.ds) {
    renderFilter();
  }
  if (name === 'analysis' && state.ds && state.chart) {
    setTimeout(() => {
      state.chart.resize();
      if (state.histChart) state.histChart.resize();
      if (state.compareChart) state.compareChart.resize();
    }, 60);
  }
}

/* ---------------- 工具 ---------------- */

function $(id) { return document.getElementById(id); }

function escapeHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('已复制到剪贴板', 'success');
    } catch (e2) {
      toast('复制失败，请手动选择文本复制', 'error');
    }
    ta.remove();
  }
}

function downloadFile(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('已导出 ' + filename, 'success');
}

// 通用二进制下载：不带 BOM（.docx 是 zip，加 BOM 会损坏；HTML 用指定 mime）
function downloadBlob(blobOrContent, filename, mime) {
  const blob = blobOrContent instanceof Blob
    ? blobOrContent
    : new Blob([blobOrContent], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('已导出 ' + filename, 'success');
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// 记录一条操作流水（可复现报告用），最多保留 30 条
function pushOp(text) {
  state.ops.push(text);
  if (state.ops.length > 30) state.ops = state.ops.slice(-30);
}

// 图表导出 PNG：默认 300dpi 高清（离屏重建 3× 分辨率），失败回退原 canvas 直出
// 离屏方案：引用共享 chartInst.config 的 data/options（保留 ticks 回调等函数），
// responsive:false + devicePixelRatio:3 → 导出尺寸 = CSS 尺寸 × 3，约 A4 半宽 300dpi
function exportChartPng(chartInst, filenameBase) {
  if (!chartInst) { toast('请先加载数据', 'error'); return; }
  const srcCanvas = chartInst.canvas;
  const a = document.createElement('a');
  let ok = false;
  try {
    if (typeof Chart !== 'undefined' && srcCanvas.clientWidth > 0) {
      const cssW = srcCanvas.clientWidth;
      const cssH = srcCanvas.clientHeight;
      const off = document.createElement('canvas');
      off.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + cssW + 'px;height:' + cssH + 'px';
      document.body.appendChild(off);
      const tmp = new Chart(off.getContext('2d'), {
        type: chartInst.config.type,
        data: chartInst.config.data,
        options: Object.assign({}, chartInst.config.options, {
          responsive: false,
          animation: false,
          devicePixelRatio: 3,
          plugins: Object.assign({}, chartInst.config.options.plugins, { zoom: undefined })
        })
      });
      tmp.render(); // 同步重绘到离屏 canvas
      a.href = off.toDataURL('image/png');
      tmp.destroy();
      off.remove();
      ok = true;
    }
  } catch (e) { /* 高清导出失败走回退 */ }
  if (!ok) a.href = srcCanvas.toDataURL('image/png');
  a.download = `${filenameBase}-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('已导出 ' + a.download + (ok ? '（300 dpi）' : ''), 'success');
}

// 图表导出 SVG（矢量，贴进 Word/打印放大不糊）：按当前图表实例重建坐标轴/网格/曲线/图例
function exportChartSvg(chartInst, filenameBase) {
  if (!chartInst) { toast('请先加载数据', 'error'); return; }
  try {
    const W = Math.round(chartInst.width), H = Math.round(chartInst.height);
    const area = chartInst.chartArea;
    const scales = chartInst.scales;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Microsoft YaHei', sans-serif">`);
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
    out.push(`<rect x="${area.left.toFixed(1)}" y="${area.top.toFixed(1)}" width="${(area.right - area.left).toFixed(1)}" height="${(area.bottom - area.top).toFixed(1)}" fill="none" stroke="#e7e7e9"/>`);
    const xs = scales.x;
    (xs.ticks || []).forEach((tk, i) => {
      const px = xs.getPixelForTick(i);
      if (!isFinite(px)) return;
      out.push(`<line x1="${px.toFixed(1)}" y1="${area.top.toFixed(1)}" x2="${px.toFixed(1)}" y2="${area.bottom.toFixed(1)}" stroke="#f1f1f3"/>`);
      out.push(`<text x="${px.toFixed(1)}" y="${(area.bottom + 14).toFixed(1)}" fill="#9b9b9b" font-size="11" text-anchor="middle">${esc(fmtTick(tk.value))}</text>`);
    });
    chartInst.data.datasets.forEach((dset, di) => {
      const scale = scales[dset.yAxisID || 'y'];
      if (!scale) return;
      const color = dset.borderColor || PALETTE[di % PALETTE.length];
      const isRight = scale.position === 'right';
      (scale.ticks || []).forEach((tk, i) => {
        const py = scale.getPixelForTick(i);
        if (!isFinite(py)) return;
        const tx = isRight ? area.right + 6 : area.left - 6;
        const lbl = tk.label != null ? tk.label : LabAnalysis.fmt(tk.value);
        out.push(`<text x="${tx.toFixed(1)}" y="${(py + 3.5).toFixed(1)}" fill="${color}" font-size="11" text-anchor="${isRight ? 'start' : 'end'}">${esc(lbl)}</text>`);
        if (!isRight && di === 0) out.push(`<line x1="${area.left.toFixed(1)}" y1="${py.toFixed(1)}" x2="${area.right.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#f1f1f3"/>`);
      });
      const pts = (dset.data || []).map(p => {
        const px = xs.getPixelForValue(p.x);
        const py = scale.getPixelForValue(p.y);
        return (isFinite(px) && isFinite(py)) ? { px, py, o: p.outlier } : null;
      }).filter(Boolean);
      if (!pts.length) return;
      if (dset.showLine !== false) {
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p.px.toFixed(1) + ' ' + p.py.toFixed(1)).join(' ');
        out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`);
      }
      pts.forEach(p => out.push(`<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="${p.o ? 3.5 : 1.6}" fill="${p.o ? '#ef4444' : color}"/>`));
    });
    let lx = area.left;
    const ly = Math.max(14, area.top - 10);
    chartInst.data.datasets.forEach((dset, di) => {
      const color = dset.borderColor || PALETTE[di % PALETTE.length];
      out.push(`<circle cx="${lx.toFixed(1)}" cy="${(ly - 3).toFixed(1)}" r="4" fill="${color}"/>`);
      out.push(`<text x="${(lx + 8).toFixed(1)}" y="${ly.toFixed(1)}" fill="#37352f" font-size="12">${esc(dset.label)}</text>`);
      lx += 12 + String(dset.label).length * 12 + 18;
    });
    out.push('</svg>');
    downloadBlob(out.join(''), (filenameBase || 'chart') + '.svg', 'image/svg+xml;charset=utf-8');
  } catch (e) {
    toast('SVG 导出失败：' + e.message, 'error');
  }
}

/* ---------------- 导入：文件上传 ---------------- */

function setupImport() {
  const dz = $('dropzone');
  const input = $('file-input');
  const chip = $('file-chip');

  $('guide-next-btn').addEventListener('click', () => switchTab('preview'));

  dz.addEventListener('click', () => input.click());
  $('pick-file-btn').addEventListener('click', e => { e.stopPropagation(); input.click(); });

  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault();
    dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault();
    dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) handleFile(input.files[0]);
    input.value = '';
  });

  // v2.5 ④：把另一份同结构数据按行追加到当前数据（多次采集合并成一张表）
  $('merge-file-btn').addEventListener('click', () => {
    if (!state.ds) { toast('请先解析一份数据，再合并第二份', 'error'); return; }
    $('merge-file-input').click();
  });
  $('merge-file-input').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await mergeFile(f);
  });

  $('file-chip-remove').addEventListener('click', () => {
    state.pending = null;
    chip.classList.add('hidden');
    hideFeedback();
  });

  async function handleFile(file) {
    const name = file.name.toLowerCase();
    const okExt = ['.csv', '.xlsx', '.xls', '.txt', '.log'].some(ext => name.endsWith(ext));
    if (!okExt) {
      toast('不支持的文件类型，请上传 .csv / .xlsx / .txt', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(`文件较大（${(file.size / 1024 / 1024).toFixed(1)} MB），解析需稍等`, 'info');
    }
    try {
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 解析库未加载（检查网络后重试）');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        state.pending = { aoa, fileName: file.name, sourceType: 'excel' };
        state.pendingNote = `工作表「${wb.SheetNames[0]}」`;
      } else {
        let text = await file.text();
        let note = '';
        if (text.includes('\uFFFD')) {
          try {
            const buf = await file.arrayBuffer();
            text = new TextDecoder('gb18030').decode(buf);
            note = '检测到 GBK 编码，已自动转换';
          } catch (e) { note = '疑似 GBK 编码，可能显示乱码'; }
        }
        state.pending = {
          text,
          fileName: file.name,
          sourceType: name.endsWith('.csv') ? 'csv' : 'txt'
        };
        state.pendingNote = note;
      }
      chip.classList.remove('hidden');
      $('file-chip-name').textContent = file.name;
      $('file-chip-size').textContent = fmtBytes(file.size);
      $('paste-area').value = '';
      updateCharCount();
      toast('文件已读取，点击「开始解析」', 'success');
    } catch (e) {
      toast('文件读取失败：' + e.message, 'error');
    }
  }
}

/* ---------------- 导入：粘贴 & 示例 ---------------- */

function setupPasteAndSamples() {
  const area = $('paste-area');
  area.addEventListener('input', updateCharCount);

  $('use-paste-btn').addEventListener('click', () => {
    const text = area.value.trim();
    if (!text) { toast('请先粘贴数据内容', 'error'); return; }
    state.pending = { text, fileName: null, sourceType: 'text' };
    state.pendingNote = '粘贴内容（自动识别串口日志 / 表格）';
    $('file-chip').classList.add('hidden');
    toast('已读取粘贴内容，点击「开始解析」', 'success');
  });

  $('clear-paste-btn').addEventListener('click', () => {
    area.value = '';
    updateCharCount();
  });

  $('sample-serial-btn').addEventListener('click', () => {
    state.pending = { text: SAMPLE_SERIAL_TEXT, fileName: 'sample_serial.txt（内置示例）', sourceType: 'serial' };
    state.pendingNote = '内置示例：串口日志';
    $('file-chip').classList.add('hidden');
    toast('示例已加载，点击「开始解析」', 'success');
  });

  $('sample-csv-btn').addEventListener('click', () => {
    state.pending = { text: SAMPLE_CSV_TEXT, fileName: 'sample_data.csv（内置示例）', sourceType: 'csv' };
    state.pendingNote = '内置示例：规整 CSV';
    $('file-chip').classList.add('hidden');
    toast('示例已加载，点击「开始解析」', 'success');
  });
}

function updateCharCount() {
  $('paste-char-count').textContent = $('paste-area').value.length + ' 字符';
}

/* ---------------- 实时串口采集（v2.3） ---------------- */

function setupSerial() {
  const connectBtn = $('serial-connect-btn');
  const simBtn = $('serial-sim-btn');
  let liveChart = null;
  let liveKeyOrder = [];
  const liveSeries = new Map(); // key → { label, data:[{x,y}] }
  let collectedLines = [];
  let totalCount = 0;
  let t0 = 0;
  let lastUi = 0;
  let running = false;
  let mode = null; // 'real' | 'sim'
  let liveMulti = false; // 上次是否多轴（通道数变化需重建 chart）
  let durationTimer = null;
  let marks = [];        // v2.6：采集过程中的手动标记 {rel, label}
  // v4.0：虚拟仪表盘开关改用 state.dashOn（setupV4 的开关按钮也要读写它）

  // 浏览器不支持 Web Serial 时改写提示（模拟按钮仍可用）
  if (!LabSerial.supported()) {
    $('serial-note').textContent = '当前浏览器不支持 Web Serial（需 Chrome / Edge 桌面版）。没有硬件时点「模拟串口数据」可体验完整流程。';
    connectBtn.disabled = true;
  }

  function resetCollect() {
    collectedLines = [];
    totalCount = 0;
    liveKeyOrder = [];
    liveSeries.clear();
    marks = [];
    t0 = Date.now();
    lastUi = 0;
    if (liveChart) { liveChart.destroy(); liveChart = null; }
    const mb = $('serial-metrics'); if (mb) mb.innerHTML = '';
    const du = $('serial-duration'); if (du) du.textContent = '时长 00:00';
  }

  function setUi(r) {
    $('serial-idle-row').classList.toggle('hidden', r);
    $('serial-running-row').classList.toggle('hidden', !r);
    $('serial-status-text').textContent = r ? '采集中' : '已停止';
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    if (r) {
      // 运行时长心跳（无新数据时也走秒）
      durationTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - t0) / 1000);
        const du = $('serial-duration');
        if (du) du.textContent = '时长 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
      }, 1000);
    }
  }

  // 每行：收原文 + 解析数值喂实时曲线（最多 3 条通道，每条最多 500 点）
  function handleLine(line) {
    if (!running) return;
    collectedLines.push(line.trim());
    totalCount++;
    if (totalCount > 100000) { toast('已收到超过 10 万行，自动停止采集', 'info'); finish(true); return; }
    const r = LabParser.parseSerialLine(line, 0);
    if (r.kind === 'data') {
      let extraN = 0; // 裸数字（无 key=value 形式）按出现顺序编号，多列都能上实时曲线
      for (const c of r.cells) {
        if (c.bad || c.value === null || c.value === undefined) continue;
        let key = c.key;
        if (!key) { extraN++; key = extraN === 1 ? '数值' : '数值' + extraN; }
        let s = liveSeries.get(key);
        if (!s) {
          s = { label: key + (c.unit ? '(' + c.unit + ')' : ''), data: [] };
          liveSeries.set(key, s);
          liveKeyOrder.push(key);
        }
        s.data.push({ x: (Date.now() - t0) / 1000, y: c.value });
        if (s.data.length > 500) s.data.shift();
      }
    }
    const now = Date.now();
    if (now - lastUi > 150) {
      lastUi = now;
      $('serial-count').textContent = `已收到 ${totalCount} 行`;
      updateLiveChart();
      updateSerialMetrics();
      // v4.0：虚拟仪表盘 + 3D 数字孪生实验台实时联动
      try {
        const spikes = spikeKeysNow();
        if (state.dashOn && typeof LabDashboard !== 'undefined') LabDashboard.update(liveSeries, liveKeyOrder, spikes);
        if (typeof LabBench !== 'undefined' && LabBench.isOpen()) LabBench.updateFromSeries(liveSeries, liveKeyOrder, spikes);
      } catch (e) { /* 仪表异常不阻断采集 */ }
    }
  }

  // 当前哪些通道正在毛刺告警（供仪表盘/实验台红闪联动）
  function spikeKeysNow() {
    const out = [];
    liveKeyOrder.slice(0, 3).forEach(key => {
      const s = liveSeries.get(key);
      if (!s || !s.data.length) return;
      if (hasRecentSpike(s.data.map(p => p.y), 6, 6)) out.push(key);
    });
    return out;
  }

  // 中位数 / MAD（保留用于最小值最大值展示判断）
  function medMad(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    const md = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    const d = s.map(x => Math.abs(x - md)).sort((a, b) => a - b);
    const m2 = d.length % 2 ? d[Math.floor(d.length / 2)] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
    return { md, mad: m2 };
  }

  // 毛刺判定（对采样流的瞬时尖峰敏感，不受常态噪声/量化抖动/低方差通道误报影响）：
  // 用二阶差分 |v[i+1]-2v[i]+v[i-1]| 衡量「离群于左右邻居」的程度，阈值取二阶差分中位数的 K 倍
  // （中位数对小样本里的一两个尖峰稳健，不像 p95 那样被尖峰带偏）。
  function hasRecentSpike(vals, recentN, k) {
    const n = vals.length;
    if (n < 6) return false;
    const d = [];
    for (let i = 1; i < n - 1; i++) d.push(Math.abs(vals[i + 1] - 2 * vals[i] + vals[i - 1]));
    if (d.length < 4) return false;
    const sd = [...d].sort((a, b) => a - b);
    const base = sd[Math.floor(sd.length / 2)] || 0;
    const span = Math.max(...vals) - Math.min(...vals);
    const thr = Math.max(base * k, span * 0.05, 1e-9);
    const fromVal = Math.max(1, n - 1 - recentN);
    for (let i = fromVal; i < n - 1; i++) {
      if (d[i - 1] > thr) return true;
    }
    return false;
  }

  // v2.4：采集面板增强——当前值 / 最小最大 / 运行时长 / 超限闪烁
  function updateSerialMetrics() {
    const sec = Math.floor((Date.now() - t0) / 1000);
    $('serial-duration').textContent = '时长 ' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    const keys = liveKeyOrder.slice(0, 3);
    const box = $('serial-metrics');
    if (!keys.length) { box.innerHTML = ''; return; }
    box.innerHTML = keys.map((key, i) => {
      const s = liveSeries.get(key);
      const vals = s.data.map(p => p.y);
      const last = vals[vals.length - 1];
      if (last === undefined) return '';
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const out = hasRecentSpike(vals, 6, 6);
      const color = PALETTE[i % PALETTE.length];
      return `<div class="serial-metric${out ? ' over' : ''}">` +
        `<span class="sm-label" style="color:${color}">${escapeHtml(s.label)}</span>` +
        `<span class="sm-cur">${LabAnalysis.fmt(last)}</span>` +
        `<span class="sm-mm">最小 ${LabAnalysis.fmt(mn)} · 最大 ${LabAnalysis.fmt(mx)}</span>` +
        `</div>`;
    }).join('');
  }

  function updateLiveChart() {
    if (typeof Chart === 'undefined' || !liveKeyOrder.length) return;
    const keys = liveKeyOrder.slice(0, 3);
    const multi = keys.length >= 2; // 多通道量级差异大 → 各挂独立 Y 轴（与主图同规则）
    const yIds = ['y', 'y1', 'y2'];
    const datasets = keys.map((key, i) => {
      const s = liveSeries.get(key);
      return {
        label: s.label,
        data: s.data,
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length],
        borderWidth: 1.8,
        pointRadius: 0,
        tension: 0.25,
        yAxisID: multi ? yIds[i] : 'y'
      };
    });
    const rebuild = !liveChart || multi !== liveMulti;
    if (!rebuild) {
      liveChart.data.datasets = datasets;
      liveChart.update('none');
      return;
    }
    if (liveChart) { liveChart.destroy(); liveChart = null; }
    const xAxis = {
      type: 'linear',
      grid: { color: '#f1f1f3' },
      border: { color: '#e7e7e9' },
      ticks: { color: '#9b9b9b', maxTicksLimit: 8, callback: v => v.toFixed(0) + 's' }
    };
    const yAxis = (i, pos) => ({
      position: pos,
      grid: { color: '#f1f1f3', drawOnChartArea: i === 0 },
      border: { color: '#e7e7e9' },
      ticks: { color: '#9b9b9b', maxTicksLimit: 6 },
      title: { display: true, text: keys[i] }
    });
    const scales = multi
      ? Object.assign({ x: xAxis, y: yAxis(0, 'left'), y1: yAxis(1, 'right') },
          keys.length === 3 ? { y2: yAxis(2, 'right') } : {})
      : { x: xAxis, y: yAxis(0, 'left') };
    liveChart = new Chart($('serial-chart'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        scales,
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#37352f', font: { size: 11 } } },
          tooltip: { callbacks: { label: it => `${it.dataset.label}：${LabAnalysis.fmt(it.parsed.y)}` } }
        }
      }
    });
    liveMulti = multi;
  }

  // 结束采集。apply=true：把已收行组装成待解析数据并自动进入分析
  function finish(apply) {
    const wasRunning = running;
    running = false;
    if (mode === 'real') LabSerial.stop();
    else LabSerial.stopSim();
    setUi(false);
    const lines = collectedLines;
    const markSnapshot = marks.slice();
    collectedLines = [];
    marks = [];
    resetCollect();
    if (!apply) return;
    if (lines.length < 2) {
      toast('采集数据太少（至少 2 行有效行），已取消本次采集', 'info');
      return;
    }
    state.pendingMarks = markSnapshot.length ? markSnapshot : null;
    state.pending = {
      text: lines.join('\n'),
      fileName: `串口实时采集（${lines.length} 行）`,
      sourceType: 'serial'
    };
    state.pendingNote = '实时串口采集';
    $('file-chip').classList.add('hidden');
    $('paste-area').value = '';
    updateCharCount();
    doParse();
    if (wasRunning && mode === 'real') { /* stop() 的 onEnd 会再触发一次，已忽略 */ }
  }

  // 底层异常断开（设备拔出等）：提示后自动把已收数据送进分析
  function onEnd(err) {
    if (!running) return; // 用户主动停止触发的结束回调，忽略
    finish(true);
    if (err) toast(err.message + '，已将收到的数据转入分析', 'warn');
  }

  connectBtn.addEventListener('click', async () => {
    if (running) return;
    if (!LabSerial.supported()) {
      toast('当前浏览器不支持 Web Serial（需 Chrome / Edge 桌面版），可用「模拟串口数据」体验', 'error');
      return;
    }
    mode = 'real';
    resetCollect();
    setUi(true);
    const baud = $('serial-baud').value;
    const ok = await LabSerial.startReal(baud, handleLine, onEnd);
    if (!ok) {
      // 授权取消或端口打开失败（未进入采集，onEnd 不会触发）
      running = false;
      setUi(false);
      toast('串口连接未建立：已取消授权，或设备打开失败（被占用 / 驱动异常）', 'info');
    } else running = true;
  });

  simBtn.addEventListener('click', () => {
    if (running) return;
    mode = 'sim';
    resetCollect();
    setUi(true);
    running = true;
    LabSerial.startSim(handleLine, 60);
    toast('模拟数据流已开始（含缓变 + 噪声 + 毛刺），点「停止并进入分析」结束', 'success');
  });

  $('serial-stop-btn').addEventListener('click', () => finish(true));
  $('serial-cancel-btn').addEventListener('click', () => finish(false));

  // v2.6：采集时手动打标记
  function addMark() {
    if (!running) return;
    const rel = (Date.now() - t0) / 1000;
    const labelEl = $('serial-mark-label');
    const label = (labelEl && labelEl.value.trim()) || '手动标记';
    marks.push({ rel, label });
    if (labelEl) labelEl.value = '';
    toast('已标记 @ ' + rel.toFixed(1) + 's：' + label, 'success', 1600);
  }
  if ($('serial-mark-btn')) $('serial-mark-btn').addEventListener('click', addMark);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && running) {
      const ae = document.activeElement;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (!typing) { e.preventDefault(); addMark(); }
    }
  });

  // v2.6：向开发板发送指令（仅真实串口）
  async function sendCmd() {
    const inp = $('serial-send-input');
    const txt = inp ? inp.value : '';
    if (!txt) return;
    const nl = $('serial-send-nl') && $('serial-send-nl').checked ? '\n' : '';
    const ok = await LabSerial.send(txt + nl);
    if (ok) {
      toast('已发送：' + txt, 'success', 1500);
      if (inp) inp.value = '';
    } else {
      toast('发送失败：未连接真实串口（模拟模式只演示接收）', 'info');
    }
  }
  if ($('serial-send-btn')) $('serial-send-btn').addEventListener('click', sendCmd);
  if ($('serial-send-input')) $('serial-send-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendCmd(); }
  });
}

/* ---------------- 数据导出：CSV / Excel（v2.3） ---------------- */

// 导出清洗后的全量数据（含换算/滤波生成的新列），首列为时间戳（如有）
function buildExportAoa() {
  const ds = state.ds;
  const head = (ds.meta.time ? ['时间'] : [])
    .concat(ds.columns.map(c => c.name + (c.unit ? `(${c.unit})` : '')));
  const aoa = [head];
  ds.rows.forEach(r => {
    aoa.push((ds.meta.time ? [r.timeLabel || ''] : []).concat(
      ds.columns.map((c, ci) => {
        const v = r.cells[ci];
        return v === null || v === undefined ? '' : v;
      })
    ));
  });
  return aoa;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function exportDataCsv() {
  if (!state.ds) { toast('请先导入数据', 'error'); return; }
  const csv = buildExportAoa().map(row => row.map(csvEscape).join(',')).join('\r\n');
  downloadFile(csv, `labinsight-export-${exportStamp()}.csv`);
}

function exportDataXlsx() {
  if (!state.ds) { toast('请先导入数据', 'error'); return; }
  if (typeof XLSX === 'undefined') {
    toast('Excel 组件未加载（导出 Excel 需联网加载组件），可先用「导出 CSV」', 'error');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(buildExportAoa());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '数据');
  const name = `labinsight-export-${exportStamp()}.xlsx`;
  XLSX.writeFile(wb, name); // 浏览器端直接触发下载
  toast('已导出 ' + name, 'success');
}

/* ---------------- 导入：解析 ---------------- */

function setupParse() {
  $('parse-btn').addEventListener('click', doParse);
}

// v2.5 ④：读取文件为 pending（与 handleFile 同逻辑，供合并复用）
async function fileToPending(file) {
  const name = file.name.toLowerCase();
  const okExt = ['.csv', '.xlsx', '.xls', '.txt', '.log'].some(ext => name.endsWith(ext));
  if (!okExt) throw new Error('不支持的文件类型，请用 .csv / .xlsx / .txt');
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') throw new Error('Excel 解析库未加载');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return { aoa, fileName: file.name, sourceType: 'excel' };
  }
  let text = await file.text();
  if (text.includes('\uFFFD')) {
    try { const buf = await file.arrayBuffer(); text = new TextDecoder('gb18030').decode(buf); } catch (e) { /* 保留原文 */ }
  }
  return { text, fileName: file.name, sourceType: name.endsWith('.csv') ? 'csv' : 'txt' };
}

// v2.5 ④：把另一份同结构数据按行追加到当前数据集（列名对齐 + 时间轴合并）
async function mergeFile(file) {
  try {
    const pending = await fileToPending(file);
    const opts = {
      skipRows: parseInt($('opt-skip-rows').value, 10) || 0,
      timeCol: $('opt-time-col').value,
      delimiter: $('opt-delimiter').value,
      sourceType: pending.sourceType,
      fileName: pending.fileName
    };
    const tmp = LabParser.parse(pending, opts);
    if (!tmp.rows.length) throw new Error('第二份数据未识别到有效行，请检查格式或解析设置');
    const cur = state.ds;
    if (!cur) throw new Error('请先解析一份数据');
    const curNames = cur.columns.map(c => String(c.name).trim());
    const tmpNames = tmp.columns.map(c => String(c.name).trim());
    if (curNames.length !== tmpNames.length) {
      throw new Error(`列数不一致（当前 ${curNames.length} 列，新数据 ${tmpNames.length} 列），无法直接合并`);
    }
    const map = tmpNames.map(n => curNames.indexOf(n)); // 新数据第 tIdx 列 → 当前第 map[tIdx] 列
    if (map.some(i => i < 0)) {
      throw new Error('两份数据的列名对不上：新数据 [' + tmpNames.join(', ') + ']，当前 [' + curNames.join(', ') + ']');
    }
    const appended = tmp.rows.map(r => {
      const cells = new Array(curNames.length);
      map.forEach((ci, tIdx) => { cells[ci] = r.cells[tIdx]; });
      return {
        cells,
        timeValue: r.timeValue,
        timeLabel: r.timeLabel,
        badCells: new Set(r.badCells || []),
        outliers: null,
        raw: r.raw,
        skipped: r.skipped,
        dirty: r.dirty
      };
    });
    cur.rows.push(...appended);
    cur.meta.totalLines = (cur.meta.totalLines || 0) + (tmp.meta.totalLines || 0);
    cur.meta.dataRows = (cur.meta.dataRows || 0) + appended.length;
    cur.meta.skippedRows = (cur.meta.skippedRows || 0) + (tmp.meta.skippedRows || 0);
    cur.meta.skippedList = (cur.meta.skippedList || []).concat(tmp.meta.skippedList || []);
    if (cur.meta.time && tmp.meta.time && cur.meta.time.mode === tmp.meta.time.mode) {
      const vals = cur.rows.map(r => r.timeValue).filter(v => typeof v === 'number' && isFinite(v));
      if (vals.length) {
        const s = Math.min(...vals), e = Math.max(...vals);
        cur.meta.time.start = s;
        cur.meta.time.end = e;
        cur.meta.time.startLabel = fmtTick(s);
        cur.meta.time.endLabel = fmtTick(e);
        cur.rows.sort((a, b) => (a.timeValue || 0) - (b.timeValue || 0));
      }
    }
    pushOp(`合并数据「${file.name}」：新增 ${appended.length} 行，共 ${cur.rows.length} 行`);
    refreshDerived();
    showFeedback(true, cur, null, `已合并「${file.name}」：新增 ${appended.length} 行`);
    LabProject.autoSave();
    toast(`已合并「${file.name}」：新增 ${appended.length} 行，共 ${cur.rows.length} 行`, 'success');
  } catch (e) {
    toast('合并失败：' + e.message, 'error');
  }
}

function doParse() {
  if (!state.pending) {
    toast('请先上传文件、粘贴日志或加载示例数据', 'error');
    return;
  }
  const opts = {
    skipRows: parseInt($('opt-skip-rows').value, 10) || 0,
    timeCol: $('opt-time-col').value,
    delimiter: $('opt-delimiter').value,
    sourceType: state.pending.sourceType,
    fileName: state.pending.fileName
  };
  // 估算行数：超过 2 万行先给黄色提示，避免解析期间无响应观感
  let estLines = 0;
  if (state.pending.text) estLines = state.pending.text.split(/\r?\n/).length;
  else if (state.pending.aoa) estLines = state.pending.aoa.length;
  const bigInput = estLines > 20000;
  if (bigInput) showFeedbackWarn(`数据量较大（${estLines} 行），解析可能需要几秒，请稍候`);
  const btn = $('parse-btn');
  btn.disabled = true;
  btn.textContent = '解析中…';
  setTimeout(() => {
    const t0 = performance.now();
    const finish = (ds) => {
      const durS = (performance.now() - t0) / 1000;
      state.ds = ds;
      afterParse(ds);
      showFeedback(true, ds, null,
        (bigInput || ds.rows.length > 20000) ? `数据量较大，解析完成：${ds.rows.length} 行，耗时 ${durS.toFixed(1)} s${(bigInput && typeof LabEngine !== 'undefined' && !LabEngine._workerBroken) ? '（Web Worker 后台解析，界面不卡顿）' : ''}` : null);
      LabProject.autoSave();
      btn.disabled = false;
      btn.textContent = '开始解析';
    };
    const fail = (msg) => {
      showFeedback(false, null, msg);
      btn.disabled = false;
      btn.textContent = '开始解析';
    };
    if (bigInput && typeof LabEngine !== 'undefined') {
      // 大数据走 Worker 子线程（file:// 或异常时自动回退主线程）
      LabEngine.parseAsync(state.pending, opts)
        .then(r => finish(r.ds))
        .catch(e => {
          try { finish(LabParser.parse(state.pending, opts)); }
          catch (e2) { fail(e2.message); }
        });
    } else {
      try { finish(LabParser.parse(state.pending, opts)); }
      catch (e) { fail(e.message); }
    }
  }, 30); // 让按钮状态先渲染
}

function afterParse(ds) {
  state.activeSeries = new Set(ds.numericColumns.map(c => c.index).slice(0, 6));
  state.calibLog = [];
  renderCalibLog();
  state.filterSel = null;
  $('filter-apply-name').dataset.autofill = '1';
  ['ntc', 'adc', 'mq'].forEach(m => { $(m + '-batch-name').dataset.autofill = '1'; });
  $('guide-next-btn').classList.remove('hidden');
  $('latex-output').classList.add('hidden');
  state.healthBackup = null; // 新数据，体检撤销失效
  state.ops = [];            // 新解析重开流水
  // v2.4：新数据清掉区间统计与直方图旧状态
  state.rangeSel = null;
  $('range-card').classList.add('hidden');
  state.histSel = null;
  if (state.histChart) { state.histChart.destroy(); state.histChart = null; }
  // v2.5：新数据清空事件标注（项目恢复时保留快照里的事件）
  if (!state.restoringProject) state.events = [];
  renderEventsList();
  syncOutlierUI();
  // v2.8：新数据清掉并列对比组（第一组跟随当前数据）
  state.compareSets = [];
  if (state.compareChart) { state.compareChart.destroy(); state.compareChart = null; }
  const cmpWrap = $('compare-wrap');
  if (cmpWrap) cmpWrap.classList.add('hidden');
  const cmpTbl = $('compare-table');
  if (cmpTbl) cmpTbl.innerHTML = '';
  const cmpGrp = $('compare-groups');
  if (cmpGrp) cmpGrp.innerHTML = '';
  renderCompareCols();
  // v3.0：新数据重置 SPC 控制图选列
  state.spcSel = null;
  // v2.6：把采集过程中的手动标记转成事件（时间对齐到数据时间轴）
  if (state.pendingMarks && state.pendingMarks.length && ds.meta.time) {
    const tv = ds.rows.map(r => r.timeValue).filter(v => typeof v === 'number' && isFinite(v));
    const base = tv.length ? Math.min(...tv) : 0;
    const dateMode = ds.meta.time.mode === 'date';
    state.pendingMarks.forEach(m => {
      state.events.push({ x: base + (dateMode ? m.rel * 1000 : m.rel), label: m.label || '手动标记' });
    });
    state.events.sort((a, b) => a.x - b.x);
    state.pendingMarks = null;
    renderEventsList();
    if (state.events.length) pushOp(`采集标记：${state.events.length} 个手动标记已写入事件`);
  }
  state.pendingMarks = null;
  // 流水首条：解析记录
  const srcName = ds.sourceLabel || state.pendingNote || '本地导入数据';
  const skipTxt = ds.meta.skippedRows > 0 ? `，跳过 ${ds.meta.skippedRows} 行（前缀/坏帧/乱码）` : '';
  pushOp(`解析「${srcName}」：有效 ${ds.rows.length} 行 × ${ds.columns.length} 列${skipTxt}`);
  if (ds.rows.length > LTTB_THRESHOLD) {
    pushOp(`图表显示降采样 LTTB（${ds.rows.length} → ${LTTB_THRESHOLD} 点，统计与报告仍用全量数据）`);
  }
  // 项目恢复时接回历史流水（解析记录在前，历史操作在后）
  if (state.pendingOps && state.pendingOps.length) {
    state.ops = state.ops.concat(state.pendingOps.slice(-25));
  }
  state.pendingOps = null;

  // 预填报告信息
  if (!$('report-title').value.trim()) {
    // sourceLabel 是「文件名 · 类型」组合串，整串进标题生硬；取类型段（最后一段）
    const st = (ds.sourceLabel.split(' · ').pop() || '本地数据').trim();
    $('report-title').value = `数据分析实验报告（${st}）`;
  }
  if (!$('report-purpose').value.trim()) {
    const cols = ds.numericColumns.map(c => LabAnalysis.prettyColName(c)).join('、');
    $('report-purpose').value = `采集并整理${cols}数据，验证设备工作状态与数据稳定性，分析数据波动与异常情况，形成实验记录报告。`;
  }

  refreshDerived();
  switchTab('preview');
}

// 重算统计/异常点/结论并重渲染预览与分析（新解析或新增换算列后共用）
function refreshDerived() {
  const ds = state.ds;
  if (!ds) return;
  if (state.filterChart) { state.filterChart.destroy(); state.filterChart = null; }
  if (state.fftChart) { state.fftChart.destroy(); state.fftChart = null; }
  if (state.ntcTheoryChart) {
    state.ntcTheoryChart.destroy(); state.ntcTheoryChart = null;
    const w = document.getElementById('ntc-theory-wrap');
    if (w) w.classList.add('hidden');
  }
  const stats = LabAnalysis.computeStats(ds, state.outlierMethod);
  ds.rows.forEach(r => r.outliers = null);
  stats.forEach(s => s.outliers.forEach(ri => {
    if (!ds.rows[ri].outliers) ds.rows[ri].outliers = new Set();
    ds.rows[ri].outliers.add(s.column);
  }));
  state.stats = stats;
  state.conclusion = LabAnalysis.buildConclusion(ds, stats);
  state.reportText = '';
  renderPreview();
  renderAnalysis();
}

function showFeedback(success, ds, errMsg, extraLine) {
  const fb = $('parse-feedback');
  fb.classList.remove('hidden');
  fb.classList.remove('success', 'error', 'warn');
  if (success) {
    fb.classList.add('success');
    const parts = [`识别到 <b>${ds.columns.length}</b> 列 · 共 <b>${ds.rows.length}</b> 行`];
    if (ds.meta.skippedRows > 0) parts.push(`有 <b>${ds.meta.skippedRows}</b> 行被跳过（日志前缀 / 坏帧 / 乱码）`);
    let detail = parts.join(' · ');
    const extra = [];
    if (extraLine) extra.push(extraLine);
    if (state.pendingNote) extra.push(state.pendingNote);
    if (ds.meta.headerDetected) extra.push('已识别表头');
    if (ds.meta.time) extra.push(`时间范围 ${ds.meta.time.startLabel} ~ ${ds.meta.time.endLabel}`);
    if (ds.meta.delimiter === '\t') extra.push('分隔符：Tab');
    else if (ds.meta.delimiter) extra.push('分隔符：' + ds.meta.delimiter);
    fb.innerHTML = '解析成功 · ' + detail + (extra.length ? `<div class="pf-detail">${extra.map(escapeHtml).join(' · ')}</div>` : '');
  } else {
    fb.classList.add('error');
    fb.innerHTML = '解析失败 · ' + escapeHtml(errMsg || '未知错误');
  }
}

// 大数据量解析前的黄色提示（沿用 parse-feedback 样式）
function showFeedbackWarn(msg) {
  const fb = $('parse-feedback');
  fb.classList.remove('hidden');
  fb.classList.remove('success', 'error');
  fb.classList.add('warn');
  fb.innerHTML = escapeHtml(msg);
}

function hideFeedback() {
  $('parse-feedback').classList.add('hidden');
}

/* ---------------- 数据预览 ---------------- */

function renderPreview() {
  const ds = state.ds;
  if (!ds) return;

  // 小结 chips
  const chips = [];
  chips.push(`数据行 <b>${ds.rows.length}</b>`);
  chips.push(`列数 <b>${ds.columns.length}</b>`);
  if (ds.meta.time) {
    chips.push(`时间范围 <b>${ds.meta.time.startLabel} ~ ${ds.meta.time.endLabel}</b>`);
  }
  if (ds.meta.skippedRows > 0) chips.push(`跳过 <b>${ds.meta.skippedRows}</b> 行`);
  const outTotal = state.stats.reduce((a, s) => a + s.outliers.length, 0);
  if (outTotal > 0) chips.push(`异常点 <b>${outTotal}</b> 个`);
  chips.push(`来源 <b>${escapeHtml(ds.sourceLabel)}</b>`);
  $('summary-chips').innerHTML = chips.map((c, i) => {
    const isWarn = (c.includes('跳过') || c.includes('异常点')) && i > 0;
    return `<span class="chip${isWarn ? ' warn' : ''}">${c}</span>`;
  }).join('');

  // 图例
  const legend = [
    `<span><span class="legend-dot" style="background:#dbeafe;border:1px solid #93c5fd"></span>数值列</span>`,
    `<span><span class="legend-dot" style="background:#fff3cd;border:1px solid #fcd34d"></span>异常点</span>`,
    `<span><span class="legend-dot" style="background:#fef2f2;border:1px solid #fecaca"></span>脏数据单元格</span>`
  ];
  $('table-legend').innerHTML = legend.join('');

  renderCleanTable();
  renderSkippedCard();
  renderSamplingCard();
  renderHealthCard();

  $('view-toggle').onclick = null;
  document.querySelectorAll('#view-toggle .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#view-toggle .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      if (seg.dataset.view === 'raw') renderRawTable();
      else renderCleanTable();
    });
  });
}

function renderCleanTable() {
  const ds = state.ds;
  const MAX = 200;
  const colCount = ds.columns.length;
  const html = [];
  html.push('<table class="data-table"><thead><tr>');
  html.push('<th>#</th>');
  if (ds.meta.time) html.push('<th>时间</th>');
  ds.columns.forEach(c => {
    html.push(`<th>${escapeHtml(c.name)}${c.unit ? ` <span style="color:#9b9b9b;font-weight:400">(${escapeHtml(c.unit)})</span>` : ''}</th>`);
  }); 
  html.push('</tr></thead><tbody>');
  const n = Math.min(ds.rows.length, MAX);
  for (let i = 0; i < n; i++) {
    const r = ds.rows[i];
    html.push('<tr>');
    html.push(`<td class="index-col">${i + 1}</td>`);
    if (ds.meta.time) html.push(`<td class="time">${escapeHtml(r.timeLabel || '')}</td>`);
    for (let ci = 0; ci < colCount; ci++) {
      const v = r.cells[ci];
      const type = ds.columns[ci].type;
      let cls = '';
      if (type === 'numeric') cls = 'num';
      if (r.outliers && r.outliers.has(ci)) cls = 'outlier';
      else if (r.badCells.has(ci)) cls = 'bad';
      const text = v === null || v === undefined ? (r.badCells.has(ci) ? '⚠' : '') : v;
      html.push(`<td class="${cls}">${escapeHtml(text)}</td>`);
    }
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  if (ds.rows.length > MAX) {
    html.push(`<div style="padding:10px 14px;font-size:12.5px;color:#9b9b9b">仅显示前 ${MAX} 行，共 ${ds.rows.length} 行</div>`);
  }
  $('table-wrap').innerHTML = html.join('');
}

function renderRawTable() {
  const ds = state.ds;
  const MAX = 200;
  const html = [];
  html.push('<table class="data-table"><thead><tr><th>#</th><th>原始文本</th><th>清洗后</th></tr></thead><tbody>');
  const n = Math.min(ds.rows.length, MAX);
  for (let i = 0; i < n; i++) {
    const r = ds.rows[i];
    const cleaned = (ds.meta.time && r.timeLabel ? r.timeLabel + '  ' : '') +
      ds.columns.map((c, ci) => {
        const v = r.cells[ci];
        if (v === null || v === undefined) return r.badCells.has(ci) ? `${c.name}=?` : '';
        return `${c.name}=${v}${c.unit || ''}`;
      }).filter(x => x).join('  ');
    html.push('<tr>');
    html.push(`<td class="index-col">${i + 1}</td>`);
    html.push(`<td style="font-family:var(--mono);font-size:12px;color:#666;white-space:normal;word-break:break-all">${escapeHtml(r.raw)}</td>`);
    html.push(`<td style="white-space:normal;word-break:break-all">${escapeHtml(cleaned)}</td>`);
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  if (ds.rows.length > MAX) {
    html.push(`<div style="padding:10px 14px;font-size:12.5px;color:#9b9b9b">仅显示前 ${MAX} 行，共 ${ds.rows.length} 行</div>`);
  }
  $('table-wrap').innerHTML = html.join('');
}

function renderSkippedCard() {
  const ds = state.ds;
  const card = $('skipped-card');
  if (!ds.meta.skippedList.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('skipped-count').textContent = `共 ${ds.meta.skippedList.length} 行`;
  const list = ds.meta.skippedList.slice(0, 30)
    .map(s => `第 ${s.lineNo} 行【${s.reason}】${s.raw}`)
    .join('\n');
  $('skipped-list').textContent = list + (ds.meta.skippedList.length > 30 ? `\n……（其余 ${ds.meta.skippedList.length - 30} 行略）` : '');
}

/* ---------------- 采样质量报告 ---------------- */

function fmtInterval(v) {
  if (!isFinite(v)) return '—';
  if (Math.abs(v) < 1) return (v * 1000).toFixed(Math.abs(v * 1000) < 10 ? 1 : 0) + ' ms';
  return v.toFixed(2) + ' s';
}

function renderSamplingCard() {
  const ds = state.ds;
  if (!ds) return;
  const q = LabAnalysis.samplingQuality(ds);
  const body = $('sampling-body');
  if (!q.ok) {
    $('sampling-hint').textContent = '';
    body.innerHTML = q.reason === 'no-time'
      ? '<div class="sampling-skip">无时间戳列，跳过采样质量分析。如需采样率 / 丢帧检测，请导入带时间戳的数据，或在解析设置里把时间戳列指定为「第一列」。</div>'
      : '<div class="sampling-skip">带时间戳的数据行数不足（至少需要 2 行），跳过采样质量分析。</div>';
    return;
  }

  const anomalyTotal = q.backwards.length + q.duplicates.length;
  $('sampling-hint').textContent = `共 ${q.n} 个带时间戳的数据点 · 时长约 ${LabAnalysis.fmtDuration(q.span, 'seconds')}`;
  const chipHtml = [
    { t: `有效间隔 <b>${q.intervals}</b> 个`, warn: false },
    { t: `实际平均采样率 <b>${isFinite(q.rate) ? q.rate.toFixed(2) + ' Hz</b>' : '无法计算（时长为 0）</b>'}`, warn: false },
    { t: `平均间隔 <b>${fmtInterval(q.avg)}</b>`, warn: false },
    { t: `标称间隔（中位数）<b>${fmtInterval(q.med)}</b>`, warn: false },
    { t: `间隔抖动 <b>± ${fmtInterval(q.sd)}</b>`, warn: false },
    { t: `最大偏差 <b>${fmtInterval(q.maxDev)}</b>`, warn: false },
    { t: `疑似丢帧 <b>${q.drops.length}</b> 处`, warn: q.drops.length > 0 },
    { t: `时间戳异常 <b>${anomalyTotal}</b> 处`, warn: anomalyTotal > 0 }
  ];
  body.innerHTML =
    `<div class="summary-chips">${chipHtml.map(c => `<span class="chip${c.warn ? ' warn' : ''}">${c.t}</span>`).join('')}</div>` +
    renderSamplingLists(q);
}

/* ---------------- 数据体检（v2.2） ---------------- */

// 体检计算：每列缺失数 / 重复行数 / 常数列
function healthCheck(ds) {
  const colMissing = ds.numericColumns.map(c => {
    let miss = 0;
    ds.rows.forEach(r => {
      const v = r.cells[c.index];
      if (v === null || v === undefined || r.badCells.has(c.index)) miss++;
    });
    return { col: c, pretty: LabAnalysis.prettyColName(c), missing: miss };
  });
  // 重复行：整行内容一致（时间标签 + 所有列）
  const seen = new Set();
  let dupRows = 0;
  const dupExamples = [];
  ds.rows.forEach(r => {
    const key = (r.timeLabel || '') + '\u0001' + r.cells.map(v => v === null || v === undefined ? '' : String(v)).join('\u0001');
    if (seen.has(key)) {
      dupRows++;
      if (dupExamples.length < 3) dupExamples.push(r.timeLabel || r.raw.slice(0, 40));
    } else {
      seen.add(key);
    }
  });
  // 常数列：有效值唯一（无波动，提示但不自动处理）
  const constCols = [];
  ds.numericColumns.forEach(c => {
    const vals = new Set();
    ds.rows.forEach(r => {
      const v = r.cells[c.index];
      if (typeof v === 'number' && isFinite(v) && !r.badCells.has(c.index)) vals.add(v);
      if (vals.size > 1) return;
    });
    if (vals.size <= 1 && ds.rows.length >= 2) constCols.push(LabAnalysis.prettyColName(c));
  });
  const totalMissing = colMissing.reduce((a, x) => a + x.missing, 0);
  return { colMissing, totalMissing, dupRows, dupExamples, constCols };
}

function renderHealthCard() {
  const ds = state.ds;
  if (!ds) return;
  const h = healthCheck(ds);

  const chips = h.colMissing.map(x =>
    `<span class="health-chip${x.missing > 0 ? ' warn' : ''}" title="${escapeHtml(x.pretty)} 缺失值">${escapeHtml(x.pretty)}：缺失 ${x.missing}</span>`
  ).join('');
  const dupChip = `<span class="health-chip${h.dupRows > 0 ? ' warn' : ''}" title="与前面行完全相同的行">重复行：${h.dupRows}</span>`;
  const constChip = h.constCols.length
    ? `<span class="health-chip warn health-const" title="全程只有一个值的通道，无波动">常数列：${h.constCols.map(escapeHtml).join('、')}</span>`
    : '';

  const problems = h.totalMissing > 0 || h.dupRows > 0;
  $('health-body').innerHTML =
    `<div class="health-summary${problems ? ' bad' : ''}">` +
    (problems
      ? `发现 ${h.totalMissing} 个缺失值、${h.dupRows} 个重复行${h.constCols.length ? '，另有常数列 ' + h.constCols.map(escapeHtml).join('、') : ''}。可用下方按钮清理，清理后统计与图表会自动重算。`
      : `体检通过：${ds.rows.length} 行 × ${ds.columns.length} 列，数值列无缺失、无重复行${h.constCols.length ? '（常数列 ' + h.constCols.map(escapeHtml).join('、') + ' 属正常采样，无需处理）' : '，数据完整'}。`) +
    `</div>` +
    (problems ? `<div class="health-col-row">${chips}${dupChip}${constChip}</div>` : '');

  $('health-drop-missing-btn').disabled = h.totalMissing === 0;
  $('health-dedupe-btn').disabled = h.dupRows === 0;
  $('health-undo-btn').classList.toggle('hidden', !state.healthBackup);
  $('health-note').textContent = '';
}

// 快照当前数据（体检撤销用）
function snapshotDataset(ds) {
  return {
    rows: ds.rows.map(r => ({ cells: r.cells.slice(), raw: r.raw, timeLabel: r.timeLabel, timeValue: r.timeValue, outliers: r.outliers, badCells: r.badCells })),
    columns: ds.columns.map(c => ({ ...c })),
    numericColumns: ds.numericColumns.map(c => ({ ...c })),
    numericColSet: new Set(ds.numericColumns.map(c => c.index))
  };
}

function restoreDataset(ds, snap) {
  ds.rows = snap.rows.map(r => ({ ...r, cells: r.cells.slice(), badCells: r.badCells, outliers: r.outliers }));
  ds.columns = snap.columns.map(c => ({ ...c }));
  ds.numericColumns = snap.numericColumns.map(c => ({ ...c }));
  ds.numericColSet = new Set(snap.numericColumns.map(c => c.index));
  ds.meta.dataRows = ds.rows.length;
}

function setupHealth() {
  $('health-drop-missing-btn').addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const numericIdx = ds.numericColumns.map(c => c.index);
    const before = ds.rows.length;
    const backup = snapshotDataset(ds);
    ds.rows = ds.rows.filter(r => !numericIdx.some(ci => r.cells[ci] === null || r.cells[ci] === undefined || r.badCells.has(ci)));
    const removed = before - ds.rows.length;
    if (!removed) { toast('没有可删除的缺失行', 'info'); return; }
    state.healthBackup = backup;
    ds.meta.dataRows = ds.rows.length;
    pushOp(`数据体检：删除缺失行 ${removed} 行（${before} → ${ds.rows.length} 行）`);
    refreshDerived();
    renderCalibColumns();
    renderHealthCard();
    $('health-note').textContent = `已删除 ${removed} 行缺失数据`;
    toast(`已删除 ${removed} 行缺失数据，可撤销`, 'success');
    LabProject.autoSave();
  });

  $('health-dedupe-btn').addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const before = ds.rows.length;
    const backup = snapshotDataset(ds);
    const seen = new Set();
    const kept = [];
    ds.rows.forEach(r => {
      const key = (r.timeLabel || '') + '\u0001' + r.cells.map(v => v === null || v === undefined ? '' : String(v)).join('\u0001');
      if (!seen.has(key)) { seen.add(key); kept.push(r); }
    });
    const removed = before - kept.length;
    if (!removed) { toast('没有重复行', 'info'); return; }
    ds.rows = kept;
    state.healthBackup = backup;
    ds.meta.dataRows = ds.rows.length;
    pushOp(`数据体检：去除重复行 ${removed} 行（${before} → ${ds.rows.length} 行）`);
    refreshDerived();
    renderCalibColumns();
    renderHealthCard();
    $('health-note').textContent = `已去除 ${removed} 个重复行`;
    toast(`已去除 ${removed} 个重复行，可撤销`, 'success');
    LabProject.autoSave();
  });

  $('health-undo-btn').addEventListener('click', () => {
    const ds = state.ds;
    const backup = state.healthBackup;
    if (!ds || !backup) { toast('没有可撤销的清理操作', 'info'); return; }
    restoreDataset(ds, backup);
    state.healthBackup = null;
    pushOp(`数据体检：撤销上一步清理，恢复至 ${ds.rows.length} 行`);
    refreshDerived();
    renderCalibColumns();
    renderHealthCard();
    toast('已撤销上一步清理', 'success');
    LabProject.autoSave();
  });
}

function renderSamplingLists(q) {  const parts = [];
  if (q.drops.length) {
    const items = q.drops.map(x =>
      `<li>第 ${x.i}~${x.i + 1} 行 · ${escapeHtml(x.from.label)} → ${escapeHtml(x.to.label)} · 间隔 ${fmtInterval(x.dt)}，约为标称的 ${x.mult.toFixed(1)} 倍，疑似丢 <b>${x.miss}</b> 帧</li>`).join('');
    parts.push(`<div class="sampling-sec warn"><div class="sampling-sec-title">疑似丢帧（相邻间隔 &gt; 标称 × 3）</div><ul class="sampling-list">${items}</ul></div>`);
  } else {
    parts.push('<div class="sampling-sec ok"><div class="sampling-sec-title">丢帧检测</div><div class="sampling-oktext">按「相邻间隔 &gt; 标称 × 3」未发现疑似丢帧，采样连续。</div></div>');
  }
  const anomalies = [];
  q.backwards.forEach(x =>
    anomalies.push(`<li>第 ${x.i}~${x.i + 1} 行 · ${escapeHtml(x.from.label)} → ${escapeHtml(x.to.label)}：时间倒流 ${fmtInterval(-x.dt)}</li>`));
  q.duplicates.forEach(x =>
    anomalies.push(`<li>第 ${x.i}~${x.i + 1} 行 · ${escapeHtml(x.from.label)}：重复时间戳</li>`));
  if (anomalies.length) {
    parts.push(`<div class="sampling-sec warn"><div class="sampling-sec-title">异常时间戳</div><ul class="sampling-list">${anomalies.join('')}</ul></div>`);
  } else {
    parts.push('<div class="sampling-sec ok"><div class="sampling-sec-title">时间戳一致性</div><div class="sampling-oktext">未发现时间倒流或重复时间戳。</div></div>');
  }
  return parts.join('');
}

/* ---------------- 智能分析 ---------------- */

function renderAnalysis() {
  const ds = state.ds;
  if (!ds) return;

  // 统计卡片（title 悬浮说明与统计口径一致）
  const valid = state.stats.filter(s => s.ok);
  const CALIBER_TITLES = {
    '最大值': '样本中的最大观测值',
    '最小值': '样本中的最小观测值',
    '平均值': '均值 ± 95% 置信区间半宽（t 分布，自由度 n-1；n>31 时近似 1.96）',
    '标准差': '标准差为样本标准差，分母 n-1',
    '极差': '极差 = 最大值 − 最小值',
    '漂移量': '漂移量 = 末值 − 初值'
  };
  const cards = [];
  valid.slice(0, 3).forEach(s => {
    const f = (v, d = 2) => LabAnalysis.fmt(v, d);
    const items = [
      ['最大值', f(s.max) + (s.unit || '')],
      ['最小值', f(s.min) + (s.unit || '')],
      ['平均值', f(s.mean) + (s.unit || ''), '± ' + f(s.ciHalf)],
      ['标准差', f(s.std, 3)],
      ['极差', f(s.range)],
      ['漂移量', (s.drift >= 0 ? '+' : '') + f(s.drift) + (s.unit || '')]
    ];
    items.forEach(([label, value, ci]) => {
      const title = CALIBER_TITLES[label] || '';
      const ciHtml = ci ? `<span class="stat-ci">${escapeHtml(ci)}</span>` : '';
      cards.push(`<div class="stat-card"${title ? ` title="${escapeHtml(title)}"` : ''}><div class="stat-label">${escapeHtml(label)} · ${escapeHtml(s.pretty)}</div><div class="stat-value">${escapeHtml(value)}${ciHtml}</div></div>`);
    });
  });
  if (valid.length > 3) {
    cards.push(`<div class="stat-card"><div class="stat-label">提示</div><div class="stat-value" style="font-size:14px;font-weight:500">共 ${valid.length} 个数值通道，此处仅展示前 3 个，完整数据见「生成报告」</div></div>`);
  }
  $('stats-grid').innerHTML = cards.join('');

  // 系列选择 chips
  const picker = $('series-picker');
  const chips = ds.numericColumns.slice(0, 6).map((c, i) => {
    const on = state.activeSeries.has(c.index);
    return `<button class="series-chip${on ? ' on' : ''}" data-col="${c.index}" style="${on ? 'background:' + PALETTE[i % PALETTE.length] : ''}"><span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]};margin:0"></span>${escapeHtml(LabAnalysis.prettyColName(c))}</button>`;
  }).join('');
  picker.innerHTML = chips;
  picker.querySelectorAll('.series-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const ci = parseInt(chip.dataset.col, 10);
      if (state.activeSeries.has(ci)) {
        if (state.activeSeries.size <= 1) { toast('至少保留一个通道'); return; }
        state.activeSeries.delete(ci);
      } else {
        state.activeSeries.add(ci);
      }
      renderChart();
      renderSeriesChips();
    });
  });

  // 相关性矩阵（v2.2）
  renderCorr();

  // 取值分布直方图（v2.4）
  renderHist();

  // SPC 控制图（v3.0）
  renderSPC();

  // 结论
  $('conclusion-body').innerHTML = state.conclusion.html;

  renderChart();
}

function renderCorr() {
  const ds = state.ds;
  const body = $('corr-body');
  const cols = ds.numericColumns.slice(0, 6);
  if (cols.length < 2) {
    body.innerHTML = '<div class="health-summary">数值通道不足 2 个，暂无相关性可计算。</div>';
    return;
  }
  const { names, matrix } = LabAnalysis.corrMatrix(ds, cols);
  const f = v => (v === null || isNaN(v)) ? '—' : (Math.abs(v) >= 0.995 ? v.toFixed(2) : v.toFixed(3));
  const cls = v => {
    if (v === null || isNaN(v)) return '';
    const a = Math.abs(v);
    if (a >= 0.995) return 'diag';
    if (a >= 0.7) return 'strong';
    if (a >= 0.4) return 'mid';
    return '';
  };
  let html = '<table class="corr-table"><thead><tr><th>通道</th>';
  html += names.map(n => `<th title="${escapeHtml(n)}">${escapeHtml(shortName(n))}</th>`).join('');
  html += '</tr></thead><tbody>';
  matrix.forEach((row, i) => {
    html += `<tr><th title="${escapeHtml(names[i])}">${escapeHtml(shortName(names[i]))}</th>`;
    row.forEach((v, j) => {
      html += `<td class="${cls(v)}">${i === j ? '1' : f(v)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  if (ds.numericColumns.length > 6) {
    html += `<div class="corr-legend" style="margin-top:6px">数值通道较多，仅计算前 6 个。</div>`;
  }
  body.innerHTML = html;
}

// 表头缩短：temp(°C) → temp
function shortName(n) {
  return String(n).replace(/\([^)]*\)\s*$/, '');
}

/* ---------------- v2.4：取值分布直方图 ---------------- */

function renderHist() {
  const ds = state.ds;
  const sel = $('hist-col');
  if (state.histChart) { state.histChart.destroy(); state.histChart = null; }
  sel.innerHTML = ds.numericColumns.map(c =>
    `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
  const keep = state.histSel !== null && ds.numericColumns.some(c => c.index === state.histSel);
  if (!keep) state.histSel = ds.numericColumns.length ? ds.numericColumns[0].index : null;
  if (state.histSel !== null) sel.value = state.histSel;
  drawHist();
}

function drawHist() {
  const ds = state.ds;
  if (!ds || state.histSel === null || typeof Chart === 'undefined') return;
  const col = ds.numericColumns.find(c => c.index === state.histSel);
  if (!col) return;
  const vals = [];
  ds.rows.forEach(r => {
    const v = r.cells[col.index];
    if (typeof v === 'number' && isFinite(v) && !r.badCells.has(col.index)) vals.push(v);
  });
  if (state.histChart) { state.histChart.destroy(); state.histChart = null; }
  if (vals.length < 3) {
    $('hist-chart').closest('.hist-wrap').innerHTML = '<div class="health-summary">有效样本不足，暂无分布图。</div>';
    return;
  }
  const NB = 15;
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = (max - min) / NB || 1;
  const counts = new Array(NB).fill(0);
  vals.forEach(v => { const k = Math.min(NB - 1, Math.max(0, Math.floor((v - min) / w))); counts[k]++; });
  const f = (v, d = 2) => LabAnalysis.fmt(v, d);
  const labels = counts.map((_, k) => `${f(min + k * w)}~${f(min + (k + 1) * w)}`);
  const u = LabAnalysis.unitOf(col);
  state.histChart = new Chart($('hist-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '频数', data: counts,
        backgroundColor: PALETTE[0] + 'CC', borderColor: PALETTE[0],
        borderWidth: 1, barPercentage: 1, categoryPercentage: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => items.length ? '[' + labels[items[0].dataIndex] + ']' : '',
            label: item => ` ${item.parsed.y} 次（${(item.parsed.y / vals.length * 100).toFixed(1)}%）`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#9b9b9b', maxRotation: 45, autoSkip: true, maxTicksLimit: 8, callback(v) { return this.getLabelForValue(v).split('~')[0]; } },
          grid: { display: false },
          title: { display: true, text: u ? `区间（${u}，标签为区间左端点）` : '区间（标签为区间左端点）', color: '#666', font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#9b9b9b', precision: 0 },
          grid: { color: '#f1f1f3' },
          title: { display: true, text: '频数', color: '#666', font: { size: 12 } }
        }
      }
    }
  });
}

/* ---------------- v2.4：区间统计（图表缩放联动） ---------------- */

// 缩放完成后按当前可视 x 范围重算统计；范围覆盖全量时自动隐藏
function updateRangeStats(from, to) {
  const ds = state.ds;
  const card = $('range-card');
  if (!ds || !state.chart) return;
  let dMin = Infinity, dMax = -Infinity;
  ds.rows.forEach((r, ri) => {
    const x = r.timeValue !== null && r.timeValue !== undefined ? r.timeValue : ri;
    if (x < dMin) dMin = x;
    if (x > dMax) dMax = x;
  });
  if (!isFinite(dMin)) return;
  const pad = (dMax - dMin) * 0.002;
  if (from <= dMin + pad && to >= dMax - pad) {
    state.rangeSel = null;
    card.classList.add('hidden');
    return;
  }
  const rows = [];
  ds.rows.forEach((r, ri) => {
    const x = r.timeValue !== null && r.timeValue !== undefined ? r.timeValue : ri;
    if (x >= from && x <= to) rows.push(r);
  });
  if (rows.length < 2) { state.rangeSel = null; card.classList.add('hidden'); return; }
  state.rangeSel = { from, to };
  const dsSub = Object.assign({}, ds, { rows });
  const stats = LabAnalysis.computeStats(dsSub, state.outlierMethod).filter(s => s.ok);
  const f = (v, d = 2) => LabAnalysis.fmt(v, d);
  let html = '<table class="corr-table"><thead><tr><th>通道</th><th>样本数</th><th>最大</th><th>最小</th><th>均值 ± 95%CI</th><th>标准差</th><th>异常点</th></tr></thead><tbody>';
  stats.forEach(s => {
    html += `<tr><th title="${escapeHtml(s.pretty)}">${escapeHtml(shortName(s.pretty))}</th><td>${s.count}</td><td>${f(s.max)}${s.unit || ''}</td><td>${f(s.min)}${s.unit || ''}</td><td>${f(s.mean)} ± ${f(s.ciHalf)}</td><td>${f(s.std, 3)}</td><td>${s.outliers.length}</td></tr>`;
  });
  html += '</tbody></table>';
  $('range-body').innerHTML = html;
  $('range-desc').textContent = `区间 ${fmtTick(from)} ~ ${fmtTick(to)} · ${rows.length} 行`;
  card.classList.remove('hidden');
}

function renderSeriesChips() {
  const picker = $('series-picker');
  const ds = state.ds;
  picker.querySelectorAll('.series-chip').forEach((chip, i) => {
    const on = state.activeSeries.has(parseInt(chip.dataset.col, 10));
    chip.classList.toggle('on', on);
    const colIdx = ds.numericColumns.slice(0, 6).indexOf(ds.numericColumns.find(c => c.index === parseInt(chip.dataset.col, 10)));
    chip.style.background = on ? PALETTE[colIdx % PALETTE.length] : '';
  });
}

function fmtTick(v) {
  const t = state.ds && state.ds.meta.time;
  if (!t) return LabAnalysis.fmt(v, 1);
  if (t.mode === 'date') {
    const d = new Date(v);
    const pad = n => String(n).padStart(2, '0');
    const spanDays = (t.end - t.start) / 86400000 > 1;
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return spanDays ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}` : hm;
  }
  // clock / seconds → 秒 → HH:MM:SS
  const s = Math.floor(v);
  const pad = n => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/* ---------------- LTTB 降采样（仅画图） ---------------- */

// Largest-Triangle-Three-Buckets：分桶后取与「前采样点→下一桶均值点」连线构成三角形面积最大的点
function lttb(points, threshold) {
  const n = points.length;
  if (threshold >= n || threshold < 3) return points;
  const every = (n - 2) / (threshold - 2);
  const bucketStart = i => Math.min(n - 1, Math.floor(i * every) + 1);
  const bucketEnd = i => Math.min(n - 1, Math.floor((i + 1) * every) + 1);
  const sampled = [points[0]];
  for (let i = 1; i <= threshold - 2; i++) {
    const s = bucketStart(i), e = Math.max(s + 1, bucketEnd(i));
    // 下一桶的平均点
    const ns = bucketStart(i + 1), ne = Math.max(ns + 1, bucketEnd(i + 1));
    let ax = 0, ay = 0, cnt = 0;
    for (let k = ns; k < ne && k < n - 1; k++) { ax += points[k].x; ay += points[k].y; cnt++; }
    if (!cnt) { ax = points[n - 1].x; ay = points[n - 1].y; cnt = 1; }
    ax /= cnt; ay /= cnt;
    const prev = sampled[sampled.length - 1];
    let best = s, bestArea = -1;
    for (let k = s; k < e && k < n - 1; k++) {
      const area = Math.abs((prev.x - points[k].x) * (ay - points[k].y) - (ax - points[k].x) * (prev.y - points[k].y));
      if (area > bestArea) { bestArea = area; best = k; }
    }
    sampled.push(points[best]);
  }
  sampled.push(points[n - 1]);
  return sampled;
}

function renderChart() {
  const ds = state.ds;
  stopReplay(false);
  if (!ds || typeof Chart === 'undefined') {
    toast('图表库未加载（需要联网加载 CDN），其他功能不受影响', 'error');
    return;
  }
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const zoomPlugin = window.ChartZoom ? (window.ChartZoom.default || window.ChartZoom) : null;
  if (zoomPlugin && !Chart.registry.plugins.get('zoom')) {
    Chart.register(zoomPlugin);
  }

  const ctx = $('main-chart');
  const cols = ds.numericColumns.filter(c => state.activeSeries.has(c.index)).slice(0, 6);
  if (!cols.length) return;

  const isScatter = state.chartMode === 'scatter';
  // 2~4 条量级不同的通道各挂一条独立 Y 轴，避免互相压扁；5 条以上回退共享轴
  const useMultiAxis = cols.length >= 2 && cols.length <= 4;

  const datasets = cols.map((c, i) => {
    const color = PALETTE[i % PALETTE.length];
    const points = [];
    ds.rows.forEach((r, ri) => {
      const v = r.cells[c.index];
      if (typeof v !== 'number' || !isFinite(v)) return;
      const x = r.timeValue !== null && r.timeValue !== undefined ? r.timeValue : ri;
      points.push({ x, y: v, outlier: !!(r.outliers && r.outliers.has(c.index)) });
    });
    // 仅画图降采样：统计/异常检测/结论/报告仍基于完整数据
    const shown = points.length > LTTB_THRESHOLD ? lttb(points, LTTB_THRESHOLD) : points;
    return {
      label: LabAnalysis.prettyColName(c),
      data: shown,
      yAxisID: useMultiAxis ? 'y' + (i === 0 ? '' : i) : 'y',
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: shown.map(p => p.outlier ? '#ef4444' : color),
      pointBorderColor: shown.map(p => p.outlier ? '#dc2626' : color),
      pointRadius: isScatter ? 3.5 : shown.map(p => p.outlier ? 5 : 2),
      showLine: !isScatter,
      borderWidth: 1.8,
      tension: 0.25,
      spanGaps: true,
      _colIndex: c.index   // v2.9：误差棒插件用列 index 对上不确定度
    };
  });

  // 降采样提示条
  const note = $('chart-downsample-note');
  const maxPts = Math.max(0, ...cols.map(c => ds.rows.filter(r => {
    const v = r.cells[c.index];
    return typeof v === 'number' && isFinite(v);
  }).length));
  if (maxPts > LTTB_THRESHOLD) {
    note.textContent = `数据量较大，图表已降采样显示（${maxPts} → ${LTTB_THRESHOLD} 点）`;
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }

  // Y 轴：独立轴时刻度/标题与对应曲线同色，仅第一条画网格线
  const yScales = {};
  if (useMultiAxis) {
    cols.forEach((c, i) => {
      const color = PALETTE[i % PALETTE.length];
      yScales['y' + (i === 0 ? '' : i)] = {
        type: 'linear',
        position: i === 0 ? 'left' : 'right',
        grid: { color: '#f1f1f3', drawOnChartArea: i === 0 },
        border: { color },
        ticks: { color, maxTicksLimit: 6 },
        // Y 轴标题只放单位（无单位回退通道名），避免与图例的通道名重复
        title: { display: true, text: LabAnalysis.unitOf(c) || LabAnalysis.prettyColName(c), color, font: { size: 12, weight: '500' } }
      };
    });
  } else {
    yScales.y = {
      grid: { color: '#f1f1f3' },
      border: { color: '#e7e7e9' },
      ticks: { color: '#9b9b9b' },
      title: { display: cols.length === 1, text: cols.length === 1 ? (LabAnalysis.unitOf(cols[0]) || LabAnalysis.prettyColName(cols[0])) : '数值', color: '#666', font: { size: 12 } }
    };
  }

  const hasZoom = !!zoomPlugin;
  // v2.4：异常阈值虚线插件——按当前判定口径在对应 Y 轴画上下限（红色虚线，只在范围内可见）
  const thByCol = {};
  (state.stats || []).forEach(s => { if (s.ok && s.outlierTh) thByCol[s.column] = s.outlierTh; });
  const thresholdPlugin = {
    id: 'outlierThreshold',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      chart.data.datasets.forEach((dset, i) => {
        const col = cols[i];
        if (!col) return;
        const th = thByCol[col.index];
        if (!th) return;
        const scale = chart.scales[dset.yAxisID || 'y'];
        if (!scale) return;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(239,68,68,0.55)';
        ctx.lineWidth = 1;
        [th.lo, th.hi].forEach(v => {
          if (v === null || !isFinite(v)) return;
          const y = scale.getPixelForValue(v);
          if (y < chartArea.top || y > chartArea.bottom) return;
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
        });
        ctx.restore();
      });
    }
  };
  // v2.5：实验事件标注——按事件 x 位置画竖直虚线 + 顶部标签
  const eventsPlugin = {
    id: 'eventsOverlay',
    afterDatasetsDraw(chart) {
      const evs = state.events || [];
      if (!evs.length) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales || !scales.x) return;
      evs.forEach(ev => {
        const x = scales.x.getPixelForValue(ev.x);
        if (!isFinite(x) || x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(213,94,0,0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = ev.label || '事件';
        ctx.font = '11px -apple-system, "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(label).width;
        const bh = 16;
        let bx = x + 4;
        if (bx + tw + 10 > chartArea.right) bx = x - tw - 14;
        const by = chartArea.top + 2;
        ctx.fillStyle = 'rgba(213,94,0,0.92)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, tw + 10, bh, 3); else ctx.rect(bx, by, tw + 10, bh);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 5, by + bh / 2 + 0.5);
        ctx.restore();
      });
    }
  };
  // v2.9：不确定度误差棒——每点按 ±U 画竖线（U = k·√(uA²+uB²)，uA=sem，uB=a/√3）
  const uByCol = {};
  const aInst = ($('unc-b') && $('unc-b').value !== '') ? Number($('unc-b').value) : 0;
  const kInst = ($('unc-k') && $('unc-k').value !== '') ? Number($('unc-k').value) : 2;
  let anyU = false;
  (state.stats || []).forEach(s => {
    if (!s.ok) return;
    const n = Math.max(1, (s.values || []).length);
    const uA = (s.sem !== undefined && isFinite(s.sem)) ? s.sem : (s.std / Math.sqrt(n));
    const uB = aInst > 0 ? aInst / Math.sqrt(3) : 0;
    const U = kInst * Math.sqrt(uA * uA + uB * uB);
    if (isFinite(U) && U > 0) { uByCol[s.column] = U; anyU = true; }
  });
  const errBarPlugin = {
    id: 'uncertaintyBars',
    afterDatasetsDraw(chart) {
      if (!anyU || state.showErrBars === false) return;
      const { ctx } = chart;
      chart.data.datasets.forEach((dset, di) => {
        const U = uByCol[dset._colIndex];
        if (!U) return;
        const scale = chart.scales[dset.yAxisID || 'y'];
        if (!scale) return;
        const meta = chart.getDatasetMeta(di);
        if (!meta || !meta.data) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(31,41,55,0.4)';
        ctx.lineWidth = 1;
        meta.data.forEach((pt, idx) => {
          const raw = dset.data[idx];
          if (!raw || typeof raw.y !== 'number') return;
          const yTop = scale.getPixelForValue(raw.y + U);
          const yBot = scale.getPixelForValue(raw.y - U);
          if (!isFinite(yTop) || !isFinite(yBot)) return;
          const x = pt.x;
          ctx.beginPath();
          ctx.moveTo(x, yTop); ctx.lineTo(x, yBot);
          ctx.moveTo(x - 2.5, yTop); ctx.lineTo(x + 2.5, yTop);
          ctx.moveTo(x - 2.5, yBot); ctx.lineTo(x + 2.5, yBot);
          ctx.stroke();
        });
        ctx.restore();
      });
    }
  };
  state.chart = new Chart(ctx, {
    type: isScatter ? 'scatter' : 'line',
    data: { datasets },
    plugins: [thresholdPlugin, eventsPlugin, errBarPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: { duration: 250 },
      parsing: false,
      // v2.5：单击图表回填事件时刻（点一下定位，再填描述添加）
      onClick: (evt, elements, chart) => {
        if (!state.ds || !chart || !chart.scales || !chart.scales.x) return;
        // Chart.js 传入的是包装事件：evt.x 已是画布内像素坐标；原生事件退回 clientX
        let px = null;
        if (evt && typeof evt.x === 'number') px = evt.x;
        else if (evt && evt.clientX != null && chart.canvas) px = evt.clientX - chart.canvas.getBoundingClientRect().left;
        if (px == null || !isFinite(px)) return;
        const x = chart.scales.x.getValueForPixel(px);
        if (x === undefined || !isFinite(x)) return;
        const ex = $('event-x');
        if (ex) ex.value = String(Number(x.toFixed(2)));
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: '#f1f1f3' },
          border: { color: '#e7e7e9' },
          ticks: {
            color: '#9b9b9b',
            maxTicksLimit: 12,
            callback: v => fmtTick(v)
          },
          title: { display: true, text: ds.meta.time ? '时间' : '采样序号', color: '#666', font: { size: 12 } }
        },
        ...yScales
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#37352f', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            title: items => items.length ? fmtTick(items[0].parsed.x) : '',
            label: item => {
              const c = cols[item.datasetIndex];
              const nm = c ? LabAnalysis.prettyColName(c) : (item.dataset.label || '');
              return `${nm}：${LabAnalysis.fmt(item.parsed.y)}${item.raw && item.raw.outlier ? ' ⚠ 异常点' : ''}`;
            }
          }
        },
        zoom: hasZoom ? {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            drag: { enabled: true, backgroundColor: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.35)' },
            // v2.4：缩放完成后按可视范围联动「区间统计」卡
            onZoomComplete: ({ chart }) => {
              const s = chart.scales.x;
              updateRangeStats(s.min, s.max);
            }
          },
          pan: { enabled: true, mode: 'x' },
          limits: { x: { min: 'original', max: 'original' } }
        } : undefined
      }
    }
  });
}

// 同步异常判定口径的界面状态（按钮 active + 口径说明文案）
function syncOutlierUI() {
  document.querySelectorAll('#outlier-method .seg').forEach(s => {
    s.classList.toggle('active', s.dataset.method === state.outlierMethod);
  });
  const txt = {
    mad: '稳健 z 分数（基于 MAD）> 3.5 或偏离中位数超 4×MAD',
    sigma3: '偏离均值超过 3 倍标准差（均值 ± 3σ）',
    iqr: '超出 Q1 − 1.5×IQR ~ Q3 + 1.5×IQR 范围（箱线图口径）'
  }[state.outlierMethod] || '';
  const cal = $('caliber-outlier');
  if (cal) cal.textContent = txt;
}

/* ---------------- 答辩演示模式（v3.0） ---------------- */

const presentState = { slides: [], idx: 0, chart: null, compareChart: null, open: false };

function buildPresentSlides() {
  const ds = state.ds;
  if (!ds) return [];
  const slides = [{ kind: 'overview' }, { kind: 'chart' }];
  if (state.compareSets && state.compareSets.length > 1) slides.push({ kind: 'compare' });
  slides.push({ kind: 'conclusion' });
  return slides;
}

function presentOverviewHtml() {
  const ds = state.ds;
  const valid = state.stats.filter(s => s.ok);
  const f = (v, d = 2) => LabAnalysis.fmt(v, d);
  const t = ds.meta.time;
  const rows = [];
  rows.push(`<div class="ps-kv"><b>数据来源</b><span>${escapeHtml(ds.sourceLabel || '本地数据')}</span></div>`);
  rows.push(`<div class="ps-kv"><b>有效数据</b><span>${ds.rows.length} 行 × ${ds.columns.length} 列${ds.meta.skippedRows ? `（跳过 ${ds.meta.skippedRows} 行）` : ''}</span></div>`);
  if (t) rows.push(`<div class="ps-kv"><b>采样时段</b><span>${escapeHtml(t.startLabel)} — ${escapeHtml(t.endLabel)}</span></div>`);
  const cards = valid.slice(0, 4).map(s => `
    <div class="ps-stat">
      <div class="ps-stat-label">${escapeHtml(s.pretty)}${s.unit ? '（' + escapeHtml(s.unit) + '）' : ''}</div>
      <div class="ps-stat-value">${f(s.mean)}<span class="ps-stat-ci">± ${f(s.ciHalf)}</span></div>
      <div class="ps-stat-sub">范围 ${f(s.min)} ~ ${f(s.max)} · σ ${f(s.std, 3)}</div>
    </div>`).join('');
  return `<div class="ps-slide">
    <div class="ps-head"><h1>${escapeHtml($('report-title').value || '实验数据分析')}</h1>
      <p class="ps-sub">${escapeHtml(ds.sourceLabel || '')}</p></div>
    <div class="ps-kvs">${rows.join('')}</div>
    <div class="ps-stats">${cards}</div>
  </div>`;
}

function presentConclusionHtml() {
  const txt = state.conclusion ? state.conclusion.text : '';
  const valid = state.stats.filter(s => s.ok);
  const outTotal = valid.reduce((n, s) => n + s.outliers.length, 0);
  // 结论按句拆分，只取要点（前 6 句），投影时一行一句好读
  const sentences = txt.split(/(?<=。)/).map(s => s.trim()).filter(Boolean);
  const key = sentences.slice(0, 6);
  return `<div class="ps-slide">
    <div class="ps-head"><h1>分析结论</h1>
      <p class="ps-sub">共 ${valid.length} 个数值通道 · ${state.ds.rows.length} 行有效数据 · 异常点 ${outTotal} 处</p></div>
    <ul class="ps-points">${key.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
  </div>`;
}

function presentChartHtml() {
  return `<div class="ps-slide">
    <div class="ps-head"><h1>数据曲线</h1>
      <p class="ps-sub">${state.stats.filter(s => s.ok).slice(0, 6).map(s => escapeHtml(s.pretty)).join(' · ')}</p></div>
    <div class="ps-chart-wrap"><canvas id="present-chart"></canvas></div>
  </div>`;
}

function presentCompareHtml() {
  return `<div class="ps-slide">
    <div class="ps-head"><h1>多组对比</h1>
      <p class="ps-sub">共 ${state.compareSets.length} 组 · 均值 ± 标准差带</p></div>
    <div class="ps-chart-wrap"><canvas id="present-compare-chart"></canvas></div>
  </div>`;
}

function renderPresentSlide() {
  const stage = $('present-stage');
  const s = presentState.slides[presentState.idx];
  if (!s || !stage) return;
  if (presentState.chart) { presentState.chart.destroy(); presentState.chart = null; }
  if (presentState.compareChart) { presentState.compareChart.destroy(); presentState.compareChart = null; }

  if (s.kind === 'overview') stage.innerHTML = presentOverviewHtml();
  else if (s.kind === 'conclusion') stage.innerHTML = presentConclusionHtml();
  else if (s.kind === 'chart') {
    stage.innerHTML = presentChartHtml();
    drawPresentChart();
  } else if (s.kind === 'compare') {
    stage.innerHTML = presentCompareHtml();
    drawPresentCompareChart();
  }
  $('present-progress').textContent = `${presentState.idx + 1} / ${presentState.slides.length}`;
  $('present-prev-btn').disabled = presentState.idx === 0;
  $('present-next-btn').disabled = presentState.idx === presentState.slides.length - 1;
  // 换页动画
  stage.classList.remove('ps-in');
  void stage.offsetWidth;
  stage.classList.add('ps-in');
}

// 主图在演示里的放大版：复用当前图表的数据配置，重画一张（不动原图实例）
function drawPresentChart() {
  const cv = $('present-chart');
  if (!cv || !state.chart) return;
  const base = state.chart.config;
  try {
    presentState.chart = new Chart(cv, {
      type: base.type,
      data: JSON.parse(JSON.stringify(base.data)),
      options: Object.assign({}, JSON.parse(JSON.stringify(base.options || {})), {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 420 },
        plugins: Object.assign({}, (base.options && base.options.plugins) || {}, { zoom: undefined })
      })
    });
  } catch (e) { /* 图表配置不可克隆时跳过图，仍显示标题 */ }
}

function drawPresentCompareChart() {
  const cv = $('present-compare-chart');
  if (!cv || !state.compareChart) return;
  try {
    const base = state.compareChart.config;
    presentState.compareChart = new Chart(cv, {
      type: base.type,
      data: JSON.parse(JSON.stringify(base.data)),
      options: Object.assign({}, JSON.parse(JSON.stringify(base.options || {})), {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 420 }
      })
    });
  } catch (e) { /* 同上 */ }
}

function openPresent() {
  if (!state.ds) { toast('请先导入数据', 'error'); return; }
  presentState.slides = buildPresentSlides();
  if (!presentState.slides.length) { toast('暂无可演示内容', 'error'); return; }
  presentState.idx = 0;
  presentState.open = true;
  const ov = $('present-overlay');
  ov.classList.remove('hidden');
  document.body.classList.add('presenting');
  $('present-title').textContent = $('report-title').value || '实验数据分析';
  renderPresentSlide();
  // 尝试进入全屏（用户手势内调用才允许；失败就退回普通覆盖层）
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function closePresent() {
  presentState.open = false;
  if (presentState.chart) { presentState.chart.destroy(); presentState.chart = null; }
  if (presentState.compareChart) { presentState.compareChart.destroy(); presentState.compareChart = null; }
  $('present-overlay').classList.add('hidden');
  document.body.classList.remove('presenting');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function presentStep(delta) {
  const next = presentState.idx + delta;
  if (next < 0 || next >= presentState.slides.length) return;
  presentState.idx = next;
  renderPresentSlide();
}

function setupPresent() {
  $('present-btn').addEventListener('click', openPresent);
  $('present-exit-btn').addEventListener('click', closePresent);
  $('present-prev-btn').addEventListener('click', () => presentStep(-1));
  $('present-next-btn').addEventListener('click', () => presentStep(1));
  document.addEventListener('keydown', e => {
    if (!presentState.open) return;
    if (e.key === 'Escape') { closePresent(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { presentStep(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { presentStep(1); e.preventDefault(); }
  });
  // 用户按 Esc 退出系统全屏时，一并收起覆盖层
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && presentState.open) closePresent();
  });
}

/* ---------------- SPC 控制图（v3.0） ---------------- */

function renderSPC() {
  const ds = state.ds;
  const sel = $('spc-col');
  if (!ds || !sel) return;
  const prev = state.spcSel;
  sel.innerHTML = ds.numericColumns.map(c =>
    `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
  const keep = prev !== null && ds.numericColumns.some(c => c.index === prev);
  state.spcSel = keep ? prev : (ds.numericColumns.length ? ds.numericColumns[0].index : null);
  if (state.spcSel !== null) sel.value = state.spcSel;
  const nSel = $('spc-n');
  if (nSel) nSel.value = String(state.spcN || 5);
  drawSPC();
}

function spcValues(col) {
  const ds = state.ds;
  const out = [];
  ds.rows.forEach(r => {
    const v = r.cells[col.index];
    if (typeof v === 'number' && isFinite(v) && !r.badCells.has(col.index)) out.push(v);
  });
  return out;
}

function drawSPC() {
  const ds = state.ds;
  if (state.spcXChart) { state.spcXChart.destroy(); state.spcXChart = null; }
  if (state.spcRChart) { state.spcRChart.destroy(); state.spcRChart = null; }
  if (!ds || state.spcSel === null || typeof Chart === 'undefined' || typeof LabSPC === 'undefined') return;
  const col = ds.numericColumns.find(c => c.index === state.spcSel);
  if (!col) return;
  const vals = spcValues(col);
  const res = LabSPC.compute(vals, state.spcN || 5);
  const u = LabAnalysis.unitOf(col);
  const uTxt = u ? `（${u}）` : '';
  const f = (v, d = 3) => LabAnalysis.fmt(v, d);

  if (!res) {
    $('spc-summary').innerHTML = `<div class="spc-empty">有效数据 ${vals.length} 点，按 n = ${state.spcN || 5} 分组不足 2 个子组，暂无控制图。减小子组大小或增加数据。</div>`;
    $('spc-hint').textContent = '';
    $('spc-note').textContent = '';
    return;
  }

  $('spc-hint').textContent = `${vals.length} 点 → ${res.k} 个子组（每 ${res.n} 点一组${res.dropped ? `，末尾 ${res.dropped} 点未用` : ''}）`;

  // 汇总卡：控制限数值
  $('spc-summary').innerHTML = `
    <div class="spc-metric"><b>均值图 Xbar${uTxt}</b>
      <span>CL ${f(res.xCL)} · UCL ${f(res.xUCL)} · LCL ${f(res.xLCL)}</span></div>
    <div class="spc-metric"><b>极差图 R${uTxt}</b>
      <span>CL ${f(res.rCL)} · UCL ${f(res.rUCL)} · LCL ${f(res.rLCL)}</span></div>
    <div class="spc-metric"><b>越界子组</b>
      <span class="${res.outCount ? 'spc-bad' : 'spc-good'}">${res.outCount ? `${res.outCount} 处（均值 ${res.xOut.length} / 极差 ${res.rOut.length}）` : '无'}</span></div>`;

  $('spc-note').textContent = `系数 A₂ = ${res.coef.A2}，D₃ = ${res.coef.D3}，D₄ = ${res.coef.D4}（子组大小 n = ${res.n}，GB/T 4091 常用表）；` +
    `控制限按 3σ 口径：Xbar 图 CL = X̿、UCL/LCL = X̿ ± A₂·R̄；R 图 CL = R̄、UCL = D₄·R̄、LCL = D₃·R̄。` + LabSPC.verdict(res);

  const labels = res.groups.map(g => `#${g.idx}`);
  const xVals = res.groups.map(g => g.mean);
  const rVals = res.groups.map(g => g.range);

  // 控制限插件（两张图共用同一写法，按实例传参）
  const makeLimitPlugin = (cl, ucl, lcl, color) => ({
    id: 'spcLimits',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const y = scales.y;
      const draw = (v, dash, label) => {
        const py = y.getPixelForValue(v);
        if (!isFinite(py) || py < chartArea.top - 1 || py > chartArea.bottom + 1) return;
        ctx.save();
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = '11px -apple-system, "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, chartArea.right - 4, py - 2);
        ctx.restore();
      };
      draw(ucl, [5, 4], 'UCL');
      draw(cl, [2, 3], 'CL');
      draw(lcl, [5, 4], 'LCL');
    }
  });

  const baseOpts = (titleTxt, outIdx) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { title: { display: true, text: '子组序号' }, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { title: { display: true, text: titleTxt } }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => `第 ${items[0].label.replace('#', '')} 组`,
          label: ctx => {
            const i = ctx.dataIndex;
            const g = res.groups[i];
            const flag = outIdx.includes(g.idx) ? ' ⚠ 越界' : '';
            const raw = `原始 ${f(g.vals[0])} ~ ${f(g.vals[g.vals.length - 1])}（${g.vals.length} 点）`;
            return `${ctx.dataset.label}：${f(ctx.parsed.y)}${flag}　${raw}`;
          }
        }
      }
    }
  });

  const pointColors = (vals2, outIdx) => vals2.map((_, i) => (outIdx.includes(i + 1) ? '#ef4444' : '#0072B2'));
  const pointRadius = (vals2, outIdx) => vals2.map((_, i) => (outIdx.includes(i + 1) ? 4.5 : 3));

  state.spcXChart = new Chart($('spc-x-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '子组均值',
        data: xVals,
        borderColor: '#0072B2',
        backgroundColor: '#0072B2',
        borderWidth: 1.4,
        pointBackgroundColor: pointColors(xVals, res.xOut),
        pointBorderColor: pointColors(xVals, res.xOut),
        pointRadius: pointRadius(xVals, res.xOut),
        tension: 0
      }]
    },
    options: baseOpts(`子组均值${uTxt}`, res.xOut),
    plugins: [makeLimitPlugin(res.xCL, res.xUCL, res.xLCL, '#2563eb')]
  });

  state.spcRChart = new Chart($('spc-r-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '子组极差',
        data: rVals,
        borderColor: '#009E73',
        backgroundColor: '#009E73',
        borderWidth: 1.4,
        pointBackgroundColor: pointColors(rVals, res.rOut),
        pointBorderColor: pointColors(rVals, res.rOut),
        pointRadius: pointRadius(rVals, res.rOut),
        tension: 0
      }]
    },
    options: baseOpts(`子组极差${uTxt}`, res.rOut),
    plugins: [makeLimitPlugin(res.rCL, res.rUCL, res.rLCL, '#0f766e')]
  });
}

function setupSPC() {
  const colSel = $('spc-col');
  const nSel = $('spc-n');
  if (colSel) colSel.addEventListener('change', e => {
    state.spcSel = parseInt(e.target.value, 10);
    drawSPC();
  });
  if (nSel) nSel.addEventListener('change', e => {
    state.spcN = parseInt(e.target.value, 10) || 5;
    drawSPC();
  });
}

function setupChartControls() {  $('chart-line-btn').addEventListener('click', () => {
    state.chartMode = 'line';
    $('chart-line-btn').classList.add('active');
    $('chart-scatter-btn').classList.remove('active');
    renderChart();
  });
  $('chart-scatter-btn').addEventListener('click', () => {
    state.chartMode = 'scatter';
    $('chart-scatter-btn').classList.add('active');
    $('chart-line-btn').classList.remove('active');
    renderChart();
  });
  $('chart-reset-btn').addEventListener('click', () => {
    if (state.chart && state.chart.resetZoom) state.chart.resetZoom();
    // resetZoom 会触发 onZoomComplete → 范围回全量 → 区间卡自动隐藏；插件缺失时兜底
    if (!window.ChartZoom) { state.rangeSel = null; $('range-card').classList.add('hidden'); }
  });
  $('export-chart-png-btn').addEventListener('click', () => {
    exportChartPng(state.chart, 'labinsight-analysis');
  });
  $('export-chart-svg-btn').addEventListener('click', () => {
    exportChartSvg(state.chart, 'labinsight-analysis');
  });
  // v2.9：误差棒开关
  if ($('chart-errbar-toggle')) {
    $('chart-errbar-toggle').addEventListener('change', e => {
      state.showErrBars = e.target.checked;
      if (state.chart) state.chart.update('none');
    });
  }
  $('copy-conclusion-btn').addEventListener('click', () => {
    if (state.conclusion) copyText(state.conclusion.text);
  });
  // v2.4：直方图选列
  $('hist-col').addEventListener('change', e => {
    state.histSel = parseInt(e.target.value, 10);
    drawHist();
  });
  // v2.4：清除区间（等同重置缩放）
  $('range-clear-btn').addEventListener('click', () => {
    if (state.chart && state.chart.resetZoom) state.chart.resetZoom();
    state.rangeSel = null;
    $('range-card').classList.add('hidden');
  });
  // v2.4：异常判定口径切换（MAD / 3σ / IQR）
  const APPLY_OUTLIER = syncOutlierUI;
  document.querySelectorAll('#outlier-method .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      state.outlierMethod = seg.dataset.method;
      APPLY_OUTLIER();
      if (state.ds) refreshDerived();
    });
  });
  APPLY_OUTLIER();
  setupReplay();
}

/* ---------------- 曲线回放 ---------------- */

function setupReplay() {
  // 系统开启"减弱动态效果"时默认选瞬时（不动画），用户仍可手动选速度
  if (REDUCED_MOTION) $('replay-speed').value = '0';

  $('replay-btn').addEventListener('click', () => {
    if (!state.chart) { toast('请先导入数据并显示图表', 'error'); return; }
    if (state.replay && state.replay.playing) {
      pauseReplay();
    } else if (state.replay && !state.replay.done) {
      resumeReplay();
    } else {
      startReplay();
    }
  });

  $('replay-reset-btn').addEventListener('click', () => stopReplay(true));

  $('replay-speed').addEventListener('change', () => {
    if (state.replay && state.replay.playing) {
      const rp = state.replay;
      rp.base = replayProgress(rp);
      rp.t0 = performance.now();
      rp.speed = replaySpeed();
    }
  });
}

function replaySpeed() {
  const v = parseFloat($('replay-speed').value);
  return isNaN(v) ? 1 : v;
}

function replayProgress(rp) {
  return rp.base + (performance.now() - rp.t0) * rp.speed;
}

function startReplay() {
  const chart = state.chart;
  const full = chart.data.datasets.map(d => d.data.slice());
  if (!full.length || !full.some(a => a.length >= 2)) {
    toast('有效数据点太少，无法回放', 'error');
    return;
  }
  let xMin = Infinity, xMax = -Infinity;
  full.forEach(a => a.forEach(p => {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }));
  if (xMin === xMax) xMax = xMin + 1;

  stopReplay(false);
  state.replay = {
    chart, full,
    ptr: full.map(() => 0),
    xMin, xMax,
    base: 0,
    t0: performance.now(),
    speed: replaySpeed(),
    playing: true,
    done: false,
    raf: 0
  };

  // 固定横轴量程：曲线在固定坐标系内从左往右逐点画出
  chart.options.scales.x.min = xMin;
  chart.options.scales.x.max = xMax;
  chart.data.datasets.forEach(d => { d.data = []; });
  chart.update('none');

  $('replay-btn').textContent = '⏸ 暂停';
  $('replay-reset-btn').classList.remove('hidden');

  if (state.replay.speed === 0) {
    finishReplay();
    return;
  }
  state.replay.raf = requestAnimationFrame(replayFrame);
}

function replayFrame() {
  const rp = state.replay;
  if (!rp || !rp.playing) return;
  const prog = replayProgress(rp);
  const frac = Math.min(1, prog / REPLAY_DURATION);
  const xCut = rp.xMin + frac * (rp.xMax - rp.xMin);
  rp.chart.data.datasets.forEach((d, i) => {
    const arr = rp.full[i];
    let p = rp.ptr[i];
    while (p < arr.length && arr[p].x <= xCut) p++;
    rp.ptr[i] = p;
    d.data = arr.slice(0, p);
  });
  rp.chart.update('none');
  if (frac >= 1) { finishReplay(); return; }
  rp.raf = requestAnimationFrame(replayFrame);
}

function pauseReplay() {
  const rp = state.replay;
  if (!rp || !rp.playing) return;
  rp.base = replayProgress(rp);
  rp.playing = false;
  cancelAnimationFrame(rp.raf);
  $('replay-btn').textContent = '▶ 继续';
}

function resumeReplay() {
  const rp = state.replay;
  if (!rp || rp.playing) return;
  rp.t0 = performance.now();
  rp.speed = replaySpeed();
  if (rp.speed === 0) { finishReplay(); return; }
  rp.playing = true;
  $('replay-btn').textContent = '⏸ 暂停';
  rp.raf = requestAnimationFrame(replayFrame);
}

function finishReplay() {
  const rp = state.replay;
  if (!rp) return;
  if (rp.raf) cancelAnimationFrame(rp.raf);
  rp.playing = false;
  rp.done = true;
  rp.chart.data.datasets.forEach((d, i) => { d.data = rp.full[i]; });
  rp.chart.update('none');
  $('replay-btn').textContent = '▶ 重放';
}

// resetChart=false：只停掉动画（图表即将重建/销毁）；true：恢复完整曲线与坐标轴
function stopReplay(resetChart) {
  const rp = state.replay;
  state.replay = null;
  if (rp && rp.raf) cancelAnimationFrame(rp.raf);
  const btn = $('replay-btn');
  if (btn) btn.textContent = '▶ 回放';
  const rst = $('replay-reset-btn');
  if (rst) rst.classList.add('hidden');
  if (resetChart && rp && rp.chart) {
    rp.chart.data.datasets.forEach((d, i) => { d.data = rp.full[i]; });
    if (rp.chart.options.scales.x) {
      delete rp.chart.options.scales.x.min;
      delete rp.chart.options.scales.x.max;
    }
    rp.chart.update();
  }
}

/* ---------------- 校准换算 ---------------- */

function setupCalib() {
  // 换算类型切换（ntc / adc / mq / poly）
  document.querySelectorAll('#calib-mode .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#calib-mode .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      state.calibMode = seg.dataset.mode;
      ['ntc', 'adc', 'mq', 'poly'].forEach(m => {
        const card = $('calib-' + m);
        if (card) card.classList.toggle('hidden', state.calibMode !== m);
      });
    });
  });

  // 多项式：一次 / 二次切换（a 的含义变化，二次时才显示 c）
  document.querySelectorAll('#poly-deg .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#poly-deg .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      const deg2 = seg.dataset.deg === '2';
      $('poly-c-field').classList.toggle('hidden', !deg2);
      $('poly-a-help').textContent = deg2 ? '二次换算时为二次项系数' : '一次换算时为斜率（灵敏度）';
      // 模式按钮文案跟随次数，避免二次模式仍显示 y = ax + b
      const modeBtn = document.querySelector('#calib-mode .seg[data-mode="poly"]');
      if (modeBtn) modeBtn.textContent = deg2 ? '多项式换算 y = ax² + bx + c' : '多项式换算 y = ax + b';
      updateCalibFormulas();
      renderCalibSingle();
    });
  });

  // NTC 方法切换（B 值式 / Steinhart-Hart）
  document.querySelectorAll('#ntc-method .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#ntc-method .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      const sh = seg.dataset.method === 'sh';
      $('ntc-sh-params').classList.toggle('hidden', !sh);
      $('ntc-b-params').classList.toggle('hidden', sh);
      updateCalibFormulas();
      renderCalibSingle();
      if (state.ntcTheoryChart) $('ntc-theory-btn').click();
    });
  });

  // 参数输入 → 公式与单值结果即时刷新
  ['ntc-b', 'ntc-r0', 'ntc-t0', 'ntc-sh-a', 'ntc-sh-b', 'ntc-sh-c',
   'adc-bits', 'adc-vref', 'adc-k', 'mq-r0', 'mq-a', 'mq-b',
   'poly-a', 'poly-b', 'poly-c'].forEach(id => {
    $(id).addEventListener('input', () => {
      updateCalibFormulas();
      renderCalibSingle();
      // R-T 标定图已生成时，NTC 参数变化即时重画理论曲线
      if (state.ntcTheoryChart && (id.startsWith('ntc-'))) $('ntc-theory-btn').click();
    });
  });

  // MQ 型号切换 → 填入典型拟合系数
  $('mq-sensor').addEventListener('change', () => {
    const p = LabCalib.MQ_PRESETS[$('mq-sensor').value];
    if (p) {
      $('mq-a').value = p.a;
      $('mq-b').value = p.b;
    }
    updateCalibFormulas();
    renderCalibSingle();
  });

  // v2.9：NTC 型号预设 → 填 B / R₀
  if ($('ntc-preset')) {
    $('ntc-preset').addEventListener('change', () => {
      const v = $('ntc-preset').value;
      if (!v) return;
      $('ntc-b').value = v;
      $('ntc-r0').value = (v === '3977') ? '100000' : '10000';
      updateCalibFormulas();
      renderCalibSingle();
      if (state.ntcTheoryChart) $('ntc-theory-btn').click();
    });
  }

  // v2.9：两点标定反算 B / R₀
  if ($('ntc-2pt-calc-btn')) $('ntc-2pt-calc-btn').addEventListener('click', () => twoPointCalib());
  if ($('ntc-2pt-from-theory-btn')) $('ntc-2pt-from-theory-btn').addEventListener('click', () => twoPointFromChart());

  // 单值输入（支持粘贴一列多行数据）
  ['ntc', 'adc', 'mq', 'poly'].forEach(m => {
    $(m + '-input').addEventListener('input', renderCalibSingle);
  });

  // 批量：输入列切换 → 默认新列名与说明；手改名字后不再自动覆盖
  ['ntc', 'adc', 'mq', 'poly'].forEach(m => {
    $(m + '-batch-col').addEventListener('change', () => {
      autofillBatchName(m);
      updateBatchNote(m);
    });
    $(m + '-batch-name').addEventListener('input', e => {
      e.target.dataset.autofill = '0';
    });
    $(m + '-batch-btn').addEventListener('click', () => applyCalibBatch(m));
  });

  updateCalibFormulas();
  renderCalibSingle();
}

/* ----- v2.9：两点标定反算 NTC 的 B / R₀ ----- */
// B = ln(R₁/R₂)/(1/T₁ − 1/T₂)；T 用开氏温度；R₀ 以 T₀=25°C(298.15K) 为标称点由 R₁ 反推
function twoPointCalib(t1c, r1, t2c, r2) {
  const T1c = (t1c !== undefined) ? Number(t1c) : parseFloat($('ntc-c1-t').value);
  const R1 = (r1 !== undefined) ? Number(r1) : parseFloat($('ntc-c1-r').value);
  const T2c = (t2c !== undefined) ? Number(t2c) : parseFloat($('ntc-c2-t').value);
  const R2 = (r2 !== undefined) ? Number(r2) : parseFloat($('ntc-c2-r').value);
  if (![T1c, R1, T2c, R2].every(v => isFinite(v)) || R1 <= 0 || R2 <= 0) {
    toast('请填两组有效数据：温度（°C）与电阻（Ω，需 > 0）', 'error'); return null;
  }
  if (Math.abs(T1c - T2c) < 1e-6) { toast('两点温度不能相同，否则无法反算 B', 'error'); return null; }
  const K1 = T1c + 273.15, K2 = T2c + 273.15;
  if (K1 <= 0 || K2 <= 0) { toast('温度低于绝对零度，请检查输入', 'error'); return null; }
  const B = Math.log(R1 / R2) / (1 / K1 - 1 / K2);
  if (!isFinite(B) || B <= 0) { toast('反算失败：B 非正，请检查两点数据（高温应对应更小电阻）', 'error'); return null; }
  const T0 = 298.15;
  const R0 = R1 * Math.exp(B * (1 / T0 - 1 / K1));
  $('ntc-b').value = B.toFixed(2);
  $('ntc-r0').value = R0.toFixed(1);
  $('ntc-t0').value = T0.toFixed(2);
  updateCalibFormulas();
  renderCalibSingle();
  if (state.ntcTheoryChart) $('ntc-theory-btn').click();
  pushOp(`两点标定：(${T1c}°C, ${R1}Ω) / (${T2c}°C, ${R2}Ω) → B=${B.toFixed(1)} K，R₀=${R0.toFixed(0)}Ω @ 25°C`);
  toast(`已反算：B = ${B.toFixed(1)} K，R₀ = ${R0.toFixed(0)} Ω（25°C）`, 'success');
  return { B, R0, T0 };
}

function twoPointFromChart() {
  const ds = state.ds;
  if (!ds) { toast('请先导入数据', 'error'); return; }
  const xi = parseInt($('ntc-theory-x-col').value, 10);
  const yi = parseInt($('ntc-theory-y-col').value, 10);
  const pts = [];
  ds.rows.forEach(r => {
    const a = r.cells[xi], b = r.cells[yi];
    if (typeof a === 'number' && isFinite(a) && !r.badCells.has(xi) && a > 0 &&
        typeof b === 'number' && isFinite(b) && !r.badCells.has(yi)) {
      pts.push({ R: a, T: b });
    }
  });
  if (pts.length < 2) { toast('所选电阻列与温度列的共同有效点不足 2 个', 'error'); return; }
  pts.sort((p, q) => p.R - q.R);
  const lo = pts[0], hi = pts[pts.length - 1];
  $('ntc-c1-t').value = lo.T.toFixed(2); $('ntc-c1-r').value = lo.R.toFixed(1);
  $('ntc-c2-t').value = hi.T.toFixed(2); $('ntc-c2-r').value = hi.R.toFixed(1);
  twoPointCalib(lo.T, lo.R, hi.T, hi.R);
}

function ntcConvert() {
  const method = document.querySelector('#ntc-method .seg.active').dataset.method;
  if (method === 'sh') {
    const A = parseFloat($('ntc-sh-a').value);
    const B = parseFloat($('ntc-sh-b').value);
    const C = parseFloat($('ntc-sh-c').value);
    return v => LabCalib.ntcTempSH(v, A, B, C);
  }
  const B = parseFloat($('ntc-b').value);
  const R0 = parseFloat($('ntc-r0').value);
  const T0 = parseFloat($('ntc-t0').value);
  return v => LabCalib.ntcTempB(v, B, R0, T0);
}

function adcConvert() {
  const bits = parseFloat($('adc-bits').value);
  const vref = parseFloat($('adc-vref').value);
  const k = parseFloat($('adc-k').value);
  return v => LabCalib.adcVoltage(v, bits, vref, k);
}

function mqParams() {
  return {
    R0: parseFloat($('mq-r0').value),
    a: parseFloat($('mq-a').value),
    b: parseFloat($('mq-b').value),
    label: LabCalib.MQ_PRESETS[$('mq-sensor').value] ? LabCalib.MQ_PRESETS[$('mq-sensor').value].label : '自定义拟合'
  };
}

/* ----- 多项式换算（v2.3） ----- */

// 读当前一次/二次模式与系数 → { coefs:[c0,c1,c2], deg }
function polyParams() {
  const deg = document.querySelector('#poly-deg .seg.active').dataset.deg === '2' ? 2 : 1;
  const a = parseFloat($('poly-a').value);
  const b = parseFloat($('poly-b').value);
  const c = parseFloat($('poly-c').value);
  // LabFit.polyApply 约定 coefs=[常数项, 一次项, 二次项]
  const coefs = deg === 2 ? [c, b, a] : [b, a, 0];
  return { deg, coefs };
}

function polyConvert() {
  const { coefs } = polyParams();
  return v => LabFit.polyApply(v, coefs);
}

function polyFormulaText() {
  const { deg, coefs } = polyParams();
  const a = parseFloat($('poly-a').value), b = parseFloat($('poly-b').value), c = parseFloat($('poly-c').value);
  const params = deg === 2
    ? `a = ${LabCalib.fmtNum(a, 6)}，b = ${LabCalib.fmtNum(b, 6)}，c = ${LabCalib.fmtNum(c, 6)}`
    : `a = ${LabCalib.fmtNum(a, 6)}，b = ${LabCalib.fmtNum(b, 6)}`;
  return `${LabFit.polyText(deg === 2 ? [c, b, a] : [b, a])}　[当前参数（${deg} 次换算）${params}]`;
}

function updateCalibFormulas() {
  const method = document.querySelector('#ntc-method .seg.active').dataset.method;
  $('ntc-formula').textContent = method === 'sh'
    ? LabCalib.ntcFormulaSH(parseFloat($('ntc-sh-a').value), parseFloat($('ntc-sh-b').value), parseFloat($('ntc-sh-c').value))
    : LabCalib.ntcFormulaB(parseFloat($('ntc-b').value), parseFloat($('ntc-r0').value), parseFloat($('ntc-t0').value));
  $('adc-formula').textContent = LabCalib.adcFormula(parseFloat($('adc-bits').value), parseFloat($('adc-vref').value), parseFloat($('adc-k').value));
  $('mq-formula').textContent = LabCalib.mqFormula($('mq-sensor').value, parseFloat($('mq-a').value), parseFloat($('mq-b').value));
  $('poly-formula').textContent = polyFormulaText();
}

function parseCalcInput(text) {
  return String(text).split(/[\s,;、\n]+/).map(s => s.trim()).filter(Boolean)
    .map(parseFloat).filter(v => isFinite(v));
}

function renderCalibSingle() {
  // NTC
  const ntcVals = parseCalcInput($('ntc-input').value);
  if (ntcVals.length) {
    const conv = ntcConvert();
    if (ntcVals.length === 1) {
      const t = conv(ntcVals[0]);
      $('ntc-result').innerHTML = isFinite(t)
        ? `<div class="cr-value">${LabCalib.fmtNum(t, 2)} °C</div><div class="cr-sub">R = ${LabCalib.fmtNum(ntcVals[0])} Ω → T ≈ ${LabCalib.fmtNum(t, 2)} °C</div>`
        : `<div class="cr-error">输入或参数无效（R 与 R₀ 需为正数，B ≠ 0）</div>`;
    } else {
      const lines = ntcVals.slice(0, 30).map((v, i) => {
        const t = conv(v);
        return `${i + 1}. R = ${LabCalib.fmtNum(v)} Ω → ${isFinite(t) ? LabCalib.fmtNum(t, 2) + ' °C' : '—'}`;
      }).join('<br>');
      $('ntc-result').innerHTML = `<div class="cr-list">${lines}${ntcVals.length > 30 ? '<br>……（仅列前 30 个）' : ''}</div>`;
    }
  } else {
    $('ntc-result').innerHTML = '';
  }

  // ADC
  const adcVals = parseCalcInput($('adc-input').value);
  if (adcVals.length) {
    const conv = adcConvert();
    const k = parseFloat($('adc-k').value);
    if (adcVals.length === 1) {
      const u = conv(adcVals[0]);
      $('adc-result').innerHTML = isFinite(u)
        ? `<div class="cr-value">${LabCalib.fmtNum(u, 4)} V</div><div class="cr-sub">ADC = ${LabCalib.fmtNum(adcVals[0], 0)} → U ≈ ${LabCalib.fmtNum(u, 4)} V${isFinite(k) && k !== 1 ? '（已乘分压系数 k = ' + LabCalib.fmtNum(k, 3) + '）' : ''}</div>`
        : `<div class="cr-error">输入或参数无效（bits 需为正数）</div>`;
    } else {
      const lines = adcVals.slice(0, 30).map((v, i) => {
        const u = conv(v);
        return `${i + 1}. ADC = ${LabCalib.fmtNum(v, 0)} → ${isFinite(u) ? LabCalib.fmtNum(u, 4) + ' V' : '—'}`;
      }).join('<br>');
      $('adc-result').innerHTML = `<div class="cr-list">${lines}${adcVals.length > 30 ? '<br>……（仅列前 30 个）' : ''}</div>`;
    }
  } else {
    $('adc-result').innerHTML = '';
  }

  // MQ
  const mqVals = parseCalcInput($('mq-input').value);
  if (mqVals.length) {
    const { R0, a, b, label } = mqParams();
    if (mqVals.length === 1) {
      const ratio = LabCalib.mqRatio(mqVals[0], R0);
      const ppm = LabCalib.mqPpm(ratio, a, b);
      $('mq-result').innerHTML = isFinite(ratio) && isFinite(ppm)
        ? `<div class="cr-value">≈ ${LabCalib.fmtNum(ppm, 1)} ppm</div><div class="cr-sub">Rs/R₀ = ${LabCalib.fmtNum(ratio, 3)}，ppm ≈ ${LabCalib.fmtNum(a, 2)} × ratio<sup>${LabCalib.fmtNum(b, 3)}</sup>（${label} 近似）</div>`
        : `<div class="cr-error">输入或参数无效（Rs、R₀ 需为正数）</div>`;
    } else {
      const lines = mqVals.slice(0, 30).map((v, i) => {
        const ratio = LabCalib.mqRatio(v, R0);
        const ppm = LabCalib.mqPpm(ratio, a, b);
        return `${i + 1}. Rs = ${LabCalib.fmtNum(v)} Ω → ratio = ${isFinite(ratio) ? LabCalib.fmtNum(ratio, 3) : '—'}，ppm ≈ ${isFinite(ppm) ? LabCalib.fmtNum(ppm, 1) : '—'}`;
      }).join('<br>');
      $('mq-result').innerHTML = `<div class="cr-list">${lines}${mqVals.length > 30 ? '<br>……（仅列前 30 个）' : ''}</div>`;
    }
  } else {
    $('mq-result').innerHTML = '';
  }

  // 多项式（v2.3）
  const polyVals = parseCalcInput($('poly-input').value);
  if (polyVals.length) {
    const { deg } = polyParams();
    const conv = polyConvert();
    if (polyVals.length === 1) {
      const y = conv(polyVals[0]);
      $('poly-result').innerHTML = isFinite(y)
        ? `<div class="cr-value">${LabCalib.fmtNum(y, 4)}</div><div class="cr-sub">x = ${LabCalib.fmtNum(polyVals[0])} → y ≈ ${LabCalib.fmtNum(y, 4)}（${deg} 次多项式）</div>`
        : `<div class="cr-error">输入或参数无效（系数需为数字）</div>`;
    } else {
      const lines = polyVals.slice(0, 30).map((v, i) => {
        const y = conv(v);
        return `${i + 1}. x = ${LabCalib.fmtNum(v)} → ${isFinite(y) ? LabCalib.fmtNum(y, 4) : '—'}`;
      }).join('<br>');
      $('poly-result').innerHTML = `<div class="cr-list">${lines}${polyVals.length > 30 ? '<br>……（仅列前 30 个）' : ''}</div>`;
    }
  } else {
    $('poly-result').innerHTML = '';
  }
}

/* ----- 批量换算 ----- */

// 各模式默认列：换算类避开温度列（温度当电阻/ADC 输入是无意义换算），拟合 X/Y 默认不同列
function pickDefaultCol(m) {
  const cols = state.ds ? state.ds.numericColumns : [];
  if (!cols.length) return null;
  const isTemp = c => /(temp|温度|℃|°c)/i.test(c.name);
  const isRes = c => /\bR([sS0-9_]|$)|\bres\b|电阻|Ω|ohm/i.test(c.name);
  const isAdc = c => /\b(adc|cnt|count|raw|ch)\b/i.test(c.name);
  if (m === 'ntc' || m === 'mq') {
    return cols.find(c => isRes(c) && !isTemp(c)) || cols.find(c => !isTemp(c)) || cols[0];
  }
  if (m === 'adc') {
    return cols.find(c => isAdc(c) && !isTemp(c)) || cols[0];
  }
  return cols[0];
}

function renderCalibColumns() {
  const ds = state.ds;
  ['ntc', 'adc', 'mq', 'poly'].forEach(m => {
    const sel = $(m + '-batch-col');
    const prev = sel.value;
    if (!ds || !ds.numericColumns.length) {
      sel.innerHTML = '<option value="">（请先导入数据）</option>';
      $(m + '-batch-btn').disabled = true;
      $(m + '-batch-note').textContent = '尚未导入数据，批量换算不可用';
      return;
    }
    sel.innerHTML = ds.numericColumns.map(c =>
      `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
    if (prev && ds.numericColumns.some(c => String(c.index) === prev)) {
      sel.value = prev;
    } else {
      const def = pickDefaultCol(m);
      if (def) sel.value = String(def.index);
    }
    $(m + '-batch-btn').disabled = false;
    autofillBatchName(m);
    updateBatchNote(m);
  });
  renderFitCols();
}

function renderFitCols() {
  const ds = state.ds;
  ['fit-x-col', 'fit-y-col'].forEach((id, i) => {
    const sel = $(id);
    if (!ds || !ds.numericColumns.length) {
      sel.innerHTML = '<option value="">（请先导入数据）</option>';
      return;
    }
    const prev = sel.value;
    sel.innerHTML = ds.numericColumns.map(c =>
      `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
    if (prev && ds.numericColumns.some(c => String(c.index) === prev)) {
      sel.value = prev;
    } else {
      // X 默认第一列，Y 默认第二列（避免 X = Y 拟合出恒等线）
      const def = ds.numericColumns[Math.min(i, ds.numericColumns.length - 1)];
      if (def) sel.value = String(def.index);
    }
  });
  $('fit-run-btn').disabled = !ds || !ds.numericColumns.length;
  $('eval-run-btn').disabled = !ds || !ds.numericColumns.length;
  renderNTCTheoryCols();
}

function renderNTCTheoryCols() {
  const ds = state.ds;
  const xSel = $('ntc-theory-x-col');
  const ySel = $('ntc-theory-y-col');
  const opts = c => `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`;
  const empty = '<option value="">（请先导入数据）</option>';
  const fill = (sel, defPick) => {
    if (!ds || !ds.numericColumns.length) { sel.innerHTML = empty; return; }
    const prev = sel.value;
    sel.innerHTML = ds.numericColumns.map(opts).join('');
    if (prev && ds.numericColumns.some(c => String(c.index) === prev)) {
      sel.value = prev;
    } else if (defPick) {
      const def = defPick(ds.numericColumns);
      if (def) sel.value = String(def.index);
    }
  };
  // 电阻列：优先名字像电阻的列，回退第一个非温度列（温度值当电阻没有意义）
  fill(xSel, cols => cols.find(c => /\bR([sS0-9_]|$)|\bres\b|电阻|Ω|ohm/i.test(c.name) && !/(temp|温度|℃|°c)/i.test(c.name)) || cols.find(c => !/(temp|温度|℃|°c)/i.test(c.name)) || cols[0]);
  // 实测温度列：优先单位是 ℃ 的列（通常是 NTC 批量换算生成的温度列），其次名字像温度的列
  fill(ySel, cols => cols.find(c => c.unit === '°C') || cols.find(c => /(temp|温度|℃|°c)/i.test(c.name)) || cols[cols.length - 1]);
  $('ntc-theory-btn').disabled = !ds || !ds.numericColumns.length;
}

function autofillBatchName(m) {
  const el = $(m + '-batch-name');
  if (el.dataset.autofill === '0') return;
  const ci = parseInt($(m + '-batch-col').value, 10);
  const col = state.ds && state.ds.numericColumns.find(c => c.index === ci);
  if (!col) return;
  const base = LabAnalysis.prettyColName(col).replace(/\([^)]*\)\s*$/, '');
  el.value = m === 'ntc' ? base + '·温度' : m === 'adc' ? base + '·电压' : m === 'poly' ? base + '·换算' : base + '·浓度';
}

function colBaseName(col) {
  return LabAnalysis.prettyColName(col).replace(/\([^)]*\)\s*$/, '');
}

function updateBatchNote(m) {
  const ds = state.ds;
  if (!ds) return;
  const ci = parseInt($(m + '-batch-col').value, 10);
  if (isNaN(ci)) { $(m + '-batch-note').textContent = ''; return; }
  let valid = 0;
  ds.rows.forEach(r => {
    const v = r.cells[ci];
    if (typeof v === 'number' && isFinite(v) && !r.badCells.has(ci)) valid++;
  });
  const colsOut = m === 'mq' ? '比值列与 ppm 列共 2 个新列' : '1 个新列';
  $(m + '-batch-note').textContent = `输入列共 ${ds.rows.length} 行，其中 ${valid} 行有效数值将参与换算，其余行在新列中留空；将生成 ${colsOut}，原始数据不变。`;
}

function uniqueColName(name) {
  const names = new Set(state.ds.columns.map(c => c.name));
  if (!names.has(name)) return name;
  let i = 2;
  while (names.has(`${name}（${i}）`)) i++;
  return `${name}（${i}）`;
}

function applyCalibBatch(m) {
  const ds = state.ds;
  if (!ds) { toast('请先导入数据再使用批量换算', 'error'); return; }
  const ci = parseInt($(m + '-batch-col').value, 10);
  const srcCol = ds.numericColumns.find(c => c.index === ci);
  if (!srcCol) { toast('请选择输入列', 'error'); return; }
  const valid = ds.rows.filter(r =>
    typeof r.cells[ci] === 'number' && isFinite(r.cells[ci]) && !r.badCells.has(ci)).length;
  if (!valid) { toast('该列没有有效数值，无法换算', 'error'); return; }

  const newCols = []; // {name, unit, convert}
  let formulaText = '';

  if (m === 'ntc') {
    newCols.push({
      name: uniqueColName(($('ntc-batch-name').value || colBaseName(srcCol) + '·温度').trim()),
      unit: '°C',
      convert: ntcConvert()
    });
    formulaText = $('ntc-formula').textContent;
  } else if (m === 'adc') {
    newCols.push({
      name: uniqueColName(($('adc-batch-name').value || colBaseName(srcCol) + '·电压').trim()),
      unit: 'V',
      convert: adcConvert()
    });
    formulaText = $('adc-formula').textContent;
  } else if (m === 'poly') {
    const { deg, coefs } = polyParams();
    newCols.push({
      name: uniqueColName(($('poly-batch-name').value || colBaseName(srcCol) + '·换算').trim()),
      unit: '',
      convert: polyConvert()
    });
    formulaText = polyFormulaText();
  } else {
    const { R0, a, b } = mqParams();
    const ppmName = uniqueColName(($('mq-batch-name').value || colBaseName(srcCol) + '·浓度').trim());
    newCols.push({
      name: uniqueColName(ppmName + '·比值'),
      unit: '',
      convert: v => LabCalib.mqRatio(v, R0)
    });
    newCols.push({
      name: ppmName,
      unit: 'ppm',
      convert: v => LabCalib.mqPpm(LabCalib.mqRatio(v, R0), a, b)
    });
    formulaText = $('mq-formula').textContent;
  }

  // 追加新列（原始数据不动）
  newCols.forEach(nc => {
    const idx = ds.columns.length;
    ds.columns.push({ name: nc.name, unit: nc.unit, type: 'numeric', index: idx });
    nc.index = idx;
    ds.rows.forEach(r => {
      const v = r.cells[ci];
      if (typeof v === 'number' && isFinite(v) && !r.badCells.has(ci)) {
        const out = nc.convert(v);
        r.cells[idx] = typeof out === 'number' && isFinite(out) ? out : null;
      } else {
        r.cells[idx] = null;
      }
    });
  });
  ds.numericColumns = ds.columns.map((c, i) => ({ ...c, index: i })).filter(c => c.type === 'numeric');
  ds.numericColSet = new Set(ds.numericColumns.map(c => c.index));
  newCols.forEach(nc => { state.activeSeries.add(nc.index); });

  const tagMap = { ntc: 'NTC', adc: 'ADC', mq: 'MQ', poly: 'POLY' };
  refreshDerived();
  renderCalibColumns();
  state.calibLog.push({
    tag: tagMap[m] || 'POLY',
    formula: formulaText,
    src: LabAnalysis.prettyColName(srcCol),
    dst: newCols.map(nc => nc.unit ? `${nc.name}(${nc.unit})` : nc.name).join('、'),
    valid,
    total: ds.rows.length
  });
  renderCalibLog();
  pushOp(`批量换算（${tagMap[m] || 'POLY'}）：${LabAnalysis.prettyColName(srcCol)} → ${newCols.map(nc => nc.unit ? nc.name + '(' + nc.unit + ')' : nc.name).join('、')}，公式 ${formulaText}`);
  toast(`已生成新列：${newCols.map(nc => nc.name).join('、')}，可在统计/图表/报告中使用`, 'success');
}

function renderCalibLog() {
  const card = $('calib-log-card');
  if (!state.calibLog.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('calib-log-list').innerHTML = state.calibLog.map(e => {
    const head = `<b>${escapeHtml(e.src)}</b>（${e.valid}/${e.total} 行有效）→ 新列 <b>${escapeHtml(e.dst)}</b>`;
    return `<div class="calib-log-item"><span class="calib-log-tag">${e.tag}</span>` +
      `<span class="calib-log-formula">${head}<br>${escapeHtml(e.formula)}</span></div>`;
  }).join('');
}

/* ----- 线性拟合（v2.3） ----- */

function setupFit() {
  $('fit-run-btn').addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const xi = parseInt($('fit-x-col').value, 10);
    const yi = parseInt($('fit-y-col').value, 10);
    const xCol = ds.numericColumns.find(c => c.index === xi);
    const yCol = ds.numericColumns.find(c => c.index === yi);
    if (!xCol || !yCol) { toast('请选择 X 列与 Y 列', 'error'); return; }
    if (xi === yi) { toast('X 列与 Y 列不能是同一列', 'error'); return; }
    // 按行取两列共同有效值
    const xs = [], ys = [];
    ds.rows.forEach(r => {
      const a = r.cells[xi], b = r.cells[yi];
      if (typeof a === 'number' && isFinite(a) && !r.badCells.has(xi) &&
          typeof b === 'number' && isFinite(b) && !r.badCells.has(yi)) {
        xs.push(a); ys.push(b);
      }
    });
    if (xs.length < 2) { toast('两列共同有效数据不足 2 行，无法拟合', 'error'); return; }
    const fit = LabFit.linreg(xs, ys);
    if (!fit) { toast('拟合失败：X 列数据全相同（无变化），无法拟合', 'error'); return; }

    const fTxt = LabFit.linText(fit.k, fit.b);
    $('fit-formula').textContent = `${fTxt}　[R² = ${fit.r2.toFixed(4)}，n = ${fit.n}]`;
    const res = $('fit-result');
    res.classList.remove('hidden');
    res.innerHTML =
      `<div class="cr-value">k = ${fit.k.toFixed(6)}，b = ${fit.b.toFixed(6)}</div>` +
      `<div class="cr-sub">R² = <b>${fit.r2.toFixed(4)}</b>（${LabFit.r2Label(fit.r2)}）· 有效样本 n = ${fit.n}</div>` +
      `<div class="cr-sub">灵敏度/斜率 k：X 每增加 1 单位，Y 变化 ${fit.k.toFixed(6)}；截距 b = ${fit.b.toFixed(6)}</div>`;
    const srcTxt = `${LabAnalysis.prettyColName(xCol)} → ${LabAnalysis.prettyColName(yCol)}`;
    state.calibLog.push({
      tag: 'FIT',
      formula: `线性拟合（最小二乘）：${fTxt}，R² = ${fit.r2.toFixed(4)}，n = ${fit.n}`,
      src: srcTxt,
      dst: '拟合参数（未生成新列）',
      valid: fit.n,
      total: ds.rows.length
    });
    renderCalibLog();
    pushOp(`线性拟合：${srcTxt}，${fTxt}（R² = ${fit.r2.toFixed(4)}，n = ${fit.n}）`);
    toast('拟合完成：' + fTxt, 'success');
  });

  /* ---- 标定评估：灵敏度 / 零点 / 线性度 / 迟滞（v2.4） ---- */
  $('eval-run-btn').addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const xi = parseInt($('fit-x-col').value, 10);
    const yi = parseInt($('fit-y-col').value, 10);
    const xCol = ds.numericColumns.find(c => c.index === xi);
    const yCol = ds.numericColumns.find(c => c.index === yi);
    if (!xCol || !yCol) { toast('请选择 X 列与 Y 列', 'error'); return; }
    if (xi === yi) { toast('X 列与 Y 列不能是同一列', 'error'); return; }
    const xs = [], ys = [];
    ds.rows.forEach(r => {
      const a = r.cells[xi], b = r.cells[yi];
      if (typeof a === 'number' && isFinite(a) && !r.badCells.has(xi) &&
          typeof b === 'number' && isFinite(b) && !r.badCells.has(yi)) {
        xs.push(a); ys.push(b);
      }
    });
    if (xs.length < 2) { toast('两列共同有效数据不足 2 行，无法评估', 'error'); return; }
    const fit = LabFit.linreg(xs, ys);
    if (!fit) { toast('评估失败：X 列数据全相同（无变化）', 'error'); return; }

    // 线性度：最大残差 / 输出量程
    const res = ys.map((y, i) => y - (fit.k * xs[i] + fit.b));
    const maxRes = Math.max(...res.map(Math.abs));
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const yRange = ymax - ymin;
    const lin = yRange > 0 ? (maxRes / yRange) * 100 : NaN;
    let linGrade, linNote;
    if (!isFinite(lin)) { linGrade = '无法计算'; linNote = 'Y 列输出全部相同，无线性度可言'; }
    else if (lin <= 1) { linGrade = '优'; linNote = '最大偏差不超过量程的 1%'; }
    else if (lin <= 2) { linGrade = '良'; linNote = '最大偏差在量程的 2% 以内'; }
    else if (lin <= 5) { linGrade = '合格'; linNote = '最大偏差在量程的 5% 以内'; }
    else { linGrade = '检查线性关系'; linNote = '最大偏差超过量程 5%，两通道可能不是线性关系（考虑分段 / 换模型）'; }

    // 迟滞（简版）：按行序前半 / 后半行程各拟合，比较斜率差异
    let hystTxt;
    if (xs.length >= 6) {
      const half = Math.floor(xs.length / 2);
      const f1 = LabFit.linreg(xs.slice(0, half), ys.slice(0, half));
      const f2 = LabFit.linreg(xs.slice(xs.length - half), ys.slice(xs.length - half));
      if (f1 && f2 && f1.k !== 0) {
        const hyst = Math.abs(f1.k - f2.k) / Math.abs(f1.k) * 100;
        hystTxt = `前半程 k = ${f1.k.toFixed(6)}，后半程 k = ${f2.k.toFixed(6)}，斜率差 <b>${hyst.toFixed(2)}%</b>` +
          (hyst <= 2 ? '（正反行程一致性良好）' : '（正反行程差异较大——注意按行序前半 / 后半只是简版判定，真正的迟滞需要正反行程交替采集）');
      } else {
        hystTxt = '前半 / 后半行程数据无变化，无法比较';
      }
    } else {
      hystTxt = `样本 n = ${xs.length} < 6，迟滞比较不做（样本不足）`;
    }

    const xu = xCol.unit ? `（${xCol.unit}）` : '';
    const yu = yCol.unit ? `（${yCol.unit}）` : '';
    const su = xCol.unit && yCol.unit ? ` ${yCol.unit}/${xCol.unit}` : '';
    const res2 = $('eval-result');
    res2.classList.remove('hidden');
    res2.innerHTML =
      `<div class="cr-value">灵敏度 S = ${fit.k.toFixed(6)}${su}</div>` +
      `<div class="cr-sub">X${xu} 每增加 1，Y${yu} 变化 ${fit.k.toFixed(6)}；R² = ${fit.r2.toFixed(4)}（${LabFit.r2Label(fit.r2)}）</div>` +
      `<div class="cr-sub">零点输出 b = ${fit.b.toFixed(6)} ${yu}（X = 0 的外推值，X 实际范围 ${Math.min(...xs).toFixed(4)} ~ ${Math.max(...xs).toFixed(4)}）</div>` +
      `<div class="cr-sub">线性度 δ = <b>${isFinite(lin) ? lin.toFixed(2) + '%' : '—'}</b>（最大残差 ${maxRes.toFixed(6)} / 量程 ${yRange.toFixed(4)}）——${linGrade}，${linNote}</div>` +
      `<div class="cr-sub">迟滞（简版）：${hystTxt}</div>`;
    const srcTxt = `${LabAnalysis.prettyColName(xCol)} → ${LabAnalysis.prettyColName(yCol)}`;
    state.calibLog.push({
      tag: 'EVAL',
      formula: `标定评估：线性度 δ = ${isFinite(lin) ? lin.toFixed(2) + '%' : '—'}（${linGrade}），R² = ${fit.r2.toFixed(4)}`,
      src: srcTxt,
      dst: '评估结论（未生成新列）',
      valid: fit.n,
      total: ds.rows.length
    });
    renderCalibLog();
    pushOp(`标定评估：${srcTxt}，线性度 ${isFinite(lin) ? lin.toFixed(2) + '%' : '—'}（${linGrade}），R² = ${fit.r2.toFixed(4)}，n = ${fit.n}`);
    toast('标定评估完成：' + linGrade, 'success');
  });

  /* ---- NTC R-T 标定图：实测散点 vs 理论曲线（v2.4） ---- */
  $('ntc-theory-btn').addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const xi = parseInt($('ntc-theory-x-col').value, 10);
    const yi = parseInt($('ntc-theory-y-col').value, 10);
    const xCol = ds.numericColumns.find(c => c.index === xi);
    const yCol = ds.numericColumns.find(c => c.index === yi);
    if (!xCol || !yCol) { toast('请选择电阻列与实测温度列', 'error'); return; }
    const conv = ntcConvert();
    const pts = [];
    ds.rows.forEach(r => {
      const a = r.cells[xi], b = r.cells[yi];
      if (typeof a === 'number' && isFinite(a) && !r.badCells.has(xi) &&
          typeof b === 'number' && isFinite(b) && !r.badCells.has(yi) && a > 0) {
        pts.push({ x: a, y: b });
      }
    });
    if (pts.length < 3) { toast('共同有效数据不足 3 行，画不出标定图', 'error'); return; }

    const rMin = Math.min(...pts.map(p => p.x));
    const rMax = Math.max(...pts.map(p => p.x));
    const span = rMax - rMin || rMax * 0.1;
    const curve = [];
    for (let i = 0; i <= 60; i++) {
      const rr = rMin - span * 0.05 + (span * 1.1) * i / 60;
      const tt = conv(rr);
      if (tt !== null && isFinite(tt)) curve.push({ x: rr, y: tt });
    }
    if (!curve.length) { toast('理论曲线计算失败：请检查 NTC 参数', 'error'); return; }

    if (state.ntcTheoryChart) { state.ntcTheoryChart.destroy(); state.ntcTheoryChart = null; }
    $('ntc-theory-wrap').classList.remove('hidden');
    const cv = $('ntc-theory-chart');
    state.ntcTheoryChart = new Chart(cv, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `实测 ${LabAnalysis.prettyColName(yCol)}`,
            data: pts,
            backgroundColor: PALETTE[1],
            pointRadius: 3.5,
            pointHoverRadius: 5
          },
          {
            label: (() => {
              const sh = document.querySelector('#ntc-method .seg.active').dataset.method === 'sh';
              return sh ? '理论曲线（Steinhart-Hart 三系数）' : `理论曲线（B 值式，B = ${$('ntc-b').value}K）`;
            })(),
            data: curve,
            type: 'line',
            borderColor: PALETTE[0],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: {
            title: { display: true, text: `电阻${xCol.unit ? `（${xCol.unit}）` : ''}` },
            ticks: { maxTicksLimit: 8 }
          },
          y: {
            title: { display: true, text: `温度（°C）` },
            ticks: { maxTicksLimit: 8 }
          }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: items => items.length ? `R = ${items[0].parsed.x.toFixed(1)}` : '',
              label: item => ` ${item.datasetIndex === 0 ? '实测' : '理论'} T = ${item.parsed.y.toFixed(2)} °C`
            }
          }
        }
      }
    });
    const devTxt = (() => {
      const devs = pts.map(p => { const t = conv(p.x); return t === null ? null : p.y - t; }).filter(v => v !== null && isFinite(v));
      if (!devs.length) return '';
      const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
      const maxAbs = Math.max(...devs.map(Math.abs));
      return `实测与理论平均偏差 ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} °C，最大偏差 ${maxAbs.toFixed(2)} °C`;
    })();
    $('ntc-theory-note').textContent =
      `n = ${pts.length} 个实测点 vs 理论曲线（当前参数即时计算）。${devTxt ? devTxt + '。' : ''}偏差大说明 B / R₀ 参数与实际器件不符，可用两点标定重新求 B。`;
    toast('R-T 标定图已生成', 'success');
  });
}

/* ---------------- 滤波实验 ---------------- */

function setupFilter() {
  $('filter-channel').addEventListener('change', () => {
    state.filterSel = parseInt($('filter-channel').value, 10);
    renderFilter();
  });

  $('export-filter-png-btn').addEventListener('click', () => {
    exportChartPng(state.filterChart, 'labinsight-filter');
  });
  $('export-fft-png-btn').addEventListener('click', () => {
    exportChartPng(state.fftChart, 'labinsight-fft');
  });

  const wire = (onId, sliderId, valId, fmt) => {
    $(onId).addEventListener('change', renderFilter);
    $(sliderId).addEventListener('input', () => {
      $(valId).textContent = fmt(parseInt($(sliderId).value, 10));
      renderFilter();
    });
  };
  wire('f-ma-on', 'f-ma-n', 'f-ma-val', v => `窗口 ${v}`);
  wire('f-med-on', 'f-med-n', 'f-med-val', v => `窗口 ${v}`);
  wire('f-lp-on', 'f-lp-alpha', 'f-lp-val', v => `α = ${(v / 100).toFixed(2)}`);

  $('filter-apply-name').addEventListener('input', e => {
    e.target.dataset.autofill = '0';
  });
  $('filter-apply-btn').addEventListener('click', applyFilterResult);

  // v2.3：FFT 重采样开关（切走勾选重新渲染频谱）
  $('fft-resample-on').addEventListener('change', () => {
    if (state.ds) renderFilter();
  });
}

function filterResults() {
  const ds = state.ds;
  const ci = state.filterSel !== null ? state.filterSel : parseInt($('filter-channel').value, 10);
  const col = ds.numericColumns.find(c => c.index === ci);
  if (!col) return null;
  const pts = [];
  ds.rows.forEach((r, ri) => {
    const v = r.cells[ci];
    if (typeof v === 'number' && isFinite(v) && !r.badCells.has(ci)) {
      pts.push({ x: r.timeValue !== null && r.timeValue !== undefined ? r.timeValue : ri, y: v, ri });
    }
  });
  if (pts.length < 3) return { col, pts, results: [] };
  const ys = pts.map(p => p.y);
  const base = colBaseName(col);
  const results = [];
  if ($('f-ma-on').checked) {
    const n = parseInt($('f-ma-n').value, 10);
    results.push({
      key: 'ma', label: `滑动平均（窗口 ${n}）`, color: PALETTE[0],
      vals: LabFilter.movingAverage(ys, n),
      defName: `${base}·均值${n}`, formula: `滑动平均：yₙ = mean(xₙ₋w/₂ … xₙ+w/₂)，居中窗口 w=${n}`
    });
  }
  if ($('f-med-on').checked) {
    const n = parseInt($('f-med-n').value, 10);
    results.push({
      key: 'med', label: `中值滤波（窗口 ${n}）`, color: PALETTE[2],
      vals: LabFilter.medianFilter(ys, n),
      defName: `${base}·中值${n}`, formula: `中值滤波：yₙ = median(xₙ₋w/₂ … xₙ+w/₂)，窗口 w=${n}（奇数）`
    });
  }
  if ($('f-lp-on').checked) {
    const a = parseInt($('f-lp-alpha').value, 10) / 100;
    results.push({
      key: 'lp', label: `一阶低通（α ${a.toFixed(2)}）`, color: PALETTE[1],
      vals: LabFilter.lowPass(ys, a),
      defName: `${base}·低通${a.toFixed(2)}`, formula: `一阶低通：yₙ = α·xₙ + (1−α)·yₙ₋₁，α=${a.toFixed(2)}，y₀=x₀`
    });
  }
  return { col, pts, results };
}

function renderFilter() {
  const ds = state.ds;
  if (!ds || typeof Chart === 'undefined') return;

  // 通道下拉（保持当前选择）
  const sel = $('filter-channel');
  sel.innerHTML = ds.numericColumns.map(c =>
    `<option value="${c.index}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
  const keep = state.filterSel !== null && ds.numericColumns.some(c => c.index === state.filterSel);
  if (keep) sel.value = state.filterSel;
  else if (ds.numericColumns.length) state.filterSel = ds.numericColumns[0].index;

  const ctx = filterResults();
  if (!ctx) return;
  const { col, pts, results } = ctx;

  if (state.filterChart) { state.filterChart.destroy(); state.filterChart = null; }
  if (state.fftChart) { state.fftChart.destroy(); state.fftChart = null; }
  renderFFT(col, pts);

  // 统计对比
  const before = LabFilter.seriesStats(pts.map(p => p.y));
  const statHtml = [];
  const f = (v, d = 3) => LabAnalysis.fmt(v, d);
  statHtml.push(`<div class="fs-card orig"><div class="fs-title">原始 · ${escapeHtml(LabAnalysis.prettyColName(col))}</div>` +
    `<div class="fs-row"><span>样本数</span><b>${before.n}</b></div>` +
    `<div class="fs-row"><span>标准差</span><b>${f(before.std)}</b></div>` +
    `<div class="fs-row"><span>极差</span><b>${f(before.range)}</b></div>` +
    `<div class="fs-row"><span>异常点数</span><b>${before.outliers}</b></div></div>`);
  results.forEach(r => {
    const after = LabFilter.seriesStats(r.vals);
    const outDown = after.outliers < before.outliers;
    statHtml.push(`<div class="fs-card${outDown ? ' improved' : ''}"><div class="fs-title">${escapeHtml(r.label)}</div>` +
      `<div class="fs-row"><span>标准差</span><b>${f(before.std)} → ${f(after.std)}</b></div>` +
      `<div class="fs-row"><span>极差</span><b>${f(before.range)} → ${f(after.range)}</b></div>` +
      `<div class="fs-row"><span>异常点数</span><b>${before.outliers} → ${after.outliers}${outDown ? ' <span class="fs-delta">↓ 毛刺已削平</span>' : ''}</b></div></div>`);
  });
  $('filter-stats').innerHTML = results.length
    ? `<div class="filter-stats-grid">${statHtml.join('')}</div>`
    : '<div class="filter-stats-hint">勾选至少一种滤波器，这里会显示处理前后的标准差 / 极差 / 异常点数对比。</div>';

  // 应用下拉与新列名
  const applySel = $('filter-apply-sel');
  const prevKey = applySel.value;
  applySel.innerHTML = results.length
    ? results.map(r => `<option value="${r.key}">${escapeHtml(r.label)}</option>`).join('')
    : '<option value="">（先启用滤波器）</option>';
  $('filter-apply-btn').disabled = !results.length;
  if (results.length && prevKey && results.some(r => r.key === prevKey)) applySel.value = prevKey;
  const nameEl = $('filter-apply-name');
  const chosen = results.find(r => r.key === applySel.value) || results[0];
  if (chosen && nameEl.dataset.autofill !== '0') nameEl.value = chosen.defName;
  $('filter-apply-note').textContent = results.length
    ? `将把所选滤波结果按行对齐追加为新列，值为空的行仍为空；原始列保持不变。`
    : '先启用滤波器再应用。';

  if (!pts.length) return;

  // 图表：原始浅色细线 + 滤波结果彩色实线
  const datasets = [{
    label: `原始 · ${LabAnalysis.prettyColName(col)}`,
    data: pts,
    borderColor: '#c3ccd8',
    backgroundColor: '#c3ccd8',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.25
  }].concat(results.map(r => ({
    label: r.label,
    data: r.vals.map((v, i) => ({ x: pts[i].x, y: v })),
    borderColor: r.color,
    backgroundColor: r.color,
    borderWidth: 2.2,
    pointRadius: 0,
    tension: 0.25
  })));

  state.filterChart = new Chart($('filter-chart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: { duration: 200 },
      parsing: false,
      scales: {
        x: {
          type: 'linear',
          grid: { color: '#f1f1f3' },
          border: { color: '#e7e7e9' },
          ticks: { color: '#9b9b9b', maxTicksLimit: 12, callback: v => fmtTick(v) },
          title: { display: true, text: ds.meta.time ? '时间' : '采样序号', color: '#666', font: { size: 12 } }
        },
        y: {
          grid: { color: '#f1f1f3' },
          border: { color: '#e7e7e9' },
          ticks: { color: '#9b9b9b' },
          // Y 轴标题只放单位（无单位回退通道名），避免与图例重复
          title: { display: true, text: LabAnalysis.unitOf(col) || col.name, color: '#666', font: { size: 12 } }
        }
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#37352f', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            title: items => items.length ? fmtTick(items[0].parsed.x) : '',
            label: item => `${item.dataset.label}：${LabAnalysis.fmt(item.parsed.y)}`
          }
        }
      }
    }
  });
}

function applyFilterResult() {
  const ds = state.ds;
  if (!ds) { toast('请先导入数据', 'error'); return; }
  const ctx = filterResults();
  if (!ctx || !ctx.results.length) { toast('请先启用至少一种滤波器', 'error'); return; }
  const chosen = ctx.results.find(r => r.key === $('filter-apply-sel').value) || ctx.results[0];
  const name = uniqueColName(($('filter-apply-name').value || chosen.defName).trim());
  const idx = ds.columns.length;
  ds.columns.push({ name, unit: ctx.col.unit || '', type: 'numeric', index: idx });
  ds.rows.forEach(r => { r.cells[idx] = null; });
  ctx.pts.forEach((p, i) => {
    const v = chosen.vals[i];
    ds.rows[p.ri].cells[idx] = typeof v === 'number' && isFinite(v) ? v : null;
  });
  ds.numericColumns = ds.columns.map((c, i) => ({ ...c, index: i })).filter(c => c.type === 'numeric');
  ds.numericColSet = new Set(ds.numericColumns.map(c => c.index));
  state.activeSeries.add(idx);
  refreshDerived();
  renderFilter();
  state.calibLog.push({
    tag: 'FILTER',
    formula: chosen.formula + `　[输入列 ${LabAnalysis.prettyColName(ctx.col)} → 新列 ${name}${ctx.col.unit ? '(' + ctx.col.unit + ')' : ''}]`,
    src: LabAnalysis.prettyColName(ctx.col) + ' ' + chosen.label,
    dst: ctx.col.unit ? `${name}(${ctx.col.unit})` : name,
    valid: ctx.pts.length,
    total: ds.rows.length
  });
  renderCalibLog();
  pushOp(`滤波处理：${chosen.label}，${chosen.formula}（输入列 ${LabAnalysis.prettyColName(ctx.col)} → 新列 ${name}）`);
  toast(`已追加新列：${name}，可在统计/图表/报告中使用`, 'success');
}

/* ---------------- FFT 频域分析（滤波实验页签内） ---------------- */

function fftFreqFmt(f) {
  return (Math.abs(f) < 1 ? f.toFixed(3) : f.toFixed(2)) + ' Hz';
}

function renderFFT(col, pts) {
  const notesEl = $('fft-notes');
  if (state.fftChart) { state.fftChart.destroy(); state.fftChart = null; }
  if (pts.length < 4) {
    notesEl.innerHTML = '<div class="fft-note">有效数据点太少（至少 4 个），跳过频谱分析。</div>';
    return;
  }

  // 采样率：优先采样质量分析结果；无时间戳时按 1 Hz 估算（不阻塞）
  const q = LabAnalysis.samplingQuality(state.ds);
  let rate, rateKnown = false;
  if (q.ok && isFinite(q.rate) && q.rate > 0) {
    rate = q.rate;
    rateKnown = true;
  } else {
    rate = 1;
  }

  // v2.3：勾选「重采样」且有真实时间戳 → 线性插值到均匀网格再变换
  // （采样间隔不均匀时直接 FFT 会让谱线展宽/失真，插值后频谱才严谨）
  let ys = pts.map(p => p.y);
  let resampled = null;
  const wantResample = !!($('fft-resample-on') && $('fft-resample-on').checked && state.ds.meta.time);
  if (wantResample && rateKnown) {
    const mode = state.ds.meta.time.mode;
    const ts = pts.map(p => mode === 'date' ? p.x / 1000 : p.x); // 统一转秒
    resampled = LabFFT.resampleUniform(ts, ys, rate);
    if (resampled) ys = resampled.ys;
  }

  const spec = LabFFT.amplitudeSpectrum(ys, rate);
  if (!spec) {
    notesEl.innerHTML = '<div class="fft-note">有效数据点太少，跳过频谱分析。</div>';
    return;
  }
  const peaks = LabFFT.findPeaks(spec.freqs, spec.amps);
  const hum = LabFFT.mainsHum(spec.freqs, spec.amps);

  // 图表：幅度谱折线 + 谱峰红点
  state.fftChart = new Chart($('fft-chart'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: `幅度谱 · ${LabAnalysis.prettyColName(col)}`,
          data: spec.freqs.map((f, i) => ({ x: f, y: spec.amps[i] })),
          borderColor: PALETTE[0],
          backgroundColor: PALETTE[0],
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.15
        },
        {
          label: '谱峰',
          data: peaks.map(p => ({ x: p.f, y: p.a })),
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: { duration: 200 },
      parsing: false,
      scales: {
        x: {
          type: 'linear',
          grid: { color: '#f1f1f3' },
          border: { color: '#e7e7e9' },
          ticks: { color: '#9b9b9b', maxTicksLimit: 10, callback: v => v.toFixed(2) },
          title: { display: true, text: '频率 (Hz)', color: '#666', font: { size: 12 } }
        },
        y: {
          grid: { color: '#f1f1f3' },
          border: { color: '#e7e7e9' },
          ticks: { color: '#9b9b9b' },
          title: { display: true, text: '幅值', color: '#666', font: { size: 12 } }
        }
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#37352f', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: item => `${item.datasetIndex === 0 ? '幅度谱' : '谱峰'}：${fftFreqFmt(item.parsed.x)}，幅值 ${LabAnalysis.fmt(item.parsed.y, 3)}`
          }
        }
      }
    }
  });

  // 文字说明
  const notes = [];
  if (peaks.length) {
    const names = ['主频', '次频', '第三频率'];
    const peakText = peaks.map((p, i) =>
      `<b>${names[i]} ${fftFreqFmt(p.f)}</b>（幅值 ${LabAnalysis.fmt(p.a, 3)}${col.unit || ''}）`).join('，');
    notes.push(`<div class="fft-note">自动标注谱峰：${peakText}。</div>`);
  } else {
    notes.push('<div class="fft-note">未发现明显谱峰（各频率分量幅值都很小），信号以直流/缓变趋势为主。</div>');
  }
  notes.push(`<div class="fft-note">直流分量（0 Hz，即均值 ${LabAnalysis.fmt(spec.amps[0], 3)}${col.unit || ''}）已单独显示并注明；变换前已扣除均值，故谱峰反映交流分量、不受直流零填充泄漏影响。</div>`);
  if (hum) {
    notes.push(`<div class="fft-note warn">疑似工频干扰：50 Hz 附近检测到谱峰（${fftFreqFmt(hum.f)}，幅值 ${LabAnalysis.fmt(hum.a, 3)}），建议检查供电与接地屏蔽。</div>`);
  }
  if (rateKnown) {
    notes.push(`<div class="fft-note">采样率 ${rate.toFixed(2)} Hz（来自采样质量分析），频率分析上限（奈奎斯特频率）${(rate / 2).toFixed(2)} Hz。${q.sd > 0 && q.med > 0 && q.sd > q.med * 0.05 ? '采样间隔存在抖动（±' + fmtInterval(q.sd) + '），频谱可能有一定展宽。' : ''}</div>`);
    if (resampled) {
      notes.push(`<div class="fft-note">已启用重采样：${pts.length} 个原始点 → ${resampled.n} 个均匀间隔点（线性插值，步长 ${(resampled.step * 1000).toFixed(1)} ms），消除采样间隔不均对频谱的影响。</div>`);
    }
  } else {
    notes.push('<div class="fft-note warn">采样质量分析未通过 / 无时间戳，频率轴按采样间隔 = 1s（1 Hz）估算，仅供参考，不影响其他功能。</div>');
  }
  notes.push('<div class="fft-note">实现说明：本地自实现的迭代式基-2 Cooley-Tukey FFT（不足 2 的幂时零填充），变换前扣除均值，单边幅度谱 A_k = 2|X_k|/N（按实际样本数折算）。</div>');
  notesEl.innerHTML = notes.join('');
}

/* ---------------- 深度分析（可选） ---------------- */

function setupDeepAnalysis() {
  $('deep-toggle').addEventListener('click', () => {
    $('deep-body').classList.toggle('hidden');
    $('deep-card').classList.toggle('open');
  });

  $('deep-send-btn').addEventListener('click', async () => {
    if (!state.ds) { toast('请先导入数据'); return; }
    const key = $('deep-key').value.trim();
    if (!key) { toast('请先填写 API Key', 'error'); return; }
    if (state.deepBusy) return;
    state.deepBusy = true;
    const btn = $('deep-send-btn');
    const result = $('deep-result');
    btn.disabled = true;
    btn.textContent = '分析中…';
    result.classList.remove('hidden', 'error');
    result.classList.add('loading');
    result.textContent = '正在请求模型分析，请稍候…';

    const summary = buildDeepSummary();
    const endpoint = $('deep-endpoint').value.trim() || 'https://api.openai.com/v1/chat/completions';
    const model = $('deep-model').value.trim() || 'gpt-4o-mini';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一名物联网实验数据分析助手。请基于用户提供的数据摘要，用简体中文给出深入、有条理的分析解读：数据质量评估、趋势成因推测、异常点可能原因、实验改进建议。语言自然、像实验报告的分析段落，不要堆砌列表符号。' },
            { role: 'user', content: summary }
          ]
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`请求失败（HTTP ${res.status}）：${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : JSON.stringify(data);
      result.classList.remove('loading');
      result.textContent = content;
    } catch (e) {
      result.classList.remove('loading');
      result.classList.add('error');
      result.textContent = '深度分析失败：' + e.message + '\n\n提示：请检查 API Key、接口地址与网络；此功能为可选项，不影响其他功能使用。';
    } finally {
      state.deepBusy = false;
      btn.disabled = false;
      btn.textContent = '发送给模型分析';
    }
  });
}

function buildDeepSummary() {
  const ds = state.ds;
  const valid = state.stats.filter(s => s.ok);
  const lines = [];
  lines.push(`数据来源：${ds.sourceLabel}`);
  lines.push(`有效数据：${ds.rows.length} 行 × ${ds.columns.length} 列`);
  if (ds.meta.time) lines.push(`采样时段：${ds.meta.time.startLabel} 至 ${ds.meta.time.endLabel}`);
  lines.push('');
  lines.push('各通道统计（最大/最小/均值/标准差/极差/漂移）：');
  const f = v => LabAnalysis.fmt(v, 3);
  valid.forEach(s => {
    lines.push(`${s.pretty}：max=${f(s.max)} min=${f(s.min)} mean=${f(s.mean)} std=${f(s.std)} range=${f(s.range)} drift=${f(s.drift)} outliers=${s.outliers.length}`);
  });
  lines.push('');
  lines.push('本地规则引擎生成的基础结论：');
  lines.push(state.conclusion.text);
  lines.push('');
  lines.push('请基于以上信息做更深入的分析解读。');
  return lines.join('\n');
}

/* ---------------- 报告 ---------------- */

function setupReport() {
  const extraInfo = () => {
    const evRec = [...state.calibLog].reverse().find(e => e && e.tag === 'EVAL');
    return {
      equipment: $('report-equipment') ? $('report-equipment').value : '',
      steps: $('report-steps') ? $('report-steps').value : '',
      notes: $('report-notes') ? $('report-notes').value : '',
      dataRecord: $('report-datarec') ? $('report-datarec').value : '',
      instruments: $('report-instruments') ? $('report-instruments').value : '',
      uncertainty: {
        a: $('unc-b') && $('unc-b').value !== '' ? Number($('unc-b').value) : 0,
        k: $('unc-k') && $('unc-k').value !== '' ? Number($('unc-k').value) : 2
      },
      outlierMethod: state.outlierMethod,
      evalRecord: evRec
        ? String(evRec.formula || '').replace('标定评估：', `标定评估（${evRec.src || '—'}）：`)
        : '',
      events: (state.events || []).slice()
    };
  };

  $('gen-report-btn').addEventListener('click', () => {
    if (!state.ds) { toast('请先导入数据'); return; }
    const info = Object.assign({
      title: $('report-title').value,
      purpose: $('report-purpose').value,
      ops: state.ops.slice()
    }, extraInfo());
    state.reportText = LabReport.buildReport(state.ds, state.stats, state.conclusion.text, info);
    // v2.3：生成报告时同时抓取当前图表位图，打印/PDF 版会附在「图表附录」
    state.reportCharts = collectReportCharts();
    $('report-preview').textContent = state.reportText;
    toast('报告已生成', 'success');
  });

  $('copy-report-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    copyText(state.reportText);
  });

  $('export-txt-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    const t = ($('report-title').value || '实验报告').trim().replace(/[\\/:*?"<>|]/g, '_');
    downloadFile(state.reportText, t + '.txt');
  });

  $('export-md-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    const t = ($('report-title').value || '实验报告').trim().replace(/[\\/:*?"<>|]/g, '_');
    downloadFile(state.reportText, t + '.md');
  });

  $('export-pdf-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    fillPrintRoot();
    toast('在打印窗口中选择「另存为 PDF」即可导出', 'success');
    setTimeout(() => window.print(), 150);
  });

  // v3.0：导出 PPT 大纲（Markdown），按报告结构生成答辩演示大纲
  $('export-ppt-btn').addEventListener('click', () => {
    if (!state.ds) { toast('请先导入数据', 'error'); return; }
    const info = Object.assign({ title: $('report-title').value, purpose: $('report-purpose').value, ops: state.ops.slice() }, extraInfo());
    const md = LabReport.buildPptOutline(state.ds, state.stats, state.conclusion ? state.conclusion.text : '', info);
    const t = ($('report-title').value || '实验报告').trim().replace(/[\\/:*?"<>|]/g, '_');
    downloadFile(md, t + '-答辩大纲.md');
    copyText(md);
    toast('PPT 大纲已生成并复制到剪贴板', 'success');
  });

  // v2.4：导出 Word（.docx，docx 库本地生成，含统计表与图表附录）
  $('export-docx-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    if (typeof docx === 'undefined') {
      toast('docx 组件未加载（请确认 vendor/docx.umd.js 存在），可先用「导出 PDF」', 'error');
      return;
    }
    const info = Object.assign({ title: $('report-title').value, purpose: $('report-purpose').value, ops: state.ops.slice() }, extraInfo());
    const pkg = {
      title: info.title, purpose: info.purpose, ops: info.ops,
      equipment: info.equipment, steps: info.steps, notes: info.notes, dataRecord: info.dataRecord,
      events: info.events,
      instruments: info.instruments, uncertainty: info.uncertainty,
      outlierMethod: info.outlierMethod, evalRecord: info.evalRecord,
      ds: state.ds, stats: state.stats, conclusionText: state.conclusion.text,
      charts: state.reportCharts || []
    };
    LabReport.buildDocx(pkg, ($('report-title').value || '实验报告').trim().replace(/[\\/:*?"<>|]/g, '_'))
      .then(p => downloadBlob(p.blob, p.filename))
      .catch(e => toast('Word 导出失败：' + e.message, 'error'));
  });

  // v2.4：导出单文件 HTML（报告正文 + 图表 base64 内联，双击即可查看，无需部署）
  $('export-html-btn').addEventListener('click', () => {
    if (!state.reportText) { toast('请先生成报告', 'error'); return; }
    const t = ($('report-title').value || '实验报告').trim().replace(/[\\/:*?"<>|]/g, '_');
    const html = LabReport.buildStaticHtml(state.reportText, state.reportCharts || [], t);
    downloadBlob(html, t + '-' + exportStamp() + '.html', 'text/html;charset=utf-8');
  });

  // 用户直接 Ctrl+P 时也填充打印视图
  window.addEventListener('beforeprint', () => {
    if (state.reportText) fillPrintRoot();
  });

  $('export-latex-btn').addEventListener('click', () => {
    const tex = buildLatexTable();
    if (!tex) { toast('请先导入数据', 'error'); return; }
    const out = $('latex-output');
    out.value = tex;
    out.classList.remove('hidden');
    copyText(tex); // 尽力写剪贴板；成败都展开只读文本框供手动复制
  });

  // v2.6：报告模板一键预填（器材 / 步骤 / 注意事项 / 数据记录）
  document.querySelectorAll('[data-report-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = btn.dataset.reportTpl;
      const set = (id, v) => { const el = $(id); if (el) el.value = v; };
      if (tpl === 'temp') {
        set('report-equipment', '温度传感器（NTC 10kΩ，B 值 3950K）\n数据采集模块（12 位 ADC）\n恒温水浴 / 加热装置\n数字万用表');
        set('report-steps', '1. 按接线图连接传感器与采集模块，检查供电。\n2. 设定水浴温度，从低温到高温逐点升温。\n3. 每稳定 2 分钟后记录一组电阻与温度读数。\n4. 记录环境温度与大气压，重复测量 3 组。');
        set('report-notes', '1. 传感器引线远离电源线，减少工频干扰。\n2. 每次升温后待读数稳定再记录。\n3. 探头完全浸入水浴，避免接触容器壁。');
        set('report-datarec', '记录列：时间、电阻值（Ω）、参考温度（°C）、环境温度。每点 3 次读数取平均。');
        toast('已套用「温度传感器标定实验」模板', 'success');
      } else if (tpl === 'generic') {
        set('report-equipment', '数据采集设备\n被测对象 / 传感器\n连接线材与电源');
        set('report-steps', '1. 连接设备并确认通信正常。\n2. 设定采样参数（采样率、量程）。\n3. 开始采集并记录数据。\n4. 导出数据用于分析。');
        set('report-notes', '1. 采集前检查设备连接与供电。\n2. 保持采样条件一致，便于对比。\n3. 异常数据当场标注说明。');
        set('report-datarec', '记录列：时间、各通道数值。说明采样频率与量程。');
        toast('已套用「通用数据采集」模板', 'success');
      } else if (tpl === 'clear') {
        set('report-equipment', '');
        set('report-steps', '');
        set('report-notes', '');
        set('report-datarec', '');
        toast('已清空选填区块', 'success');
      }
    });
  });
}

// 统计表 → LaTeX tabular（列为数值通道，行为各统计量）
function buildLatexTable() {
  const valid = (state.stats || []).filter(s => s.ok);
  if (!valid.length) return '';
  const esc = s => String(s).replace(/([&%#_])/g, '\\$1');
  const f = (v, d = 2) => LabAnalysis.fmt(v, d);
  const rows = [
    ['最大值', s => f(s.max) + (s.unit || '')],
    ['最小值', s => f(s.min) + (s.unit || '')],
    ['平均值', s => f(s.mean) + (s.unit || '')],
    ['标准差', s => f(s.std, 3)],
    ['SEM', s => f(s.sem, 4)],
    ['95% CI 半宽', s => f(s.ciHalf)],
    ['极差', s => f(s.range)],
    ['漂移量', s => (s.drift >= 0 ? '+' : '') + f(s.drift) + (s.unit || '')]
  ];
  const L = [];
  L.push('\\begin{tabular}{l' + 'c'.repeat(valid.length) + '}');
  L.push('\\hline');
  L.push(' & ' + valid.map(s => esc(s.pretty)).join(' & ') + ' \\\\');
  L.push('\\hline');
  rows.forEach(([label, fn]) => {
    L.push(esc(label) + ' & ' + valid.map(fn).join(' & ') + ' \\\\');
  });
  L.push('\\hline');
  L.push('\\end{tabular}');
  return L.join('\n');
}

// v2.3：canvas 快照。页签隐藏时 Chart.js 未布局，canvas 可能是 0×0（toDataURL 得到 'data:,'），
// 此时用离屏 canvas 重建一份（引用共享 config，responsive:false 固定尺寸）再导出
function snapshotChart(chartInst, w, h) {
  if (!chartInst) return null;
  try {
    if (chartInst.canvas && chartInst.canvas.width > 0 && chartInst.canvas.height > 0) {
      const url = chartInst.canvas.toDataURL('image/png');
      if (url && url.length > 30) return url;
    }
  } catch (e) { /* 落入离屏重建 */ }
  try {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const inst = new Chart(tmp, {
      type: chartInst.config.type,
      data: chartInst.config.data,
      options: Object.assign({}, chartInst.config.options, {
        responsive: false,
        animation: false,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: { zoom: undefined }
      })
    });
    inst.update('none');
    const url = tmp.toDataURL('image/png');
    inst.destroy();
    return url;
  } catch (e) {
    return null;
  }
}

// v2.3：收集当前已生成的图表（canvas 位图 → dataURL），供打印/PDF 版图表附录使用
// 注意：页签隐藏的 canvas 位图仍在，toDataURL 不受 display:none 影响
function collectReportCharts() {
  // 滤波/频谱图只在访问过「滤波实验」页签后才创建——生成报告时先补渲染一次
  // （canvas 在隐藏面板 0×0，snapshotChart 会离屏重建兜底），避免附录静默缺图
  if (!state.filterChart) { try { renderFilter(); } catch (e) { /* 数据不支持滤波时忽略 */ } }
  if (!state.fftChart) { try { renderFFT(); } catch (e) { /* 无时间戳等降级时忽略 */ } }
  const out = [];
  // 从 PNG dataURL 解析位图宽高（IHDR 在固定偏移，大端 4 字节），Word/HTML 版排版要用真实比例
  const pngSize = url => {
    try {
      const b = atob(url.split(',')[1]);
      return {
        w: ((b.charCodeAt(16) << 24) | (b.charCodeAt(17) << 16) | (b.charCodeAt(18) << 8) | b.charCodeAt(19)) >>> 0,
        h: ((b.charCodeAt(20) << 24) | (b.charCodeAt(21) << 16) | (b.charCodeAt(22) << 8) | b.charCodeAt(23)) >>> 0
      };
    } catch (e) { return null; }
  };
  const grab = (inst, title, w, h) => {
    const url = inst ? snapshotChart(inst, w, h) : null;
    const dim = url ? pngSize(url) : null;
    out.push({
      title: url ? title : title + '（未生成：请先访问对应页签，确认数据支持后再生成报告）',
      url,
      w: dim ? dim.w : w,
      h: dim ? dim.h : h
    });
  };
  grab(state.chart, '趋势图（数据曲线）', 760, 400);
  grab(state.filterChart, '滤波前后对比图', 760, 400);
  grab(state.fftChart, '频谱图（FFT 幅度谱）', 480, 300);
  return out;
}

function fillPrintRoot() {
  let html = LabReport.toHtml(state.reportText);
  const charts = state.reportCharts || [];
  if (charts.length) {
    html += '<h2>图表附录</h2>';
    charts.forEach(c => {
      if (c.url) {
        html += `<figure class="print-figure"><img src="${c.url}" alt="${escapeHtml(c.title)}"><figcaption>${escapeHtml(c.title)}</figcaption></figure>`;
      } else {
        html += `<p class="chart-tip">${escapeHtml(c.title)}</p>`;
      }
    });
  }
  $('print-root').innerHTML = html;
}

/* ================= v4.0 创新功能接线 ================= */

function setupV4() {

  /* ---- 3D 数据星系 / 异常猎人 ---- */
  const galaxyBtn = $('galaxy-open-btn');
  if (galaxyBtn) galaxyBtn.addEventListener('click', () => {
    if (!state.ds) { toast('请先导入数据', 'error'); return; }
    if (!LabGalaxy.supported()) { toast('Three.js 未加载（vendor/three.min.js 缺失）', 'error'); return; }
    try { LabGalaxy.open(state.ds, 'fly'); toast('3D 数据星系已开启：WASD 飞行 · R 回放 · Esc 退出', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  });
  const hunterBtn = $('hunter-open-btn');
  if (hunterBtn) hunterBtn.addEventListener('click', () => {
    if (!state.ds) { toast('请先导入数据', 'error'); return; }
    if (!LabGalaxy.supported()) { toast('Three.js 未加载', 'error'); return; }
    try {
      LabGalaxy.open(state.ds, 'hunter');
      toast('异常猎人开始：飞行器自动推进，点击红色晶体判定「真异常 / 误报」', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  /* ---- 3D 实验台 + 虚拟仪表盘 ---- */
  const benchBtn = $('bench-open-btn');
  if (benchBtn) benchBtn.addEventListener('click', () => {
    if (!LabBench.supported()) { toast('Three.js 未加载', 'error'); return; }
    try {
      LabBench.open();
      // 打开时立即把当前采集值灌进去（有数据时可见联动）
      toast('3D 实验台已开启：进采集页采集即可看到温度计 / 数码管实时联动；右上角可玩接线挑战', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
  const dashBtn = $('dash-toggle-btn');
  const dashRoot = $('dash-root');
  if (dashBtn && dashRoot) {
    dashBtn.addEventListener('click', () => {
      state.dashOn = !state.dashOn;
      dashBtn.textContent = '虚拟仪表：' + (state.dashOn ? '开' : '关');
      dashRoot.classList.toggle('hidden', !state.dashOn);
      if (state.dashOn) LabDashboard.mount(dashRoot);
    });
    LabDashboard.mount(dashRoot);
    dashRoot.classList.toggle('hidden', !state.dashOn); // 默认开启（state.dashOn 初始 true）
  }

  /* ---- 实验复现包与指纹 ---- */
  const rpExport = $('rp-export-btn');
  if (rpExport) rpExport.addEventListener('click', async () => {
    try {
      rpExport.disabled = true;
      const meta = await LabRepro.exportPackage();
      showRpResult(`复现包已导出。<br>指纹：${meta.fingerprint}<br>共 ${meta.rows} 行 · ${meta.ops.length} 条流水 · ${meta.events.length} 个事件`);
    } catch (e) { toast(e.message, 'error'); }
    finally { rpExport.disabled = false; }
  });
  const rpVerifyBtn = $('rp-verify-btn');
  const rpInput = $('rp-verify-input');
  if (rpVerifyBtn && rpInput) {
    rpVerifyBtn.addEventListener('click', () => rpInput.click());
    rpInput.addEventListener('change', async () => {
      const f = rpInput.files && rpInput.files[0];
      rpInput.value = '';
      if (!f) return;
      try {
        rpVerifyBtn.disabled = true;
        showRpResult('验证中…');
        const r = await LabRepro.verifyPackage(f);
        showRpResult(r.ok
          ? `<span style="color:#16a34a">✔ 指纹一致</span>：${r.actual}<br>数据 ${r.meta.rows} 行 · ${r.meta.created}<br>结论可信：报告由这份数据经这条流水得出`
          : `<span style="color:#dc2626">✘ 指纹不一致</span><br>包内：${r.expect}<br>重算：${r.actual}<br>数据或流水在导出后被改动过`);
      } catch (e) { showRpResult('验证失败：' + escapeHtml(e.message)); }
      finally { rpVerifyBtn.disabled = false; }
    });
  }
  const rpFp = $('rp-fp-btn');
  if (rpFp) rpFp.addEventListener('click', async () => {
    if (!state.ds) { toast('请先导入数据', 'error'); return; }
    const fp = await LabRepro.fingerprint(rawTextOfV4(), state.ops);
    showRpResult(`当前指纹：${fp}<br>输入 = 原始数据文本 + 处理流水（顺序敏感）`);
  });
  function showRpResult(html) {
    const box = $('rp-result');
    box.classList.remove('hidden');
    box.innerHTML = html;
  }
  function rawTextOfV4() {
    if (state.pending && state.pending.text) return state.pending.text;
    return '';
  }

  /* ---- 分享链接 ---- */
  const shareBtn = $('share-make-btn');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    try {
      const r = LabRepro.makeShareUrl();
      if (r.size > 60000) {
        toast('数据量较大（压缩后 ' + (r.size / 1024).toFixed(0) + ' KB），链接可能超长，建议改用「导出复现包」', 'warn');
      }
      copyText(r.url);
      const box = $('share-result');
      box.classList.remove('hidden');
      box.innerHTML = `链接已复制（携带 ${r.rows} 行数据，压缩后 ${(r.size / 1024).toFixed(1)} KB）：<br>` +
        `<input class="input" readonly value="${escapeHtml(r.url.slice(0, 220))}${r.url.length > 220 ? '…' : ''}">`;
    } catch (e) { toast(e.message, 'error'); }
  });

  /* ---- 自动模型辨识 ---- */
  const midBtn = $('mid-run-btn');
  const midC = $('mid-c-btn');
  let midBest = null;
  if (midBtn) midBtn.addEventListener('click', () => {
    const ds = state.ds;
    if (!ds) { toast('请先导入数据', 'error'); return; }
    const xi = parseInt($('fit-x-col').value, 10);
    const yi = parseInt($('fit-y-col').value, 10);
    const xs = [], ys = [];
    ds.rows.forEach(r => {
      const a = r.cells[xi], b = r.cells[yi];
      if (typeof a === 'number' && isFinite(a) && !r.badCells.has(xi) &&
          typeof b === 'number' && isFinite(b) && !r.badCells.has(yi)) { xs.push(a); ys.push(b); }
    });
    const res = LabModelID.identify(xs, ys);
    const box = $('mid-result');
    box.classList.remove('hidden');
    if (!res.best) {
      midBest = null;
      midC && midC.classList.add('hidden');
      box.innerHTML = `<div class="cr-error">${escapeHtml(res.reason || '辨识失败')}</div>`;
      return;
    }
    midBest = res.best;
    midC && midC.classList.remove('hidden');
    const rows = res.list.map((m, i) =>
      `<tr${i === 0 ? ' style="background:#eff6ff"' : ''}><td>${i === 0 ? '★ ' : ''}${escapeHtml(m.name)}</td><td>${escapeHtml(m.formula)}</td><td>${m.r2.toFixed(4)}</td><td><b>${m.adjR2.toFixed(4)}</b></td><td>${LabAnalysis.fmt(m.maxRes, 4)}</td></tr>`).join('');
    box.innerHTML =
      `<div class="cr-value">推荐：${escapeHtml(res.best.name)}（修正 R² = ${res.best.adjR2.toFixed(4)}）</div>` +
      `<table class="data-table" style="max-width:640px"><thead><tr><th>模型</th><th>公式</th><th>R²</th><th>修正 R²</th><th>最大残差</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="cr-sub">按修正 R² 排序（惩罚参数数）；评分在原始 y 空间进行，不受变量变换影响。点「生成该模型 C 代码」可直接烧进芯片。</div>`;
    pushOp(`模型自动辨识：${LabAnalysis.prettyColName(ds.columns[xi] || { name: 'X' })} → ${LabAnalysis.prettyColName(ds.columns[yi] || { name: 'Y' })}，最优 ${res.best.name}（修正 R² ${res.best.adjR2.toFixed(4)}）`);
  });
  if (midC) midC.addEventListener('click', () => {
    if (!midBest) return;
    const xi = parseInt($('fit-x-col').value, 10);
    const xCol = (state.ds && state.ds.columns[xi]) || { name: 'raw' };
    const code = LabModelID.cCode(midBest, LabAnalysis.prettyColName(xCol), 'sensor_convert');
    downloadBlobV4(code, 'modelid_' + midBest.id + '.h');
    copyText(code);
  });
  function downloadBlobV4(text, name) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出 ' + name, 'success');
  }

  /* ---- 分享链接恢复（页面带 #share= 时） ---- */
  const shared = (typeof LabRepro !== 'undefined') && LabRepro.readShareHash();
  if (shared) {
    history.replaceState(null, '', location.pathname + location.search);
    state.pending = { text: shared.text, fileName: '分享链接携带的数据', sourceType: 'text' };
    state.pendingNote = '来自分享链接';
    if (shared.opts) {
      $('opt-skip-rows').value = shared.opts.skipRows ?? '0';
      $('opt-time-col').value = shared.opts.timeCol || 'auto';
      $('opt-delimiter').value = shared.opts.delimiter || 'auto';
    }
    if (shared.reportInfo) {
      if (shared.reportInfo.title) $('report-title').value = shared.reportInfo.title;
      if (shared.reportInfo.purpose) $('report-purpose').value = shared.reportInfo.purpose;
    }
    doParse();
    setTimeout(() => toast('已从分享链接恢复实验数据并解析', 'success'), 600);
  }
}



/* ---------------- 实验事件标注（v2.5） ---------------- */
function fmtEventTime(x) {
  return fmtTick(x);
}

function renderEventsList() {
  const box = $('events-list');
  if (!box) return;
  const evs = state.events || [];
  if (!evs.length) {
    box.innerHTML = '';
    $('event-hint').textContent = '';
    return;
  }
  box.innerHTML = evs.map((ev, i) =>
    `<span class="event-item"><span class="event-time">${fmtEventTime(ev.x)}</span>` +
    `<span class="event-text">${escapeHtml(ev.label || '事件')}</span>` +
    (ev.photo ? `<img class="event-photo" src="${ev.photo}" alt="事件照片">` : '') +
    `<button class="event-del" data-idx="${i}" title="删除">×</button></span>`
  ).join('');
  $('event-hint').textContent = `共 ${evs.length} 个事件，已标注在趋势图上`;
  box.querySelectorAll('.event-del').forEach(btn => {
    btn.addEventListener('click', () => {
      state.events.splice(Number(btn.dataset.idx), 1);
      renderEventsList();
      if (state.chart) state.chart.update('none');
    });
  });
}

function setupEvents() {
  const addBtn = $('event-add-btn');
  if (!addBtn) return;
  addBtn.addEventListener('click', () => {
    const raw = ($('event-x').value || '').trim();
    const x = Number(raw);
    if (!raw || !isFinite(x)) { toast('请先填写或点击图表选择一个时刻', 'warn'); return; }
    const label = ($('event-label').value || '').trim() || '事件';
    const ev = { x, label };
    if (state.pendingEventPhoto) { ev.photo = state.pendingEventPhoto; state.pendingEventPhoto = null; }
    state.events.push(ev);
    state.events.sort((a, b) => a.x - b.x);
    $('event-x').value = '';
    $('event-label').value = '';
    renderEventsList();
    if (state.chart) state.chart.update('none');
    pushOp(`标注事件「${label}」@ ${fmtEventTime(x)}${ev.photo ? '（附现场照片）' : ''}`);
  });
  // v4.0 拍照关联：选择/拍摄一张现场照片，压缩后附加到下一个添加的事件
  const photoInput = $('event-photo-input');
  const photoBtn = $('event-photo-btn');
  if (photoBtn && photoInput) {
    photoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
      const f = photoInput.files && photoInput.files[0];
      photoInput.value = '';
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        // 压缩到最长边 480px 的 JPEG（质量控制体积，照片仅存本地与导出包）
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        state.pendingEventPhoto = cv.toDataURL('image/jpeg', 0.6);
        toast('照片已就绪，填好时刻与描述后点「添加事件」即可关联', 'success');
      };
      img.onerror = () => toast('照片读取失败', 'error');
      img.src = URL.createObjectURL(f);
    });
  }
}

/* ================= v2.6 工具箱 ================= */

// C 浮点字面量：整数值补 .0，避免 3950f 这种非法写法
function cLit(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0.0f';
  let s = String(n);
  if (!/[.eE]/.test(s)) s += '.0';
  return s + 'f';
}

// 生成嵌入式 C 代码：读取校准页当前参数
function genCCode() {
  const type = $('cg-type').value;
  let body = '';
  if (type === 'ntc') {
    const method = document.querySelector('#ntc-method .seg.active').dataset.method;
    if (method === 'sh') {
      const A = parseFloat($('ntc-sh-a').value), B = parseFloat($('ntc-sh-b').value), C = parseFloat($('ntc-sh-c').value);
      body =
`#include <math.h>

/* NTC 热敏电阻 → 摄氏温度（Steinhart-Hart 三系数）
   1/T = A + B·lnR + C·(lnR)^3
   A=${A}  B=${B}  C=${C} */
float ntc_temp(float R)
{
    if (R <= 0.0f) return -273.15f;
    float lnR = logf(R);
    float invT = ${cLit(A)} + ${cLit(B)} * lnR + ${cLit(C)} * lnR * lnR * lnR;
    return 1.0f / invT - 273.15f;
}`;
    } else {
      const B = parseFloat($('ntc-b').value), R0 = parseFloat($('ntc-r0').value), T0 = parseFloat($('ntc-t0').value); // T0 单位 K
      const pts = 21, rMin = R0 * 0.1, rMax = R0 * 10;
      const rs = [], ts = [];
      for (let i = 0; i < pts; i++) {
        const R = rMin + (rMax - rMin) * i / (pts - 1);
        rs.push(R);
        const t = Number(LabCalib.ntcTempB(R, B, R0, T0));
        ts.push(isFinite(t) ? parseFloat(t.toFixed(3)) : 0);
      }
      body =
`#include <math.h>

/* NTC 热敏电阻 → 摄氏温度（B 值式）
   1/T = 1/T0 + ln(R/R0)/B
   B=${B}K  R0=${R0}Ω  T0=${T0}K */
float ntc_temp(float R)
{
    if (R <= 0.0f) return -273.15f;
    float invT = 1.0f / ${cLit(T0)} + logf(R / ${cLit(R0)}) / ${cLit(B)};
    return 1.0f / invT - 273.15f;
}

/* 电阻分度表（Ω），范围 ${rMin.toFixed(0)} ~ ${rMax.toFixed(0)} Ω，共 ${pts} 点 */
const float ntc_table_R[${pts}] = { ${rs.map(v => cLit(parseFloat(v.toFixed(2)))).join(', ')} };
/* 对应温度（°C），与 ntc_table_R 一一对应 */
const float ntc_table_T[${pts}] = { ${ts.map(v => cLit(v)).join(', ')} };`;
    }
  } else if (type === 'adc') {
    const bits = parseFloat($('adc-bits').value), vref = parseFloat($('adc-vref').value), k = parseFloat($('adc-k').value);
    const full = Math.pow(2, bits) - 1;
    body =
`/* ADC 原始读数 → 电压（V）
   ${bits} 位 ADC，Vref=${vref}V，分压还原系数 k=${k} */
float adc_to_volt(unsigned int raw)
{
    return (float)raw / ${cLit(full)} * ${cLit(vref)} * ${cLit(k)};
}`;
  } else {
    const { coefs, deg } = polyParams();
    const c0 = coefs[0], c1 = coefs[1], c2 = coefs[2];
    const polyExpr = deg === 2
      ? `${cLit(c0)} + ${cLit(c1)} * x + ${cLit(c2)} * x * x`
      : `${cLit(c0)} + ${cLit(c1)} * x`;
    body =
`/* 自定义多项式换算 y = f(x)
   当前${deg === 2 ? '二次' : '一次'}多项式 */
float poly_conv(float x)
{
    return ${polyExpr};
}`;
  }
  const header = '/* 由 LabInsight 生成 · 直接把函数拷进 Keil / Arduino 工程即可使用 */\n';
  $('cg-output').textContent = header + body + '\n';
  toast('已生成 C 代码', 'success');
}

// v2.9：生成可直接烧录的 Arduino 完整 sketch（.ino），函数体复用上方 C 代码
function genArduinoSketch() {
  const out = $('cg-output');
  if (!out || !out.textContent.trim() || /点「生成 C 代码」/.test(out.textContent)) genCCode();
  const code = $('cg-output').textContent
    .replace(/^\/\* 由 LabInsight 生成[^\n]*\n/, '')
    .trim();
  const t = ($('cg-type') && $('cg-type').value) || 'ntc';
  const typeLabel = t === 'adc' ? 'ADC 码值 → 电压' : (t === 'poly' ? '多项式换算' : 'NTC 电阻 → 温度');
  const loopBody = t === 'adc'
    ? `  int raw = analogRead(ADC_PIN);
  float v = adc_to_volt((unsigned int)raw);
  Serial.print(F("raw=")); Serial.print(raw);
  Serial.print(F("  V=")); Serial.print(v, 4); Serial.println(F(" V"));`
    : (t === 'poly'
      ? `  int raw = analogRead(ADC_PIN);
  float y = poly_conv((float)raw);
  Serial.print(F("raw=")); Serial.print(raw);
  Serial.print(F("  y=")); Serial.print(y, 4); Serial.println();`
      : `  int raw = analogRead(ADC_PIN);
  float v = (float)raw / ADC_MAX * VCC;
  float R = (v >= VCC) ? 0.0f : R_REF * v / (VCC - v);   // NTC 接 GND 侧；若接 VCC 侧改用 R_REF*(VCC-v)/v
  float temp = ntc_temp(R);
  Serial.print(F("raw=")); Serial.print(raw);
  Serial.print(F("  V=")); Serial.print(v, 4);
  Serial.print(F("  R=")); Serial.print(R, 1);
  Serial.print(F("  T=")); Serial.print(temp, 2); Serial.println(F(" C"));`);
  const sketch = `/* ===== LabInsight 生成的 Arduino 完整示例（${typeLabel}） =====
 * 接线：传感器 / 分压中点接 A0，共地。
 * 烧录前只需改下面「用户常量」几行，换算函数按当前校准参数生成，可直接编译。
 */
const uint8_t  ADC_PIN   = A0;
const float    VCC       = 3.3f;      // 供电电压：5V 板改成 5.0
const float    R_REF     = 10000.0f;  // 分压固定电阻（Ω），仅 NTC 用
const uint16_t ADC_MAX   = 4095;      // 10 位 ADC 改成 1023
const uint16_t PERIOD_MS = 1000;      // 采样周期（ms）

${code}

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  Serial.println(F("LabInsight 示例启动：每秒输出一行"));
}

void loop() {
${loopBody}
  delay(PERIOD_MS);
}
`;
  downloadBlob(sketch, 'labinsight_sketch.ino', 'text/plain;charset=utf-8');
  pushOp(`导出 Arduino 完整示例（${typeLabel}）`);
  toast('已下载 labinsight_sketch.ino', 'success');
}

// 采样率 / 定时器配置助手
function calcTimer() {
  const rate = parseFloat($('tm-rate').value);
  const mcu = $('tm-mcu').value;
  if (!(rate > 0)) { $('tm-output').textContent = '请填写大于 0 的目标采样率'; return; }
  let out = '';
  if (mcu === 'stm32') {
    const clk = (parseFloat($('tm-clk').value) || 72) * 1e6;
    const ticks = clk / rate;
    let psc = 0;
    if (ticks > 65536) psc = Math.ceil(ticks / 65536) - 1;
    let arr = Math.round(ticks / (psc + 1)) - 1;
    if (arr < 0) arr = 0;
    if (arr > 65535) arr = 65535;
    const real = clk / ((psc + 1) * (arr + 1));
    const T = 1e6 / rate;
    out = `STM32 定时器配置（时钟 ${(clk / 1e6).toFixed(0)} MHz，目标 ${rate} Hz）\n` +
      `  定时周期 ≈ ${T.toFixed(2)} µs\n` +
      `  PSC = ${psc}（预分频 ${psc + 1}）\n` +
      `  ARR = ${arr}（计数 ${arr + 1}）\n` +
      `  实际采样率 = ${real.toFixed(2)} Hz\n` +
      `  HAL 写法：htim.Init.Prescaler = ${psc};  htim.Init.Period = ${arr};`;
  } else {
    const clk = 16e6; // Arduino UNO 16MHz
    const presets = [1, 8, 64, 256, 1024];
    let chosen = null, ocr = 0;
    for (const p of presets) {
      const v = clk / (p * rate) - 1;
      if (v >= 0 && v <= 65535) { chosen = p; ocr = Math.round(v); break; }
    }
    if (chosen === null) {
      out = `Arduino UNO（16 MHz）在 ${rate} Hz 下超出定时器范围，请降低采样率或改用更高主频板卡。`;
    } else {
      const real = clk / (chosen * (ocr + 1));
      out = `Arduino UNO 定时器配置（16 MHz，目标 ${rate} Hz）\n` +
        `  预分频 = ${chosen}\n` +
        `  OCR1A = ${ocr}\n` +
        `  实际采样率 = ${real.toFixed(2)} Hz\n` +
        `  参考代码：TCCR1A=0; TCCR1B=(1<<WGM12)|预设分频; OCR1A=${ocr}; TIMSK1|=(1<<OCIE1A);`;
    }
  }
  let os = '';
  const osRate = rate * 16;
  if (osRate <= 200000) {
    os += `\n过采样提示：若采用 16 倍过采样（硬件/软件求平均），等效采样率 ${osRate.toFixed(0)} Hz，理论上可提升约 2 位有效分辨率（4 倍平均提 1 位，16 倍提 2 位）。`;
  }
  $('tm-output').textContent = out + os;
}

// 分压电阻 / ADC 位数助手（E24 标准电阻推荐）
function calcDivider() {
  const vin = parseFloat($('dv-vin').value);
  const vref = parseFloat($('dv-vref').value);
  const bits = parseInt($('dv-bits').value, 10);
  if (!(vin > 0) || !(vref > 0) || !(bits > 0)) { $('dv-output').textContent = '请填写有效的电压与位数'; return; }
  const lsb = vref / Math.pow(2, bits);
  let out = `ADC 分辨率（1 LSB）= ${(lsb * 1000).toFixed(3)} mV（${bits} 位，Vref ${vref} V）\n`;
  if (vin <= vref) {
    const use = vin / vref * 100;
    out += `信号最大 ${vin} V ≤ 参考 ${vref} V，可直接接入，无需分压。\n量程利用率 = ${use.toFixed(1)} %\n`;
    if (use < 50) out += `提示：利用率偏低（<50%），浪费了分辨率；可加分压或用更低的参考电压。\n`;
    if (lsb * 1000 > (vin * 0.01 * 1000)) out += `提示：1 LSB（${(lsb * 1000).toFixed(2)} mV）相对量程偏大，若需更细分辨率请提高位数或降低 Vref。\n`;
  } else {
    const ratio = vref / vin;
    out += `信号 ${vin} V > 参考 ${vref} V，必须分压。\n所需分压比 Vout/Vin ≤ ${ratio.toFixed(4)}（R2/(R1+R2) = ${ratio.toFixed(4)}）\n`;
    const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
    const cands = [];
    for (const r1 of E24) for (const r2 of E24) {
      const rr = r2 / (r1 + r2);
      if (rr >= ratio * 0.85 && rr <= ratio * 1.05) cands.push({ r1: r1 * 1000, r2: r2 * 1000, rr });
    }
    cands.sort((a, b) => Math.abs(a.rr - ratio) - Math.abs(b.rr - ratio));
    if (cands.length) {
      out += `推荐标准电阻（E24，R1 上 / R2 下）:\n`;
      cands.slice(0, 3).forEach(c => {
        out += `  R1 = ${c.r1} Ω，R2 = ${c.r2} Ω → 比值 ${c.rr.toFixed(4)}，适配最大输入 ${(vref / c.rr).toFixed(2)} V\n`;
      });
      out += `分压后最大 ${(vin * cands[0].rr).toFixed(3)} V，${vin * cands[0].rr <= vref ? '在量程内 ✔' : '仍超出量程，需更大分压比'}\n`;
    } else {
      out += `E24 常用阻值凑不出合适比值，可用精密电阻或运算放大器衰减。\n`;
    }
  }
  $('dv-output').textContent = out;
}

// hex 字节流解码
function hexToBytes(str) {
  const cleaned = String(str).replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, ' ');
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  let bytes = [];
  if (tokens.length === 1 && tokens[0].length > 2) {
    const s = tokens[0];
    for (let i = 0; i + 1 < s.length; i += 2) bytes.push(parseInt(s.substr(i, 2), 16));
  } else if (tokens.length && tokens.every(t => t.length === 2)) {
    bytes = tokens.map(t => parseInt(t, 16));
  } else {
    const s = cleaned.replace(/\s+/g, '');
    for (let i = 0; i + 1 < s.length; i += 2) bytes.push(parseInt(s.substr(i, 2), 16));
  }
  return bytes.filter(b => !isNaN(b));
}

function hexDecode(mode) {
  const bytes = hexToBytes($('hx-input').value);
  if (!bytes.length) { $('hx-output').textContent = '未识别到有效字节'; return; }
  let out = `共 ${bytes.length} 字节\nHEX: ${bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}\n`;
  if (mode === 'ascii') {
    out += `ASCII: ${bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')}\n`;
  } else if (mode === 'u16') {
    const vals = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) vals.push(bytes[i] * 256 + bytes[i + 1]);
    out += `uint16（大端）: ${vals.join(', ')}\n`;
  } else if (mode === 'i16') {
    const vals = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      let v = bytes[i] * 256 + bytes[i + 1];
      if (v >= 32768) v -= 65536;
      vals.push(v);
    }
    out += `int16（大端）: ${vals.join(', ')}\n`;
  }
  $('hx-output').textContent = out;
}

/* ----- 多组并列对比（v2.8）：重复实验取均值 ± 标准差带 ----- */

function compareAllSets() {
  // 第一组 = 当前数据（A 组），其后为追加的对比组
  return state.ds ? [{ label: 'A 组', ds: state.ds }].concat(state.compareSets) : [];
}

function compareCommonCols() {
  const all = compareAllSets();
  if (!all.length) return [];
  if (all.length < 2) return all[0].ds.numericColumns.slice();
  return all[0].ds.numericColumns.filter(c => all.every(g => g.ds.numericColumns.some(x => x.name === c.name)));
}

function setupCompare() {
  $('compare-add-btn').addEventListener('click', addCompareSet);
  $('compare-file-btn').addEventListener('click', () => $('compare-file-input').click());
  $('compare-file-input').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) addCompareFile(f);
  });
  $('compare-clear-btn').addEventListener('click', () => {
    state.compareSets = [];
    if (state.compareChart) { state.compareChart.destroy(); state.compareChart = null; }
    $('compare-wrap').classList.add('hidden');
    $('compare-groups').innerHTML = '';
    $('compare-table').innerHTML = '';
    renderCompareCols();
    toast('已清空对比组', 'success');
  });
  $('compare-col').addEventListener('change', renderCompareChart);
}

function renderCompareCols() {
  const sel = $('compare-col');
  if (!sel) return;
  const prev = sel.value;
  const cols = compareCommonCols();
  // v4.0 修复 P1：value 存列名（不是 index）——各组列顺序可能不同，按 index 取会静默错位
  sel.innerHTML = cols.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(LabAnalysis.prettyColName(c))}</option>`).join('');
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function addCompareSet() {
  if (!state.ds) { toast('请先解析一份数据（作为 A 组）', 'error'); return; }
  const text = $('compare-paste').value.trim();
  if (!text) { toast('请先粘贴第二组数据，或点「从文件选择」', 'error'); return; }
  const pending = { text, fileName: `对比组${state.compareSets.length + 2}`, sourceType: 'paste' };
  return addComparePending(pending);
}

// v2.9：对比组支持文件输入（CSV / Excel / txt），复用 fileToPending
async function addCompareFile(file) {
  try {
    if (!state.ds) { toast('请先解析一份数据（作为 A 组）', 'error'); return; }
    const pending = await fileToPending(file);
    addComparePending(pending);
  } catch (e) {
    toast('对比组添加失败：' + e.message, 'error');
  }
}

function addComparePending(pending) {
  const opts = {
    skipRows: parseInt($('opt-skip-rows').value, 10) || 0,
    timeCol: $('opt-time-col').value,
    delimiter: $('opt-delimiter').value,
    sourceType: pending.sourceType,
    fileName: pending.fileName
  };
  try {
    const ds = LabParser.parse(pending, opts);
    if (!ds.rows.length) throw new Error('未识别到有效数据行');
    const common = ds.numericColumns.filter(c => state.ds.numericColumns.some(x => x.name === c.name));
    if (!common.length) throw new Error('与当前数据没有同名的数值列，无法对比（列名需一致）');
    const label = String.fromCharCode(65 + state.compareSets.length + 1) + ' 组'; // B、C…
    state.compareSets.push({ label, ds });
    $('compare-paste').value = '';
    renderCompareCols();
    renderCompareChart();
    pushOp(`多组对比：添加${label}（${ds.rows.length} 行，来源 ${pending.fileName || '粘贴'}）`);
    toast(`已添加${label}：${ds.rows.length} 行`, 'success');
  } catch (e) {
    toast('对比组添加失败：' + e.message, 'error');
  }
}

function renderCompareChart() {
  const all = compareAllSets();
  if (!all.length) return;
  const wrap = $('compare-wrap');
  const tbl = $('compare-table');
  const grp = $('compare-groups');
  grp.innerHTML = all.map(g => `<span class="compare-chip"><b>${escapeHtml(g.label)}</b>${g.ds.rows.length} 行</span>`).join('');
  const sel = $('compare-col');
  if (!sel.options.length) { wrap.classList.add('hidden'); tbl.innerHTML = ''; return; }
  // v4.0 修复 P1：按列名在各组里各取各的 index（B 组列序不同时不再错位）
  const colName = sel.value;
  const col = all[0].ds.numericColumns.find(c => c.name === colName) || all[0].ds.numericColumns[0];
  const series = all.map(g => {
    const c = g.ds.columns.find(x => x.name === col.name);
    if (!c) return [];
    return g.ds.rows.map(r => {
      const v = r.cells[c.index];
      return (v === null || v === undefined) ? null : v;
    });
  });
  const nMax = Math.max(...series.map(s => s.length));
  const means = [], stds = [];
  for (let i = 0; i < nMax; i++) {
    const vals = series.map(s => s[i]).filter(v => v !== null && isFinite(v));
    if (!vals.length) { means.push(null); stds.push(null); continue; }
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    means.push(m);
    stds.push(vals.length >= 2 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / (vals.length - 1)) : 0);
  }
  const datasets = [];
  series.forEach((s, gi) => {
    datasets.push({
      label: all[gi].label,
      data: s.map((v, i) => v === null ? null : { x: i + 1, y: v }),
      borderColor: PALETTE[gi % PALETTE.length],
      backgroundColor: PALETTE[gi % PALETTE.length],
      borderWidth: 1.2, pointRadius: 0, tension: 0.25, spanGaps: false, order: 3
    });
  });
  if (all.length >= 2) {
    const top = [], bot = [];
    for (let i = 0; i < nMax; i++) {
      top.push(means[i] === null ? null : { x: i + 1, y: means[i] + (stds[i] || 0) });
      bot.push(means[i] === null ? null : { x: i + 1, y: means[i] - (stds[i] || 0) });
    }
    datasets.push({ label: '均值 +1σ', data: top, borderColor: 'rgba(31,41,55,0)', backgroundColor: 'rgba(37,99,235,0.12)', borderWidth: 0, pointRadius: 0, fill: '+1', tension: 0.25, order: 1 });
    datasets.push({ label: '均值 −1σ', data: bot, borderColor: 'rgba(31,41,55,0)', backgroundColor: 'rgba(37,99,235,0.12)', borderWidth: 0, pointRadius: 0, tension: 0.25, order: 1 });
    datasets.push({ label: '组间均值', data: means.map((m, i) => m === null ? null : { x: i + 1, y: m }), borderColor: '#1f2937', backgroundColor: '#1f2937', borderWidth: 2.4, pointRadius: 0, tension: 0.25, spanGaps: false, order: 0 });
  }
  if (state.compareChart) { state.compareChart.destroy(); state.compareChart = null; }
  wrap.classList.remove('hidden');
  const u = (LabAnalysis.unitOf ? LabAnalysis.unitOf(col) : '') || col.unit || '';
  state.compareChart = new Chart($('compare-chart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: { type: 'linear', title: { display: true, text: '采样序号', color: '#666', font: { size: 12 } }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9b9b9b', maxTicksLimit: 10 } },
        y: { title: { display: !!u, text: u || col.name, color: '#666', font: { size: 12 } }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9b9b9b' } }
      },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, color: '#37352f', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            title: items => items.length ? `第 ${Math.round(items[0].parsed.x)} 个采样点` : '',
            label: item => `${item.dataset.label}：${item.parsed.y === null || item.parsed.y === undefined ? '—' : LabAnalysis.fmt(item.parsed.y)}${u}`
          }
        }
      }
    }
  });
  // 每组统计 + 组间均值极差
  const statOf = vals => {
    const m = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    const sd = vals.length >= 2 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / (vals.length - 1)) : 0;
    return { m, sd };
  };
  const rowsHtml = all.map((g, gi) => {
    const vals = series[gi].filter(v => v !== null && isFinite(v));
    const { m, sd } = statOf(vals);
    return `<tr><td>${escapeHtml(g.label)}</td><td>${vals.length}</td><td>${LabAnalysis.fmt(m, 3)}${u}</td><td>${LabAnalysis.fmt(sd, 3)}</td></tr>`;
  }).join('');
  const mArr = all.map((g, gi) => statOf(series[gi].filter(v => v !== null && isFinite(v))).m).filter(v => isFinite(v));
  const spread = mArr.length >= 2 ? LabAnalysis.fmt(Math.max(...mArr) - Math.min(...mArr), 3) : '—';
  tbl.innerHTML = `<table><thead><tr><th>组</th><th>有效点数</th><th>均值${u ? `(${u})` : ''}</th><th>标准差</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="corr-legend">组间均值极差：${spread}${u}（越小说明重复性越好）</div>`;
}

function setupToolbox() {
  $('cg-gen-btn').addEventListener('click', genCCode);
  if ($('cg-ino-btn')) $('cg-ino-btn').addEventListener('click', genArduinoSketch);
  $('cg-copy-btn').addEventListener('click', () => { copyText($('cg-output').textContent); });
  $('cg-dl-btn').addEventListener('click', () => {
    const out = $('cg-output');
    if (!out || !out.textContent.trim() || /点「生成 C 代码」/.test(out.textContent)) genCCode();
    const code = $('cg-output').textContent;
    const t = ($('cg-type') && $('cg-type').value) || 'ntc';
    const name = t === 'adc' ? 'adc_to_volt' : (t === 'poly' ? 'poly_conv' : 'ntc_temp');
    const guard = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_H';
    const body = `#ifndef ${guard}\n#define ${guard}\n\n${code.trim()}\n\n#endif /* ${guard} */\n`;
    downloadBlob(body, name + '.h', 'text/plain;charset=utf-8');
    toast('已下载 ' + name + '.h', 'success');
  });
  $('tm-calc-btn').addEventListener('click', calcTimer);
  $('dv-calc-btn').addEventListener('click', calcDivider);
  $('hx-ascii-btn').addEventListener('click', () => hexDecode('ascii'));
  $('hx-u16-btn').addEventListener('click', () => hexDecode('u16'));
  $('hx-i16-btn').addEventListener('click', () => hexDecode('i16'));
}

/* ----- 测量不确定度（v2.6） ----- */

function renderUncertaintyCols() {
  const sel = $('unc-col');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  if (!state.ds) {
    const o = document.createElement('option');
    o.textContent = '（先导入数据）';
    o.value = '';
    sel.appendChild(o);
    return;
  }
  state.ds.numericColumns.forEach(c => {
    const o = document.createElement('option');
    o.value = String(c.index);
    o.textContent = LabAnalysis.prettyColName(c) + (c.unit ? `（${c.unit}）` : '');
    sel.appendChild(o);
  });
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function calcUncertainty() {
  if (!state.ds) { toast('请先导入数据', 'error'); return; }
  const col = parseInt($('unc-col').value, 10);
  if (isNaN(col)) { toast('请选择测量列', 'error'); return; }
  const ds = state.ds;
  const vals = [];
  ds.rows.forEach(r => {
    if (r.badCells && r.badCells.has(col)) return;
    const v = r.cells[col];
    if (v !== null && v !== undefined && isFinite(v)) vals.push(v);
  });
  if (vals.length < 2) { toast('该列有效数据不足', 'error'); return; }
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
  const a = parseFloat($('unc-b').value) || 0;
  const k = parseFloat($('unc-k').value) || 2;
  const uA = s / Math.sqrt(n);
  const uB = a / Math.sqrt(3);
  const uc = Math.sqrt(uA * uA + uB * uB);
  const U = k * uc;
  const colObj = ds.columns.find(c => c.index === col) || {};
  const unit = colObj.unit || '';
  const name = LabAnalysis.prettyColName(colObj);
  const f = x => LabAnalysis.fmt(x);
  const fu = x => LabAnalysis.fmt(x, 3);
  const lines = [
    `测量列：${name}${unit ? '（' + unit + '）' : ''}`,
    `重复测量次数 n = ${n}，均值 = ${f(mean)} ${unit}`,
    `实验标准差 s = ${fu(s)} ${unit}`,
    '',
    `A 类标准不确定度 uA = s / √n = ${fu(uA)} ${unit}`,
    `B 类标准不确定度 uB = a / √3 = ${fu(uB)} ${unit}（a = ${a}）`,
    `合成标准不确定度 uC = √(uA² + uB²) = ${fu(uc)} ${unit}`,
    `扩展不确定度 U = k·uC = ${fu(U)} ${unit}（k = ${k}）`,
    '',
    `结果表示：${name} = ${f(mean)} ± ${fu(U)} ${unit}（k=${k}）`
  ];
  $('unc-output').textContent = lines.join('\n');
  toast('不确定度已计算', 'success');
}

function setupUncertainty() {
  if ($('unc-calc-btn')) $('unc-calc-btn').addEventListener('click', calcUncertainty);
  // v2.9：仪器允差 a / 包含因子 k 变化 → 主图误差棒跟随重画
  ['unc-b', 'unc-k'].forEach(id => {
    if ($(id)) $(id).addEventListener('input', () => { if (state.chart) state.chart.update('none'); });
  });
}

function init() {
  // 页签
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.goto));
  });

  setupImport();
  setupPasteAndSamples();
  setupParse();
  setupSerial();
  setupCalib();
  setupFit();
  setupFilter();
   setupChartControls();
   setupSPC();
  setupEvents();
  setupDeepAnalysis();
  setupReport();
   setupHealth();
   setupToolbox();
   setupUncertainty();
   setupCompare();
   setupPresent();
  setupV4();
  $('export-csv-btn').addEventListener('click', exportDataCsv);
  $('export-xlsx-btn').addEventListener('click', exportDataXlsx);
  LabProject.wireBanner();
  LabProject.wireImportExport();
  LabProject.wireLibrary();
  LabProject.offerRestore();
  updateCharCount();
}

document.addEventListener('DOMContentLoaded', init);
