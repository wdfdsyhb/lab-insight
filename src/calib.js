/* =========================================================
   calib.js — 传感器校准换算（纯本地计算，无外部依赖）
   1. NTC 热敏电阻 → 温度：B 值式 / Steinhart-Hart
   2. ADC 原始读数 → 电压（含可选分压系数）
   3. MQ 系列气体传感器：Rs/R₀ 比值 + log-log 拟合 ppm 近似
   每个换算都提供「公式文本」用于页面追溯。
   ========================================================= */

const LabCalib = (() => {

  /* ---------------- NTC 热敏电阻 ---------------- */

  // B 值式：1/T = 1/T₀ + ln(R/R₀)/B，返回摄氏温度
  function ntcTempB(R, B, R0, T0) {
    if (!isFinite(R) || R <= 0 || !isFinite(B) || B === 0 ||
        !isFinite(R0) || R0 <= 0 || !isFinite(T0) || T0 <= 0) return NaN;
    const invT = 1 / T0 + Math.log(R / R0) / B;
    if (invT <= 0) return NaN;
    return 1 / invT - 273.15;
  }

  // Steinhart-Hart：1/T = A + B·ln(R) + C·(ln R)³，返回摄氏温度
  function ntcTempSH(R, A, B, C) {
    if (!isFinite(R) || R <= 0) return NaN;
    const lnR = Math.log(R);
    const invT = A + B * lnR + C * lnR * lnR * lnR;
    if (!isFinite(invT) || invT <= 0) return NaN;
    return 1 / invT - 273.15;
  }

  /* ---------------- ADC → 电压 ---------------- */

  // U = ADC / (2^bits − 1) × Vref × k（k 为分压还原系数，默认 1）
  function adcVoltage(adc, bits, vref, k) {
    if (!isFinite(adc) || !isFinite(bits) || bits <= 0 || !isFinite(vref)) return NaN;
    const kk = isFinite(k) ? k : 1;
    const full = Math.pow(2, bits) - 1;
    if (full <= 0) return NaN;
    return adc / full * vref * kk;
  }

  /* ---------------- MQ 系列气体传感器 ---------------- */

  const MQ_PRESETS = {
    mq2:  { label: 'MQ-2（烟雾 / LPG 段）', a: 1081.8, b: -2.51 },
    mq135: { label: 'MQ-135（CO₂ 段）', a: 116.6, b: -2.769 },
    custom: { label: '自定义拟合', a: 1000, b: -2.5 }
  };

  function mqRatio(Rs, R0) {
    if (!isFinite(Rs) || !isFinite(R0) || R0 <= 0) return NaN;
    return Rs / R0;
  }

  // ppm ≈ a × ratio^b（数据手册典型 log-log 拟合，近似值）
  function mqPpm(ratio, a, b) {
    if (!isFinite(ratio) || ratio <= 0 || !isFinite(a) || a <= 0 || !isFinite(b)) return NaN;
    return a * Math.pow(ratio, b);
  }

  /* ---------------- 公式文本（页面追溯用） ---------------- */

  function fmtNum(v, d = 4) {
    if (!isFinite(v)) return '—';
    return String(parseFloat(v.toFixed(d)));
  }

  function ntcFormulaB(B, R0, T0) {
    return `1/T = 1/T₀ + ln(R/R₀)/B；T(°C) = T(K) − 273.15` +
      `　[当前参数 B = ${fmtNum(B, 1)} K，R₀ = ${fmtNum(R0, 1)} Ω，T₀ = ${fmtNum(T0, 2)} K（25°C）]`;
  }

  function ntcFormulaSH(A, B, C) {
    return `1/T = A + B·ln(R) + C·(ln R)³　[当前参数 A = ${A}，B = ${B}，C = ${C}]`;
  }

  function adcFormula(bits, vref, k) {
    return `U = ADC / (2^bits − 1) × Vref × k　[当前参数 bits = ${fmtNum(bits, 0)} 位（满量程 ${fmtNum(Math.pow(2, bits) - 1, 0)}），Vref = ${fmtNum(vref, 3)} V，分压系数 k = ${fmtNum(k, 3)}]`;
  }

  function mqFormula(sensor, a, b) {
    const label = (MQ_PRESETS[sensor] || MQ_PRESETS.custom).label;
    return `ratio = Rs / R₀；ppm ≈ a × ratio^b（log-log 拟合近似值）　[当前 ${label}：a = ${fmtNum(a, 2)}，b = ${fmtNum(b, 3)}，R₀ = 输入值]`;
  }

  /* ---------------- 对外 ---------------- */

  return {
    ntcTempB,
    ntcTempSH,
    adcVoltage,
    mqRatio,
    mqPpm,
    MQ_PRESETS,
    ntcFormulaB,
    ntcFormulaSH,
    adcFormula,
    mqFormula,
    fmtNum
  };
})();
