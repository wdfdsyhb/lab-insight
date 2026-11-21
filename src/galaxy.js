/* =========================================================
   galaxy.js — 3D 数据星系 + 异常猎人（v4.0，Three.js 本地 vendor）
   把多通道时间序列升维成可飞行的 3D 地形：
   · X = 时间（向远方延伸），Z = 通道（每通道一条山脊），Y = 归一化数值
   · 异常点 = 发光红色晶体（脉动）；事件标注 = 地面石碑（文字贴图）
   · 飞行模式：WASD / 方向键移动 + 鼠标拖动转视角，Esc 退出
   · 回放模式：相机沿时间轴匀速飞行，地形随时间"生长"
   · 猎人模式：飞行器沿跑道自动前进，点击晶体命中后弹出
     「真异常 / 误报」判定，误报晶体变绿倒地——结束时输出复核清单
   数据全部来自 state.ds（真实数据映射，无装饰性假 3D）。
   ========================================================= */

const LabGalaxy = (() => {

  const CHANNEL_GAP = 34;      // 相邻通道山脊的 Z 间距
  const H_MAX = 26;            // 山高上限
  const MAX_POINTS = 900;      // 每通道绘制的最大点数（等距抽样）

  let st = null; // 场景状态

  function supported() { return typeof THREE !== 'undefined'; }

  /* ---------- 数据准备 ---------- */

  function prepareSeries(ds) {
    const cols = ds.numericColumns.slice(0, 4);
    const series = cols.map(col => {
      const pts = [];
      ds.rows.forEach((r, ri) => {
        const v = r.cells[col.index];
        if (typeof v !== 'number' || !isFinite(v)) return;
        const outlier = !!(r.outliers && r.outliers.has(col.index));
        pts.push({ x: ri, y: v, outlier: outlier });
      });
      // 等距抽样控制地形密度
      if (pts.length > MAX_POINTS) {
        const step = pts.length / MAX_POINTS;
        const thin = [];
        for (let i = 0; i < MAX_POINTS; i++) thin.push(pts[Math.floor(i * step)]);
        if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
        pts.length = 0;
        pts.push.apply(pts, thin);
      }
      let min = Infinity, max = -Infinity;
      for (const p of pts) { if (p.y < min) min = p.y; if (p.y > max) max = p.y; }
      if (!isFinite(min)) { min = 0; max = 1; }
      if (max === min) max = min + 1;
      return { name: col.name, pts: pts, min: min, max: max };
    }).filter(s => s.pts.length >= 2);
    return series;
  }

  /* ---------- 场景构建 ---------- */

  function makeTextSprite(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(15,23,42,0.85)';
    c.fillRect(0, 0, 256, 64);
    c.strokeStyle = 'rgba(148,163,184,0.9)';
    c.strokeRect(1, 1, 254, 62);
    c.fillStyle = '#f8fafc';
    c.font = '22px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(text).slice(0, 12), 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(14, 3.5, 1);
    return sp;
  }

  function open(ds, mode) {
    if (!supported()) throw new Error('Three.js 未加载（vendor/three.min.js 缺失）');
    if (st) close();
    const series = prepareSeries(ds);
    if (!series.length) throw new Error('没有可绘制的数值通道');

    const overlay = document.createElement('div');
    overlay.id = 'galaxy-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#05070d;';
    document.body.appendChild(overlay);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    overlay.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 60, 420);

    const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1200);
    const s0 = series[0];
    const midZ = CHANNEL_GAP * (series.length - 1) / 2;
    camera.position.set(-16, H_MAX * 1.5, midZ + CHANNEL_GAP * 1.6);
    camera.lookAt(s0.pts.length * 0.4, H_MAX * 0.35, midZ);

    scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(40, 90, -30);
    scene.add(sun);

    const grid = new THREE.GridHelper(1200, 80, 0x1e293b, 0x101827);
    grid.position.y = -0.2;
    scene.add(grid);

    const crystals = [];  // { mesh, row, ci, name, value }
    const PALETTE = [0x0072b2, 0xe69f00, 0x009e73, 0xcc79a7];

    series.forEach((s, ci) => {
      const z = ci * CHANNEL_GAP;
      const color = PALETTE[ci % PALETTE.length];
      // 山脊条带：每两点一个四边形
      const positions = [];
      const baseY = 0;
      for (let i = 0; i < s.pts.length; i++) {
        const y = ((s.pts[i].y - s.min) / (s.max - s.min)) * H_MAX;
        positions.push(s.pts[i].x, baseY, z - 3.2);
        positions.push(s.pts[i].x, y, z);
        positions.push(s.pts[i].x, baseY, z + 3.2);
      }
      const idx = [];
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        // 左坡
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        // 右坡
        idx.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: color, metalness: 0.1, roughness: 0.55,
        emissive: color, emissiveIntensity: 0.22,
        transparent: true, opacity: 0.92
      });
      scene.add(new THREE.Mesh(geo, mat));

      // 通道名标签
      const tag = makeTextSprite(s.name);
      tag.position.set(s.pts[0].x - 8, 6, z);
      scene.add(tag);

      // 异常点晶体
      s.pts.forEach(p => {
        if (!p.outlier) return;
        const y = ((p.y - s.min) / (s.max - s.min)) * H_MAX;
        const cry = new THREE.Mesh(
          new THREE.OctahedronGeometry(1.5),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xff2d2d, emissiveIntensity: 1.6, roughness: 0.2 })
        );
        cry.position.set(p.x, y + 1.6, z);
        scene.add(cry);
        crystals.push({ mesh: cry, baseY: y + 1.6, row: p.x, channel: s.name, value: p.y,
          verified: null });
      });
    });

    // 事件石碑
    (state.events || []).forEach(ev => {
      const x = ev.x;
      const stele = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 6, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
      );
      stele.position.set(x, 3, -10);
      scene.add(stele);
      const tag = makeTextSprite(ev.label || '事件');
      tag.position.set(x, 7.4, -10);
      scene.add(tag);
    });

    // 猎人模式的飞行器
    let ship = null;
    if (mode === 'hunter') {
      ship = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 4.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.9 })
      );
      ship.rotation.z = Math.PI / 2;
      scene.add(ship);
    }

    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:14px;left:16px;color:#e2e8f0;font:14px "Microsoft YaHei",sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre-line;';
    overlay.appendChild(hud);
    const exitBtn = document.createElement('button');
    exitBtn.textContent = '退出 (Esc)';
    exitBtn.style.cssText = 'position:absolute;top:12px;right:14px;padding:6px 14px;border-radius:8px;border:1px solid #475569;background:rgba(15,23,42,0.8);color:#e2e8f0;cursor:pointer;font-size:13px;';
    overlay.appendChild(exitBtn);

    st = {
      overlay: overlay, renderer: renderer, scene: scene, camera: camera,
      series: series, crystals: crystals, ship: ship, hud: hud,
      mode: mode || 'fly', replay: false, replayT: 0,
      keys: {},
      // 初始朝向对准数据（yaw 由相机位置 → 数据中心的方向反解）
      yaw: Math.atan2(-(s0.pts.length * 0.4 - camera.position.x), -(midZ - camera.position.z)),
      pitch: -0.22,
      shipX: 0, hunterHits: [], closed: false,
      raf: 0, last: 0
    };
    if (st.mode === 'hunter') st.yaw = 0; // 猎人模式相机由代码控制

    /* ---------- 交互 ---------- */

    const onKey = e => {
      if (e.key === 'Escape') { close(); return; }
      if (st.mode === 'fly' || st.mode === 'hunter') st.keys[e.key.toLowerCase()] = e.type === 'keydown';
      if (e.key === 'r' || e.key === 'R') st.replay = !st.replay;
      if (e.type === 'keydown') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let dragging = false, lx = 0, ly = 0;
    renderer.domElement.addEventListener('pointerdown', e => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      if (st.mode === 'hunter') tryShoot(e);
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      st.yaw -= (e.clientX - lx) * 0.0035;
      st.pitch -= (e.clientY - ly) * 0.0035;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch));
      lx = e.clientX; ly = e.clientY;
    });
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    exitBtn.addEventListener('click', close);
    st.cleanup = () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('resize', onResize);
    };

    st.last = performance.now();
    loop();

    // 猎人模式：射击判定
    function tryShoot(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const meshes = st.crystals.filter(c => !c.verified).map(c => c.mesh);
      const hit = ray.intersectObjects(meshes)[0];
      if (!hit) return;
      const target = st.crystals.find(c => c.mesh === hit.object);
      if (target) showVerdict(target, e.clientX, e.clientY);
    }

    function showVerdict(target, px, py) {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;z-index:5;padding:10px 14px;border-radius:10px;background:rgba(15,23,42,0.94);border:1px solid #475569;color:#e2e8f0;font:13px "Microsoft YaHei",sans-serif;';
      box.style.left = Math.min(px, window.innerWidth - 240) + 'px';
      box.style.top = Math.min(py, window.innerHeight - 120) + 'px';
      box.innerHTML = `<div style="margin-bottom:8px">通道 <b>${target.channel}</b> · 第 ${target.row + 1} 点 · 值 ${target.value}</div>` +
        '<div style="display:flex;gap:8px">' +
        '<button data-v="real" style="padding:5px 12px;border-radius:6px;border:1px solid #dc2626;background:#dc2626;color:#fff;cursor:pointer">真异常</button>' +
        '<button data-v="false" style="padding:5px 12px;border-radius:6px;border:1px solid #16a34a;background:#16a34a;color:#fff;cursor:pointer">误报</button></div>';
      overlay.appendChild(box);
      box.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          target.verified = b.dataset.v;
          if (target.verified === 'false') {
            target.mesh.material.color.setHex(0x16a34a);
            target.mesh.material.emissive.setHex(0x22c55e);
            target.mesh.rotation.z = Math.PI / 4;
            target.mesh.position.y = 0.8;
          } else {
            target.mesh.material.emissiveIntensity = 2.4;
          }
          st.hunterHits.push({ row: target.row, channel: target.channel, value: target.value, verdict: target.verified });
          box.remove();
        });
      });
    }

    /* ---------- 渲染循环 ---------- */

    function loop() {
      if (!st || st.closed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - st.last) / 1000);
      st.last = now;

      const cam = st.camera;
      const len = st.series[0].pts.length;

      if (st.mode === 'hunter' && st.ship) {
        // 飞行器沿时间推进（跟随第一个通道的地形高度）
        st.shipX = Math.min(len - 1, st.shipX + dt * 6);
        const s0 = st.series[0];
        const idx = Math.min(s0.pts.length - 1, Math.round(st.shipX));
        const y0 = ((s0.pts[idx].y - s0.min) / (s0.max - s0.min)) * H_MAX;
        st.ship.position.set(st.shipX, y0 + 4, CHANNEL_GAP * (st.series.length - 1) / 2);
        cam.position.set(st.shipX - 16, y0 + 10, st.ship.position.z + 6);
        cam.lookAt(st.shipX + 14, y0 + 2, st.ship.position.z);
        st.hud.textContent = `异常猎人 · 前进 ${(st.shipX / len * 100).toFixed(0)}%\n已复核 ${st.hunterHits.length} / ${st.crystals.filter(c => !c.verified).length + st.hunterHits.length} 处\n鼠标点击红色晶体进行判定，Esc 结束`;
        if (st.shipX >= len - 1) finishHunter();
      } else if (st.replay) {
        // 回放：相机沿时间轴匀速飞行
        st.replayT = (st.replayT + dt * 0.06) % 1;
        const x = st.replayT * len;
        cam.position.set(x - 12, H_MAX * 0.8, CHANNEL_GAP * (st.series.length - 1) / 2 + 14);
        cam.lookAt(x + 12, H_MAX * 0.4, CHANNEL_GAP * (st.series.length - 1) / 2);
        st.hud.textContent = `回放中 ${(st.replayT * 100).toFixed(0)}% · 按 R 停止回放\n← ↑ → ↓ / WASD 移动 · 鼠标拖动转视角 · Esc 退出`;
      } else {
        // 自由飞行
        const sp = 46 * dt;
        const fx = Math.cos(st.yaw), fz = Math.sin(st.yaw);
        if (st.keys['w'] || st.keys['arrowup']) { cam.position.x += fx * sp; cam.position.z += fz * sp; }
        if (st.keys['s'] || st.keys['arrowdown']) { cam.position.x -= fx * sp; cam.position.z -= fz * sp; }
        if (st.keys['a'] || st.keys['arrowleft']) { cam.position.x += fz * sp; cam.position.z -= fx * sp; }
        if (st.keys['d'] || st.keys['arrowright']) { cam.position.x -= fz * sp; cam.position.z += fx * sp; }
        if (st.keys['q']) cam.position.y += sp;
        if (st.keys['e']) cam.position.y -= sp;
        cam.rotation.order = 'YXZ';
        cam.rotation.y = st.yaw;
        cam.rotation.x = st.pitch;
        st.hud.textContent = `${st.mode === 'hunter' ? '猎人待机' : '自由飞行'} · 按 R 回放 · 鼠标拖动转视角\n← ↑ → ↓ / WASD 移动 · Q/E 升降 · Esc 退出`;
      }

      // 晶体脉动
      const t = now / 600;
      st.crystals.forEach((c, i) => {
        if (!c.verified) {
          const s = 1 + Math.sin(t + i) * 0.18;
          c.mesh.scale.set(s, s, s);
        }
      });

      st.renderer.render(st.scene, st.camera);
      st.raf = requestAnimationFrame(loop);
    }
    return true;
  }

  function finishHunter() {
    if (!st || st._finished) return;
    st._finished = true;
    st.replay = false;
    const real = st.hunterHits.filter(h => h.verdict === 'real');
    const false_ = st.hunterHits.filter(h => h.verdict === 'false');
    st.hud.textContent = `猎人结算\n真异常 ${real.length} 处 · 误报 ${false_.length} 处\n结果已写入异常复核清单，Esc 退出`;
    // 复核清单写进操作流水，进报告
    (window.pushOp || function () {})(
      `异常猎人复核：共 ${st.hunterHits.length} 处，确认真异常 ${real.length} 处（` +
      real.map(h => `${h.channel}#${h.row + 1}`).join('、') + '），误报 ' + false_.length + ' 处'
    );
    // state 是 app.js 的顶层 const（全局词法绑定），不是 window 属性——
    // 用 typeof 探测后直接赋值，否则 window.state 恒为 undefined，复核清单会丢
    if (typeof state !== 'undefined' && state) state.hunterVerdicts = st.hunterHits.slice();
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
  function getHunterVerdicts() {
    if (st) return st.hunterHits.slice();
    return (typeof state !== 'undefined' && state && state.hunterVerdicts) || [];
  }

  return { open: open, close: close, isOpen: isOpen, supported: supported, getHunterVerdicts: getHunterVerdicts };
})();
