/* =========================================================
   fft.js — 频域分析（纯本地实现，无外部依赖）
   自实现迭代式基-2 Cooley-Tukey FFT（位反转 + 蝶形运算），
   数据点不足 2 的幂时零填充到最近的 2 的幂。
   输出单边幅度谱：A₀ = |X₀|/N；A_k = 2|X_k|/N（0<k<N/2）；
   A_{N/2} = |X_{N/2}|/N。
   变换前先扣除均值（直流分量），避免大直流偏置经零填充
   泄漏到低频 bin 淹没真实谱峰；直流分量（均值）单独放
   在 0 Hz 处展示，不参与主频判定。
   ========================================================= */

const LabFFT = (() => {

  function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  // 就地迭代式基-2 FFT，re/im 长度须为 2 的幂
  function fft(re, im) {
    const n = re.length;
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT 长度须为 2 的幂');

    // 位反转重排
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j |= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }

    // 蝶形
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const halfLen = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < halfLen; k++) {
          const a = i + k, b = a + halfLen;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  /* ---------------- 幅度谱 ---------------- */

  function amplitudeSpectrum(vals, rate) {
    const n = vals.length;
    if (n < 4) return null;
    const nfft = nextPow2(n);
    const re = new Array(nfft).fill(0);
    const im = new Array(nfft).fill(0);
    // 扣除均值后再变换，消除直流零填充泄漏；均值单独作为 0 Hz 直流分量展示
    const dc = vals.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) re[i] = vals[i] - dc;
    fft(re, im);

    const half = nfft >> 1;
    const freqs = new Array(half + 1);
    const amps = new Array(half + 1);
    // 幅值按实际样本数 n 折算（零填充不稀释幅值）：A_k≈对应正弦分量幅值
    for (let k = 0; k <= half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      amps[k] = (k === 0 || k === half) ? mag / n : 2 * mag / n;
      freqs[k] = k * rate / nfft;
    }
    amps[0] = dc;
    return { freqs, amps, n, nfft, rate, dc };
  }

  /* ---------------- 峰值检测 ---------------- */

  // 局部极大值且幅值 ≥ 最大幅值 5%，按幅值取前 count 个（相邻 2 bin 内去重保留较大者）
  function findPeaks(freqs, amps, count = 3) {
    const half = freqs.length - 1;
    const maxAmp = Math.max(...amps.slice(1, half), 0);
    if (maxAmp <= 0) return [];
    const cand = [];
    for (let k = 1; k < half; k++) {
      if (amps[k] > amps[k - 1] && amps[k] >= amps[k + 1] && amps[k] >= maxAmp * 0.05) {
        cand.push(k);
      }
    }
    cand.sort((a, b) => amps[b] - amps[a]);
    const picked = [];
    for (const k of cand) {
      if (picked.every(p => Math.abs(p.k - k) > 2)) {
        picked.push({ k, f: freqs[k], a: amps[k] });
      }
      if (picked.length >= count) break;
    }
    return picked;
  }

  // 50 Hz 附近（±1.5 Hz）最大幅值是否达到全谱最大幅值的 10% → 疑似工频干扰
  function mainsHum(freqs, amps) {
    const half = freqs.length - 1;
    let worst = null;
    for (let k = 1; k <= half; k++) {
      if (freqs[k] >= 48.5 && freqs[k] <= 51.5) {
        if (!worst || amps[k] > worst.a) worst = { f: freqs[k], a: amps[k] };
      }
    }
    if (!worst) return null;
    const maxAmp = Math.max(...amps.slice(1), 0); // 直流分量不参与比较
    if (maxAmp <= 0 || worst.a < maxAmp * 0.1) return null;
    return worst;
  }

  return { amplitudeSpectrum, findPeaks, mainsHum, nextPow2 };
})();
