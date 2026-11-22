/* =========================================================
   analysis.js — 统计分析 + 中文结论引擎（纯本地规则，无外部依赖）
   内容：统计量 / 离群点检测 / 趋势判断 / 分段描述 / 结论生成
   ========================================================= */

const LabAnalysis = (() => {

  /* ---------------- 基础统计 ---------------- */

  function mean(arr) {
    if (!arr.length) return NaN;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  function median(arr) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mad(arr) {
    const m = median(arr);
    const devs = arr.map(x => Math.abs(x - m));
    return median(devs);
  }

  // 线性插值分位数（教材标准法），p ∈ [0,1]
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }

  /* 异常判定三种口径：mad（稳健 z 分数）/ sigma3（3σ）/ iqr（四分位距）
     返回 {outliers, th:{lo,hi,kind,label}} —— th 供图表画阈值虚线与口径文案 */
  function detectOutliers(vals, valIdx, method) {
    const n = vals.length;
    const out = { outliers: [], th: null };
    if (n < 8) return out;
    if (method === 'sigma3') {
      const m = mean(vals);
      const s = std(vals);
      if (s <= 0) return out;
      const lo = m - 3 * s, hi = m + 3 * s;
      vals.forEach((x, k) => { if (x < lo || x > hi) out.outliers.push(valIdx[k]); });
      out.th = { lo, hi, kind: 'sigma3', label: '均值 ± 3σ' };
      return out;
    }
    if (method === 'iqr') {
      const sorted = [...vals].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25);
      const q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      if (iqr <= 0) return out;
      const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      vals.forEach((x, k) => { if (x < lo || x > hi) out.outliers.push(valIdx[k]); });
      out.th = { lo, hi, kind: 'iqr', label: 'Q1 − 1.5×IQR ~ Q3 + 1.5×IQR' };
      return out;
    }
    // 默认 mad：稳健 z 分数（基于 MAD）> 3.5 或偏离中位数超 4×MAD
    const md = median(vals);
    const mdAbs = mad(vals);
    if (mdAbs <= 0) return out;
    vals.forEach((x, k) => {
      const mz = 0.6745 * (x - md) / mdAbs;
      if (Math.abs(mz) > 3.5 || Math.abs(x - md) > 4 * mdAbs) out.outliers.push(valIdx[k]);
    });
    out.th = { lo: md - 4 * mdAbs, hi: md + 4 * mdAbs, kind: 'mad', label: '中位数 ± 4×MAD' };
    return out;
  }

  /* ---------------- 列名美化：temp_c → temp(°C) ---------------- */

  const UNIT_MAP = {
    c: '°C', pct: '%', hpa: 'hPa', pa: 'Pa', kpa: 'kPa',
    v: 'V', mv: 'mV', a: 'A', ma: 'mA',
    rpm: 'rpm', lux: 'lux', m: 'm', cm: 'cm', mm: 'mm',
    s: 's', ms: 'ms', hz: 'Hz', khz: 'kHz', mhz: 'MHz',
    g: 'g', kg: 'kg', ppm: 'ppm', db: 'dB', dbm: 'dBm', vpp: 'Vpp'
  };

  function prettyColName(col) {
    if (col.unit) return `${col.name}(${col.unit})`;
    const m = String(col.name).match(/^(.+?)_([a-zµ]+)$/i);
    if (m && UNIT_MAP[m[2].toLowerCase()]) {
      return `${m[1]}(${UNIT_MAP[m[2].toLowerCase()]})`;
    }
    return col.name;
  }

  // 从列名推断单位（不含列名本身）：unit 字段优先，其次 _c/_pct 等后缀映射，用于图表 Y 轴标题
  function unitOf(col) {
    if (col.unit) return col.unit;
    const m = String(col.name).match(/^(.+?)_([a-zµ]+)$/i);
    if (m && UNIT_MAP[m[2].toLowerCase()]) return UNIT_MAP[m[2].toLowerCase()];
    return '';
  }

  /* ---------------- 置信区间（t 分布，df>30 近似 1.96） ---------------- */

  // t(0.975) 双侧 95% 临界值，自由度 df = n-1，1~30 查表，>30 用正态近似
  const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];

  function tCrit975(df) {
    if (df <= 0) return NaN;
    return df <= 30 ? T975[df - 1] : 1.96;
  }

  // 均值标准误与 95% 置信区间半宽：sem = s/√n，ciHalf = t·sem
  function meanCI(vals, s) {
    const n = vals.length;
    if (n < 2) return { sem: 0, ciHalf: 0, df: n - 1 };
    const sem = s / Math.sqrt(n);
    const df = n - 1;
    return { sem, ciHalf: tCrit975(df) * sem, df };
  }

  /* ---------------- Pearson 相关系数矩阵 ---------------- */

  function pearson(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return NaN;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
    const ma = sa / n, mb = sb / n;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      saa += da * da; sbb += db * db; sab += da * db;
    }
    if (saa === 0 || sbb === 0) return NaN; // 常数列无意义
    return sab / Math.sqrt(saa * sbb);
  }

  // 按行序对齐取两列都有效的值；cols 为 {index,name,pretty,type} 数组（建议 ≤6 列）
  function corrMatrix(ds, cols) {
    const colsN = cols.filter(c => c.type === 'numeric');
    const series = colsN.map(c => ds.rows.map(r => {
      const v = r.cells[c.index];
      return (typeof v === 'number' && isFinite(v) && !r.badCells.has(c.index)) ? v : null;
    }));
    const n = colsN.length;
    const m = [];
    for (let i = 0; i < n; i++) {
      m.push(new Array(n).fill(null));
      for (let j = 0; j < n; j++) {
        if (i === j) { m[i][j] = 1; continue; }
        if (j < i) { m[i][j] = m[j][i]; continue; }
        const a = [], b = [];
        for (let k = 0; k < series[i].length; k++) {
          if (series[i][k] !== null && series[j][k] !== null) { a.push(series[i][k]); b.push(series[j][k]); }
        }
        m[i][j] = pearson(a, b);
      }
    }
    return { names: colsN.map(c => prettyColName(c)), matrix: m, pairs: n };
  }

  /* ---------------- 每列统计 + 离群点 ---------------- */

  function computeStats(ds, method) {
    const m_ = method || 'mad'; // 默认稳健 MAD 口径
    const stats = [];
    ds.numericColumns.forEach(col => {
      const vals = [];
      const valIdx = [];
      ds.rows.forEach((r, ri) => {
        const v = r.cells[col.index];
        if (typeof v === 'number' && isFinite(v) && !r.badCells.has(col.index)) {
          vals.push(v);
          valIdx.push(ri);
        }
      });
      if (vals.length === 0) {
        stats.push({ column: col.index, name: col.name, count: 0, ok: false });
        return;
      }
      const n = vals.length;
      const m = mean(vals);
      const s = std(vals);
      const md = median(vals);
      const mdAbs = mad(vals);
      const first = vals[0];
      const last = vals[n - 1];

      // 离群点判定（口径可切：mad / sigma3 / iqr）
      const det = detectOutliers(vals, valIdx, m_);
      const outliers = det.outliers;

      const ci = meanCI(vals, s);

      stats.push({
        column: col.index,
        name: col.name,
        pretty: prettyColName(col),
        unit: col.unit,
        ok: true,
        count: n,
        missing: ds.rows.length - n,
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean: m,
        std: s,
        sem: ci.sem,
        ciHalf: ci.ciHalf,
        ciDF: ci.df,
        median: md,
        mad: mdAbs,
        range: Math.max(...vals) - Math.min(...vals),
        drift: last - first,
        first, last,
        cv: Math.abs(m) > 1e-9 ? s / Math.abs(m) : 0,
        outliers, // 行下标数组
        outlierTh: det.th, // 阈值上下限与口径（画阈值虚线 / 口径文案用）
        values: vals,
        valueRows: valIdx
      });
    });
    return stats;
  }

  /* ---------------- 趋势判断（线性回归） ---------------- */

  function detectTrend(vals) {
    const n = vals.length;
    if (n < 3) return { dir: 'flat', slope: 0, relChange: 0 };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    vals.forEach((y, i) => {
      sx += i; sy += y; sxx += i * i; sxy += i * y;
    });
    const denom = n * sxx - sx * sx;
    const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
    const avg = mean(vals);
    const relChange = avg !== 0 ? (slope * (n - 1)) / avg : 0;
    let dir = 'flat';
    if (Math.abs(relChange) >= 0.03) dir = relChange > 0 ? 'up' : 'down';
    return { dir, slope, relChange, fit: relChange };
  }

  /* ---------------- 波动分级 ---------------- */

  function volatilityLabel(cv) {
    if (cv < 0.01) return { level: '稳定', text: '波动很小' };
    if (cv < 0.03) return { level: '较小', text: '波动较小' };
    if (cv < 0.08) return { level: '中等', text: '波动中等' };
    return { level: '较大', text: '波动较大' };
  }

  /* ---------------- 分段描述 ---------------- */

  function segmentSeries(ds, colIndex, segCount) {
    const rows = ds.rows;
    const n = rows.length;
    const size = Math.max(1, Math.ceil(n / segCount));
    const segs = [];
    for (let s = 0; s < segCount; s++) {
      const lo = s * size;
      const hi = Math.min(n, lo + size);
      if (lo >= n) break;
      const vals = [];
      let outCount = 0;
      const outRows = [];
      for (let i = lo; i < hi; i++) {
        const v = rows[i].cells[colIndex];
        if (typeof v === 'number' && isFinite(v)) {
          vals.push(v);
          if (rows[i].outliers && rows[i].outliers.has(colIndex)) {
            outCount++;
            outRows.push(rows[i]);
          }
        }
      }
      const t0 = rows[lo]?.timeLabel || '';
      const t1 = rows[hi - 1]?.timeLabel || '';
      const cleanVals = vals.filter(v => typeof v === 'number' && isFinite(v));
      segs.push({
        idx: s + 1, lo, hi: hi - 1,
        timeStart: t0, timeEnd: t1,
        mean: mean(vals), std: std(vals),
        min: cleanVals.length ? Math.min(...cleanVals) : NaN,
        max: cleanVals.length ? Math.max(...cleanVals) : NaN,
        firstVal: cleanVals.length ? cleanVals[0] : NaN,
        lastVal: cleanVals.length ? cleanVals[cleanVals.length - 1] : NaN,
        outlierCount: outCount, outlierRows: outRows
      });
    }
    return segs;
  }

  /* ---------------- 时间格式辅助 ---------------- */

  function fmtDuration(msOrSec, mode) {
    if (mode === 'date') {
      const s = Math.round(msOrSec / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return h > 0 ? `${h}分${m}秒` : m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
    }
    const s = msOrSec;
    if (s >= 60) {
      const m = Math.floor(s / 60), sec = Math.round(s % 60);
      return `${m}分${sec}秒`;
    }
    return `${s.toFixed(1)}秒`;
  }

  function fmt(v, digits = 2) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const d = digits;
    return String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
  }

  /* ---------------- 结论生成（核心） ---------------- */

  function buildConclusion(ds, stats) {
    const valid = stats.filter(s => s.ok);
    if (!valid.length) return { text: '未识别到可分析的数值列。', html: '未识别到可分析的数值列。' };

    const segCount = ds.rows.length > 80 ? 4 : 3;
    const parts = [];

    /* 1. 总体句 */
    const timeInfo = ds.meta.time;
    let rangeDesc = '';
    if (timeInfo) {
      const dur = timeInfo.end - timeInfo.start;
      rangeDesc = `采集时段 ${timeInfo.startLabel} 至 ${timeInfo.endLabel}，约 ${fmtDuration(dur, timeInfo.mode)}`;
    }
    const colList = valid.map(s => s.pretty).join('、');
    parts.push(
      `本次共解析有效数据 ${ds.rows.length} 行（${rangeDesc}），包含 ${valid.length} 个数值通道：${colList}。`
    );

    /* 2. 主要列趋势 + 波动句（最多 3 列，其余一句话带过） */
    const mains = valid.slice(0, 3);
    const rest = valid.slice(3);
    for (const s of mains) {
      const tr = detectTrend(s.values);
      const vol = volatilityLabel(s.cv);
      const dirText = tr.dir === 'up' ? '整体呈上升趋势' : tr.dir === 'down' ? '整体呈下降趋势' : '整体保持平稳';
      const spanText = tr.dir !== 'flat'
        ? `：从 ${fmt(s.first)}${s.unit || ''} 升至 ${fmt(s.last)}${s.unit || ''}（均值 ${fmt(s.mean)}${s.unit || ''}）`
        : `，围绕均值 ${fmt(s.mean)}${s.unit || ''} 小幅波动`;
      const volText = tr.dir === 'flat'
        ? `${vol.text}（标准差 ${fmt(s.std, 3)}）`
        : `${vol.text}（标准差 ${fmt(s.std, 3)}，约为均值的 ${fmt(s.cv * 100, 1)}%）`;
      parts.push(`「${s.pretty}」${dirText}${spanText}，${volText}。`);
    }
    if (rest.length) {
      const brief = rest.map(s => {
        const tr = detectTrend(s.values);
        const dirWord = tr.dir === 'up' ? '上升' : tr.dir === 'down' ? '下降' : '平稳';
        return `「${s.pretty}」${dirWord}`;
      }).join('、');
      parts.push(`其余通道：${brief}。`);
    }

    /* 3. 异常句 */
    let totalOutliers = 0;
    const outSummary = [];
    for (const s of valid) {
      totalOutliers += s.outliers.length;
      if (!s.outliers.length) continue;
      const segOf = segCount;
      const segs = segmentSeries(ds, s.column, segOf);
      const details = s.outliers.slice(0, 4).map(ri => {
        const row = ds.rows[ri];
        const v = row.cells[s.column];
        const dev = s.median !== 0 ? ((v - s.median) / Math.abs(s.median)) * 100 : 0;
        const segIdx = segs.findIndex(sg => ri >= sg.lo && ri <= sg.hi) + 1;
        return `${row.timeLabel || ('第' + (ri + 1) + '行')} 达 ${fmt(v)}（偏离中位数约 ${fmt(Math.abs(dev), 1)}%${dev < 0 ? '，偏低' : '，偏高'}）`;
      });
      const segWithOut = segs.filter(sg => sg.outlierCount > 0);
      const segDesc = segWithOut.map(sg => `第 ${sg.idx} 段`).join('、');
      const cause = suggestCause(s);
      outSummary.push(
        `「${s.pretty}」在${segDesc}出现 ${s.outliers.length} 处明显毛刺（${details.join('；')}），${cause}。`
      );
    }
    if (outSummary.length) {
      parts.push('异常检测：' + outSummary.join(' '));
    } else {
      parts.push('异常检测：各通道均未发现明显离群点，数据连续性好。');
    }

    /* 4. 分段描述（取第一个主列） */
    const main = mains[0];
    const segs = segmentSeries(ds, main.column, segCount);
    const segParts = segs.map(sg => {
      const span = Math.abs(sg.lastVal - sg.firstVal);
      const noise = sg.std > 0 ? sg.std : 1e-9;
      let moveText;
      if (span > noise * 0.6) {
        moveText = sg.lastVal > sg.firstVal
          ? `由 ${fmt(sg.firstVal)} 升至 ${fmt(sg.lastVal)}`
          : `由 ${fmt(sg.firstVal)} 降至 ${fmt(sg.lastVal)}`;
      } else {
        moveText = '基本平稳';
      }
      let extra = '';
      if (sg.outlierCount > 0) {
        extra = `，含 ${sg.outlierCount} 处毛刺`;
      }
      const tRange = (sg.timeStart || sg.lo + 1) + (sg.timeEnd ? '–' + sg.timeEnd : '');
      return `第 ${sg.idx} 段（${tRange}）均值 ${fmt(sg.mean)}${main.unit || ''}，${moveText}${extra}`;
    });
    parts.push(`分段来看：${segParts.join('；')}。`);

    /* 5. 总结建议 */
    const outRatio = ds.rows.length ? (totalOutliers / ds.rows.length) * 100 : 0;
    let close;
    if (totalOutliers === 0) {
      close = `整体而言，数据质量良好，各通道统计指标稳定，测量结果可信。建议保持现有采集设置，必要时延长采样时间以进一步验证长期稳定性。`;
    } else {
      close = `整体而言，数据质量基本可信：共发现 ${totalOutliers} 个异常点（占比约 ${fmt(outRatio, 1)}%），剔除后各通道波动会进一步收敛。建议对异常时段涉及的接线与供电做一次排查，确认无接触不良后复测验证。`;
    }
    parts.push(close);

    return { text: parts.join('\n\n'), html: parts.map(p => `<p>${escapeHtml(p)}</p>`).join('') };
  }

  function suggestCause(s) {
    const dev = Math.abs((s.max - s.median) / (Math.abs(s.median) || 1));
    if (dev > 0.1) return '幅值偏离较大，疑似接触不良或偶发干扰';
    if (dev > 0.04) return '疑似瞬时干扰或接触抖动';
    return '疑似偶发噪声，影响有限';
  }

  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 采样质量分析 ---------------- */

  // 基于行序相邻时间戳：采样率 / 抖动 / 丢帧 / 时间倒流与重复
  function samplingQuality(ds) {
    if (!ds.meta.time) return { ok: false, reason: 'no-time' };
    if (ds.rows.length < 2) return { ok: false, reason: 'few-rows' };
    const t = ds.meta.time;
    const toSec = v => (t.mode === 'date' ? v / 1000 : v);
    const pts = ds.rows.map(r => ({ v: toSec(r.timeValue), label: r.timeLabel || '' }));
    const intervals = [];
    for (let i = 1; i < pts.length; i++) {
      intervals.push({ i, from: pts[i - 1], to: pts[i], dt: pts[i].v - pts[i - 1].v });
    }
    const dts = intervals.map(x => x.dt);
    const avg = mean(dts);
    const sd = std(dts);
    const med = median(dts);
    const maxDev = Math.max(...dts.map(d => Math.abs(d - med)));
    const vals = pts.map(p => p.v);
    const span = Math.max(...vals) - Math.min(...vals);
    const rate = span > 0 ? dts.length / span : NaN;
    const drops = med > 0 ? intervals.filter(x => x.dt > med * 3) : [];
    drops.forEach(x => {
      x.mult = x.dt / med;
      x.miss = Math.max(1, Math.round(x.dt / med) - 1);
    });
    const backwards = intervals.filter(x => x.dt < 0);
    const duplicates = intervals.filter(x => x.dt === 0);
    return {
      ok: true, n: pts.length, intervals: intervals.length,
      span, rate, avg, sd, med, maxDev,
      drops, backwards, duplicates
    };
  }

  /* ---------------- Welch's t 检验（v4.1） ----------------
     独立两样本 t 检验（不假设方差齐），自由度用 Welch–Satterthwaite。
     p 值由不完全贝塔函数算 t 分布的尾部概率（连分数法，标准数值算法），
     纯本地实现，不依赖外部库。 */

  // log-gamma（Lanczos 近似）
  function lgamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x0 = x, tmp = x0 + 5.5;
    tmp -= (x0 + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / (++x0);
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // 不完全贝塔 I_x(a, b)（连分数法，Numerical Recipes 标准实现）
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // ln B(a,b) = lgamma(a+b) − lgamma(a) − lgamma(b)（注意符号：之前写反会导致 p 值虚大）
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a
      : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  // Welch's t 检验：a/b 为两组有效样本值数组
  // 返回 { t, df, p, sig, m1, m2, n1, n2 } 或 null（样本不足 / 无方差）
  function tTestWelch(a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const varr = (arr, m) => arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1);
    const m1 = mean(a), m2 = mean(b);
    const v1 = varr(a, m1), v2 = varr(b, m2);
    const se2 = v1 / n1 + v2 / n2;
    if (!(se2 > 0)) return null;
    const t = (m1 - m2) / Math.sqrt(se2);
    const df = se2 * se2 /
      ((v1 * v1) / (n1 * n1 * (n1 - 1)) + (v2 * v2) / (n2 * n2 * (n2 - 1)));
    const p = ibeta(df / 2, 0.5, df / (df + t * t)); // 双尾 p 值
    const sig = p < 0.01 ? '差异高度显著（p < 0.01）'
      : p < 0.05 ? '差异显著（p < 0.05）'
      : p < 0.1 ? '弱显著（0.05 ≤ p < 0.10）'
      : '差异不显著（p ≥ 0.10）';
    return { t: t, df: df, p: p, sig: sig, m1: m1, m2: m2, n1: n1, n2: n2 };
  }

  // 两两比较 + Bonferroni 校正（v4.2）
  // groups: [{ label, values }]，返回 { k, m, alpha, pairs: [...] } 或 null
  // 三组以上直接拿单次 t 检验的 p 值比 0.05，等于把"碰巧显著"的概率放大 m 倍
  // （m 次比较、每次 5% 假阳，族错误率约 1-(0.95)^m）。Bonferroni 把阈值按比较次数分摊：
  // 校正后 p = min(1, p × m)，再与 0.05 比 —— 保守但不需要额外分布假设。
  function tTestPairwise(groups, alpha) {
    const a = alpha || 0.05;
    const gs = (groups || []).filter(g => g && g.values && g.values.length >= 2);
    if (gs.length < 2) return null;
    const m = gs.length * (gs.length - 1) / 2;
    const pairs = [];
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const tt = tTestWelch(gs[i].values, gs[j].values);
        if (!tt) continue;
        const pAdj = Math.min(1, tt.p * m);
        const sig = pAdj < 0.01 ? '差异高度显著（校正后 p < 0.01）'
          : pAdj < 0.05 ? '差异显著（校正后 p < 0.05）'
            : pAdj < 0.1 ? '弱显著（校正后 0.05 ≤ p < 0.10）'
              : '差异不显著（校正后 p ≥ 0.10）';
        pairs.push({
          labelA: gs[i].label, labelB: gs[j].label,
          t: tt.t, df: tt.df, p: tt.p, pAdj: pAdj, sig: sig, rawSig: tt.sig,
          m1: tt.m1, m2: tt.m2, n1: tt.n1, n2: tt.n2
        });
      }
    }
    if (!pairs.length) return null;
    return { k: gs.length, m: m, alpha: a, pairs: pairs };
  }

  /* ---------------- 对外 ---------------- */

  return {
    computeStats,
    detectOutliers,
    detectTrend,
    segmentSeries,
    volatilityLabel,
    buildConclusion,
    prettyColName, unitOf,
    samplingQuality,
    meanCI,
    corrMatrix,
    tTestWelch,
    tTestPairwise,
    fmt,
    fmtDuration
  };
})();
