/* =========================================================
   modelid.js — 传感器模型自动辨识（v4.0，纯本地无依赖）
   给定任意「输入列 → 输出列」数据，在 7 种候选模型里自动竞选：
     线性 / 二次 / 三次 / 指数 / 对数 / 幂函数 / 倒数
   · 每个模型先做变量变换转线性回归（或正规方程多项式拟合），
     再把预测值反变换回原始空间，按**原始 y** 计算 R² 与修正 R²
     （避免"变换域 R² 虚高"的经典陷阱）
   · 修正 R² = 1 − (1−R²)(n−1)/(n−p−1)，参数越多的模型自动受罚
   · 输出按修正 R² 排序的候选表 + 最优模型推荐 + 对应 C 代码
   ========================================================= */

const LabModelID = (() => {

  /* ---------- 基础最小二乘 ---------- */

  // 一元线性回归 y = k·x + b
  function linregXY(xs, ys) {
    const n = xs.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i];
      sxx += xs[i] * xs[i]; syy += ys[i] * ys[i];
    }
    const den = n * sxx - sx * sx;
    if (!isFinite(den) || den === 0) return null;
    const k = (n * sxy - sx * sy) / den;
    const b = (sy - k * sx) / n;
    return { k: k, b: b, n: n };
  }

  // 多项式最小二乘（正规方程 + 高斯消元，deg ≤ 3 的 4×4 手写即可）
  function polyfit(xs, ys, deg) {
    const n = xs.length, m = deg + 1;
    const powX = xs.map(x => {
      const p = [1];
      for (let d = 1; d <= deg; d++) p.push(p[d - 1] * x);
      return p;
    });
    const A = [], bv = [];
    for (let r = 0; r < m; r++) {
      A.push(new Array(m + 1).fill(0));
      bv.push(0);
    }
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += powX[i][r] * powX[i][c];
        A[r][c] = s;
      }
      let s2 = 0;
      for (let i = 0; i < n; i++) s2 += powX[i][r] * ys[i];
      bv[r] = s2;
    }
    // 高斯消元（部分主元）
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      if (piv !== c) { const t = A[piv]; A[piv] = A[c]; A[c] = t; const tb = bv[piv]; bv[piv] = bv[c]; bv[c] = tb; }
      for (let r = c + 1; r < m; r++) {
        const f = A[r][c] / A[c][c];
        for (let cc = c; cc <= m; cc++) A[r][cc] -= f * A[c][cc];
        bv[r] -= f * bv[c];
      }
    }
    const coef = new Array(m).fill(0);
    for (let r = m - 1; r >= 0; r--) {
      let s = bv[r];
      for (let c = r + 1; c < m; c++) s -= A[r][c] * coef[c];
      coef[r] = s / A[r][r];
      if (!isFinite(coef[r])) return null;
    }
    return coef;
  }

  /* ---------- 候选模型定义 ----------
     fit(xs,ys) 返回 { params, predict(x) } 或 null（不适用）
     params 用于展示与 C 代码生成 */
  const MODELS = [
    {
      id: 'linear', name: '线性', p: 2, needPositiveX: false, needPositiveY: false,
      formula: 'y = a·x + b',
      fit: (xs, ys) => {
        const r = linregXY(xs, ys);
        if (!r) return null;
        return { params: { a: r.k, b: r.b }, predict: x => r.k * x + r.b };
      }
    },
    {
      id: 'poly2', name: '二次多项式', p: 3, needPositiveX: false, needPositiveY: false,
      formula: 'y = a·x² + b·x + c',
      fit: (xs, ys) => {
        const c = polyfit(xs, ys, 2);
        if (!c) return null;
        return { params: { a: c[2], b: c[1], c: c[0] }, predict: x => c[0] + c[1] * x + c[2] * x * x };
      }
    },
    {
      id: 'poly3', name: '三次多项式', p: 4, needPositiveX: false, needPositiveY: false,
      formula: 'y = a·x³ + b·x² + c·x + d',
      fit: (xs, ys) => {
        const c = polyfit(xs, ys, 3);
        if (!c) return null;
        return { params: { a: c[3], b: c[2], c: c[1], d: c[0] },
          predict: x => c[0] + c[1] * x + c[2] * x * x + c[3] * x * x * x };
      }
    },
    {
      id: 'exp', name: '指数', p: 2, needPositiveX: false, needPositiveY: true,
      formula: 'y = a·e^(b·x)',
      fit: (xs, ys) => {
        if (ys.some(y => y <= 0)) return null;
        const r = linregXY(xs, ys.map(y => Math.log(y)));
        if (!r) return null;
        const a = Math.exp(r.b);
        return { params: { a: a, b: r.k }, predict: x => a * Math.exp(r.k * x) };
      }
    },
    {
      id: 'log', name: '对数', p: 2, needPositiveX: true, needPositiveY: false,
      formula: 'y = a·ln(x) + b',
      fit: (xs, ys) => {
        if (xs.some(x => x <= 0)) return null;
        const lx = xs.map(x => Math.log(x));
        const r = linregXY(lx, ys);
        if (!r) return null;
        return { params: { a: r.k, b: r.b }, predict: x => r.k * Math.log(x) + r.b };
      }
    },
    {
      id: 'power', name: '幂函数', p: 2, needPositiveX: true, needPositiveY: true,
      formula: 'y = a·x^b',
      fit: (xs, ys) => {
        if (xs.some(x => x <= 0) || ys.some(y => y <= 0)) return null;
        const r = linregXY(xs.map(x => Math.log(x)), ys.map(y => Math.log(y)));
        if (!r) return null;
        const a = Math.exp(r.b);
        return { params: { a: a, b: r.k }, predict: x => a * Math.pow(x, r.k) };
      }
    },
    {
      id: 'recip', name: '倒数', p: 2, needPositiveX: false, needPositiveY: false,
      formula: 'y = a/x + b',
      fit: (xs, ys) => {
        if (xs.some(x => x === 0)) return null;
        const r = linregXY(xs.map(x => 1 / x), ys);
        if (!r) return null;
        return { params: { a: r.k, b: r.b }, predict: x => r.k / x + r.b };
      }
    }
  ];

  /* ---------- R² / 修正 R²（原始 y 空间） ---------- */

  function r2Of(ys, preds) {
    const n = ys.length;
    let mean = 0;
    for (const y of ys) mean += y;
    mean /= n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      ssTot += (ys[i] - mean) * (ys[i] - mean);
      ssRes += (ys[i] - preds[i]) * (ys[i] - preds[i]);
    }
    if (!(ssTot > 0)) return 0;
    return Math.max(0, 1 - ssRes / ssTot);
  }

  /* ---------- 主入口：identify(xs, ys) ----------
     xs/ys 等长有效对（调用前过滤脏值）。返回：
     { best, list: [{id,name,formula,params,r2,adjR2,maxRes,maxResX,predict}] }
     best 为 null 表示样本不足 */
  function identify(xs, ys) {
    const n = xs.length;
    if (n < 5) return { best: null, list: [], reason: '有效样本不足 5 对，无法辨识' };
    const list = [];
    for (const m of MODELS) {
      if (m.needPositiveX && xs.some(x => x <= 0)) continue;
      if (m.needPositiveY && ys.some(y => y <= 0)) continue;
      let fitRes;
      try { fitRes = m.fit(xs, ys); } catch (e) { fitRes = null; }
      if (!fitRes) continue;
      const preds = xs.map(x => fitRes.predict(x));
      if (preds.some(v => !isFinite(v))) continue;
      const r2 = r2Of(ys, preds);
      const adj = 1 - (1 - r2) * (n - 1) / (n - m.p - 1);
      let maxRes = 0, maxResX = xs[0];
      for (let i = 0; i < n; i++) {
        const res = Math.abs(ys[i] - preds[i]);
        if (res > maxRes) { maxRes = res; maxResX = xs[i]; }
      }
      list.push({
        id: m.id, name: m.name, formula: m.formula, params: fitRes.params,
        r2: r2, adjR2: adj, maxRes: maxRes, maxResX: maxResX, predict: fitRes.predict
      });
    }
    if (!list.length) return { best: null, list: [], reason: '所有候选模型都不适用于该数据（正负号 / 零值约束）' };
    list.sort((a, b) => b.adjR2 - a.adjR2);
    return { best: list[0], list: list, reason: null };
  }

  /* ---------- 最优模型 → C 代码 ---------- */

  function fmt(v) {
    if (!isFinite(v)) return '0.0f';
    const s = Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(6) : parseFloat(v.toFixed(8)).toString();
    return /e/i.test(s) ? s.replace('e', 'e') + 'f' : s + 'f';
  }

  function cCode(model, srcName, dstName) {
    const P = model.params, f = fmt;
    let body;
    switch (model.id) {
      case 'linear': body = `return ${f(P.a)} * x + ${f(P.b)};`; break;
      case 'poly2': body = `return ${f(P.a)} * x * x + ${f(P.b)} * x + ${f(P.c)};`; break;
      case 'poly3': body = `return ${f(P.a)} * x * x * x + ${f(P.b)} * x * x + ${f(P.c)} * x + ${f(P.d)};`; break;
      case 'exp': body = `return ${f(P.a)} * expf(${f(P.b)} * x);`; break;
      case 'log': body = `if (x <= 0.0f) return 0.0f; return ${f(P.a)} * logf(x) + ${f(P.b)};`; break;
      case 'power': body = `if (x <= 0.0f) return 0.0f; return ${f(P.a)} * powf(x, ${f(P.b)});`; break;
      case 'recip': body = `if (x == 0.0f) return 0.0f; return ${f(P.a)} / x + ${f(P.b)};`; break;
      default: body = 'return x;';
    }
    return `/* 由 LabInsight 模型自动辨识生成 · ${model.name}模型 · 修正 R² = ${model.adjR2.toFixed(4)} */\n` +
      `float ${dstName || 'sensor_convert'}(float x) /* x: ${srcName || 'raw'} */\n{\n    ${body}\n}\n`;
  }

  return { identify: identify, cCode: cCode, MODELS: MODELS };
})();
