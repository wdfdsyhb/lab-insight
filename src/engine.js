/* =========================================================
   engine.js — Web Worker 解析引擎主线程封装（v4.0）
   LabEngine.parseAsync(pending, opts) → Promise<{ds, stats, conclusion}>
   · 部署环境（http/https）：大数据走 Worker，主线程不卡 UI
   · file:// 双击环境：Worker 创建失败时自动回退主线程同步解析，
     结果一致，功能不缺失（保证"双击即用"）
   · 30 秒超时同样回退主线程重算，避免 Worker 异常导致界面无响应
   ========================================================= */

const LabEngine = (() => {

  let worker = null;
  let seq = 0;

  function canUseWorker() {
    if (typeof Worker === 'undefined') return false;
    if (LabEngine._workerBroken) return false;
    return true;
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('engine-worker.js');
    return worker;
  }

  // 主线程回退路径：与 worker 跑同一套模块，结果逐位一致
  function mainThreadParse(pending, opts) {
    return { ds: LabParser.parse(pending, opts) };
  }

  function parseAsync(pending, opts) {
    return new Promise((resolve, reject) => {
      if (!canUseWorker()) {
        try { resolve(mainThreadParse(pending, opts)); }
        catch (e) { reject(e); }
        return;
      }
      let w;
      try { w = getWorker(); }
      catch (e) {
        LabEngine._workerBroken = true; // file:// 下 new Worker 直接抛错
        try { resolve(mainThreadParse(pending, opts)); }
        catch (e2) { reject(e2); }
        return;
      }
      const id = ++seq;
      const timer = setTimeout(() => {
        LabEngine._workerBroken = true;
        cleanup();
        try { resolve(mainThreadParse(pending, opts)); }
        catch (e) { reject(e); }
      }, 30000);
      const onMsg = (ev) => {
        if (!ev.data || ev.data.id !== id) return;
        clearTimeout(timer);
        cleanup();
        if (ev.data.ok) resolve(ev.data.result);
        else reject(new Error(ev.data.error || 'Worker 解析失败'));
      };
      const cleanup = () => w.removeEventListener('message', onMsg);
      w.addEventListener('message', onMsg);
      w.postMessage({ id: id, cmd: 'parse', payload: { pending: pending, opts: opts } });
    });
  }

  return { parseAsync: parseAsync, _workerBroken: false };
})();
