/* =========================================================
   filter.js — 滤波器（纯本地计算，无外部依赖）
   1. 滑动平均：居中窗口，边界自动缩窗
   2. 中值滤波：窗口内排序取中值（窗口为奇数）
   3. 一阶低通（指数平滑）：y[n] = α·x[n] + (1−α)·y[n−1]
   附：与智能分析一致的离群点计数，用于处理前后对比。
   ========================================================= */

const LabFilter = (() => {

  function mean(a) {
    if (!a.length) return NaN;
    return a.reduce((s, v) => s + v, 0) / a.length;
  }

  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  }

  function median(a) {
    const s = [...a].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mad(a) {
    const m = median(a);
    return median(a.map(x => Math.abs(x - m)));
  }

  /* ---------------- 滤波器 ---------------- */

  // 滑动平均（居中窗口，边界缩窗），N 为奇数
  function movingAverage(vals, N) {
    const n = vals.length;
    const half = (N - 1) / 2;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(n - 1, i + half);
      let s = 0, c = 0;
      for (let j = lo; j <= hi; j++) { s += vals[j]; c++; }
      out[i] = s / c;
    }
    return out;
  }

  // 中值滤波（居中窗口，边界缩窗），N 为奇数
  function medianFilter(vals, N) {
    const n = vals.length;
    const half = (N - 1) / 2;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const win = [];
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) win.push(vals[j]);
      win.sort((a, b) => a - b);
      const mid = Math.floor(win.length / 2);
      out[i] = win.length % 2 ? win[mid] : (win[mid - 1] + win[mid]) / 2;
    }
    return out;
  }

  // 一阶低通（指数平滑），y[0] = x[0]
  function lowPass(vals, alpha) {
    const n = vals.length;
    const out = new Array(n);
    let y = NaN;
    for (let i = 0; i < n; i++) {
      y = i === 0 ? vals[0] : alpha * vals[i] + (1 - alpha) * y;
      out[i] = y;
    }
    return out;
  }

  /* ---------------- 处理前后对比统计 ---------------- */

  // 与智能分析一致的离群点判定（MAD 稳健 z 分数）
  function outlierCount(vals) {
    const n = vals.length;
    if (n < 8) return 0;
    const md = mad(vals);
    if (!(md > 0)) return 0;
    const med = median(vals);
    let c = 0;
    for (const x of vals) {
      const mz = 0.6745 * (x - med) / md;
      if (Math.abs(mz) > 3.5 || Math.abs(x - med) > 4 * md) c++;
    }
    return c;
  }

  function seriesStats(vals) {
    if (!vals.length) return null;
    return {
      n: vals.length,
      std: std(vals),
      range: Math.max(...vals) - Math.min(...vals),
      outliers: outlierCount(vals)
    };
  }

  /* ---------------- 对外 ---------------- */

  return {
    movingAverage,
    medianFilter,
    lowPass,
    seriesStats,
    outlierCount
  };
})();
