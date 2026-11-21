/* =========================================================
   engine-worker.js — Web Worker 解析引擎脚本（v4.0）
   在子线程里跑 parser + stats + conclusion，主线程不卡 UI。
   通过 importScripts 复用同一份 parser.js / analysis.js（与页面完全同源，
   主线程与 Worker 的解析结果保证逐位一致）。
   协议：postMessage({ id, cmd: 'parse', payload: { pending, opts } })
   返回：postMessage({ id, ok, result | error })
   注意：file:// 下 Worker 与 importScripts 均受限，主线程侧会自动回退
   同步解析（见 engine.js），不影响"双击即用"。
   ========================================================= */

importScripts('parser.js');

self.onmessage = function (e) {
  const { id, cmd, payload } = e.data || {};
  try {
    if (cmd !== 'parse') throw new Error('未知命令：' + cmd);
    const ds = LabParser.parse(payload.pending, payload.opts);
    if (!ds.rows.length) throw new Error('未识别到有效数据行，请检查内容或解析设置');
    // 只做 parse（CPU 大头）；stats / conclusion 仍由主线程 refreshDerived 统一计算，
    // 保证口径切换、合并、换算等路径与 Worker 路径共用同一套后处理
    self.postMessage({ id: id, ok: true, result: { ds: ds } });
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: (err && err.message) || String(err) });
  }
};
