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

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('浏览器不支持 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
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

  /* ---------- 保存快照 ---------- */

  // 把当前待解析输入 + 解析设置 + 报告信息 + 操作流水存入 IndexedDB
  function snapshot() {
    const p = state.pending;
    if (!p) return null;
    let aoa = null;
    if (p.aoa) {
      try { aoa = JSON.parse(JSON.stringify(p.aoa)); } catch (e) { aoa = null; }
    }
    return {
      version: 1,
      savedAt: Date.now(),
      pending: {
        text: p.text || null,
        aoa,
        fileName: p.fileName || null,
        sourceType: p.sourceType || 'text'
      },
      pendingNote: state.pendingNote || '',
      parseOpts: {
        skipRows: $('opt-skip-rows').value,
        timeCol: $('opt-time-col').value,
        delimiter: $('opt-delimiter').value
      },
      reportInfo: {
        title: $('report-title').value || '',
        purpose: $('report-purpose').value || ''
      },
      ops: (state.ops || []).slice(-30)
    };
  }

  // 解析成功后自动保存（800ms 防抖，避免高频触发）
  let saveTimer = 0;
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snap = snapshot();
      if (!snap) return;
      put(snap).catch(() => { /* 存储失败静默：保存是尽力而为 */ });
    }, 800);
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
      $('report-title').value = snap.reportInfo.title || '';
      $('report-purpose').value = snap.reportInfo.purpose || '';
    }
    // 接回流水：只保留列加工类记录（换算/滤波——恢复后的数据里真实存在这些列）。
    // 解析与体检类记录过时（快照存的是原始输入，恢复后由本次解析重新记录，体检卡重新提示）。
    state.pendingOps = Array.isArray(snap.ops)
      ? snap.ops.filter(op => op.includes('换算') || op.includes('滤波'))
      : []; // 解析成功后接回流水
    $('project-banner').classList.add('hidden');
    toast(fromBanner ? '项目已恢复，正在重新解析…' : '项目已导入，正在解析…', 'success');
    doParse();
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

  return { autoSave, offerRestore, wireBanner, wireImportExport, exportJson, importJson, get, clear };
})();
