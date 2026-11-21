/* LabInsight · SPC 控制图（v3.0）
 * Xbar-R 控制图：把一串测量值按固定子组大小 n 切成若干组，
 * 对「子组均值 Xbar」和「子组极差 R」分别画控制图，控制限按 3σ 口径用
 * 常规 SPC 系数（A2 / D3 / D4）计算：
 *   Xbar 图：CL = X̿（子组均值的均值），UCL/LCL = X̿ ± A2·R̄
 *   R    图：CL = R̄（子组极差的均值），UCL = D4·R̄，LCL = D3·R̄
 * 系数取自 GB/T 4091 / ISO 7870 中「子组大小 n = 2…10」的常用表。
 * 不依赖外部库，纯本地计算。
 */
(function (global) {
  'use strict';

  // n → { A2, D3, D4 }（n = 2…10）
  const CONST = {
    2:  { A2: 1.880, D3: 0.000, D4: 3.267 },
    3:  { A2: 1.023, D3: 0.000, D4: 2.574 },
    4:  { A2: 0.729, D3: 0.000, D4: 2.282 },
    5:  { A2: 0.577, D3: 0.000, D4: 2.114 },
    6:  { A2: 0.483, D3: 0.000, D4: 2.004 },
    7:  { A2: 0.419, D3: 0.076, D4: 1.924 },
    8:  { A2: 0.373, D3: 0.136, D4: 1.864 },
    9:  { A2: 0.337, D3: 0.184, D4: 1.816 },
    10: { A2: 0.308, D3: 0.223, D4: 1.777 }
  };

  const SUPPORTED = Object.keys(CONST).map(Number);

  function constants(n) {
    return CONST[n] || null;
  }

  /* 把 values 按顺序切成大小 n 的子组；末尾不足 n 的一组丢弃（并在结果里说明丢弃几个点）
   * 返回 { n, groups:[{idx, from, to, mean, range, vals}], used, dropped } */
  function subgroup(values, n) {
    const size = Math.max(2, Math.min(10, Math.floor(n) || 5));
    const groups = [];
    const total = values.length;
    const full = Math.floor(total / size) * size;
    for (let i = 0; i + size <= full; i += size) {
      const vals = values.slice(i, i + size);
      let sum = 0, mn = Infinity, mx = -Infinity;
      for (const v of vals) { sum += v; if (v < mn) mn = v; if (v > mx) mx = v; }
      groups.push({
        idx: groups.length + 1,
        from: i,
        to: i + size - 1,
        mean: sum / size,
        range: mx - mn,
        vals
      });
    }
    return { n: size, groups, used: full, dropped: total - full };
  }

  /* 计算 Xbar-R 控制图。
   * values: 已过滤的有效数值数组（按采样顺序）
   * n: 子组大小 2…10
   * 返回 null 表示样本不足；否则返回
   * { n, k, groups, xbar, rbar, xCL, xUCL, xLCL, rCL, rUCL, rLCL, coef,
   *   xOut:[组序号], rOut:[组序号], outCount, used, dropped } */
  function compute(values, n) {
    const size = Math.max(2, Math.min(10, Math.floor(n) || 5));
    const coef = constants(size);
    if (!coef) return null;
    const sg = subgroup(values, size);
    if (sg.groups.length < 2) return null; // 至少 2 个子组才有控制限意义

    let sumMean = 0, sumRange = 0;
    for (const g of sg.groups) { sumMean += g.mean; sumRange += g.range; }
    const k = sg.groups.length;
    const xbar = sumMean / k;   // X̿
    const rbar = sumRange / k;  // R̄

    const xUCL = xbar + coef.A2 * rbar;
    const xLCL = xbar - coef.A2 * rbar;
    const rUCL = coef.D4 * rbar;
    const rLCL = coef.D3 * rbar;

    const xOut = [], rOut = [];
    sg.groups.forEach(g => {
      if (g.mean > xUCL || g.mean < xLCL) xOut.push(g.idx);
      if (g.range > rUCL || g.range < rLCL) rOut.push(g.idx);
    });

    return {
      n: size,
      k,
      groups: sg.groups,
      xbar,
      rbar,
      xCL: xbar,
      xUCL,
      xLCL,
      rCL: rbar,
      rUCL,
      rLCL,
      coef,
      xOut,
      rOut,
      outCount: xOut.length + rOut.length,
      used: sg.used,
      dropped: sg.dropped
    };
  }

  /* 判定提示：给报告/页面用的一句话 */
  function verdict(res) {
    if (!res) return '样本不足，无法绘制控制图（至少需要 2 个子组，即 n×2 个有效数据点）。';
    const parts = [];
    if (res.xOut.length === 0 && res.rOut.length === 0) {
      parts.push(`全部 ${res.k} 个子组均落在控制限内，过程处于统计受控状态，未发现异常波动。`);
    } else {
      if (res.xOut.length) parts.push(`均值图有 ${res.xOut.length} 个子组越界（第 ${res.xOut.join('、')} 组），提示过程中心发生了偏移。`);
      if (res.rOut.length) parts.push(`极差图有 ${res.rOut.length} 个子组越界（第 ${res.rOut.join('、')} 组），提示过程波动变大，需检查测量或环境条件。`);
      if (res.xOut.length && !res.rOut.length) parts.push('极差图正常而均值图越界，通常是设定值或传感器零点漂移，波动本身没有变大。');
      if (res.rOut.length && !res.xOut.length) parts.push('均值图正常而极差图越界，通常是随机干扰增大（接触不良、噪声、供电波动）。');
    }
    if (res.dropped > 0) parts.push(`末尾 ${res.dropped} 个数据点不足一个子组，未参与计算。`);
    return parts.join('');
  }

  global.LabSPC = { constants, subgroup, compute, verdict, SUPPORTED, CONST };
})(window);
