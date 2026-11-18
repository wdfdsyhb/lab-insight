/* =========================================================
   serial.js — Web Serial 实时采集（浏览器直连开发板）
   1. 真实串口：requestPort 授权 → 读流 → 按行回调
   2. 模拟模式：软件定时生成带毛刺的数据流（无硬件演示用）
   两种模式都通过同一个 onLine(line) 回调喂数据，
   由 app.js 统一收集并喂给解析引擎。
   注意：Web Serial 需 Chrome / Edge 桌面版；file:// 与
   HTTPS 均为安全上下文，本地双击打开即可使用。
   ========================================================= */

const LabSerial = (() => {

  let port = null;
  let reader = null;
  let writer = null;
  let keepReading = false;
  let simTimer = null;
  let simT0 = 0;
  let simCount = 0;

  function supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /* ---------------- 真实串口 ---------------- */

  // onLine(line) 每收到一行回调；onEnd(err) 结束回调（err 非空表示异常断开）
  // 返回 true = 已开始；false = 用户取消授权或打开失败
  async function startReal(baudRate, onLine, onEnd) {
    if (!supported()) { onEnd(new Error('当前浏览器不支持 Web Serial')); return false; }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: parseInt(baudRate, 10) || 9600 });
    } catch (e) {
      // 尚未开始采集（授权取消 / 端口打开失败）：不走 onEnd（其语义是「采集结束」，
      // 此刻 running 仍为 false 会被 app.js 早退），由调用方按返回值 false 统一提示
      port = null;
      return false;
    }
    keepReading = true;
    // 读循环单独异步跑，异常通过 onEnd 通知
    readLoop(onLine, onEnd);
    return true;
  }

  async function readLoop(onLine, onEnd) {
    const decoder = new TextDecoder();
    let buf = '';
    let closed = false;
    try {
      while (port && port.readable && keepReading) {
        reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done || !keepReading) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.search(/[\r\n]/)) >= 0) {
              const line = buf.slice(0, idx);
              buf = buf.slice(idx + 1);
              if (line.trim()) onLine(line);
            }
          }
        } catch (e) {
          // 设备拔出 / 流错误 → 跳出，走 onEnd
          closed = true;
          buf = '';
        } finally {
          try { reader.releaseLock(); } catch (e2) { /* 已释放 */ }
          reader = null;
        }
        if (closed) break;
      }
    } finally {
      const tail = buf.trim();
      buf = '';
      if (tail) onLine(tail);
      const err = closed ? new Error('串口连接断开（设备可能已拔出）') : null;
      if (keepReading === false) { /* 用户主动停止，静默 */ }
      keepReading = false;
      try { if (writer) { await writer.releaseLock(); } } catch (e4) { /* 忽略 */ }
      writer = null;
      try { if (port) await port.close(); } catch (e3) { /* 关闭失败忽略 */ }
      port = null;
      onEnd(err);
    }
  }

  // 发送指令到串口（仅真实串口；模拟模式返回 false）
  async function send(text) {
    if (!port || !port.writable) return false;
    try {
      if (!writer) writer = port.writable.getWriter();
      await writer.write(new TextEncoder().encode(text));
      return true;
    } catch (e) {
      try { if (writer) { writer.releaseLock(); } } catch (e2) { /* 忽略 */ }
      writer = null;
      return false;
    }
  }

  async function stop() {
    keepReading = false;
    try { if (reader) await reader.cancel(); } catch (e) { /* 忽略 */ }
    stopSim();
  }

  /* ---------------- 模拟串口 ---------------- */

  // 软件生成一行串口数据（带正弦缓变 + 噪声 + 偶发毛刺），走同一个 onLine 通道
  function simLine() {
    const t = (Date.now() - simT0) / 1000;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    simCount++;
    const noise = () => (Math.random() - 0.5) * 0.2;
    let temp = 25 + 1.5 * Math.sin(t / 10) + noise();
    if (simCount % 30 === 17) temp += 6; // 每 30 行左右埋一个毛刺
    const humi = 62 + 0.8 * Math.sin(t / 7) + (Math.random() - 0.5) * 0.3;
    const press = 1013 + 0.4 * Math.sin(t / 15) + (Math.random() - 0.5) * 0.15;
    return `${hh}:${mi}:${ss}.${ms} temp=${temp.toFixed(2)} humi=${humi.toFixed(2)} press=${press.toFixed(1)}`;
  }

  function startSim(onLine, intervalMs = 60) {
    stopSim();
    simT0 = Date.now();
    simCount = 0;
    onLine(simLine());
    simTimer = setInterval(() => onLine(simLine()), intervalMs);
  }

  function stopSim() {
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
  }

  function simRunning() { return !!simTimer; }

  /* ---------------- 对外 ---------------- */

  return { supported, startReal, stop, send, startSim, stopSim, simRunning };
})();
