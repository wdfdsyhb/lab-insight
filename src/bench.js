/* =========================================================
   bench.js — 虚拟实验台（v4.0，Three.js 数字孪生 + 接线小游戏）
   浏览器里的"活的"实验桌面，全部程序化几何（无外部模型文件）：

   · 实验桌 + 主控板（两排引脚）+ 传感器模块（VCC/GND/DATA 三脚）
     + 玻璃温度计 + 七段数码管屏 + 状态 LED
   · 数据联动：串口采集的每个新值驱动场景——
     温度计液柱升降变色 / 数码管重绘 / 模块毛刺告警红闪
     （updateFromSeries 由 app.js 采集管线调用）
   · 接线小游戏：进入「接线模式」后鼠标先点模块引脚再点主控板引脚
     生成杜邦线；任务是把 VCC→3V3、GND→GND、DATA→PA0 三根线接对，
     全部接对显示「接线正确」，错误的线高亮红色可点击拆除。
     接线全部正确后状态 LED 变绿——"虚拟串口开始出数"。
   ========================================================= */

const LabBench = (() => {

  let st = null;

  function supported() { return typeof THREE !== 'undefined'; }

  /* ---------- 场景物件 ---------- */

  function makeBoard(scene) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.35, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.5 })
    );
    board.position.set(-3.4, 0.55, 0);
    scene.add(board);
    const chip = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.22, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 })
    );
    chip.position.set(-3.4, 0.85, 0);
    scene.add(chip);
    // 两排引脚（前排放主控引脚：3V3 / GND / PA0 …，供接线）
    const pinNames = ['3V3', 'GND', 'PA0', 'PA1'];
    const pins = {};
    pinNames.forEach((name, i) => {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.3 })
      );
      p.position.set(-5.2 + i * 1.2, 0.95, 2.5);
      p.userData.pinName = name;
      scene.add(p);
      pins[name] = p;
    });
    return { board: board, chip: chip, pins: pins };
  }

  function makeSensorModule(scene) {
    const mod = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.4, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.45 })
    );
    mod.position.set(3.6, 0.6, 0);
    scene.add(mod);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.2 })
    );
    led.position.set(3.6, 0.9, 0.6);
    scene.add(led);
    // 模块侧引脚：VCC / GND / DATA
    const pinNames = ['VCC', 'GND', 'DATA'];
    const pins = {};
    pinNames.forEach((name, i) => {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.7, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.3 })
      );
      p.position.set(2.8 + i * 0.8, 0.95, 1.35);
      p.userData.pinName = name;
      scene.add(p);
      pins[name] = p;
    });
    return { mod: mod, led: led, pins: pins };
  }

  function makeThermometer(scene) {
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 5.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45, roughness: 0.1 })
    );
    glass.position.set(7.2, 2.8, -2.6);
    scene.add(glass);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.5 })
    );
    bulb.position.set(7.2, 0.7, -2.6);
    scene.add(bulb);
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 1, 12),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x2563eb, emissiveIntensity: 0.6 })
    );
    liquid.position.set(7.2, 1.25, -2.6); // scaleY 动态，锚点在底部
    liquid.geometry.translate(0, 0.5, 0);
    scene.add(liquid);
    return { glass: glass, bulb: bulb, liquid: liquid };
  }

  function makeDisplay(scene) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.4),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    screen.position.set(3.6, 2.3, -2.58);
    scene.add(screen);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.6, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    back.position.set(3.6, 2.3, -2.7);
    scene.add(back);
    return { cv: cv, ctx: ctx, tex: tex, screen: screen };
  }

  function drawDisplay(display, chName, value) {
    const c = display.ctx;
    c.fillStyle = '#10131a';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#ff5d3a';
    c.font = 'bold 44px Consolas, monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(value), 128, 40);
    c.fillStyle = '#64748b';
    c.font = '18px "Microsoft YaHei", sans-serif';
    c.fillText(chName, 128, 78);
    display.tex.needsUpdate = true;
  }

  function makeWire(scene, from, to, ok) {
    // 中段高度用确定性偏移（避免弱随机数告警；纯视觉用途）
    const midSag = ((Math.abs(from.x - to.x) * 7 + Math.abs(from.z - to.z) * 13) % 5) * 0.1;
    const mid = new THREE.Vector3(
      (from.x + to.x) / 2, 2.1 + midSag, (from.z + to.z) / 2 + 0.6
    );
    const curve = new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.09, 8, false),
      new THREE.MeshStandardMaterial({ color: ok ? 0x22c55e : 0xef4444, roughness: 0.4 })
    );
    scene.add(line);
    return line;
  }

  /* ---------- 开关与联动 ---------- */

  function open() {
    if (!supported()) throw new Error('Three.js 未加载（vendor/three.min.js 缺失）');
    if (st) close();
    const overlay = document.createElement('div');
    overlay.id = 'bench-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0b1220;';
    document.body.appendChild(overlay);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    overlay.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 30, 90);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(1.5, 6.5, 10.5);
    camera.lookAt(1.5, 1, 0);

    scene.add(new THREE.AmbientLight(0x9fb3d9, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(6, 12, 9);
    scene.add(key);

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.5, 9),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 })
    );
    desk.position.set(1.5, 0.25, 0);
    scene.add(desk);

    const board = makeBoard(scene);
    const sensor = makeSensorModule(scene);
    const thermo = makeThermometer(scene);
    const display = makeDisplay(scene);
    drawDisplay(display, '—', '--');

    // 主控板状态 LED（接线全对时变绿）
    const statusLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.4 })
    );
    statusLed.position.set(-1.9, 1.0, 2.0);
    scene.add(statusLed);

    // 轨道控制器（简化 orbit：拖拽绕原点旋转 + 滚轮缩放）
    let ang = 0.14, elev = 0.55, dist = 13.5, drag = false, lx = 0, ly = 0;
    function applyCam() {
      camera.position.set(1.5 + Math.sin(ang) * dist * Math.cos(elev),
        1 + Math.sin(elev) * dist,
        Math.cos(ang) * dist * Math.cos(elev));
      camera.lookAt(1.5, 1.2, 0);
    }
    applyCam();

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:14px;left:16px;color:#e2e8f0;font:14px "Microsoft YaHei",sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre-line;';
    overlay.appendChild(hud);
    const exitBtn = document.createElement('button');
    exitBtn.textContent = '退出实验台 (Esc)';
    exitBtn.style.cssText = 'position:absolute;top:12px;right:14px;padding:6px 14px;border-radius:8px;border:1px solid #475569;background:rgba(15,23,42,0.8);color:#e2e8f0;cursor:pointer;font-size:13px;';
    overlay.appendChild(exitBtn);
    const wireBtn = document.createElement('button');
    wireBtn.textContent = '进入接线挑战';
    wireBtn.style.cssText = 'position:absolute;top:12px;right:150px;padding:6px 14px;border-radius:8px;border:1px solid #0ea5e9;background:rgba(14,165,233,0.25);color:#e2e8f0;cursor:pointer;font-size:13px;';
    overlay.appendChild(wireBtn);

    st = {
      overlay: overlay, renderer: renderer, scene: scene, camera: camera,
      board: board, sensor: sensor, thermo: thermo, display: display,
      statusLed: statusLed, hud: hud, wires: [], wiring: false,
      pendingPin: null, connMap: { VCC: '3V3', GND: 'GND', DATA: 'PA0' },
      connections: [], spikeFlash: 0, lastValues: {}, ang: ang, elev: elev, dist: dist,
      applyCam: applyCam, raf: 0, last: performance.now(), closed: false
    };
    setHud();

    /* ---------- 交互 ---------- */

    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    exitBtn.addEventListener('click', close);
    wireBtn.addEventListener('click', () => { st.wiring = !st.wiring; st.pendingPin = null; setHud(); });

    renderer.domElement.addEventListener('pointerdown', e => {
      if (!st.wiring) { drag = true; lx = e.clientX; ly = e.clientY; return; }
      const hit = pickPin(e);
      if (!hit) return;
      if (!st.pendingPin) { st.pendingPin = hit; setHud(); return; }
      if (hit === st.pendingPin) { st.pendingPin = null; setHud(); return; }
      // 生成连线并校验
      const a = st.pendingPin.userData.pinName, b = hit.userData.pinName;
      const isModuleSide = st.pendingPin === sensor.pins[a] || hit === sensor.pins[a];
      const ok = (a in st.connMap && st.connMap[a] === b) || (b in st.connMap && st.connMap[b] === a);
      const w = makeWire(scene, st.pendingPin.position, hit.position, ok);
      st.wires.push({ mesh: w, a: a, b: b, ok: ok });
      st.connections.push({ a: a, b: b, ok: ok });
      st.pendingPin = null;
      checkWiring();
      setHud();
    });
    window.addEventListener('pointerup', () => { drag = false; });
    window.addEventListener('pointermove', e => {
      if (drag) {
        st.ang -= (e.clientX - lx) * 0.005;
        st.elev = Math.max(0.15, Math.min(1.35, st.elev + (e.clientY - ly) * 0.004));
        lx = e.clientX; ly = e.clientY;
        st.applyCam();
      }
    });
    renderer.domElement.addEventListener('wheel', e => {
      st.dist = Math.max(7, Math.min(24, st.dist + e.deltaY * 0.01));
      st.applyCam();
    }, { passive: true });

    st.cleanup = () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };

    loop();
    return true;

    function pickPin(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const pins = Object.values(board.pins).concat(Object.values(sensor.pins));
      const hit = ray.intersectObjects(pins)[0];
      return hit ? hit.object : null;
    }

    function wiringState() {
      const done = Object.keys(st.connMap).filter(k =>
        st.connections.some(c => c.ok && ((c.a === k && c.b === st.connMap[k]) || (c.b === k && c.a === st.connMap[k]))));
      return { done: done, all: done.length === Object.keys(st.connMap).length };
    }

    function checkWiring() {
      const w = wiringState();
      if (w.all) {
        st.statusLed.material.color.setHex(0x22c55e);
        st.statusLed.material.emissive.setHex(0x22c55e);
        toastSafe('接线全部正确！虚拟串口开始出数（返回采集页体验数据联动）');
        st.wiring = false;
      } else {
        st.statusLed.material.color.setHex(0xef4444);
        st.statusLed.material.emissive.setHex(0xef4444);
      }
    }

    function setHud() {
      const w = wiringState();
      const pend = st.pendingPin ? ('已选 ' + st.pendingPin.userData.pinName + '，再点目标引脚完成连线') : '先点传感器模块引脚（VCC/GND/DATA）';
      st.hud.textContent = st.wiring
        ? `接线挑战 · 任务：VCC→3V3，GND→GND，DATA→PA0\n已完成 ${w.done.length}/3 · ${pend}\n红 = 未接对（可重接覆盖）\n拖动旋转视角 · 滚轮缩放 · Esc 退出`
        : `数字孪生实验台 · 数据联动 ${w.all ? '已激活' : '待接线'}（右上角进入接线挑战）\n拖动旋转视角 · 滚轮缩放 · Esc 退出`;
    }
  }

  function toastSafe(msg) {
    if (typeof toast === 'function') toast(msg, 'success');
  }

  // 采集管线每行调用：values = { chName: value }，spike = { chName: true }
  function updateFromSeries(seriesMap, keyOrder, spikeKeys) {
    if (!st) return;
    const keys = keyOrder.slice(0, 3);
    keys.forEach((k, i) => {
      const s = seriesMap.get(k);
      if (!s || !s.data.length) return;
      const v = s.data[s.data.length - 1].y;
      st.lastValues[k] = v;
      if (i === 0) {
        // 温度计：以当前滑动范围归一化
        let min = Infinity, max = -Infinity;
        for (const p of s.data) { if (p.y < min) min = p.y; if (p.y > max) max = p.y; }
        if (!isFinite(min) || max === min) { min = v - 1; max = v + 1; }
        const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
        const h = 0.8 + t * 3.6;
        st.thermo.liquid.scale.y = h;
        st.thermo.liquid.position.y = 1.05 + h / 2 - 0.5;
        const hue = Math.round(210 - t * 210);
        const col = new THREE.Color(`hsl(${hue}, 78%, 48%)`);
        st.thermo.liquid.material.color.copy(col);
        st.thermo.liquid.material.emissive.copy(col);
        st.thermo.bulb.material.color.copy(col);
      }
      if (i === 1) drawDisplay(st.display, k, v);
      if (i === 2) drawDisplay(st.display, k, v);
    });
    if (keys.length === 1 && keys[0]) drawDisplay(st.display, keys[0], st.lastValues[keys[0]]);
    // 毛刺告警：模块 LED 与整体红闪两秒
    if (spikeKeys && spikeKeys.length) {
      st.spikeFlash = 2;
      st.sensor.led.material.color.setHex(0xdc2626);
      st.sensor.led.material.emissive.setHex(0xff2d2d);
    } else if (st.spikeFlash > 0) {
      st.spikeFlash -= 0.016;
      if (st.spikeFlash <= 0) {
        st.sensor.led.material.color.setHex(0x22c55e);
        st.sensor.led.material.emissive.setHex(0x22c55e);
      }
    }
  }

  function loop() {
    if (!st || st.closed) return;
    const now = performance.now();
    if (st.sensor && st.sensor.led) {
      const pulse = 0.9 + Math.sin(now / 300) * 0.5;
      st.sensor.led.material.emissiveIntensity = st.spikeFlash > 0 ? 2.2 : pulse;
    }
    st.renderer.render(st.scene, st.camera);
    st.raf = requestAnimationFrame(loop);
  }

  function close() {
    if (!st) return;
    st.closed = true;
    cancelAnimationFrame(st.raf);
    if (st.cleanup) st.cleanup();
    st.renderer.dispose();
    if (st.overlay.parentNode) st.overlay.parentNode.removeChild(st.overlay);
    st = null;
  }

  function isOpen() { return !!st; }
  function wired() { if (!st) return false; const k = Object.keys(st.connMap); return k.every(name => st.connections.some(c => c.ok && ((c.a === name && c.b === st.connMap[name]) || (c.b === name && c.a === st.connMap[name])))); }

  return { open: open, close: close, isOpen: isOpen, supported: supported, wired: wired, updateFromSeries: updateFromSeries };
})();
