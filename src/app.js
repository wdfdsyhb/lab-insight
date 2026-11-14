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
  chart: null,
  filterChart: null,
  fftChart: null,
  filterSel: null,
  chartMode: 'line',
  activeSeries: new Set(),
  deepBusy: false,
  calibMode: 'ntc',  // 当前换算模式 ntc / adc / mq
  calibLog: [],      // 已执行的换算记录（追溯用）
  replay: null       // 回放状态（null = 未在回放）
};

const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const REPLAY_DURATION = 6000; // 1× 速度下完整回放时长（ms）

const PALETTE = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];

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
  if (name !== 'import' && name !== 'calib') {
    const has = !!state.ds;
    document.getElementById(name + '-empty').classList.toggle('hidden', has);
    document.getElementById(name + '-content').classList.toggle('hidden', !has);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name !== 'import' && name !== 'calib' && !state.ds) {
    toast('请先导入数据或加载示例数据');
  }
  refreshTabVisibility();
  if (name === 'calib') {
    $('calib-no-data').classList.toggle('hidden', !!state.ds);
    renderCalibColumns();
  }
  if (name === 'filter' && state.ds) {
    renderFilter();
  }
  if (name === 'analysis' && state.ds && state.chart) {
    setTimeout(() => state.chart.resize(), 60);
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

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/* ---------------- 导入：文件上传 ---------------- */

function setupImport() {
  const dz = $('dropzone');
  const input = $('file-input');
  const chip = $('file-chip');

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
    if (!text) { toast('请先粘贴串口日志内容', 'error'); return; }
    state.pending = { text, fileName: null, sourceType: 'text' };
    state.pendingNote = '粘贴的串口日志';
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

/* ---------------- 导入：解析 ---------------- */

function setupParse() {
  $('parse-btn').addEventListener('click', doParse);
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
  const btn = $('parse-btn');
  btn.disabled = true;
  btn.textContent = '解析中…';
  setTimeout(() => {
    try {
      const ds = LabParser.parse(state.pending, opts);
      if (!ds.rows.length) throw new Error('未识别到有效数据行，请检查内容或解析设置');
      state.ds = ds;
      afterParse(ds);
      showFeedback(true, ds);
    } catch (e) {
      showFeedback(false, null, e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '开始解析';
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

  // 预填报告信息
  if (!$('report-title').value.trim()) {
    $('report-title').value = ds.sourceLabel + ' 数据分析实验';
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
  const stats = LabAnalysis.computeStats(ds);
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

function showFeedback(success, ds, errMsg) {
  const fb = $('parse-feedback');
  fb.classList.remove('hidden');
  fb.classList.remove('success', 'error');
  if (success) {
    fb.classList.add('success');
    const parts = [`识别到 <b>${ds.columns.length}</b> 列 · 共 <b>${ds.rows.length}</b> 行`];
    if (ds.meta.skippedRows > 0) parts.push(`有 <b>${ds.meta.skippedRows}</b> 行被跳过（日志前缀 / 坏帧 / 乱码）`);
    let detail = parts.join(' · ');
    const extra = [];
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

function renderSamplingLists(q) {
  const parts = [];
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

  // 统计卡片
  const valid = state.stats.filter(s => s.ok);
  const cards = [];
  valid.slice(0, 3).forEach(s => {
    const f = (v, d = 2) => LabAnalysis.fmt(v, d);
    const items = [
      ['最大值', f(s.max) + (s.unit || '')],
      ['最小值', f(s.min) + (s.unit || '')],
      ['平均值', f(s.mean) + (s.unit || '')],
      ['标准差', f(s.std, 3)],
      ['极差', f(s.range)],
      ['漂移量', (s.drift >= 0 ? '+' : '') + f(s.drift) + (s.unit || '')]
    ];
    items.forEach(([label, value]) => {
      cards.push(`<div class="stat-card"><div class="stat-label">${escapeHtml(label)} · ${escapeHtml(s.pretty)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`);
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

  // 结论
  $('conclusion-body').innerHTML = state.conclusion.html;

  renderChart();
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
    return {
      label: LabAnalysis.prettyColName(c),
      data: points,
      yAxisID: useMultiAxis ? 'y' + (i === 0 ? '' : i) : 'y',
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: points.map(p => p.outlier ? '#ef4444' : color),
      pointBorderColor: points.map(p => p.outlier ? '#dc2626' : color),
      pointRadius: isScatter ? 3.5 : points.map(p => p.outlier ? 5 : 2),
      showLine: !isScatter,
      borderWidth: 1.8,
      tension: 0.25,
      spanGaps: true
    };
  });

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
        title: { display: true, text: LabAnalysis.prettyColName(c), color, font: { size: 12, weight: '500' } }
      };
    });
  } else {
    yScales.y = {
      grid: { color: '#f1f1f3' },
      border: { color: '#e7e7e9' },
      ticks: { color: '#9b9b9b' },
      title: { display: cols.length === 1, text: cols.length === 1 ? cols[0].pretty : '数值', color: '#666', font: { size: 12 } }
    };
  }

  const hasZoom = !!zoomPlugin;
  state.chart = new Chart(ctx, {
    type: isScatter ? 'scatter' : 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: { duration: 250 },
      parsing: false,
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
              return `${c.pretty}：${LabAnalysis.fmt(item.parsed.y)}${item.raw && item.raw.outlier ? ' ⚠ 异常点' : ''}`;
            }
          }
        },
        zoom: hasZoom ? {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            drag: { enabled: true, backgroundColor: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.35)' }
          },
          pan: { enabled: true, mode: 'x' },
          limits: { x: { min: 'original', max: 'original' } }
        } : undefined
      }
    }
  });
}

function setupChartControls() {
  $('chart-line-btn').addEventListener('click', () => {
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
  });
  $('copy-conclusion-btn').addEventListener('click', () => {
    if (state.conclusion) copyText(state.conclusion.text);
  });
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
  // 换算类型切换
  document.querySelectorAll('#calib-mode .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#calib-mode .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      state.calibMode = seg.dataset.mode;
      $('calib-ntc').classList.toggle('hidden', state.calibMode !== 'ntc');
      $('calib-adc').classList.toggle('hidden', state.calibMode !== 'adc');
      $('calib-mq').classList.toggle('hidden', state.calibMode !== 'mq');
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
    });
  });

  // 参数输入 → 公式与单值结果即时刷新
  ['ntc-b', 'ntc-r0', 'ntc-t0', 'ntc-sh-a', 'ntc-sh-b', 'ntc-sh-c',
   'adc-bits', 'adc-vref', 'adc-k', 'mq-r0', 'mq-a', 'mq-b'].forEach(id => {
    $(id).addEventListener('input', () => {
      updateCalibFormulas();
      renderCalibSingle();
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

  // 单值输入（支持粘贴一列多行数据）
  ['ntc', 'adc', 'mq'].forEach(m => {
    $(m + '-input').addEventListener('input', renderCalibSingle);
  });

  // 批量：输入列切换 → 默认新列名与说明；手改名字后不再自动覆盖
  ['ntc', 'adc', 'mq'].forEach(m => {
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

function updateCalibFormulas() {
  const method = document.querySelector('#ntc-method .seg.active').dataset.method;
  $('ntc-formula').textContent = method === 'sh'
    ? LabCalib.ntcFormulaSH(parseFloat($('ntc-sh-a').value), parseFloat($('ntc-sh-b').value), parseFloat($('ntc-sh-c').value))
    : LabCalib.ntcFormulaB(parseFloat($('ntc-b').value), parseFloat($('ntc-r0').value), parseFloat($('ntc-t0').value));
  $('adc-formula').textContent = LabCalib.adcFormula(parseFloat($('adc-bits').value), parseFloat($('adc-vref').value), parseFloat($('adc-k').value));
  $('mq-formula').textContent = LabCalib.mqFormula($('mq-sensor').value, parseFloat($('mq-a').value), parseFloat($('mq-b').value));
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
}

/* ----- 批量换算 ----- */

function renderCalibColumns() {
  const ds = state.ds;
  ['ntc', 'adc', 'mq'].forEach(m => {
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
    if (prev && ds.numericColumns.some(c => String(c.index) === prev)) sel.value = prev;
    $(m + '-batch-btn').disabled = false;
    autofillBatchName(m);
    updateBatchNote(m);
  });
}

function autofillBatchName(m) {
  const el = $(m + '-batch-name');
  if (el.dataset.autofill === '0') return;
  const ci = parseInt($(m + '-batch-col').value, 10);
  const col = state.ds && state.ds.numericColumns.find(c => c.index === ci);
  if (!col) return;
  const base = LabAnalysis.prettyColName(col).replace(/\([^)]*\)\s*$/, '');
  el.value = m === 'ntc' ? base + '·温度' : m === 'adc' ? base + '·电压' : base + '·浓度';
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

  refreshDerived();
  renderCalibColumns();
  state.calibLog.push({
    tag: m === 'ntc' ? 'NTC' : m === 'adc' ? 'ADC' : 'MQ',
    formula: formulaText,
    src: LabAnalysis.prettyColName(srcCol),
    dst: newCols.map(nc => nc.unit ? `${nc.name}(${nc.unit})` : nc.name).join('、'),
    valid,
    total: ds.rows.length
  });
  renderCalibLog();
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

/* ---------------- 滤波实验 ---------------- */

function setupFilter() {
  $('filter-channel').addEventListener('change', () => {
    state.filterSel = parseInt($('filter-channel').value, 10);
    renderFilter();
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
      key: 'ma', label: `滑动平均（窗口 ${n}）`, color: '#2563eb',
      vals: LabFilter.movingAverage(ys, n),
      defName: `${base}·均值${n}`, formula: `滑动平均：yₙ = mean(xₙ₋w/₂ … xₙ+w/₂)，居中窗口 w=${n}`
    });
  }
  if ($('f-med-on').checked) {
    const n = parseInt($('f-med-n').value, 10);
    results.push({
      key: 'med', label: `中值滤波（窗口 ${n}）`, color: '#10b981',
      vals: LabFilter.medianFilter(ys, n),
      defName: `${base}·中值${n}`, formula: `中值滤波：yₙ = median(xₙ₋w/₂ … xₙ+w/₂)，窗口 w=${n}（奇数）`
    });
  }
  if ($('f-lp-on').checked) {
    const a = parseInt($('f-lp-alpha').value, 10) / 100;
    results.push({
      key: 'lp', label: `一阶低通（α ${a.toFixed(2)}）`, color: '#f59e0b',
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
          title: { display: true, text: LabAnalysis.prettyColName(col), color: '#666', font: { size: 12 } }
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

  const ys = pts.map(p => p.y);
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
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
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
  $('gen-report-btn').addEventListener('click', () => {
    if (!state.ds) { toast('请先导入数据'); return; }
    const info = {
      title: $('report-title').value,
      purpose: $('report-purpose').value
    };
    state.reportText = LabReport.buildReport(state.ds, state.stats, state.conclusion.text, info);
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

  // 用户直接 Ctrl+P 时也填充打印视图
  window.addEventListener('beforeprint', () => {
    if (state.reportText) fillPrintRoot();
  });
}

function fillPrintRoot() {
  $('print-root').innerHTML = LabReport.toHtml(state.reportText);
}

/* ---------------- 初始化 ---------------- */

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
  setupCalib();
  setupFilter();
  setupChartControls();
  setupDeepAnalysis();
  setupReport();
  updateCharCount();
}

document.addEventListener('DOMContentLoaded', init);
