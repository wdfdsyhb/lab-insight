/* =========================================================
   project.js — 项目保存与恢复（IndexedDB，纯本地）
   自动保存：解析成功后写入当前数据与设置；
   恢复：刷新页面后弹出横幅，可一键恢复或忽略；
   导出 / 导入：项目 JSON 文件，方便换设备或备份。
   ========================================================= */

const LabProject = (() => {

  const DB_NAME = 'labinsight';
  const STORE = 'kv';
  const KEY = 'project';
  const PSTORE = 'projects';   // v3.0：多项目库（keyPath: id）
  const DB_VER = 2;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('浏览器不支持 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PSTORE)) db.createObjectStore(PSTORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
  }

  function put(value) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('写入失败')); };
    }));
  }

  function get() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error || new Error('读取失败')); };
    }));
  }

  function clear() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('清除失败')); };
    }));
  }

  /* ---------- v3.0 多项目库 ---------- */

  function tx(store, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      let out;
      try { out = fn(os); } catch (e) { db.close(); reject(e); return; }
      t.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
      t.onerror = () => { db.close(); reject(t.error || new Error('操作失败')); };
    }));
  }

  // 全部项目（按保存时间倒序）
  function listAll() {
    return tx(PSTORE, 'readonly', os => {
      const out = [];
      const req = os.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push(c.value); c.continue(); }
      };
      return { get result() { return out; } };
    }).then(list => list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
  }

  function getOne(id) {
    return tx(PSTORE, 'readonly', os => {
      const req = os.get(id);
      return { get result() { return req.result || null; } };
    });
  }

  function putOne(rec) {
    return tx(PSTORE, 'readwrite', os => { os.put(rec); return null; });
  }

  function delOne(id) {
    return tx(PSTORE, 'readwrite', os => { os.delete(id); return null; });
  }

  // 当前项目 id（sessionStorage 记不住就靠内存）
  let currentId = null;
  function setCurrent(id) { currentId = id; }
  function getCurrent() { return currentId; }

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- 保存快照 ---------- */

  // 把当前待解析输入 + 解析设置 + 报告信息 + 操作流水存入 IndexedDB
  function snapshot() {
    const p = state.pending;
    if (!p) return null;
    let aoa = null;
    if (p.aoa) {
      try { aoa = JSON.parse(JSON.stringify(p.aoa)); } catch (e) { aoa = null; }
    }
    const val = id => { const el = $(id); return el ? el.value : ''; };
    return {
      version: 2,
      savedAt: Date.now(),
      pending: {
        text: p.text || null,
        aoa,
        fileName: p.fileName || null,
        sourceType: p.sourceType || 'text'
      },
      pendingNote: state.pendingNote || '',
      parseOpts: {
        skipRows: val('opt-skip-rows'),
        timeCol: val('opt-time-col'),
        delimiter: val('opt-delimiter')
      },
      reportInfo: {
        title: val('report-title'),
        purpose: val('report-purpose'),
        equipment: val('report-equipment'),
        steps: val('report-steps'),
        notes: val('report-notes'),
        dataRecord: val('report-datarec'),
        instruments: val('report-instruments')
      },
      // v3.0：事件标注与异常口径一并存（恢复后图表与结论一致）
      events: (state.events || []).slice(),
      outlierMethod: state.outlierMethod || 'mad',
      ops: (state.ops || []).slice(-30)
    };
  }

  // 解析成功后自动保存（800ms 防抖，避免高频触发）
  // 只写「上次项目」快照，不动项目库条目——库里的实验只在用户点「存为实验」时更新，
  // 否则恢复某个实验后的一次自动保存就会把该实验的存档覆盖成当前内存状态。
  let saveTimer = 0;
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snap = snapshot();
      if (!snap) return;
      put(snap).catch(() => { /* 存储失败静默：保存是尽力而为 */ });
    }, 800);
  }

  /* ---------- v3.0 项目库操作 ---------- */

  let currentName = null;

  // 把当前状态存进项目库：同名（当前实验）更新，换名字则新建一条
  function saveToLibrary(name) {
    const snap = snapshot();
    if (!snap) { toast('请先导入数据', 'error'); return Promise.resolve(null); }
    const nm = name || '未命名实验';
    const reuse = currentId && currentName === nm;
    const rec = { ...snap, id: reuse ? currentId : newId(), name: nm };
    currentId = rec.id;
    currentName = rec.name;
    return putOne(rec).then(() => {
      renderLibrary();
      toast(reuse ? `已更新实验：${rec.name}` : `已存为实验：${rec.name}`, 'success');
      return rec;
    }).catch(e => { toast('保存失败：' + e.message, 'error'); return null; });
  }

  // 恢复一条项目记录
  function loadFromLibrary(id) {
    return getOne(id).then(rec => {
      if (!rec) { toast('项目不存在', 'error'); return; }
      currentId = rec.id;
      currentName = rec.name;
      restoreFrom(rec, false);
      renderLibrary();
    }).catch(e => toast('读取失败：' + e.message, 'error'));
  }

  function renameInLibrary(id, name) {
    return getOne(id).then(rec => {
      if (!rec) return;
      rec.name = name;
      if (rec.id === currentId) currentName = name;
      return putOne(rec).then(() => renderLibrary());
    }).catch(() => {});
  }

  function deleteFromLibrary(id) {
    return delOne(id).then(() => {
      if (id === currentId) { currentId = null; currentName = null; }
      renderLibrary();
      toast('已从实验库删除', 'success');
    }).catch(e => toast('删除失败：' + e.message, 'error'));
  }

  function fmtSavedAt(ts) {
    if (!ts) return '';
    const t = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }

  function rowCountOf(rec) {
    const p = rec.pending || {};
    if (p.text) return p.text.split(/\r?\n/).filter(x => x.trim()).length + ' 行文本';
    if (p.aoa) return p.aoa.length + ' 行表格';
    return '';
  }

  // 渲染实验库列表
  function renderLibrary() {
    const box = $('project-list');
    if (!box) return;
    listAll().then(list => {
      box.innerHTML = '';
      const cnt = $('project-lib-count');
      if (cnt) cnt.textContent = list.length ? `共 ${list.length} 个实验` : '';
      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'project-empty';
        empty.textContent = '还没有保存的实验。解析数据后点「存为实验」即可建一个。';
        box.appendChild(empty);
        return;
      }
      list.forEach(rec => {
        const item = document.createElement('div');
        item.className = 'project-item' + (rec.id === currentId ? ' current' : '');
        const src = (rec.pending && rec.pending.fileName) || rowCountOf(rec) || '本地数据';
        item.innerHTML =
          `<div class="pi-main"><div class="pi-name"></div>` +
          `<div class="pi-meta">${src} · ${fmtSavedAt(rec.savedAt)}</div></div>` +
          `<div class="pi-actions">` +
          `<button class="btn btn-ghost btn-sm" data-act="load">打开</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="rename">重命名</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="del">删除</button>` +
          `</div>`;
        item.querySelector('.pi-name').textContent = rec.name || '未命名实验';
        item.querySelector('[data-act="load"]').addEventListener('click', () => loadFromLibrary(rec.id));
        item.querySelector('[data-act="rename"]').addEventListener('click', () => {
          const n = window.prompt('重命名实验', rec.name || '未命名实验');
          if (n && n.trim()) renameInLibrary(rec.id, n.trim());
        });
        item.querySelector('[data-act="del"]').addEventListener('click', () => {
          if (window.confirm(`删除实验「${rec.name}」？此操作不可撤销。`)) deleteFromLibrary(rec.id);
        });
        box.appendChild(item);
      });
    }).catch(() => {});
  }

  function wireLibrary() {
    const saveBtn = $('project-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name = window.prompt('实验名称', currentName || '未命名实验');
        if (name && name.trim()) saveToLibrary(name.trim());
      });
    }
    renderLibrary();
  }

  /* ---------- 恢复横幅 ---------- */

  function describeSource(snap) {
    const p = snap.pending || {};
    const src = p.fileName || (p.text ? '粘贴内容' : p.aoa ? 'Excel 数据' : '未知来源');
    let rows = '';
    if (p.text) rows = p.text.split(/\r?\n/).filter(x => x.trim()).length + ' 行文本';
    else if (p.aoa) rows = p.aoa.length + ' 行表格';
    const t = new Date(snap.savedAt);
    const pad = n => String(n).padStart(2, '0');
    const time = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
    return `${src}${rows ? '（' + rows + '）' : ''} · 保存于 ${time}`;
  }

  // 启动时检查本地项目并显示恢复横幅
  function offerRestore() {
    get().then(snap => {
      if (!snap || !snap.pending) return;
      const banner = $('project-banner');
      $('project-banner-desc').textContent = describeSource(snap);
      banner.classList.remove('hidden');
      banner.dataset.snapshot = JSON.stringify(snap); // 挂在 DOM 上，点恢复时取出
    }).catch(() => { /* IndexedDB 不可用则静默 */ });
  }

  function wireBanner() {
    $('project-restore-btn').addEventListener('click', () => {
      const banner = $('project-banner');
      const raw = banner.dataset.snapshot;
      if (!raw) return;
      let snap;
      try { snap = JSON.parse(raw); } catch (e) { toast('恢复失败：本地数据损坏', 'error'); return; }
      restoreFrom(snap, true);
    });
    $('project-dismiss-btn').addEventListener('click', () => {
      $('project-banner').classList.add('hidden');
      clear().catch(() => {});
      toast('已忽略，本地保存已清除');
    });
  }

  // 把快照写回界面并自动解析。fromBanner=true 时来自页面横幅
  function restoreFrom(snap, fromBanner) {
    const p = snap.pending || {};
    state.pending = {
      text: p.text || undefined,
      aoa: p.aoa || undefined,
      fileName: p.fileName || null,
      sourceType: p.sourceType || 'text'
    };
    state.pendingNote = snap.pendingNote || '';
    if (snap.parseOpts) {
      $('opt-skip-rows').value = snap.parseOpts.skipRows ?? '0';
      $('opt-time-col').value = snap.parseOpts.timeCol || 'auto';
      $('opt-delimiter').value = snap.parseOpts.delimiter || 'auto';
    }
    if (snap.reportInfo) {
      const ri = snap.reportInfo;
      const setV = (id, v) => { const el = $(id); if (el) el.value = v || ''; };
      setV('report-title', ri.title);
      setV('report-purpose', ri.purpose);
      setV('report-equipment', ri.equipment);
      setV('report-steps', ri.steps);
      setV('report-notes', ri.notes);
      setV('report-datarec', ri.dataRecord);
      setV('report-instruments', ri.instruments);
    }
    // v3.0：事件标注与异常口径
    state.events = Array.isArray(snap.events) ? snap.events.slice() : [];
    if (snap.outlierMethod) {
      state.outlierMethod = snap.outlierMethod;
      const seg = document.querySelector(`#outlier-method .seg[data-method="${snap.outlierMethod}"]`);
      if (seg) {
        document.querySelectorAll('#outlier-method .seg').forEach(b => b.classList.remove('active'));
        seg.classList.add('active');
      }
    }
    // 接回流水：只保留列加工类记录（换算/滤波——恢复后的数据里真实存在这些列）。
    // 解析与体检类记录过时（快照存的是原始输入，恢复后由本次解析重新记录，体检卡重新提示）。
    state.pendingOps = Array.isArray(snap.ops)
      ? snap.ops.filter(op => op.includes('换算') || op.includes('滤波'))
      : []; // 解析成功后接回流水
    $('project-banner').classList.add('hidden');
    toast(fromBanner ? '项目已恢复，正在重新解析…' : '项目已导入，正在解析…', 'success');
    state.restoringProject = true;   // 让 afterParse 不要清掉项目 id
    doParse();
    setTimeout(() => { state.restoringProject = false; }, 1500);
  }

  /* ---------- 导出 / 导入 JSON ---------- */

  // 不加 BOM：JSON.parse 遇 \uFEFF 会报错
  function exportJson() {
    const snap = snapshot();
    if (!snap) { toast('请先导入数据', 'error'); return; }
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'labinsight-project-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出 ' + a.download, 'success');
  }

  function importJson(file) {
    file.text().then(text => {
      let snap;
      try { snap = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { throw new Error('文件不是合法的 JSON'); }
      if (!snap || !snap.pending) throw new Error('文件缺少项目数据（pending 字段）');
      restoreFrom(snap, false);
    }).catch(e => toast('导入失败：' + e.message, 'error'));
  }

  function wireImportExport() {
    $('project-export-btn').addEventListener('click', exportJson);
    $('project-import-btn').addEventListener('click', () => $('project-import-input').click());
    $('project-import-input').addEventListener('change', () => {
      const f = $('project-import-input').files && $('project-import-input').files[0];
      if (f) importJson(f);
      $('project-import-input').value = '';
    });
  }

  return {
    autoSave, offerRestore, wireBanner, wireImportExport, exportJson, importJson, get, clear,
    // v3.0 多项目库
    wireLibrary, saveToLibrary, loadFromLibrary, renameInLibrary, deleteFromLibrary,
    listAll, renderLibrary, setCurrent, getCurrent
  };
})();
