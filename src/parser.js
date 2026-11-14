/* =========================================================
   parser.js — 数据解析引擎（纯本地，无外部依赖）
   职责：
   1. 规整表格解析（CSV / Excel 的 aoa / 粘贴的表格文本）
   2. 串口日志清洗解析（前缀、乱码、key=value、单位、坏行）
   3. 列类型识别（时间 / 数值 / 文本）与单位提取
   4. 跳过行统计（带原因与原文）
   ========================================================= */

const LabParser = (() => {

  /* ---------------- 工具：数值与单位 ---------------- */

  // 从 "25.3C"、"62.1%"、"-12.5V"、"1.5e3" 中提取数值与单位
  function parseNumeric(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim().replace(/\u00a0/g, ' ').replace(/[~≈]/g, '');
    const m = s.match(/^[-+]?(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!m) return null;
    let rest = s.slice(m[0].length).trim();
    if (/\d/.test(rest) || /^[.,]/.test(rest)) return null; // "25.x"、"1,234" 之类 → 非法
    let unit = rest.replace(/[^\w%°/²³μ℃]+/g, '');
    if (unit === 'C') unit = '°C';
    return { value: parseFloat(m[0]), unit };
  }

  /* ---------------- 工具：时间戳 ---------------- */

  const RE_CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?/;
  const RE_DATE  = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?/;

  // 返回 { value, label, mode, rawLen } 或 null
  function tryParseTime(str) {
    const s = String(str).trim();
    let m = s.match(RE_DATE);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
      const [y, mo, d, h, mi, se = '0', ms = '0'] = [m[1], m[2], m[3], m[4], m[5], m[6], m[7]];
      const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se, +ms);
      const label = `${y}-${mo}-${d} ${h.padStart(2, '0')}:${mi}:${String(se).padStart(2, '0')}`;
      return { value: dt.getTime(), label, mode: 'date', rawLen: m[0].length };
    }
    m = s.match(RE_CLOCK);
    if (m && +m[1] < 24 && +m[2] < 60) {
      const [h, mi, se = '0', ms = '0'] = [m[1], m[2], m[3], m[4]];
      const value = (+h) * 3600 + (+mi) * 60 + (+se) + (+ms) / Math.pow(10, ms.length);
      const label = `${h.padStart(2, '0')}:${mi}:${String(se).padStart(2, '0')}` + (m[4] ? '.' + ms : '');
      return { value, label, mode: 'clock', rawLen: m[0].length };
    }
    return null;
  }

  // 纯数字秒（如 "123" 或 "3.2"）→ 仅在显式要求时使用
  function tryParseSeconds(str) {
    const s = String(str).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const v = parseFloat(s);
      return { value: v, label: v + 's', mode: 'seconds', rawLen: s.length };
    }
    return null;
  }

  /* ---------------- 工具：表头名称与单位 ---------------- */

  // "温度(°C)" → {name:"温度", unit:"°C"}；"temp_c" → {name:"temp_c", unit:""}
  function splitHeaderName(cell) {
    const s = String(cell === null || cell === undefined ? '' : cell).trim();
    const m = s.match(/^(.+?)\s*[\(\[]([^\)\]]{1,8})[\)\]]$/);
    if (m) return { name: m[1].trim(), unit: m[2].trim() };
    return { name: s, unit: '' };
  }

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }

  /* ---------------- 串口日志：单行解析 ---------------- */

  // 返回 { kind:'data'|'log'|'skip'|'empty', ... }
  function parseSerialLine(line, lineNo) {
    let raw = String(line).replace(/\x1b\[[0-9;]*m/g, '').replace(/^\uFEFF/, '').trim();
    if (!raw) return { kind: 'empty' };

    let rest = raw;

    // 1. 行首前缀 [INFO] / [WARN] 等
    const tagM = rest.match(/^\[([^\]]{1,20})\]\s*(.*)$/);
    if (tagM) {
      const tag = tagM[1].toUpperCase();
      rest = tagM[2].trim();
      // WARN/ERROR 里常带 raw=... 的坏帧引用，整行按日志跳过
      if (/^(WARN|ERROR|ERR|DEBUG|FAIL)/.test(tag)) {
        return { kind: 'skip', reason: '日志报错行 [' + tagM[1] + ']', raw };
      }
      // 有前缀的行：只有前缀后紧跟数字（时间戳/数据）才算数据行
      if (!/^\d/.test(rest)) {
        return { kind: 'log', reason: '日志信息行 [' + tagM[1] + ']', raw };
      }
    }

    // 2. 行首时间戳
    let time = null;
    const t = tryParseTime(rest);
    if (t) {
      time = { value: t.value, label: t.label, mode: t.mode };
      rest = rest.slice(t.rawLen).trim();
    } else if (/^\d+(\.\d+)?\s/.test(rest)) {
      // 数字开头但不像时钟 → 尝试纯秒数时间戳（仅当后面还有内容）
      const head = rest.match(/^\d+(\.\d+)?/)[0];
      const after = rest.slice(head.length).trim();
      if (after) {
        const ts = tryParseSeconds(head);
        if (ts) {
          time = { value: ts.value, label: ts.label, mode: ts.mode };
          rest = after;
        }
      }
    }

    if (!rest) return { kind: 'log', reason: '无内容行', raw };

    // 3. 字段提取：优先 key=value / key:value，未配对的数字作为附加列
    const pairs = [];      // {key, rawVal}
    const extras = [];     // 未配对数字 token
    const kvRe = /([A-Za-z_][\w]*)\s*[=:]\s*(-?[\d.]+[A-Za-z%°/℃\u00b2\u00b3]*)/g;
    let kvM, lastIdx = 0, matched = false;
    while ((kvM = kvRe.exec(rest)) !== null) {
      matched = true;
      pairs.push({ key: kvM[1], rawVal: kvM[2] });
      lastIdx = kvRe.lastIndex;
    }
    if (matched) {
      // 剩余的未配对数字 token（夹在键值对之间或结尾）
      const leftover = rest.slice(lastIdx);
      const numRe = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([A-Za-z%°/℃\u00b2\u00b3]{0,4})/g;
      let nm;
      while ((nm = numRe.exec(leftover)) !== null) {
        extras.push(nm[1] + nm[2]);
      }
    } else {
      // 无键值对 → 按位置切分（支持空格/Tab/逗号/分号混用）
      const tokens = rest.split(/[\s,;\t|]+/).filter(x => x !== '');
      if (tokens.length === 0) return { kind: 'log', reason: '无数据内容', raw };
      for (const tk of tokens) extras.push(tk);
    }

    // 4. 判定数值单元格
    const cells = []; // {key|null, value, unit, bad}
    for (const p of pairs) {
      const n = parseNumeric(p.rawVal);
      if (n) cells.push({ key: p.key, value: n.value, unit: n.unit, bad: false });
      else cells.push({ key: p.key, value: null, unit: '', bad: true });
    }
    for (const e of extras) {
      const n = parseNumeric(e);
      if (n) cells.push({ key: null, value: n.value, unit: n.unit, bad: false });
      else cells.push({ key: null, value: null, unit: '', bad: true });
    }

    const hasAnyValue = cells.some(c => !c.bad);
    if (!hasAnyValue) {
      return { kind: 'skip', reason: '无有效数值（疑似乱码/坏帧）', raw };
    }

    return { kind: 'data', time, cells, raw };
  }

  /* ---------------- 串口日志：整体解析 ---------------- */

  function parseSerial(text, opts) {
    const lines = String(text).split(/\r?\n/);
    const skipFirst = Math.max(0, parseInt(opts.skipRows, 10) || 0);
    const meta = {
      sourceType: 'serial',
      totalLines: lines.length,
      dataRows: 0,
      skippedRows: 0,
      skippedList: [],
      headerDetected: false,
      delimiter: '',
      time: null
    };

    const keyIndex = new Map();          // key → 列序号（不含时间列）
    const columns = [];                  // {name, unit, isKeyCol:true, serialKey:key}
    const rows = [];
    let timeMode = null;
    let timeValues = [];

    lines.forEach((line, i) => {
      const lineNo = i + 1;
      if (lineNo <= skipFirst) {
        meta.skippedRows++;
        meta.skippedList.push({ lineNo, raw: String(line).trim(), reason: '按设置跳过（起始行）' });
        return;
      }
      const r = parseSerialLine(line, lineNo);
      if (r.kind === 'empty') return;
      if (r.kind === 'log' || r.kind === 'skip') {
        meta.skippedRows++;
        meta.skippedList.push({ lineNo, raw: r.raw, reason: r.reason });
        return;
      }

      // 时间列
      let timeValue = null, timeLabel = null;
      if (r.time && opts.timeCol !== 'none') {
        timeValue = r.time.value;
        timeLabel = r.time.label;
        if (timeMode === null) timeMode = r.time.mode;
        timeValues.push(r.time.value);
      }

      // 数据单元格 → 定位/新建列
      const cells = new Array(columns.length).fill(null);
      const badCells = new Set();
      let extraPos = 0;
      for (const c of r.cells) {
        let ci;
        if (c.key !== null) {
          if (!keyIndex.has(c.key)) {
            keyIndex.set(c.key, columns.length);
            columns.push({ name: c.key, unit: c.unit, isKeyCol: true });
          }
          ci = keyIndex.get(c.key);
        } else {
          // 未配对数值 → 按行内出现顺序对应第 N 个合成列
          ci = ensureSynthCol(extraPos);
          extraPos++;
        }
        if (cells[ci] == null) {
          cells[ci] = c.bad ? null : c.value;
          if (c.bad) badCells.add(ci);
          if (!c.bad && c.unit && !columns[ci].unit) columns[ci].unit = c.unit;
        }
      }

      rows.push({
        cells, timeValue, timeLabel, badCells,
        raw: r.raw, skipped: false, dirty: badCells.size > 0
      });
      meta.dataRows++;
    });

    // 确保第 seq 个合成列存在并返回其列序号
    function ensureSynthCol(seq) {
      let seen = 0;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i].isKeyCol === false) {
          if (seen === seq) return i;
          seen++;
        }
      }
      const name = seq === 0 ? '数值' : '数值' + (seq + 1);
      columns.push({ name, unit: '', isKeyCol: false });
      return columns.length - 1;
    }

    // 时间范围
    if (timeMode && timeValues.length) {
      timeValues.sort((a, b) => a - b);
      meta.time = {
        mode: timeMode,
        start: timeValues[0],
        end: timeValues[timeValues.length - 1],
        startLabel: rows.find(r => r.timeValue === timeValues[0])?.timeLabel || '',
        endLabel: rows.find(r => r.timeValue === timeValues[timeValues.length - 1])?.timeLabel || ''
      };
    }

    // 列类型：串口列默认数值（偶有脏值已标 bad）
    const cols = columns.map((c, i) => ({
      name: c.name, unit: c.unit || guessUnit(rows, i),
      type: 'numeric', index: i
    }));

    return finalize({ columns: cols, rows, meta, sourceType: 'serial' });
  }

  // 从数值中统计最常见单位
  function guessUnit(rows, colIdx) {
    const counts = new Map();
    for (const r of rows) {
      const v = r.cells[colIdx];
      if (typeof v === 'number') {
        // 单位在解析时已剥掉，这里留空即可
        return '';
      }
    }
    return '';
  }

  /* ---------------- 规整表格：整体解析 ---------------- */

  // aoa: 二维数组（CSV / Excel / 粘贴表格）
  function parseTable(aoa, opts) {
    const meta = {
      sourceType: opts.sourceType || 'table',
      totalLines: aoa.length,
      dataRows: 0,
      skippedRows: 0,
      skippedList: [],
      headerDetected: false,
      delimiter: opts.delimiter || '',
      time: null
    };

    const skipFirst = Math.max(0, parseInt(opts.skipRows, 10) || 0);
    let body = aoa.slice(skipFirst);
    for (let i = 0; i < skipFirst && i < aoa.length; i++) {
      meta.skippedRows++;
      meta.skippedList.push({ lineNo: i + 1, raw: String(aoa[i]), reason: '按设置跳过（起始行）' });
    }

    // 表头检测：首行大多为非数值文本 → 视为表头
    let headers = null;
    if (body.length) {
      const first = body[0].map(v => isBlank(v) ? '' : String(v).trim());
      const nonNum = first.filter(c => c !== '' && !parseNumeric(c)).length;
      const filled = first.filter(c => c !== '').length;
      if (filled > 0 && nonNum >= filled * 0.6) {
        headers = first;
        meta.headerDetected = true;
        body = body.slice(1);
      }
    }

    const colCount = Math.max(
      headers ? headers.length : 0,
      ...body.map(r => r.length),
      1
    );

    // 表头名称/单位
    const colDefs = [];
    for (let i = 0; i < colCount; i++) {
      const raw = headers && i < headers.length ? headers[i] : '';
      const { name, unit } = splitHeaderName(raw);
      colDefs.push({ name: name || ('列' + (i + 1)), unit });
    }

    // 时间列判定
    let timeColIdx = -1;
    if (opts.timeCol === 'first') {
      timeColIdx = 0;
    } else if (opts.timeCol === 'auto') {
      // 候选：表头名含时间关键词的列；否则第一列
      const nameHit = colDefs.findIndex(c => /time|ts|时间|日期|date|timestamp/i.test(c.name));
      const candidates = nameHit >= 0 ? [nameHit] : [0];
      for (const ci of candidates) {
        const vals = body.map(r => r[ci]).filter(v => !isBlank(v)).slice(0, 50);
        if (vals.length >= 3) {
          const ok = vals.filter(v => tryParseTime(v) !== null).length;
          if (ok >= vals.length * 0.8) { timeColIdx = ci; break; }
        }
      }
    }

    // 时间列解析模式
    let timeMode = null;
    const timeSamples = [];
    if (timeColIdx >= 0) {
      for (const r of body) {
        const v = r[timeColIdx];
        if (!isBlank(v)) {
          const t = tryParseTime(v) || tryParseSeconds(v);
          if (t) { if (timeMode === null) timeMode = t.mode; timeSamples.push(t.value); }
        }
      }
    }

    // 数值列判定：≥80% 可解析为数字 → 数值列
    const colTypes = [];
    for (let i = 0; i < colCount; i++) {
      if (i === timeColIdx) { colTypes.push('time'); continue; }
      const vals = body.map(r => r[i]).filter(v => !isBlank(v));
      if (vals.length === 0) { colTypes.push('text'); continue; }
      const numOk = vals.filter(v => parseNumeric(v) !== null).length;
      colTypes.push(numOk >= vals.length * 0.8 ? 'numeric' : 'text');
    }

    // 逐行整理
    const rows = [];
    const unitCounts = colDefs.map(() => new Map());
    body.forEach((r, bi) => {
      const lineNo = skipFirst + bi + 1 + (meta.headerDetected ? 1 : 0);
      const cells = new Array(colCount).fill(null);
      const badCells = new Set();
      let anyValue = false;

      for (let i = 0; i < colCount; i++) {
        const raw = r[i];
        if (isBlank(raw)) continue;
        const type = colTypes[i];
        if (type === 'time') {
          const t = tryParseTime(raw) || tryParseSeconds(raw);
          if (t) { anyValue = true; }
        } else if (type === 'numeric') {
          const n = parseNumeric(raw);
          if (n) {
            cells[i] = n.value;
            if (n.unit) {
              const m = unitCounts[i];
              m.set(n.unit, (m.get(n.unit) || 0) + 1);
            }
            anyValue = true;
          } else {
            cells[i] = null;
            badCells.add(i);
            anyValue = true;
          }
        } else {
          cells[i] = String(raw).trim();
          anyValue = true;
        }
      }

      let timeValue = null, timeLabel = null;
      if (timeColIdx >= 0 && !isBlank(r[timeColIdx])) {
        const t = tryParseTime(r[timeColIdx]) || tryParseSeconds(r[timeColIdx]);
        if (t) { timeValue = t.value; timeLabel = t.label; }
      }

      if (!anyValue) {
        meta.skippedRows++;
        meta.skippedList.push({ lineNo, raw: String(r).trim(), reason: '空行或整行无有效数据' });
        return;
      }

      rows.push({
        cells, timeValue, timeLabel, badCells,
        raw: r.map(v => isBlank(v) ? '' : v).join(meta.delimiter || ', '),
        skipped: false, dirty: badCells.size > 0
      });
      meta.dataRows++;
    });

    // 列单位：表头带出的优先，否则取出现最多的数值单位
    const columns = colDefs.map((d, i) => ({
      name: d.name,
      unit: d.unit || mostCommon(unitCounts[i]),
      type: colTypes[i],
      index: i
    }));

    // 时间范围
    if (timeMode !== null && timeSamples.length) {
      const sorted = [...timeSamples].sort((a, b) => a - b);
      const firstT = rows.find(r => r.timeValue === sorted[0]);
      const lastT = rows.find(r => r.timeValue === sorted[sorted.length - 1]);
      meta.time = {
        mode: timeMode,
        start: sorted[0],
        end: sorted[sorted.length - 1],
        startLabel: firstT ? firstT.timeLabel : '',
        endLabel: lastT ? lastT.timeLabel : ''
      };
    }

    return finalize({ columns, rows, meta, sourceType: meta.sourceType });
  }

  function mostCommon(m) {
    let best = '', bestN = 0;
    for (const [u, n] of m) if (n > bestN) { best = u; bestN = n; }
    return best;
  }

  /* ---------------- 收尾：公共后处理 ---------------- */

  function finalize(ds) {
    ds.numericColumns = ds.columns
      .map((c, i) => ({ ...c, index: i }))
      .filter(c => c.type === 'numeric');
    // 数值列标记（供表格高亮）
    ds.numericColSet = new Set(ds.numericColumns.map(c => c.index));
    return ds;
  }

  /* ---------------- 分隔符嗅探 ---------------- */

  function sniffDelimiter(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
    const cands = [',', '\t', ';', '|'];
    let best = '', bestN = 0;
    for (const d of cands) {
      let n = 0;
      for (const l of lines) n += (l.split(d).length - 1);
      if (n > bestN) { bestN = n; best = d; }
    }
    if (bestN === 0) return ''; // 交给空格/自动
    return best;
  }

  /* ---------------- 文本 → 二维数组（CSV 用 PapaParse，失败时手写回退） ---------------- */

  function textToAoa(text, delimiter) {
    if (typeof Papa !== 'undefined') {
      const res = Papa.parse(text, {
        delimiter: delimiter || '',
        skipEmptyLines: 'greedy',
        header: false
      });
      if (res.data && res.data.length) return res.data;
    }
    // 手写回退
    const d = delimiter || ',';
    return String(text).split(/\r?\n/)
      .filter(l => l.trim() !== '')
      .map(l => l.split(d).map(c => c.trim()));
  }

  /* ---------------- 入口 ---------------- */

  // opts: { skipRows, timeCol:'auto'|'first'|'none', delimiter:'auto'|','|'tab'|'space', sourceType, fileName }
  // input: { text } 或 { aoa }
  function parse(input, opts) {
    opts = opts || {};
    const opt = {
      skipRows: opts.skipRows,
      timeCol: opts.timeCol || 'auto',
      delimiter: opts.delimiter || 'auto',
      sourceType: opts.sourceType || 'text',
      fileName: opts.fileName || null
    };

    let ds;

    if (input.aoa) {
      // Excel（已在 app.js 用 SheetJS 转成 aoa）
      ds = parseTable(input.aoa, { ...opt, sourceType: 'excel' });
    } else {
      const text = input.text;
      const delimChoice = opt.delimiter === 'auto' ? sniffDelimiter(text) : (opt.delimiter === 'tab' ? '\t' : opt.delimiter === 'space' ? ' ' : opt.delimiter);
      const userSetDelimiter = opt.delimiter !== 'auto';
      const isCsv = opt.sourceType === 'csv';

      // 规整来源（CSV / Excel / 用户指定了分隔符）→ 走表格路径；
      // 只有来源不明（txt / 粘贴）时才尝试串口日志识别
      const looksSerial = !isCsv && !userSetDelimiter && detectSerial(text);
      if (looksSerial) {
        ds = parseSerial(text, opt);
      } else if (isCsv || userSetDelimiter || delimChoice || looksTable(text)) {
        const aoa = textToAoa(text, delimChoice);
        ds = parseTable(aoa, { ...opt, sourceType: isCsv ? 'csv' : 'table', delimiter: delimChoice });
      } else {
        ds = parseSerial(text, opt);
      }
    }

    ds.fileName = opt.fileName;
    ds.sourceLabel = buildSourceLabel(ds);
    return ds;
  }

  // 判断文本是否更像串口日志（key=value 多 / 行首时钟多）
  function detectSerial(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return false;
    let kv = 0, clock = 0, useful = 0;
    for (const l of lines.slice(0, 60)) {
      const t = l.trim();
      if (t.startsWith('[')) { useful++; continue; }
      const kvCount = (t.match(/[A-Za-z_]\w*\s*[=:]\s*-?\d/g) || []).length;
      if (kvCount >= 1) { kv++; useful++; }
      else if (tryParseTime(t)) { clock++; useful++; }
    }
    if (!useful) return false;
    return (kv + clock) / useful > 0.3;
  }

  // 纯数值/时间表格（空格分隔）
  function looksTable(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim()).slice(0, 10);
    if (!lines.length) return false;
    let tabular = 0;
    for (const l of lines) {
      const tokens = l.trim().split(/[\s,;\t|]+/).filter(x => x !== '');
      if (tokens.length >= 2) tabular++;
    }
    return tabular >= Math.min(lines.length, 3);
  }

  function buildSourceLabel(ds) {
    const parts = [];
    if (ds.fileName) parts.push(ds.fileName);
    const typeName = { csv: 'CSV 文件', excel: 'Excel 文件', serial: '串口日志', table: '文本表格', text: '粘贴文本' }[ds.sourceType] || '数据';
    parts.push(typeName);
    return parts.join(' · ');
  }

  /* ---------------- 对外 ---------------- */

  return {
    parse,
    parseNumeric,
    tryParseTime,
    parseSerialLine,
    sniffDelimiter
  };
})();
