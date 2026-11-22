/* =========================================================
   sim.js — 电路仿真引擎（v4.2 方案 X：引脚级仿真 + 分析闭环）
   ========================================================= */

const LabSim = (() => {

  /* ================= 元件注册表 ================= */

  const PARTS = {
    'board-esp32-devkit-c-v4': {
      label: 'ESP32 DevKit-C', w: 170, h: 120, cat: 'mcu',
      attrs: {},
      pins: buildEsp32Pins()
    },
    'wokwi-led': {
      label: 'LED', w: 46, h: 52, cat: 'out',
      attrs: { color: 'red' },
      pins: { A: { x: 12, y: 46 }, C: { x: 34, y: 46 } }
    },
    'wokwi-resistor': {
      label: '电阻', w: 74, h: 18, cat: 'passive',
      attrs: { value: '220' },
      pins: { '1': { x: 4, y: 9 }, '2': { x: 70, y: 9 } }
    },
    'wokwi-pushbutton': {
      label: '按钮', w: 58, h: 46, cat: 'in',
      attrs: {},
      pins: { '1.l': { x: 8, y: 12 }, '1.r': { x: 50, y: 12 }, '2.l': { x: 8, y: 34 }, '2.r': { x: 50, y: 34 } }
    },
    'wokwi-potentiometer': {
      label: '电位器', w: 62, h: 56, cat: 'in',
      attrs: { value: '50' },
      pins: { VCC: { x: 8, y: 8 }, GND: { x: 54, y: 8 }, SIG: { x: 31, y: 52 } }
    },
    'wokwi-7segment': {
      label: '数码管(1位)', w: 76, h: 96, cat: 'out',
      attrs: {},
      pins: {
        A: { x: 10, y: 92 }, B: { x: 20, y: 92 }, C: { x: 30, y: 92 },
        D: { x: 40, y: 92 }, E: { x: 50, y: 92 }, F: { x: 60, y: 92 },
        G: { x: 70, y: 92 }, 'COM.1': { x: 68, y: 4 }
      }
    },
    'wokwi-lcd1602': {
      label: 'LCD1602（I2C 占位）', w: 150, h: 76, cat: 'out',
      attrs: {},
      pins: { GND: { x: 10, y: 72 }, VCC: { x: 20, y: 72 }, SDA: { x: 30, y: 72 }, SCL: { x: 40, y: 72 } }
    },
    'wokwi-buzzer': {
      label: '蜂鸣器', w: 48, h: 48, cat: 'out',
      attrs: {},
      pins: { '1': { x: 12, y: 44 }, '2': { x: 36, y: 44 } }
    },
    'wokwi-slide-switch': {
      label: '拨动开关', w: 62, h: 28, cat: 'in',
      attrs: {},
      pins: { '1': { x: 6, y: 20 }, '2': { x: 31, y: 20 }, '3': { x: 56, y: 20 } }
    },
    'wokwi-ntc-sensor': {
      label: 'NTC 温度源', w: 60, h: 56, cat: 'sensor',
      attrs: { temp: '25' },
      pins: { '1': { x: 12, y: 52 }, '2': { x: 48, y: 52 } }
    }
  };

  function buildEsp32Pins() {
    const pins = {};
    const L = ['3V3', 'GND.1', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'];
    const R = ['VIN', 'GND.2', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN'];
    L.forEach((name, i) => { pins[name] = { x: 6, y: 16 + i * 6.6 }; });
    R.forEach((name, i) => { pins[name] = { x: 164, y: 16 + i * 6.6 }; });
    return pins;
  }

  const PIN_COLORS = { GND: '#111827', '3V3': '#f59e0b', VIN: '#f59e0b' };

  /* ================= 电路状态 ================= */

  let st = null;
  let timer = 0;
  let lastTs = 0;
  let netsDirty = true;
  let pyMode = false; // v4.3：Python 脚本模式（applyRules 跳过，逻辑由 Pyodide Worker 驱动）

  function freshState() {
    return {
      parts: {}, order: [], conns: [],
      netOf: null, nets: [], netLevels: [],
      running: false, tick: 0,
      rules: {
        2: { mode: 'toggle', period: 15 },
        4: { mode: 'input-pullup' }
      },
      serial: [], wave: [], watchNets: []
    };
  }

  /* ================= 网络解算 ================= */

  const GND_PAT = /^GND/;
  const VCC_PAT = /^(3V3|VIN|VCC)/;

  function rebuildNets() {
    const parent = new Map();
    const find = k => {
      if (!parent.has(k)) parent.set(k, k);
      while (parent.get(k) !== k) {
        parent.set(k, parent.get(parent.get(k)));
        k = parent.get(k);
      }
      return k;
    };
    for (const c of st.conns) {
      const a = c.from.join(':'), b = c.to.join(':');
      if (parent.get(find(a)) !== find(b)) parent.set(find(a), find(b));
    }
    const nets = [], netOf = new Map();
    for (const k of Array.from(parent.keys())) {
      const r = find(k);
      if (!netOf.has(r)) { netOf.set(r, nets.length); nets.push([]); }
      const idx = netOf.get(r);
      // 每个引脚键都映射到网络号（此前只登记根，非根引脚 get 全部 undefined）
      netOf.set(k, idx);
      nets[idx].push(k);
    }
    st.nets = nets;
    st.netOf = netOf;
  }

  function parseGpio(pin) {
    const m = /^D(\d+)$/.exec(pin);
    return m ? Number(m[1]) : null;
  }

  // 单网络电平：强驱动（GND/3V3/GPIO 输出）> 上拉 > 悬空
  function solveNet(ni) {
    const keys = st.nets[ni] || [];
    let v = null, analog = null;
    const drivers = [];
    for (const k of keys) {
      const cidx = k.indexOf(':');
      const pid = k.slice(0, cidx);
      const pin = k.slice(cidx + 1);
      const p = st.parts[pid];
      if (!p) continue;
      if (GND_PAT.test(pin)) {
        if (v !== 0) { v = 0; drivers.push(pid + ':GND'); }
      } else if (VCC_PAT.test(pin)) {
        if (v !== 1) { v = 1; drivers.push(pid + ':' + pin); }
      } else if (p.type === 'board-esp32-devkit-c-v4') {
        const g = parseGpio(pin);
        if (g === null) continue;
        const out = p.outputs ? p.outputs[g] : undefined;
        if (out !== undefined) {
          if (typeof out === 'number' && out > 0 && out < 1) {
            analog = out;
            drivers.push('GPIO' + g + ' PWM ' + Math.round(out * 100) + '%');
          } else if (v === null) {
            v = out ? 1 : 0;
            drivers.push('GPIO' + g + (out ? ' HIGH' : ' LOW'));
          }
        }
      } else if (p.type === 'wokwi-potentiometer' && pin === 'SIG') {
        // 电位器 SIG：模拟电压 0~1（供 Python 模式 analogRead 与波形记录）
        if (analog === null) analog = (Number(p.attrs.value) || 0) / 100;
      } else if (p.type === 'wokwi-ntc-sensor') {
        // NTC 分压近似：与同网 3V3/GND 组合时输出等效电压比（配合固定电阻）
        // 具体分压在 analogRead 桥计算；这里不做数字驱动
      }
    }
    if (v === null && analog === null) {
      for (const k of keys) {
        const cidx = k.indexOf(':');
        const pid = k.slice(0, cidx);
        const pin = k.slice(cidx + 1);
        const p = st.parts[pid];
        if (p && p.type === 'board-esp32-devkit-c-v4') {
          const g = parseGpio(pin);
          if (g !== null && p.pullUp && p.pullUp[g]) {
            v = 1;
            drivers.push('GPIO' + g + ' 上拉');
            break;
          }
        }
      }
    }
    return { v: v, analog: analog, drivers: drivers, floating: (v === null && analog === null) };
  }

  /* ================= 全局解算 ================= */

  function solveAll() {
    if (netsDirty) { rebuildNets(); netsDirty = false; }
    const netLevels = st.nets.map(function (_, i) { return solveNet(i); });

    // 元件内部导通桥接：电阻/NTC 两脚永久导通；按钮按下导通；拨动开关按位导通。
    // （LED 单向导通，发光判定单独处理，不做电平桥接）
    if (typeof console !== 'undefined' && console.debug) console.debug('[sim] solveAll bridges @tick', st.tick);
    Object.keys(st.parts).forEach(function (id) {
      const p = st.parts[id];
      let bridges = null;
      if (p.type === 'wokwi-resistor' || p.type === 'wokwi-ntc-sensor') {
        bridges = [[[id, '1'], [id, '2']]];
      } else if (p.type === 'wokwi-pushbutton' && p.attrs.pressed) {
        bridges = [[[id, '1.l'], [id, '1.r']], [[id, '2.l'], [id, '2.r']]];
      } else if (p.type === 'wokwi-slide-switch') {
        const pairs = (p.attrs.on === 2) ? [['2.l', '2.r']] : [['1.l', '1.r']];
        bridges = pairs.map(function (pr) { return [[id, pr[0]], [id, pr[1]]]; });
      }
      if (!bridges) return;
      bridges.forEach(function (br) {
        const ka = br[0][0] + ':' + br[0][1];
        const kb = br[1][0] + ':' + br[1][1];
        const na = st.netOf.get(ka), nb = st.netOf.get(kb);
        if (na === undefined || nb === undefined || na === nb) return;
        const lvA = netLevels[na], lvB = netLevels[nb];
        const strong = [lvA, lvB].filter(function (l) { return l.v !== null || l.analog !== null; });
        if (strong.length) {
          const merged = {
            v: strong[0].v, analog: strong[0].analog,
            drivers: strong.reduce(function (acc, l) { return acc.concat(l.drivers || []); }, []),
            floating: false
          };
          netLevels[na] = merged;
          netLevels[nb] = merged;
        }
      });
    });

    // 数码管点亮判定 + NTC 等效电阻
    Object.keys(st.parts).forEach(function (id) {
      const p = st.parts[id];
      if (p.type === 'wokwi-7segment') {
        let com = null;
        const ci = st.netOf.get(id + ':COM.1');
        if (ci !== undefined) com = netLevels[ci].v;
        p.lit = {};
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(function (sg) {
          const ni = st.netOf.get(id + ':' + sg);
          const lv = (ni === undefined) ? { v: null } : netLevels[ni];
          const segHigh = (lv.v === 1);
          p.lit[sg] = (com === 0 && segHigh) || (com === 1 && !segHigh);
        });
      }
      if (p.type === 'wokwi-ntc-sensor') {
        const tempC = Number(p.attrs.temp) || 25;
        p.rOhm = 10000 * Math.exp(3950 * (1 / (tempC + 273.15) - 1 / 298.15));
      }
    });

    st.netLevels = netLevels;
    return netLevels;
  }

  /* ================= MCU 规则引擎（无代码执行面） ================= */

  function applyRules() {
    if (pyMode) return; // v4.3：Python 模式下 MCU 输出由 Pyodide Worker 驱动
    const esp = Object.values(st.parts).find(function (p) {
      return p.type === 'board-esp32-devkit-c-v4';
    });
    if (!esp) return;
    esp.outputs = esp.outputs || {};
    esp.pullUp = esp.pullUp || {};
    Object.keys(st.rules).forEach(function (gStr) {
      const g = Number(gStr);
      const rule = st.rules[gStr];
      if (rule.mode === 'high') {
        esp.outputs[g] = 1;
        delete esp.pullUp[g];
      } else if (rule.mode === 'low') {
        esp.outputs[g] = 0;
        delete esp.pullUp[g];
      } else if (rule.mode === 'toggle') {
        const period = Math.max(2, Number(rule.period) || 15);
        esp.outputs[g] = (Math.floor(st.tick / period) % 2 === 0) ? 1 : 0;
        delete esp.pullUp[g];
      } else if (rule.mode === 'pwm-breath') {
        const period = Math.max(8, Number(rule.period) || 60);
        const phase = (st.tick % period) / period;
        esp.outputs[g] = (phase < 0.5) ? phase * 2 : 2 - phase * 2;
        delete esp.pullUp[g];
      } else if (rule.mode === 'input-pullup') {
        delete esp.outputs[g];
        esp.pullUp[g] = true;
      } else if (rule.mode === 'input') {
        delete esp.outputs[g];
        delete esp.pullUp[g];
      }
    });
  }

  /* ================= 主循环 ================= */

  // 时间基准：逻辑步长 20 ms/步（logEvents 的 [NNNs] 与波形时间戳都按它换算）
  const STEP_MS = 20;
  const MAX_CATCHUP = 6;      // 单次最多补 6 步，避免页面挂起后暴冲

  function start() {
    if (st.running) return;
    st.running = true;
    st.serial = ['-- reset --'];
    st.tick = 0;
    st.wave = [];
    lastTs = Date.now();
    tickLoop();
    timer = setInterval(tickLoop, STEP_MS);
  }

  function stop() {
    st.running = false;
    if (timer) { clearInterval(timer); timer = 0; }
    Object.keys(st.parts).forEach(function (id) {
      const p = st.parts[id];
      if (p.type === 'board-esp32-devkit-c-v4') { p.outputs = {}; p.pullUp = {}; }
    });
  }

  // v4.3 修复：原实现用 requestAnimationFrame 驱动，而浏览器窗口不可见/最小化时
  // rAF 会被节流到 ~1 fps（实测 1.5 s 仅 3 帧，同时 setInterval(20ms) 跑满 80 次），
  // 于是仿真时钟跟着掉到 1 步/秒，看起来像"Python 跑约 10 秒后自己停了"。
  // 改 setInterval 定时器 + 按真实墙钟补步，节流环境下仍保持 20 ms/步的时间基准。
  function tickLoop() {
    if (!st.running) return;
    const now = Date.now();
    let steps = Math.floor((now - lastTs) / STEP_MS);
    if (!isFinite(steps) || steps < 1) steps = 1;
    if (steps > MAX_CATCHUP) steps = MAX_CATCHUP;
    lastTs = now;
    try {
      for (let i = 0; i < steps; i++) {
        st.tick++;
        applyRules();
        solveAll();
        recordWave();
        logEvents();
      }
      if (st.tick % 2 === 0) renderScope();
      renderParts();
    } catch (e) {
      // 运行异常可见化：写进事件日志并停止（file:// 下 window.onerror 看不到细节）
      st.running = false;
      if (timer) { clearInterval(timer); timer = 0; }
      st.serial.push('[运行异常] ' + (e && e.message ? e.message : String(e)));
      renderSerial();
    }
  }

  /* ================= 事件日志 ================= */

  const lastGpioLog = {};
  function logEvents() {
    const esp = Object.values(st.parts).find(function (p) {
      return p.type === 'board-esp32-devkit-c-v4';
    });
    if (!esp || !esp.outputs) return;
    Object.keys(esp.outputs).forEach(function (g) {
      const v = esp.outputs[g];
      if (typeof v === 'number' && v > 0 && v < 1) return;
      if (lastGpioLog[g] === v) return;
      lastGpioLog[g] = v;
      const sec = String(Math.floor(st.tick * 20 / 1000));
      st.serial.push('[' + sec.padStart(3, '0') + 's] GPIO' + g + ' → ' + (v ? 'HIGH' : 'LOW'));
      if (st.serial.length > 300) st.serial.shift();
    });
    renderSerial();
  }

  function renderSerial() {
    const box = document.getElementById('sim-serial');
    if (!box) return;
    box.textContent = st.serial.slice(-200).join('\n') || '（GPIO 电平变化会记录在这里）';
    box.scrollTop = box.scrollHeight;
  }

  // v4.3：Python 模式的 print/status/error 统一写入串口数组（避免被 renderSerial 覆盖）
  function pyPrint(text) {
    st.serial.push(String(text));
    if (st.serial.length > 400) st.serial.splice(0, st.serial.length - 400);
    renderSerial();
  }

  /* ================= 波形 / 示波器 / 导出 ================= */

  const WAVE_MAX = 600;

  function recordWave() {
    const netRec = {};
    st.netLevels.forEach(function (lv, i) {
      if (lv.analog !== null && lv.analog !== undefined) {
        netRec[i] = Math.round(lv.analog * 1000) / 1000;
      } else if (lv.v === 1) netRec[i] = 1;
      else if (lv.v === 0) netRec[i] = 0;
    });
    st.wave.push({ t: st.tick, net: netRec });
    if (st.wave.length > WAVE_MAX) st.wave.shift();
  }

  function renderScope() {
    const cv = document.getElementById('sim-scope');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(200, cv.clientWidth * dpr);
    const H = Math.max(100, cv.clientHeight * dpr);
    cv.width = W;
    cv.height = H;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e293b';
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, H * i / 4);
      ctx.lineTo(W, H * i / 4);
      ctx.stroke();
    }
    const watch = st.watchNets.slice(0, 4);
    const PAL = ['#38bdf8', '#f59e0b', '#34d399', '#f472b6'];
    if (!watch.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Microsoft YaHei"';
      ctx.fillText('右键元件引脚 → 加入示波器', 12, 22);
      return;
    }
    watch.forEach(function (ni, ci) {
      ctx.strokeStyle = PAL[ci % PAL.length];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < st.wave.length; i++) {
        const v = st.wave[i].net[ni];
        const x = i / (WAVE_MAX - 1) * W;
        const y = (v === undefined) ? H : H - (v * 0.85 + 0.05) * H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.font = '12px "Microsoft YaHei"';
    watch.forEach(function (ni, ci) {
      ctx.fillStyle = PAL[ci % PAL.length];
      ctx.fillText('N' + ni + ' ' + (st.nets[ni] || []).slice(0, 2).join(' '), 10 + ci * 210, 16);
    });
  }

  function addWatchByPin(pid, pin) {
    const ni = st.netOf.get(pid + ':' + pin);
    if (ni === undefined) { if (typeof toast === 'function') toast('该引脚未连线', 'warn'); return; }
    if (st.watchNets.indexOf(ni) >= 0) return;
    if (st.watchNets.length >= 4) { if (typeof toast === 'function') toast('示波器最多 4 通道', 'warn'); return; }
    st.watchNets.push(ni);
    renderScope();
  }

  // 核心卖点：波形导出 CSV → 进 LabInsight 分析链路
  function exportToAnalysis() {
    if (!st.wave.length) {
      if (typeof toast === 'function') toast('还没有仿真数据，先运行电路', 'error');
      return;
    }
    let watch = st.watchNets.slice(0, 4);
    if (!watch.length) {
      watch = st.netLevels.map(function (_, i) { return i; })
        .filter(function (i) { return st.wave.some(function (w) { return w.net[i] !== undefined; }); })
        .slice(0, 6);
    }
    if (!watch.length) {
      if (typeof toast === 'function') toast('没有可导出的仿真信号', 'error');
      return;
    }
    const lines = ['时间戳_ms,' + watch.map(function (ni) { return 'ch' + ni; }).join(',')];
    st.wave.forEach(function (w) {
      const row = watch.map(function (ni) {
        return (w.net[ni] === undefined) ? '' : w.net[ni];
      });
      lines.push(Math.round(w.t * 20) + ',' + row.join(','));
    });
    const text = lines.join('\n');
    if (typeof state !== 'undefined' && typeof doParse === 'function') {
      state.pending = { text: text, fileName: '电路仿真波形导出', sourceType: 'csv' };
      state.pendingNote = '电路仿真波形';
      doParse();
      if (typeof switchTab === 'function') switchTab('preview');
      if (typeof toast === 'function') {
        toast('仿真波形已导出到「数据预览」：' + watch.length + ' 通道 × ' + st.wave.length + ' 帧', 'success');
      }
    }
  }

  /* ================= diagram.json 导入 / 导出 ================= */

  function exportDiagram() {
    const parts = st.order.map(function (id) {
      const p = st.parts[id];
      return {
        id: p.id, type: p.type,
        top: Math.round(p.y), left: Math.round(p.x),
        attrs: Object.assign({}, p.attrs)
      };
    });
    const conns = st.conns.map(function (c) {
      return [c.from.join(':'), c.to.join(':'), c.color || 'green', []];
    });
    const doc = { version: 1, author: 'LabInsight', editor: 'labinsight-sim', parts: parts, connections: conns };
    return JSON.stringify(doc, null, 2);
  }

  function importDiagram(json) {
    const d = JSON.parse(json);
    if (!d || !Array.isArray(d.parts)) throw new Error('不是有效的 diagram.json');
    reset();
    d.parts.forEach(function (p) {
      addPart(p.type, p.id, p.left || 40, p.top || 40, p.attrs || {});
    });
    (d.connections || []).forEach(function (c) {
      st.conns.push({
        from: String(c[0]).split(':'),
        to: String(c[1]).split(':'),
        color: c[2] || 'green'
      });
    });
    netsDirty = true;
    fullRender();
    if (typeof toast === 'function') {
      toast('已导入 ' + d.parts.length + ' 个元件 / ' + (d.connections || []).length + ' 条连线', 'success');
    }
  }

  /* ================= 元件增删 ================= */

  function addPart(type, id, x, y, attrs) {
    const def = PARTS[type];
    if (!def) throw new Error('未知元件类型：' + type);
    id = id || nextId(type);
    if (st.parts[id]) throw new Error('id 重复：' + id);
    st.parts[id] = { id: id, type: type, x: x, y: y, attrs: Object.assign({}, def.attrs, attrs || {}) };
    st.order.push(id);
    netsDirty = true;
    // 立即上屏：此前只改状态不渲染，点元件库后画布看不到新元件（状态/ DOM 不一致）
    fullRender();
    return id;
  }

  function nextId(type) {
    const base = (type.replace(/^wokwi-/, '').replace(/^board-/, '').split('-')[0] || 'p').replace(/[^a-z]/gi, '') || 'p';
    let n = 1;
    while (st.parts[base + n]) n++;
    return base + n;
  }

  function removePart(id) {
    if (!st.parts[id]) return;
    st.conns = st.conns.filter(function (c) {
      return c.from[0] !== id && c.to[0] !== id;
    });
    delete st.parts[id];
    const i = st.order.indexOf(id);
    if (i >= 0) st.order.splice(i, 1);
    netsDirty = true;
    fullRender();
  }

  function reset() {
    stop();
    st.parts = {};
    st.order = [];
    st.conns = [];
    st.wave = [];
    st.serial = [];
    st.watchNets = [];
    netsDirty = true;
  }

  /* ================= DOM 渲染（全部 DOM API，无 innerHTML 拼接） ================= */

  function fullRender() {
    const canvas = document.getElementById('sim-canvas');
    const svg = document.getElementById('sim-wires');
    if (!canvas || !svg) return;
    // 清空元件 DOM，但保留连线 SVG 容器（它嵌在画布里）
    Array.from(canvas.children).forEach(function (child) {
      if (child !== svg) canvas.removeChild(child);
    });
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    st.order.forEach(function (id) { renderPart(canvas, st.parts[id]); });
    renderWires();
  }

  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function svgEl(tag, attrs) {
    const NS = 'http://www.w3.org/2000/svg';
    const e = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function renderPart(canvas, p) {
    const def = PARTS[p.type];
    const box = mk('div', 'sim-part');
    box.style.left = p.x + 'px';
    box.style.top = p.y + 'px';
    box.style.width = def.w + 'px';
    box.dataset.id = p.id;
    box.appendChild(mk('div', 'sim-part-title', p.id + ' · ' + def.label));
    const pinEls = {};
    Object.keys(def.pins).forEach(function (name) {
      const pos = def.pins[name];
      const dot = mk('div', 'sim-pin');
      dot.style.left = (pos.x - 4) + 'px';
      dot.style.top = (pos.y - 4) + 'px';
      dot.title = p.id + ':' + name;
      dot.dataset.key = p.id + ':' + name;
      dot.style.background = PIN_COLORS[name] || '#94a3b8';
      box.appendChild(dot);
      pinEls[name] = dot;
    });
    const body = mk('div', 'sim-part-body');
    const kind = p.type.replace(/^wokwi-/, '').replace(/^board-/, '');
    if (kind === 'led') {
      const led = mk('div', 'sim-led');
      const colors = ['red', 'green', 'blue', 'yellow', 'orange', 'white'];
      led.style.color = (colors.indexOf(p.attrs.color) >= 0) ? p.attrs.color : 'red';
      body.appendChild(led);
      body.appendChild(mk('div', 'sim-part-caption', 'A / C'));
    } else if (kind === 'resistor') {
      body.appendChild(mk('div', 'sim-resistor', String(p.attrs.value) + 'Ω'));
    } else if (kind === 'pushbutton') {
      body.appendChild(mk('div', 'sim-button'));
      body.appendChild(mk('div', 'sim-part-caption', '点按导通'));
    } else if (kind === 'potentiometer') {
      const pot = mk('div', 'sim-pot');
      pot.appendChild(mk('div', 'sim-pot-knob'));
      body.appendChild(pot);
      body.appendChild(mk('div', 'sim-part-caption pot-val', (p.attrs.value || 0) + '%'));
    } else if (kind === '7segment') {
      body.appendChild(svgEl('svg', { class: 'sim-seg', viewBox: '0 0 76 88', width: '76', height: '88' }));
    } else if (kind === 'lcd1602') {
      const lcd = mk('div', 'sim-lcd');
      lcd.appendChild(mk('div', 'sim-lcd-line', 'LCD1602'));
      lcd.appendChild(mk('div', 'sim-lcd-line', 'I2C 占位'));
      body.appendChild(lcd);
    } else if (kind === 'buzzer') {
      body.appendChild(mk('div', 'sim-buzzer', '♪'));
    } else if (kind === 'slide-switch') {
      const sw = mk('div', 'sim-switch');
      sw.appendChild(mk('div', 'sim-switch-knob'));
      body.appendChild(sw);
    } else if (kind === 'ntc-sensor') {
      const ntc = mk('div', 'sim-ntc');
      ntc.appendChild(mk('div', 'sim-ntc-temp'));
      body.appendChild(ntc);
    } else if (kind === 'esp32-devkit-c-v4') {
      const esp = mk('div', 'sim-esp32');
      const chip = mk('div', 'sim-esp32-chip', 'ESP32');
      chip.title = '双击芯片打开 GPIO 规则编辑';
      esp.appendChild(chip);
      body.appendChild(esp);
    } else {
      body.textContent = def.label;
    }
    box.appendChild(body);
    canvas.appendChild(box);
    p.el = box;
    p.pinEls = pinEls;
    wirePartEvents(p, box);
  }

  function wirePartEvents(p, box) {
    // 拖动移动元件
    box.addEventListener('pointerdown', function (e) {
      if (e.target.classList.contains('sim-pin')) return;
      if (e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      const ox = p.x, oy = p.y;
      const move = function (ev) {
        p.x = Math.max(0, ox + (ev.clientX - sx));
        p.y = Math.max(0, oy + (ev.clientY - sy));
        box.style.left = p.x + 'px';
        box.style.top = p.y + 'px';
        renderWires();
      };
      const up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    box.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (window.confirm('删除元件 ' + p.id + '？')) removePart(p.id);
    });
    // 按钮按压
    if (p.type === 'wokwi-pushbutton') {
      const btnEl = box.querySelector('.sim-button');
      btnEl.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        p.attrs.pressed = true;
        btnEl.classList.add('pressed');
      });
      window.addEventListener('pointerup', function () {
        p.attrs.pressed = false;
        btnEl.classList.remove('pressed');
      });
    }
    // 电位器拖动
    if (p.type === 'wokwi-potentiometer') {
      const knob = box.querySelector('.sim-pot-knob');
      const cap = box.querySelector('.pot-val');
      const setVal = function (clientX) {
        const rect = p.el.getBoundingClientRect();
        const t = Math.max(0, Math.min(100, Math.round((clientX - rect.left) / rect.width * 100)));
        p.attrs.value = String(t);
        knob.style.left = t + '%';
        if (cap) cap.textContent = t + '%';
      };
      knob.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        const mv = function (ev) { setVal(ev.clientX); };
        const up = function () {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        setVal(e.clientX);
      });
      knob.style.left = (p.attrs.value || 0) + '%';
    }
    // NTC 温度设置
    if (p.type === 'wokwi-ntc-sensor') {
      const cap = box.querySelector('.sim-ntc-temp');
      const refresh = function () {
        if (p.rOhm) cap.textContent = p.attrs.temp + '°C · ' + (p.rOhm / 1000).toFixed(1) + 'kΩ';
      };
      cap.addEventListener('click', function (e) {
        e.stopPropagation();
        const v = window.prompt('设置环境温度（°C）', p.attrs.temp);
        if (v !== null && isFinite(Number(v))) {
          p.attrs.temp = String(Number(v));
          refresh();
        }
      });
      refresh();
    }
    // 拨动开关
    if (p.type === 'wokwi-slide-switch') {
      const knob = box.querySelector('.sim-switch-knob');
      const apply = function () { knob.style.left = (p.attrs.on === 2 ? '50%' : '0%'); };
      knob.addEventListener('click', function (e) {
        e.stopPropagation();
        p.attrs.on = (p.attrs.on === 2) ? 1 : 2;
        apply();
      });
      apply();
    }
    // 引脚：左键连线（点 A → 点 B）；右键加入示波器
    Object.keys(p.pinEls).forEach(function (name) {
      const dot = p.pinEls[name];
      dot.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        const key = p.id + ':' + name;
        if (!st._pendingPin) {
          st._pendingPin = key;
          dot.classList.add('pending');
        } else if (st._pendingPin === key) {
          dot.classList.remove('pending');
          st._pendingPin = null;
        } else {
          st.conns.push({
            from: st._pendingPin.split(':'),
            to: key.split(':'),
            color: 'green'
          });
          const pend = document.querySelectorAll('.sim-pin.pending');
          for (let i = 0; i < pend.length; i++) pend[i].classList.remove('pending');
          st._pendingPin = null;
          netsDirty = true;
          renderWires();
        }
      });
      dot.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        addWatchByPin(p.id, name);
      });
    });
  }

  function pinAbsPos(pid, pin) {
    const p = st.parts[pid];
    if (!p) return null;
    const rel = PARTS[p.type].pins[pin];
    if (!rel) return null;
    return { x: p.x + rel.x, y: p.y + rel.y };
  }

  function renderWires() {
    const svg = document.getElementById('sim-wires');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const colorMap = { green: '#22c55e', black: '#111827', red: '#ef4444', blue: '#3b82f6', yellow: '#eab308' };
    st.conns.forEach(function (c) {
      const a = pinAbsPos(c.from[0], c.from[1]);
      const b = pinAbsPos(c.to[0], c.to[1]);
      if (!a || !b) return;
      const color = colorMap[c.color] || c.color || '#22c55e';
      const path = svgEl('path', {
        d: 'M' + a.x + ',' + a.y + ' C ' + ((a.x + b.x) / 2) + ',' + a.y + ' ' +
           ((a.x + b.x) / 2) + ',' + b.y + ' ' + b.x + ',' + b.y,
        stroke: color, fill: 'none', 'stroke-width': '2', opacity: '0.9'
      });
      svg.appendChild(path);
    });
  }

  // 每帧刷新元件视觉状态
  function renderParts() {
    Object.keys(st.parts).forEach(function (id) {
      const p = st.parts[id];
      const kind = p.type.replace(/^wokwi-/, '').replace(/^board-/, '');
      if (kind === 'led') {
        const ni = st.netOf.get(p.id + ':A');
        const nc = st.netOf.get(p.id + ':C');
        const lvA = (ni === undefined) ? null : (st.netLevels || [])[ni];
        const lvC = (nc === undefined) ? null : (st.netLevels || [])[nc];
        const lit = !!(lvA && lvC && lvA.v === 1 && lvC.v === 0);
        const pwm = !!(lvA && lvC && lvA.analog !== null && lvA.analog !== undefined && lvC.v === 0);
        const el = p.el.querySelector('.sim-led');
        if (el) {
          if (lit) {
            el.classList.add('on');
            el.style.opacity = '1';
            el.style.filter = 'drop-shadow(0 0 8px currentColor)';
          } else if (pwm) {
            el.classList.add('on');
            el.style.opacity = String(0.25 + lvA.analog * 0.75);
            el.style.filter = 'none';
          } else {
            el.classList.remove('on');
            el.style.opacity = '1';
            el.style.filter = 'none';
          }
        }
      } else if (kind === '7segment') {
        const segEl = p.el.querySelector('.sim-seg');
        if (segEl) drawSevenSeg(segEl, p.lit || {});
      } else if (kind === 'buzzer') {
        const ni = st.netOf.get(p.id + ':1');
        const nc = st.netOf.get(p.id + ':2');
        const on = !!(ni !== undefined && nc !== undefined &&
          st.netLevels[ni] && st.netLevels[ni].v === 1 &&
          st.netLevels[nc] && st.netLevels[nc].v === 0);
        const el = p.el.querySelector('.sim-buzzer');
        if (el) el.classList.toggle('on', on);
      } else if (kind === 'ntc-sensor') {
        const cap = p.el.querySelector('.sim-ntc-temp');
        if (cap && p.rOhm) {
          cap.textContent = p.attrs.temp + '°C · ' + (p.rOhm / 1000).toFixed(1) + 'kΩ';
        }
      }
    });
  }

  function drawSevenSeg(el, lit) {
    while (el.firstChild) el.removeChild(el.firstChild);
    const segs = {
      a: [20, 8, 56, 8], b: [60, 12, 60, 40], c: [60, 46, 60, 74],
      d: [20, 78, 56, 78], e: [16, 46, 16, 74], f: [16, 12, 16, 40],
      g: [20, 42, 56, 42]
    };
    Object.keys(segs).forEach(function (k) {
      // solveAll 里 p.lit 的键是大写 A~G，这里小写 a~g 查不到 → 数码管永远全灭
      const on = lit[k] !== undefined ? lit[k] : lit[k.toUpperCase()];
      const line = svgEl('line', {
        x1: segs[k][0], y1: segs[k][1], x2: segs[k][2], y2: segs[k][3],
        stroke: on ? '#ff5d3a' : '#2a2f3a',
        'stroke-width': '5', 'stroke-linecap': 'round'
      });
      el.appendChild(line);
    });
  }

  /* ================= GPIO 规则编辑（简化面板） ================= */

  function openRulesEditor() {
    const esp = Object.values(st.parts).find(function (p) {
      return p.type === 'board-esp32-devkit-c-v4';
    });
    if (!esp) return;
    const panel = document.getElementById('sim-rules');
    if (!panel) return;
    panel.innerHTML = '';
    const modes = [
      ['high', '常高'], ['low', '常低'], ['toggle', '交替翻转'],
      ['pwm-breath', 'PWM 呼吸'], ['input-pullup', '输入+上拉'], ['input', '输入悬空']
    ];
    Object.keys(st.rules).forEach(function (g) {
      const row = mk('div', 'sim-rule-row');
      row.appendChild(mk('span', 'sim-rule-g', 'GPIO' + g));
      const sel = mk('select', 'input sim-rule-mode');
      modes.forEach(function (m) {
        const opt = mk('option', null, m[1]);
        opt.value = m[0];
        sel.appendChild(opt);
      });
      sel.value = st.rules[g].mode;
      sel.addEventListener('change', function () {
        st.rules[g].mode = sel.value;
        if (sel.value === 'toggle' && !st.rules[g].period) st.rules[g].period = 15;
        if (sel.value === 'pwm-breath' && !st.rules[g].period) st.rules[g].period = 60;
      });
      row.appendChild(sel);
      const per = mk('input', 'input sim-rule-period');
      per.type = 'number';
      per.min = '2';
      per.value = st.rules[g].period || '';
      per.title = '周期（帧，20ms/帧）';
      per.addEventListener('input', function () { st.rules[g].period = Number(per.value) || undefined; });
      row.appendChild(per);
      panel.appendChild(row);
    });
  }

  /* ================= 对外 API ================= */

  function init() {
    st = freshState();
    loadDefault();
    openRulesEditor();
  }

  function loadDefault() {
    reset();
    addPart('board-esp32-devkit-c-v4', 'esp', 40, 60, {});
    addPart('wokwi-resistor', 'r1', 300, 110, { value: '220' });
    addPart('wokwi-led', 'led1', 420, 100, { color: 'red' });
    addPart('wokwi-pushbutton', 'btn1', 300, 210, {});
    st.conns.push({ from: ['esp', 'D2'], to: ['r1', '1'], color: 'green' });
    st.conns.push({ from: ['r1', '2'], to: ['led1', 'A'], color: 'green' });
    st.conns.push({ from: ['led1', 'C'], to: ['esp', 'GND.1'], color: 'black' });
    st.conns.push({ from: ['esp', 'D4'], to: ['btn1', '1.l'], color: 'blue' });
    st.conns.push({ from: ['btn1', '1.r'], to: ['esp', '3V3'], color: 'red' });
    netsDirty = true;
    fullRender();
    openRulesEditor();
  }

  function setRule(g, rule) {
    st.rules[g] = rule;
    applyRules();
  }

  /* ---------- v4.3 Python 模式桥 ---------- */

  function setPyMode(on) {
    pyMode = !!on;
    if (pyMode) {
      // 清掉规则引擎残留输出
      Object.values(st.parts).forEach(function (p) {
        if (p.type === 'board-esp32-devkit-c-v4') { p.outputs = {}; p.pullUp = {}; }
      });
    } else {
      stopPyWorkerIfNeeded();
    }
    applyRules();
  }

  // Python Worker 写引脚：直接写 MCU 输出并即时解算渲染
  function pyPinWrite(g, v, asAnalog) {
    const esp = Object.values(st.parts).find(function (p) {
      return p.type === 'board-esp32-devkit-c-v4';
    });
    if (!esp) return;
    esp.outputs = esp.outputs || {};
    esp.outputs[Number(g)] = asAnalog ? v : (v ? 1 : 0);
    solveAll();
    renderParts();
  }

  // 给 Worker 的输入快照：digital = 每个 D 引脚网络电平；analog = 电位器 SIG 值
  function pyInputsSnapshot() {
    const esp = Object.values(st.parts).find(function (p) {
      return p.type === 'board-esp32-devkit-c-v4';
    });
    const digital = {}, analog = {};
    if (esp) {
      Object.keys(PARTS['board-esp32-devkit-c-v4'].pins).forEach(function (pin) {
        const g = parseGpio(pin);
        if (g === null) return;
        const ni = st.netOf.get(esp.id + ':' + pin);
        if (ni === undefined) return;
        const lv = (st.netLevels || [])[ni];
        if (lv && lv.v !== null) digital[g] = lv.v;
      });
    }
    Object.values(st.parts).forEach(function (p) {
      if (p.type === 'wokwi-potentiometer') {
        const v = (Number(p.attrs.value) || 0) / 100;
        const ni = st.netOf.get(p.id + ':SIG');
        if (ni === undefined) return;
        // 找该网络里挂在 ESP32 上的 GPIO 号；接在 D34 就映射 34（此前硬编码 analog[0]，ADC(34) 恒读 0）
        const keys = st.nets[ni] || [];
        let mapped = false;
        for (const k of keys) {
          const cidx = k.indexOf(':');
          const owner = st.parts[k.slice(0, cidx)];
          if (!owner || owner.type !== 'board-esp32-devkit-c-v4') continue;
          const g = parseGpio(k.slice(cidx + 1));
          if (g === null) continue;
          analog[g] = v;
          mapped = true;
        }
        // 未接 MCU 时仍保留一个可读槽位，便于教学演示
        if (!mapped && analog[0] === undefined) analog[0] = v;
      }
    });
    return { digital: digital, analog: analog };
  }

  function stopPyWorkerIfNeeded() {
    if (typeof window !== 'undefined' && window.__simPyWorker) {
      try { window.__simPyWorker.terminate(); } catch (e) { /* 已终止 */ }
      window.__simPyWorker = null;
    }
  }

  return {
    init: init,
    start: start,
    stop: stop,
    isRunning: function () { return !!st && st.running; },
    setRule: setRule,
    getRules: function () { return st.rules; },
    exportDiagram: exportDiagram,
    importDiagram: importDiagram,
    loadDefault: loadDefault,
    reset: reset,
    addPart: addPart,
    removePart: removePart,
    addWatchByPin: addWatchByPin,
    clearWatch: function () { st.watchNets = []; renderScope(); },
    exportToAnalysis: exportToAnalysis,
    openRulesEditor: openRulesEditor,
    pyPrint: pyPrint,
    solveAll: solveAll,          // 调试用：手动触发一次全局解算
    setPyMode: setPyMode,
    pyPinWrite: pyPinWrite,
    pyInputsSnapshot: pyInputsSnapshot,
    PARTS: PARTS,
    getParts: function () { return st ? st.order.map(function (id) { return st.parts[id]; }) : []; },
    _st: function () { return st; }
  };
})();
