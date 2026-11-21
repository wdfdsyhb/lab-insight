/* =========================================================
   repro.js — 可复现实验包 + 数据指纹 + 无后端分享链接（v4.0）
   三个能力共用一个模块，全部纯本地：

   1. 数据指纹：SHA-256(原始数据文本 + 处理流水 JSON)，
      与报告一起构成"这份结论由这份数据、这条流水得出"的可验证承诺。
   2. 可复现实验包（zip）：package.json(指纹/流水/设置/事件/口径)
      + data.raw(原始输入) + report.txt(报告文本) + charts/*.png。
      拿到包的人用"验证复现包"重算指纹比对，或一键导入为当前实验。
   3. 无后端分享链接：把 {原始文本, 解析设置, 报告信息} 用 LZ-String
      压缩进 URL hash（#share=…），对方打开链接即自动恢复并解析——
      数据仍然不上传，分享的只是一条 URL。

   file:// 安全上下文下 crypto.subtle 可用；不可用时指纹回退 FNV-1a
   （并在结果里标注算法名，保证验证双方用同一算法即可）。
   ========================================================= */

const LabRepro = (() => {

  /* ---------- 哈希 ---------- */

  // FNV-1a 32 位回退（crypto.subtle 不可用时），输出 8 位 hex
  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  async function sha256Hex(text) {
    try {
      if (!(crypto && crypto.subtle && crypto.subtle.digest)) throw new Error('no subtle');
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { algo: 'SHA-256', hex: Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('') };
    } catch (e) {
      return { algo: 'FNV-1a(回退)', hex: fnv1a(text) };
    }
  }

  // 指纹输入 = 原始数据文本 + 处理流水（顺序敏感）。ops 变了指纹就变。
  function fingerprintInput(text, ops) {
    return 'LabInsight-FP-v1\n' + (text || '') + '\n---OPS---\n' + JSON.stringify(ops || []);
  }

  async function fingerprint(text, ops) {
    const r = await sha256Hex(fingerprintInput(text, ops));
    return r.algo + ':' + r.hex;
  }

  /* ---------- 复现包 ---------- */

  function rawTextOf() {
    if (state.pending && state.pending.text) return state.pending.text;
    if (state.pending && state.pending.aoa) {
      // Excel 来源：没有原始文本，把 aoa 序列化成 TSV 作为可复现输入
      return state.pending.aoa.map(r => r.map(c => c === null || c === undefined ? '' : c).join('\t')).join('\n');
    }
    return '';
  }

  function buildPackageMeta(fp) {
    return {
      app: 'LabInsight', pkgVersion: 1,
      created: new Date().toISOString(),
      fingerprint: fp,
      source: state.ds ? (state.ds.sourceLabel || '') : '',
      rows: state.ds ? state.ds.rows.length : 0,
      parseOpts: {
        skipRows: $('opt-skip-rows').value,
        timeCol: $('opt-time-col').value,
        delimiter: $('opt-delimiter').value
      },
      outlierMethod: state.outlierMethod || 'mad',
      events: (state.events || []).map(e => ({ x: e.x, label: e.label, hasPhoto: !!e.photo })),
      ops: (state.ops || []).slice(),
      reportInfo: {
        title: $('report-title').value, purpose: $('report-purpose').value,
        equipment: $('report-equipment') ? $('report-equipment').value : '',
        steps: $('report-steps') ? $('report-steps').value : '',
        notes: $('report-notes') ? $('report-notes').value : '',
        datarec: $('report-datarec') ? $('report-datarec').value : '',
        instruments: $('report-instruments') ? $('report-instruments').value : ''
      }
    };
  }

  async function buildPackage() {
    if (!state.ds) throw new Error('请先导入并解析数据');
    const text = rawTextOf();
    if (!text) throw new Error('当前数据没有原始文本可打包（请重新从文本/文件导入后再生成）');
    const fp = await fingerprint(text, state.ops);
    const meta = buildPackageMeta(fp);
    const charts = collectChartPngs();
    return { meta: meta, text: text, report: state.reportText || '', charts: charts };
  }

  // 抓当前三张图（与报告图表附录同一来源；页签隐藏时 snapshotChart 会离屏兜底）
  function collectChartPngs() {
    const out = [];
    try {
      if (state.chart) out.push({ name: 'trend.png', url: snapshotChart(state.chart, 760, 400) });
      if (state.filterChart) out.push({ name: 'filter.png', url: snapshotChart(state.filterChart, 760, 400) });
      if (state.fftChart) out.push({ name: 'fft.png', url: snapshotChart(state.fftChart, 480, 300) });
    } catch (e) { /* 图缺失不阻断打包 */ }
    return out.filter(c => c.url && c.url.indexOf('data:image') === 0);
  }

  async function exportPackage() {
    const pkg = await buildPackage();
    if (typeof JSZip === 'undefined') throw new Error('zip 组件未加载（vendor/jszip.min.js 缺失）');
    const zip = new JSZip();
    zip.file('package.json', JSON.stringify(pkg.meta, null, 2));
    zip.file('data.raw', pkg.text);
    zip.file('report.txt', pkg.report || '（尚未生成报告）');
    zip.file('README.txt',
      'LabInsight 可复现实验包\n' +
      '指纹: ' + pkg.meta.fingerprint + '\n' +
      '验证方法: 打开 LabInsight → 工具箱 → 实验复现包 → 「验证复现包」选择本文件。\n' +
      '重算 (data.raw + package.json.ops) 的指纹并与 package.json.fingerprint 比对，\n' +
      '一致即证明：报告结论由这份数据经这条流水得出，未被改动。\n');
    pkg.charts.forEach(c => zip.file('charts/' + c.name, c.url.split(',')[1], { base64: true }));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(blob, 'labinsight-repro-' + stamp() + '.zip');
    return pkg.meta;
  }

  // 验证：读取 zip → 重算指纹比对 → 可选导入为当前实验
  async function verifyPackage(file) {
    if (typeof JSZip === 'undefined') throw new Error('zip 组件未加载');
    const zip = await JSZip.loadAsync(file);
    const metaFile = zip.file('package.json');
    const dataFile = zip.file('data.raw');
    if (!metaFile || !dataFile) throw new Error('不是 LabInsight 复现包（缺少 package.json / data.raw）');
    const meta = JSON.parse(await metaFile.async('string'));
    const text = await dataFile.async('string');
    const recomputed = await fingerprint(text, meta.ops || []);
    const ok = recomputed === meta.fingerprint;
    return {
      ok: ok,
      expect: meta.fingerprint,
      actual: recomputed,
      meta: meta,
      text: text
    };
  }

  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  /* ---------- 无后端分享链接 ---------- */

  const SHARE_LIMIT = 60000; // hash 超过约 6 万字符时建议改用文件导出

  function makeShareUrl() {
    if (!state.pending) throw new Error('请先导入数据');
    const payload = {
      v: 1,
      text: rawTextOf(),
      opts: {
        skipRows: $('opt-skip-rows').value,
        timeCol: $('opt-time-col').value,
        delimiter: $('opt-delimiter').value
      },
      reportInfo: {
        title: $('report-title').value, purpose: $('report-purpose').value
      }
    };
    if (!payload.text) throw new Error('当前数据没有原始文本可分享（Excel 来源请改用复现包）');
    const packed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const base = location.origin + location.pathname;
    return { url: base + '#share=' + packed, size: packed.length, rows: state.ds ? state.ds.rows.length : 0 };
  }

  function readShareHash() {
    const m = /(?:^|[#&])share=([^&]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      const obj = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1]));
      if (!obj || !obj.text) return null;
      return obj;
    } catch (e) { return null; }
  }

  return {
    fingerprint: fingerprint,
    exportPackage: exportPackage,
    verifyPackage: verifyPackage,
    makeShareUrl: makeShareUrl,
    readShareHash: readShareHash,
    buildPackageMeta: buildPackageMeta
  };
})();
