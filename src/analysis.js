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

  /* ---------------- 每列统计 + 离群点 ---------------- */

  function computeStats(ds) {
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

      // 离群点：稳健 z 分数（MAD）> 3.5 或偏离中位数超 4×MAD
      const outliers = [];
      if (n >= 8 && mdAbs > 0) {
        valIdx.forEach((ri, k) => {
          const x = vals[k];
          const mz = 0.6745 * (x - md) / mdAbs;
          if (Math.abs(mz) > 3.5 || Math.abs(x - md) > 4 * mdAbs) {
            outliers.push(ri);
          }
        });
      }

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
        median: md,
        mad: mdAbs,
        range: Math.max(...vals) - Math.min(...vals),
        drift: last - first,
        first, last,
        cv: Math.abs(m) > 1e-9 ? s / Math.abs(m) : 0,
        outliers, // 行下标数组
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

  /* ---------------- 对外 ---------------- */

  return {
    computeStats,
    detectTrend,
    segmentSeries,
    volatilityLabel,
    buildConclusion,
    prettyColName,
    samplingQuality,
    fmt,
    fmtDuration
  };
})();
