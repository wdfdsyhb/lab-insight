/* =========================================================
   sim-py-worker.js — 仿真页 Python 执行 Worker（v4.3 方案 Y）
   在 Worker 线程里跑 Pyodide（CPython WASM，本地 vendor/pyodide/），
   给学生代码提供 MicroPython 风格的 machine 模拟层：

   from machine import Pin, ADC, PWM
   pin = Pin(2, Pin.OUT)
   pin.value(1)            → 桥到 LabSim 虚拟元件（主线程）
   adc = ADC(34); adc.read() → 读主线程推送的输入快照
   print(...)              → 桥到仿真页事件日志 / 串口监视器

   桥协议（postMessage）：
   主线程 → Worker：{cmd:'start', code, indexURL}
                    {cmd:'inputs', digital:{gpio:0/1}, analog:{gpio:0~1}}
   Worker → 主线程：{type:'ready'} {type:'pin', g, v} {type:'pwm', g, duty}
                    {type:'print', text} {type:'error', text} {type:'done'}

   限制（诚实声明）：Pyodide 是 CPython WASM，不是 ESP32 固件——
   machine 层是语义模拟（Pin/ADC/PWM 接口兼容），代码语法与真板一致；
   真 ESP32 指令级执行 = 方案 Z（esp-qemu WASM，见 docs/方案Z-esp-qemu.md）。
   file:// 下 Worker 与 wasm fetch 受限 → Python 模式需要 http/https 环境。
   ========================================================= */

let pyodide = null;
let loading = null;
let inputs = { digital: {}, analog: {} };
let stopFlag = false;

// 顶层探针：worker 脚本加载即回报（诊断通信链路）
self.postMessage({ type: 'print', text: '[worker] sim-py-worker.js 已加载' });
self.onerror = function (ev) {
  self.postMessage({ type: 'print', text: '[worker 异常] ' + (ev.message || (ev && ev.filename) || '未知') });
};

function bridge() {
  return {
    simPinMode: function (g, mode, pull) {
      self.postMessage({ type: 'pinmode', g: g, mode: mode, pull: pull });
    },
    simPinWrite: function (g, v) {
      self.postMessage({ type: 'pin', g: g, v: v ? 1 : 0 });
    },
    simPinPWM: function (g, duty) {
      self.postMessage({ type: 'pwm', g: g, duty: duty });
    },
    simPinRead: function (g) {
      const d = inputs.digital;
      if (d[g] !== undefined) return d[g] ? 1 : 0;
      return 0;
    },
    simAdcRead: function (g) {
      const a = inputs.analog;
      if (a[g] !== undefined) return Math.round(a[g] * 4095);
      return 0;
    },
    simSleep: function (sec) {
      // 兜底路径专用（同步 runPython 时）。忙等会阻塞 worker 消息队列，
      // 因此正常路径改用下面的 wrapAsync()：把 time.sleep 换成 asyncio.sleep，
      // 让 worker 在 await 处回到事件循环，能收到主线程推来的 inputs 更新。
      const end = Date.now() + Math.min(2000, sec * 1000);
      while (Date.now() < end) { /* busy wait */ }
    }
  };
}

/* ---------------------------------------------------------
   v4.3 修复：Python 运行期间输入冻结
   原实现用 py.runPython() 一次性同步执行学生代码，配合忙等 sleep，
   worker 线程在执行期间完全不处理 postMessage —— 主线程每 100 ms 推送的
   {cmd:'inputs'} 全被丢弃，ADC/Pin 读取永远停在启动那一刻的快照。
   办法：把 time.sleep(...) 改写为 await asyncio.sleep(...)，整段代码包进
   async 函数后用 runPythonAsync 执行。await 处 worker 回到事件循环，
   消息队列得以消费，输入实时生效；学生代码写法（while True + time.sleep）
   一字不改。改写失败（语法非常规）时回退同步执行，行为与 v4.3 原版一致。
   --------------------------------------------------------- */
