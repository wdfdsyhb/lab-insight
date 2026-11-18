/* =========================================================
   fit.js — 线性拟合与多项式换算（纯本地计算，无外部依赖）
   1. 最小二乘线性拟合 y = k·x + b（附 R² 判定系数）
   2. 多项式求值 y = c0 + c1·x + c2·x²（一阶 / 二阶换算）
   ========================================================= */

const LabFit = (() => {

  /* ---------------- 线性拟合（最小二乘） ---------------- */

  // xs/ys 等长且 ≥2；返回 { k, b, r2, n } 或 null（x 全相同时无法拟合）
  // k = (nΣxy − ΣxΣy) / (nΣx² − (Σx)²)；b = (Σy − kΣx)/n
  // R² 用相关系数平方：(nΣxy−ΣxΣy)² / ((nΣx²−(Σx)²)(nΣy²−(Σy)²))
  function linreg(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      if (!isFinite(x) || !isFinite(y)) return null;
      sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
    }
    const denX = n * sxx - sx * sx;
    if (!isFinite(denX) || denX === 0) return null; // X 全相同，无法拟合
    const cov = n * sxy - sx * sy;
    const k = cov / denX;
    const b = (sy - k * sx) / n;
    const denY = n * syy - sy * sy;
    const r2 = denY === 0 ? 1 : Math.max(0, Math.min(1, (cov * cov) / (denX * denY)));
    return { k, b, r2, n };
  }

  // 系数 → 带符号文本；系数负数显示 (−0.5)（乘在变量前需括号）
  function fmtTerm(v, d = 6) {
    const s = parseFloat(v.toFixed(d));
    return s < 0 ? `(${s})` : String(s);
  }

  function linText(k, b) {
    const bt = b < 0 ? '− ' + fmtTerm(-b) : '+ ' + fmtTerm(b);
    return `y = ${fmtTerm(k)}·x ${bt}`;
  }

  function r2Label(r2) {
    if (r2 >= 0.99) return '线性关系显著，拟合质量高';
    if (r2 >= 0.95) return '拟合较好';
    if (r2 >= 0.9) return '存在一定非线性或噪声，建议检查传感器线性度';
    return '线性关系较弱，可能需要分段拟合或换用非线性模型';
  }

  /* ---------------- 多项式求值 ---------------- */

  // coefs = [c0, c1, c2] → c0 + c1·x + c2·x²（缺省项为 0）
  function polyApply(x, coefs) {
    if (!isFinite(x)) return NaN;
    const c0 = coefs[0] || 0, c1 = coefs[1] || 0, c2 = coefs[2] || 0;
    return c0 + c1 * x + c2 * x * x;
  }

  // coefs = [c0, c1, c2] → 公式文本（0 项跳过；全 0 显示 y = 0）
  function polyText(coefs, varName = 'x') {
    const c0 = coefs[0] || 0, c1 = coefs[1] || 0, c2 = coefs[2] || 0;
    const parts = [];
    if (c2) parts.push(c2 > 0 ? `${fmtTerm(c2)}·${varName}²` : `(−${fmtTerm(-c2)})·${varName}²`);
    if (c1) parts.push(c1 > 0 ? `${fmtTerm(c1)}·${varName}` : `(−${fmtTerm(-c1)})·${varName}`);
    if (c0 || !parts.length) parts.push(c0 < 0 ? `(−${fmtTerm(-c0)})` : fmtTerm(c0));
    return 'y = ' + parts.join(' + ');
  }

  /* ---------------- 对外 ---------------- */

  return { linreg, linText, r2Label, polyApply, polyText };
})();
