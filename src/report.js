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

    L.push(`# 实验报告：${title}`);
    L.push('');
    L.push(hr);

    /* 一、实验名称与目的 */
    L.push('## 一、实验名称与目的');
    L.push('');
    L.push(`- 实验名称：${title}`);
    L.push(`- 实验目的：${purpose}`);
    L.push('');

    /* 二、实验设备与数据来源 */
    L.push('## 二、实验设备与数据来源');
    L.push('');
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

    /* 三、数据结果 */
    L.push('## 三、数据结果');
    L.push('');
    const valid = stats.filter(s => s.ok);
    if (valid.length) {
      L.push('各数值通道统计指标如下：');
      L.push('');
      L.push('| 通道 | 最大值 | 最小值 | 平均值 | 标准差 | 极差 | 漂移量 | 异常点数 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const s of valid) {
        const f = (v, d = 2) => LabAnalysis.fmt(v, d);
        L.push(`| ${s.pretty} | ${f(s.max)} | ${f(s.min)} | ${f(s.mean)} | ${f(s.std, 3)} | ${f(s.range)} | ${f(s.drift)} | ${s.outliers.length} |`);
      }
      L.push('');
      L.push(`趋势图（折线/散点）见「智能分析」页签，可缩放查看任意时段；统计口径：标准差为样本标准差（n-1），漂移量 = 末值 − 初值。`);
    } else {
      L.push('未识别到可统计的数值列。');
    }
    L.push('');

    /* 四、分析结论 */
    L.push('## 四、分析结论');
    L.push('');
    L.push(conclusionText || '（暂无结论，请先在「智能分析」页签生成）');
    L.push('');

    /* 五、附录 */
    L.push('## 五、附录：原始数据摘录');
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

  return { buildReport, toHtml };
})();