function wrapAsync(code) {
  let src = String(code || '');
  if (!src.trim()) return null;
  // time.sleep(x) → await asyncio.sleep(x)
  src = src.replace(/\btime\.sleep\s*\(/g, 'await asyncio.sleep(');
  // from time import sleep 后的裸 sleep(x)（不碰 asyncio.sleep）
  src = src.replace(/(^|[^.\w])sleep\s*\(/g, function (m, pre) {
    return pre + 'await asyncio.sleep(';
  });
  const body = src.split('\n').map(function (l) {
    return l.length ? '    ' + l : l;
  }).join('\n');
  return 'import asyncio\n' +
    'async def __lab_main():\n' + body + '\n\n' +
    'await __lab_main()\n';
}

const MACHINE_PY = [
  'import js as _js',
  '',
  'class Pin:',
  '    OUT = 1',
  '    IN = 0',
  '    PULL_UP = 2',
  '    PULL_DOWN = 1',
  '    def __init__(self, num, mode=-1, pull=-1, value=None):',
  '        self.num = num',
  '        self.mode = mode',
  '        _js.simPinMode(num, mode if mode >= 0 else 0, pull if pull >= 0 else -1)',
  '        if value is not None:',
  '            self.value(value)',
  '    def value(self, v=None):',
  '        if v is None:',
  '            return _js.simPinRead(self.num)',
  '        _js.simPinWrite(self.num, 1 if v else 0)',
  '    def on(self):',
  '        self.value(1)',
  '    def off(self):',
  '        self.value(0)',
  '    def toggle(self):',
  '        self.value(0 if self.value() else 1)',
  '',
  'class ADC:',
  '    ATTN_0DB = 0',
  '    ATTN_11DB = 3',
  '    width_12bit = 12',
  '    def __init__(self, pin, atten=3):',
  '        self.pin = pin',
  '    def read(self):',
  '        return _js.simAdcRead(self.pin)',
  '    def read_u16(self):',
  '        return min(65535, _js.simAdcRead(self.pin) * 16)',
  '',
  'class PWM:',
  '    def __init__(self, pin, freq=1000, duty=None, duty_u16=None):',
  '        self.pin = pin',
  '        d = duty_u16 / 65535 if duty_u16 is not None else (duty if duty is not None else 0.5)',
  '        _js.simPinPWM(pin, max(0.0, min(1.0, d)))',
  '    def duty(self, d):',
  '        _js.simPinPWM(self.pin, max(0.0, min(1.0, d / 1023)))',
  '',
  'import time as _time',
  '_orig_sleep = _time.sleep',
  'def _sleep(s):',
  '    _js.simSleep(s)',
  '_time.sleep = _sleep',
  'time = _time',
  '',
  '# 注册为可导入的 machine 模块（学生代码 from machine import Pin 即可用）',
  'import types as _types',
  'import sys as _sys',
  '_machine_mod = _types.ModuleType("machine")',
  '_machine_mod.Pin = Pin',
  '_machine_mod.ADC = ADC',
  '_machine_mod.PWM = PWM',
  '_sys.modules["machine"] = _machine_mod'
].join('\n');

async function boot(indexURL) {
  if (pyodide) return pyodide;
  if (loading) return loading;
  loading = (async function () {
    importScripts(indexURL + 'pyodide.js');
    const b = bridge();
    self.__simBridge = b;
    // 桥函数逐个挂到 worker 全局（Python 侧 _js.simPinWrite 等直接可用；
    // 不能带双下划线前缀——类方法内会被 Python name mangling 改写）
    Object.keys(b).forEach(function (k) { self[k] = b[k]; });
    const py = await loadPyodide({ indexURL: indexURL });
    py.setStdout({ batched: function (s) { self.postMessage({ type: 'print', text: s }); } });
    py.setStderr({ batched: function (s) { self.postMessage({ type: 'print', text: '[err] ' + s }); } });
    py.runPython(MACHINE_PY);
    pyodide = py;
    self.postMessage({ type: 'ready' });
    return py;
  })();
  return loading;
}

self.onmessage = async function (e) {
  const msg = e.data || {};
  if (msg.cmd === 'inputs') {
    inputs.digital = msg.digital || {};
    inputs.analog = msg.analog || {};
    return;
  }
  if (msg.cmd === 'stop') {
    stopFlag = true;
    return;
  }
  if (msg.cmd !== 'start') return;
  stopFlag = false;
  try {
    self.postMessage({ type: 'status', text: 'Python 运行时加载中（首次约 13 MB，本地 vendor）…' });
    const py = await boot(msg.indexURL || 'vendor/pyodide/');
    self.postMessage({ type: 'status', text: 'Python 就绪，运行用户代码…' });
    const wrapped = wrapAsync(msg.code || '');
    try {
      if (wrapped) {
        await py.runPythonAsync(wrapped);
      } else {
        py.runPython(msg.code || '');
      }
      self.postMessage({ type: 'done' });
    } catch (err) {
      if (stopFlag) {
        self.postMessage({ type: 'status', text: 'Python 已停止' });
      } else {
        // 异步改写失败（学生代码含非常规语法）→ 回退同步执行，保证还能跑
        if (/SyntaxError|IndentationError/.test(String(err && err.name) + String(err && err.message))) {
          try {
            py.runPython(msg.code || '');
            self.postMessage({ type: 'done' });
            return;
          } catch (err2) {
            self.postMessage({ type: 'error', text: String(err2.message || err2) });
            return;
          }
        }
        self.postMessage({ type: 'error', text: String(err.message || err) });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', text: 'Pyodide 加载失败：' + String(err.message || err) });
  }
};
