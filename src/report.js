/* =========================================================
   report.js — 实验报告文本生成（纯本地）
   套模板自动填：名称/目的、设备与来源、数据结果、
   分析结论、附录（原始数据摘录）
   ========================================================= */

const LabReport = (() => {

  function buildReport(ds, stats, conclusionText, info) {
    info = info || {};
    const title = (info.title || '').trim() || '实验数据记录与分析报告';
    const purpose = (info.purpose || '').trim() || '（请在「报告信息」中补充实验目的）';

    const L = [];
    const hr = '────────────────────────────────';
    const RN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    let sn = 0;
    const sec = (t) => { sn++; return `## ${RN[sn] || sn}、${t}`; };
    const flat = (txt) => (txt || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    const equipment = (info.equipment || '').trim();
    const steps = (info.steps || '').trim();
    const notes = (info.notes || '').trim();
    const dataRecord = (info.dataRecord || '').trim();

    L.push(`# 实验报告：${title}`);
    L.push('');
    L.push(hr);

    /* 一、实验名称与目的 */
    L.push(sec('实验名称与目的'));
    L.push('');
    L.push(`- 实验名称：${title}`);
    L.push(`- 实验目的：${purpose}`);
    L.push('');

    /* 二、实验器材与数据来源 */
    L.push(sec('实验器材与数据来源'));
    L.push('');
    if (equipment) L.push(`- 实验器材：${flat(equipment).join('；')}`);
    const instRows0 = parseInstruments(info.instruments);
    if (instRows0.length) {
      L.push('');
      L.push('仪器台账：');
      L.push('');
      L.push('| 名称 | 型号 | 编号 | 精度等级/允差 | 校准日期 |');
      L.push('| --- | --- | --- | --- | --- |');
      instRows0.forEach(r => L.push(`| ${r[0] || '—'} | ${r[1] || '—'} | ${r[2] || '—'} | ${r[3] || '—'} | ${r[4] || '—'} |`));
    }
    L.push(`- 数据来源：${ds.sourceLabel || '本地导入数据'}`);
    if (ds.sourceType === 'serial') {
      L.push(`- 原始记录：共 ${ds.meta.totalLines} 行，清洗后得到有效数据 ${ds.meta.dataRows} 行，跳过 ${ds.meta.skippedRows} 行（日志前缀、坏帧、乱码行等）`);
    } else {
      L.push(`- 数据规模：${ds.meta.dataRows} 行 × ${ds.columns.length} 列${ds.meta.headerDetected ? '（含表头）' : ''}`);
    }
    const nums = ds.numericColumns.map(c => LabAnalysis.prettyColName(c));
    L.push(`- 数据通道：${nums.length ? nums.join('、') : '—'}`);
    if (ds.meta.time) {
      const dur = LabAnalysis.fmtDuration(ds.meta.time.end - ds.meta.time.start, ds.meta.time.mode);
      L.push(`- 采样时段：${ds.meta.time.startLabel} 至 ${ds.meta.time.endLabel}（约 ${dur}）`);
    }
    L.push('- 处理方式：浏览器本地解析清洗，数据未上传服务器');
    L.push('');

    /* 三~五（选填）：实验步骤 / 注意事项 / 数据记录说明 */
    if (steps) {
      L.push(sec('实验步骤'));
      L.push('');
      flat(steps).forEach(s => L.push(`- ${s}`));
      L.push('');
    }
    if (notes) {
      L.push(sec('注意事项'));
      L.push('');
      flat(notes).forEach(s => L.push(`- ${s}`));
      L.push('');
    }
    if (dataRecord) {
      L.push(sec('数据记录说明'));
      L.push('');
      flat(dataRecord).forEach(s => L.push(`- ${s}`));
      L.push('');
    }

    /* 数据结果 */
    L.push(sec('数据结果'));
    L.push('');
    const valid = stats.filter(s => s.ok);
    if (valid.length) {
      L.push('各数值通道统计指标如下：');
      L.push('');
      L.push('| 通道 | 最大值 | 最小值 | 平均值 | 标准差 | SEM | 95% 置信区间 | 极差 | 漂移量 | 异常点数 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const s of valid) {
        const f = (v, d = 2) => LabAnalysis.fmt(v, d);
        const u = s.unit || '';
        const ci = `${f(s.mean - s.ciHalf)} ~ ${f(s.mean + s.ciHalf)}${u}`;
        L.push(`| ${s.pretty} | ${f(s.max)}${u} | ${f(s.min)}${u} | ${f(s.mean)}${u} | ${f(s.std, 3)} | ${f(s.sem, 4)} | ${ci} | ${f(s.range)} | ${f(s.drift)} | ${s.outliers.length} |`);
      }
      L.push('');
      L.push(`趋势图与滤波对比 / 频谱图已附在导出 PDF 的「图表附录」中（.txt / .md 文本版不含图片）；统计口径：标准差为样本标准差（n-1），漂移量 = 末值 − 初值，SEM = 标准差/√n，95% 置信区间按 t 分布（自由度 n-1，n>31 时近似 1.96）。`);
      L.push('');
      // v4.1：多组对比的组间差异显著性检验（Welch's t）自动写进报告
      const tt = info && info.tTest;
      if (tt) {
        const fp = v => v < 0.0001 ? v.toExponential(2) : v.toFixed(4);
        L.push(`组间差异检验（Welch's t，通道 ${tt.col}）：「${tt.labelA}」（n = ${tt.n1}，均值 ${LabAnalysis.fmt(tt.m1, 3)}）与「${tt.labelB}」（n = ${tt.n2}，均值 ${LabAnalysis.fmt(tt.m2, 3)}），t = ${LabAnalysis.fmt(tt.t, 3)}，自由度 ≈ ${tt.df.toFixed(1)}，双尾 p = ${fp(tt.p)} —— ${tt.sig}。`);
        L.push('');
      }
      const ops = (info.ops || []).filter(Boolean);
      if (ops.length) {
        L.push('处理与计算流程（可复现）：');
        L.push('');
        ops.forEach((o, i) => L.push(`- ${i + 1}. ${o}`));
        L.push('');
      }
    } else {
      L.push('未识别到可统计的数值列。');
    }
    L.push('');

    /* 实验事件记录（选填，来自图上标注） */
    const evtTime = (x) => {
      const tm = ds.meta && ds.meta.time;
      if (!tm) return `${LabAnalysis.fmt(x)} s`;
      const p = n => String(n).padStart(2, '0');
      if (tm.mode === 'date') {
        const d = new Date(x);
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      }
      const s = Math.floor(x);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
    };
    const evs = (info.events || []).slice().sort((a, b) => a.x - b.x);
    if (evs.length) {
      L.push(sec('实验事件记录'));
      L.push('');
      evs.forEach(ev => L.push(`- ${evtTime(ev.x)}：${(ev.label || '事件')}`));
      L.push('');
    }

    /* 分析结论 */
    L.push(sec('分析结论'));
    L.push('');
    L.push(conclusionText || '（暂无结论，请先在「智能分析」页签生成）');
    L.push('');

    /* 误差分析与讨论 */
    const errLines = buildErrorText(ds, stats, info);
    if (errLines.length) {
      L.push(sec('误差分析与讨论'));
      L.push('');
      errLines.forEach(line => L.push(line));
      L.push('');
    }

    /* 附录 */
    L.push(sec('附录：原始数据摘录'));
    L.push('');
    const nShow = Math.min(ds.rows.length, 20);
    if (ds.rows.length) {
      const head = (ds.meta.time ? ['时间'] : [])
        .concat(ds.columns.map(c => c.name + (c.unit ? `(${c.unit})` : '')));
      L.push('```');
      L.push(head.join('\t'));
      for (let i = 0; i < nShow; i++) {
        const r = ds.rows[i];
        const cells = (ds.meta.time ? [r.timeLabel || ''] : [])
          .concat(ds.columns.map((c, ci) => {
            const v = r.cells[ci];
            return v === null || v === undefined ? '' : v;
          }));
        L.push(cells.join('\t'));
      }
      if (ds.rows.length > nShow) {
        L.push(`……（其余 ${ds.rows.length - nShow} 行略）`);
      }
      L.push('```');
    } else {
      L.push('（无数据行）');
    }
    L.push('');
    L.push(hr);
    L.push(`报告生成时间：${new Date().toLocaleString('zh-CN')} · 由 LabInsight 本地生成`);

    return L.join('\n');
  }

  /* ---------- 报告文本 → 打印用 HTML ---------- */

  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 轻量渲染：# / ## 标题、- 列表、| 表格 |、``` 代码块、──── 分隔线、其余段落
  function toHtml(text) {
    const lines = String(text).split('\n');
    const out = [];
    let inList = false, inPre = false, inTable = false;
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/\s+$/, '');

      if (inPre) {
        if (/^```/.test(line)) { out.push('</pre>'); inPre = false; }
        else out.push(escHtml(raw));
        continue;
      }
      if (/^```/.test(line)) { closeList(); closeTable(); out.push('<pre>'); inPre = true; continue; }
      if (/^#\s/.test(line)) { closeList(); closeTable(); out.push('<h1>' + escHtml(line.slice(2)) + '</h1>'); continue; }
      if (/^##\s/.test(line)) { closeList(); closeTable(); out.push('<h2>' + escHtml(line.slice(3)) + '</h2>'); continue; }
      if (/^- /.test(line)) {
        closeTable();
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + escHtml(line.slice(2)) + '</li>');
        continue;
      }
      if (/^\|/.test(line)) {
        closeList();
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length && cells.every(c => /^-{2,}$/.test(c))) continue; // 表格分隔行
        if (!inTable) {
          out.push('<table><thead><tr>' + cells.map(c => '<th>' + escHtml(c) + '</th>').join('') + '</tr></thead><tbody>');
          inTable = true;
        } else {
          out.push('<tr>' + cells.map(c => '<td>' + escHtml(c) + '</td>').join('') + '</tr>');
        }
        continue;
      }
      if (/^─{6,}$/.test(line)) { closeList(); closeTable(); out.push('<hr>'); continue; }
      if (line.trim() === '') { closeList(); closeTable(); continue; }
      closeTable();
      out.push('<p>' + escHtml(line) + '</p>');
    }
    closeList(); closeTable();
    if (inPre) out.push('</pre>');
    return out.join('\n');
  }

  /* ---------- v2.4：报告 → 单文件 HTML（正文 + 图表 base64 内联，双击即可查看） ---------- */

  function buildStaticHtml(text, charts, title) {
    const t = (title || '').trim() || '实验报告';
    charts = charts || [];
    let appendix = '';
    if (charts.some(c => c.url)) {
      appendix = '<h2>图表附录</h2>';
      charts.forEach(c => {
        if (c.url) {
          appendix += `<figure><img src="${c.url}" alt="${escHtml(c.title)}"><figcaption>${escHtml(c.title)}</figcaption></figure>`;
        } else {
          appendix += `<p class="tip">${escHtml(c.title)}</p>`;
        }
      });
    }
    return [
      '<!DOCTYPE html>',
      '<html lang="zh-CN"><head><meta charset="UTF-8">',
      '<title>' + escHtml(t) + '</title>',
      '<style>',
      'body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#1f2937;background:#f4f5f7;margin:0;padding:32px 16px;}',
      '.page{max-width:820px;margin:0 auto;background:#fff;padding:48px 56px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.08);}',
      'h1{font-size:24px;margin:.2em 0 .6em;}h2{font-size:17px;border-left:3px solid #2563eb;padding-left:10px;margin:28px 0 10px;}',
      'p,li{font-size:14px;line-height:1.8;}ul{padding-left:22px;}hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0;}',
      'table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0;}th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:center;}th{background:#f0f5ff;font-weight:600;}',
      'pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre;font-family:Consolas,monospace;}',
      'figure{margin:18px 0;text-align:center;page-break-inside:avoid;}figure img{max-width:100%;border:1px solid #e5e7eb;border-radius:6px;}',
      'figcaption{font-size:12px;color:#6b7280;margin-top:6px;}',
      '.tip{font-size:12px;color:#9ca3af;}',
      '.foot{color:#9ca3af;font-size:12px;text-align:center;margin-top:28px;}',
      '</style></head><body><div class="page">',
      LabReport.toHtml(text),
      appendix,
      '<p class="foot">由 LabInsight 本地生成 · 单文件 HTML，可直接转发查看</p>',
      '</div></body></html>'
    ].join('\n');
  }

  /* ---------- v2.4：报告 → Word .docx（docx 库本地生成，含统计表格与图表） ---------- */

  // dataURL → Uint8Array（ImageRun 需要二进制）
  function b64ToU8(url) {
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function buildDocx(pkg, title) {
    const { ds, stats, conclusionText, charts } = pkg;
    const info = { title: pkg.title, purpose: pkg.purpose, ops: pkg.ops,
      equipment: pkg.equipment, steps: pkg.steps, notes: pkg.notes, dataRecord: pkg.dataRecord,
      events: pkg.events,
      instruments: pkg.instruments, uncertainty: pkg.uncertainty,
      outlierMethod: pkg.outlierMethod, evalRecord: pkg.evalRecord,
      tTest: pkg.tTest };
    const docxNS = window.docx;
    const t = (info.title || '').trim() || '实验数据记录与分析报告';
    const purpose = (info.purpose || '').trim() || '（请在「报告信息」中补充实验目的）';
    const D = docxNS;
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
      WidthType, ImageRun, AlignmentType } = D;

    const h2 = s => new Paragraph({ text: s, heading: HeadingLevel.HEADING_2 });
    const para = s => new Paragraph({ children: [new TextRun(s)] });
    const li = s => new Paragraph({ text: s, bullet: { level: 0 } });
    const mono = s => new Paragraph({
      children: [new TextRun({ text: s, font: 'Consolas', size: 17 })], spacing: { after: 0, line: 240 }
    });

    const kids = [];
    kids.push(new Paragraph({ text: `实验报告：${t}`, heading: HeadingLevel.HEADING_1 }));

    const RN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    let sn = 0;
    const h2s = (s) => { sn++; return h2(`${RN[sn] || sn}、${s}`); };
    const flat = (txt) => (txt || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const equipment = (info.equipment || '').trim();
    const steps = (info.steps || '').trim();
    const notes = (info.notes || '').trim();
    const dataRecord = (info.dataRecord || '').trim();

    /* 一、实验名称与目的 */
    kids.push(h2s('实验名称与目的'));
    kids.push(li(`实验名称：${t}`));
    kids.push(li(`实验目的：${purpose}`));

    /* 二、实验器材与数据来源 */
    kids.push(h2s('实验器材与数据来源'));
    if (equipment) kids.push(li(`实验器材：${flat(equipment).join('；')}`));
    const instRows = parseInstruments(info.instruments);
    if (instRows.length) {
      const cellI = (txt, bold) => new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(txt), bold: !!bold, size: 17 })] })]
      });
      const headI = new TableRow({ tableHeader: true, children: ['名称', '型号', '编号', '精度等级/允差', '校准日期'].map(x => cellI(x, true)) });
      const bodyI = instRows.map(r => new TableRow({ children: r.map((x, i) => cellI(x || '—')) }));
      kids.push(para('仪器台账：'));
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headI].concat(bodyI) }));
    }
    kids.push(li(`数据来源：${ds.sourceLabel || '本地导入数据'}`));
    if (ds.sourceType === 'serial') {
      kids.push(li(`原始记录：共 ${ds.meta.totalLines} 行，清洗后得到有效数据 ${ds.meta.dataRows} 行，跳过 ${ds.meta.skippedRows} 行（日志前缀、坏帧、乱码行等）`));
    } else {
      kids.push(li(`数据规模：${ds.meta.dataRows} 行 × ${ds.columns.length} 列${ds.meta.headerDetected ? '（含表头）' : ''}`));
    }
    const nums = ds.numericColumns.map(c => LabAnalysis.prettyColName(c));
    kids.push(li(`数据通道：${nums.length ? nums.join('、') : '—'}`));
    if (ds.meta.time) {
      const dur = LabAnalysis.fmtDuration(ds.meta.time.end - ds.meta.time.start, ds.meta.time.mode);
      kids.push(li(`采样时段：${ds.meta.time.startLabel} 至 ${ds.meta.time.endLabel}（约 ${dur}）`));
    }
    kids.push(li('处理方式：浏览器本地解析清洗，数据未上传服务器'));

    /* 三~五（选填） */
    if (steps) { kids.push(h2s('实验步骤')); flat(steps).forEach(s => kids.push(li(s))); }
    if (notes) { kids.push(h2s('注意事项')); flat(notes).forEach(s => kids.push(li(s))); }
    if (dataRecord) { kids.push(h2s('数据记录说明')); flat(dataRecord).forEach(s => kids.push(li(s))); }

    /* 数据结果（统计表） */
    kids.push(h2s('数据结果'));
    const valid = (stats || []).filter(s => s.ok);
    if (valid.length) {
      kids.push(para('各数值通道统计指标如下：'));
      const f = (v, d = 2) => LabAnalysis.fmt(v, d);
      const u = s => s.unit || '';
      const headTexts = ['通道', '最大值', '最小值', '平均值', '标准差', 'SEM', '95% 置信区间', '极差', '漂移量', '异常点数'];
      const cell = (txt, bold) => new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(txt), bold: !!bold, size: 17 })] })]
      });
      const headerRow = new TableRow({
        tableHeader: true,
        children: headTexts.map(x => cell(x, true))
      });
      const dataRows = valid.map(s => {
        const ci = `${f(s.mean - s.ciHalf)} ~ ${f(s.mean + s.ciHalf)}${u(s)}`;
        return new TableRow({
          children: [s.pretty, `${f(s.max)}${u(s)}`, `${f(s.min)}${u(s)}`, `${f(s.mean)}${u(s)}`, f(s.std, 3), f(s.sem, 4), ci, f(s.range), f(s.drift), String(s.outliers.length)]
            .map(x => cell(x))
        });
      });
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow].concat(dataRows) }));
      kids.push(para('统计口径：标准差为样本标准差（n-1），漂移量 = 末值 − 初值，SEM = 标准差/√n，95% 置信区间按 t 分布（自由度 n-1，n>31 时近似 1.96）。趋势图等已附在文末「图表附录」。'));
      const ops = (info.ops || []).filter(Boolean);
      if (ops.length) {
        kids.push(para('处理与计算流程（可复现）：'));
        ops.forEach((o, i) => kids.push(li(`${i + 1}. ${o}`)));
      }
      // v4.1：多组对比的组间差异显著性检验（Welch's t）
      const tt = info.tTest;
      if (tt) {
        const fp = v => v < 0.0001 ? v.toExponential(2) : v.toFixed(4);
        kids.push(para(`组间差异检验（Welch's t，通道 ${tt.col}）：「${tt.labelA}」（n = ${tt.n1}，均值 ${f(tt.m1, 3)}）与「${tt.labelB}」（n = ${tt.n2}，均值 ${f(tt.m2, 3)}），t = ${f(tt.t, 3)}，自由度 ≈ ${tt.df.toFixed(1)}，双尾 p = ${fp(tt.p)} —— ${tt.sig}。p < 0.05 说明两组均值差异不太可能纯属随机波动。`));
      }
    } else {
      kids.push(para('未识别到可统计的数值列。'));
    }

    /* 实验事件记录（选填，来自图上标注） */
    const evtTime2 = (x) => {
      const tm = ds.meta && ds.meta.time;
      if (!tm) return `${LabAnalysis.fmt(x)} s`;
      const p = n => String(n).padStart(2, '0');
      if (tm.mode === 'date') {
        const d = new Date(x);
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      }
      const s = Math.floor(x);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
    };
    const evs2 = (info.events || []).slice().sort((a, b) => a.x - b.x);
    if (evs2.length) {
      kids.push(h2s('实验事件记录'));
      evs2.forEach(ev => kids.push(li(`${evtTime2(ev.x)}：${ev.label || '事件'}`)));
    }

    /* 四、分析结论 */
    kids.push(h2s('分析结论'));
    (conclusionText || '（暂无结论，请先在「智能分析」页签生成）').split('\n').forEach(l => {
      if (l.trim()) kids.push(para(l));
    });

    /* 误差分析与讨论 */
    const errLines2 = buildErrorText(ds, stats, info);
    if (errLines2.length) {
      kids.push(h2s('误差分析与讨论'));
      errLines2.forEach(line => {
        const txt = String(line).replace(/^\s*[-·]\s*/, '');
        if (txt.trim()) kids.push(li(txt));
      });
    }

    /* 五、附录：原始数据摘录 */
    kids.push(h2s('附录：原始数据摘录'));
    const nShow = Math.min(ds.rows.length, 20);
    if (ds.rows.length) {
      const head = (ds.meta.time ? ['时间'] : [])
        .concat(ds.columns.map(c => c.name + (c.unit ? `(${c.unit})` : '')));
      kids.push(mono(head.join('\t')));
      for (let i = 0; i < nShow; i++) {
        const r = ds.rows[i];
        const cells = (ds.meta.time ? [r.timeLabel || ''] : [])
          .concat(ds.columns.map((c, ci) => {
            const v = r.cells[ci];
            return v === null || v === undefined ? '' : v;
          }));
        kids.push(mono(cells.join('\t')));
      }
      if (ds.rows.length > nShow) kids.push(mono(`……（其余 ${ds.rows.length - nShow} 行略）`));
    } else {
      kids.push(para('（无数据行）'));
    }

    /* 图表附录（.docx 版含图，与 PDF 版一致） */
    const withImg = (charts || []).filter(c => c.url);
    if (withImg.length) {
      kids.push(h2('图表附录'));
      withImg.forEach(c => {
        // 位图宽高比不变，等比缩到最大宽 600px（A4 正文宽）
        const scale = Math.min(1, 600 / c.w);
        kids.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: b64ToU8(c.url), transformation: { width: Math.round(c.w * scale), height: Math.round(c.h * scale) } })]
        }));
        kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.title, size: 18, color: '6B7280' })] }));
      });
    }

    kids.push(para(`报告生成时间：${new Date().toLocaleString('zh-CN')} · 由 LabInsight 本地生成`));

    const doc = new Document({ sections: [{ children: kids }] });
    const filename = (title || '实验报告') + '.docx';
    return Packer.toBlob(doc).then(blob => ({ blob, filename }));
  }

  /* ---------- v2.7：仪器台账解析 + 误差分析与讨论 ---------- */

  // 每行一台：名称,型号,编号,精度/允差,校准日期（逗号 / 中文逗号 / 竖线分隔）
  function parseInstruments(text) {
    const out = [];
    (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(/[,，|]/).map(s => s.trim());
      while (parts.length < 5) parts.push('');
      out.push(parts.slice(0, 5));
    });
    return out;
  }

  // 误差分析与讨论：采样质量 / 异常检测 / 测量不确定度 / 标定评估 / 综合判断
  function buildErrorText(ds, stats, info) {
    const L = [];
    const f = (v, d = 3) => LabAnalysis.fmt(v, d);
    const valid = (stats || []).filter(s => s.ok);
    if (!valid.length) return L;

    // 1. 采样质量
    let sq = null;
    try { sq = LabAnalysis.samplingQuality ? LabAnalysis.samplingQuality(ds) : null; } catch (e) { sq = null; }
    if (sq && sq.ok && isFinite(sq.rate)) {
      let dropsTxt = '未发现丢帧';
      if (sq.drops && sq.drops.length) {
        const d0 = sq.drops[0];
        dropsTxt = `发现 ${sq.drops.length} 处疑似丢帧（最大间隔 ${f(d0.dt, 2)} s ≈ ${f(d0.mult, 1)}× 标称间隔），可能引入时间轴误差`;
      }
      L.push(`- 采样质量：实际平均采样率 ${f(sq.rate, 2)} Hz，平均间隔 ${f(sq.avg, 2)} s，中位间隔 ${f(sq.med, 2)} s，间隔抖动 ±${f(sq.sd, 2)} s；${dropsTxt}。`);
    } else {
      L.push('- 采样质量：数据未携带可用时间戳，按采样序号处理，时间轴误差未评估。');
    }

    // 2. 异常值检测
    const METHOD_LABEL = { mad: '稳健 z 分数（MAD）', sigma3: '均值 ± 3σ', iqr: '箱线图 IQR' };
    const om = (info && info.outlierMethod && METHOD_LABEL[info.outlierMethod]) || METHOD_LABEL.mad;
    const outRows = valid.filter(s => s.outliers && s.outliers.length > 0);
    if (outRows.length) {
      L.push(`- 异常值检测（口径：${om}）：${outRows.map(s => `${s.pretty} ${s.outliers.length} 处`).join('、')}；异常点在图中以红点标出，建议结合重复测量复核而非直接剔除。`);
    } else {
      L.push(`- 异常值检测（口径：${om}）：各通道均未发现异常点。`);
    }

    // 3. 测量不确定度（A 类 + B 类）
    const a = info && info.uncertainty ? (Number(info.uncertainty.a) || 0) : 0;
    const k = info && info.uncertainty && Number(info.uncertainty.k) ? Number(info.uncertainty.k) : 2;
    const uRows = valid.map(s => {
      const n = Math.max(1, s.values.length);
      const uA = s.std / Math.sqrt(n);
      const uB = a / Math.sqrt(3);
      const uc = Math.sqrt(uA * uA + uB * uB);
      return { s, uA, uB, uc, U: k * uc };
    });
    const bTxt = a > 0 ? `B 类按仪器允差 a = ${a}（uB = a/√3）` : '仪器允差未填，B 类分量暂计为 0';
    L.push(`- 测量不确定度（包含因子 k = ${k}，${bTxt}）：`);
    uRows.forEach(r => {
      const u = r.s.unit || '';
      L.push(`  · ${r.s.pretty}：uA = ${f(r.uA)}${u}，uC = ${f(r.uc)}${u}，U = ${f(r.U)}${u}；结果表示 ${LabAnalysis.fmt(r.s.mean, 2)} ± ${f(r.U)}${u}`);
    });
    L.push('  · 数据趋势图上每个数据点的误差棒即该通道的 ±U（扩展不确定度），可直接看出测量结果的波动区间。');

    // 4. 综合判断
    const r0 = uRows[0];    const rel = Math.abs(r0.s.mean) > 1e-9 ? (r0.U / Math.abs(r0.s.mean)) * 100 : Infinity;
    let cred;
    if (rel < 1) cred = '测量结果可信度高';
    else if (rel < 5) cred = '测量结果可信度中等，增加重复测量次数可收敛不确定度';
    else cred = '数据散布相对较大，建议先排查采集环节再复测';
    let source;
    if (a <= 0) source = '当前仅按 A 类（重复性）估计，补填仪器允差后可完整评估 B 类分量';
    else if (uRows.some(r => r.uA >= r.uB)) source = '主要误差来源为 A 类分量（重复性波动），关注采样环境稳定性、接线抖动与被测对象自身波动';
    else source = '主要误差来源为 B 类分量（仪器允差），核对仪器精度等级与校准有效期';
    L.push(`- 综合判断：以首通道 ${r0.s.pretty} 计，扩展不确定度约占均值的 ${f(rel, 2)}%，${cred}；${source}。`);
    if (sq && sq.ok && sq.drops && sq.drops.length) {
      L.push(`- 采集过程存在 ${sq.drops.length} 处疑似丢帧，建议核对采样定时与串口缓冲；时间轴误差会同时影响趋势与频域分析。`);
    }

    // 5. 标定评估（有记录才写）
    if (info && info.evalRecord) {
      L.push(`- ${info.evalRecord}。线性度偏大时建议检查拟合关系或改分段标定。`);
    }
    return L;
  }

  /* PPT 大纲（v3.0）：按报告结构生成答辩演示大纲（Markdown）
   * 每页用 `## 第 N 页 · 标题`，页内用 - 列表；可直接粘进 PPT 备注或复制到便签
   */
  function buildPptOutline(ds, stats, conclusionText, info) {
    info = info || {};
    const title = (info.title || '').trim() || '实验数据记录与分析';
    const purpose = (info.purpose || '').trim();
    const f = (v, d = 2) => LabAnalysis.fmt(v, d);
    const valid = stats.filter(s => s.ok);
    const L = [];
    let page = 0;
    const P = (t) => { page++; L.push(`## 第 ${page} 页 · ${t}`); L.push(''); };

    L.push(`# ${title} · 答辩演示大纲`);
    L.push('');
    L.push(`> 由 LabInsight 按报告结构自动生成 · 共 @@PAGES@@ 页 · 建议每页 30 秒`);
    L.push('');

    /* 1. 标题页 */
    P('标题页');
    L.push(`- 题目：${title}`);
    if (purpose) L.push(`- 一句话说明：${purpose.split(/\r?\n/)[0]}`);
    L.push(`- 数据规模：${ds.rows.length} 行 × ${ds.columns.length} 列${ds.meta.skippedRows ? `（跳过 ${ds.meta.skippedRows} 行脏数据）` : ''}`);
    if (ds.meta.time) L.push(`- 采集时段：${ds.meta.time.startLabel} — ${ds.meta.time.endLabel}`);
    L.push('');

    /* 2. 数据概览 */
    P('数据概览');
    L.push(`- 数据来源：${ds.sourceLabel || '本地导入'}`);
    L.push(`- 有效数据：${ds.rows.length} 行，${valid.length} 个数值通道（${valid.map(s => s.pretty).join('、')}）`);
    if (ds.meta.skippedRows) L.push(`- 数据清洗：自动跳过 ${ds.meta.skippedRows} 行无法解析的脏行`);
    L.push('');
    L.push('| 通道 | 均值 | 标准差 | 范围 | 异常点 |');
    L.push('| --- | --- | --- | --- | --- |');
    valid.slice(0, 6).forEach(s => {
      L.push(`| ${s.pretty} | ${f(s.mean)}${s.unit || ''} | ${f(s.std, 3)} | ${f(s.min)} ~ ${f(s.max)} | ${s.outliers.length} |`);
    });
    L.push('');

    /* 3. 主图 */
    P('数据曲线（主图）');
    L.push('- 展示：智能分析页签「数据曲线」截图，或「导出 PNG（300dpi）」插进 PPT');
    L.push('- 讲解要点：整体趋势 / 波动幅度 / 明显拐点或台阶');
    valid.slice(0, 3).forEach(s => {
      const dir = s.last > s.first * 1.005 ? '上升' : s.last < s.first * 0.995 ? '下降' : '平稳';
      L.push(`- ${s.pretty}：${dir}，从 ${f(s.first)} 到 ${f(s.last)}${s.unit || ''}，均值 ${f(s.mean)}${s.unit || ''}`);
    });
    L.push('');

    /* 4. 误差分析 */
    P('误差分析与不确定度');
    const a = info.uncertainty ? (Number(info.uncertainty.a) || 0) : 0;
    const k = info.uncertainty && Number(info.uncertainty.k) ? Number(info.uncertainty.k) : 2;
    const r0 = valid[0];
    if (r0) {
      const n = Math.max(1, r0.values.length);
      const uA = r0.std / Math.sqrt(n);
      const uB = a / Math.sqrt(3);
      const uc = Math.sqrt(uA * uA + uB * uB);
      const U = k * uc;
      const rel = Math.abs(r0.mean) > 1e-9 ? (U / Math.abs(r0.mean)) * 100 : Infinity;
      L.push(`- 以 ${r0.pretty} 为例：uA = ${f(uA)}，uB = ${f(uB)}（仪器允差 a = ${a}），uC = ${f(uc)}，U = ${f(U)}（k = ${k}）`);
      L.push(`- 结果表示：${f(r0.mean)} ± ${f(U)}${r0.unit || ''}，相对扩展不确定度约 ${f(rel, 2)}%`);
      L.push(`- 主要误差来源：${a <= 0 ? '当前仅计 A 类（重复性），补填仪器允差后可完整评估' : (uA >= uB ? 'A 类（重复性波动）主导' : 'B 类（仪器允差）主导')}`);
    }
    const sqRate = ds.meta && ds.meta.time ? (ds.rows.length - 1) / ((ds.meta.time.end - ds.meta.time.start) / (ds.meta.time.mode === 'date' ? 1000 : 1)) : null;
    if (sqRate && isFinite(sqRate)) L.push(`- 采样质量：实际平均采样率约 ${f(sqRate, 2)} Hz`);
    if (info.evalRecord) L.push(`- 标定评估：${String(info.evalRecord).replace(/^- /, '')}`);
    L.push('');

    /* 5. 结论 */
    P('分析结论');
    const sentences = String(conclusionText || '').split(/(?<=。)/).map(s => s.trim()).filter(Boolean);
    sentences.slice(0, 5).forEach(s => L.push(`- ${s}`));
    if (!sentences.length) L.push('- （尚未生成结论，先在「智能分析」页签生成）');
    L.push('');

    /* 6. 收尾 */
    P('总结与展望');
    const totalOut = valid.reduce((n, s) => n + s.outliers.length, 0);
    L.push(`- 数据质量：${totalOut === 0 ? '各通道未发现异常点，数据连续性好' : `${totalOut} 处异常点已定位并复核`}`);
    L.push('- 可改进：延长采样时长 / 增加重复测量次数以收敛不确定度 / 完善标定流程');
    L.push('- 演示提示：智能分析页签点「答辩演示」可全屏投影，← → 翻页');
    L.push('');

    // 回填总页数
    return L.join('\n').replace('@@PAGES@@', String(page));
  }

  return { buildReport, toHtml, buildStaticHtml, buildDocx, buildPptOutline };
})();
