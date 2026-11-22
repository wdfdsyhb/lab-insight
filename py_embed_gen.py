#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
py_embed_gen.py — 生成 Pyodide 离线嵌入文件（file:// 双击场景专用）

把 Pyodide 运行时部件转成一个可被 <script src> 加载的 JS 文件（base64 内嵌），
file:// 双击场景下 Worker 与 fetch 受限，该文件是 Python 模式的离线载体。

产出：src/vendor/pyodide/pyodide-embed.js
  window.__PYODIDE_EMBED = { wasmB64, zipB64, lockText, loaderJs, workerSrc, marker }

用法：在项目根目录运行  python py_embed_gen.py
"""

import base64
import io
import json
import os


def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()


def read_text(p):
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    wasm = read_bytes('src/vendor/pyodide/pyodide.asm.wasm')
    stdlib = read_bytes('src/vendor/pyodide/python_stdlib.zip')
    loader = read_text('src/vendor/pyodide/pyodide.js')
    asm_js = read_text('src/vendor/pyodide/pyodide.asm.js')
    lock = read_text('src/vendor/pyodide/pyodide-lock.json')
    worker = read_text('src/sim-py-worker.js')

    wasm_b64 = base64.b64encode(wasm).decode('ascii')
    zip_b64 = base64.b64encode(stdlib).decode('ascii')

    buf = io.StringIO()
    buf.write('/* pyodide-embed.js — 由 py_embed_gen.py 生成（勿手改）\n')
    buf.write('   用途：file:// 双击场景下离线加载 Pyodide。\n')
    buf.write('   wasm 10.1MB -> b64 13.5MB | stdlib 2.3MB -> b64 3.1MB | asm.js %.1fMB */\n' % (
        len(asm_js) / 1048576,))
    buf.write('(function () {\n')
    buf.write('  "use strict";\n')
    buf.write('  const wasmChunks = [];\n')
    # base64 分块写入（每块 1MB，避免单条语句过长）
    CHUNK = 1048576
    pos = 0
    while pos < len(wasm_b64):
        chunk = wasm_b64[pos:pos + CHUNK]
        buf.write('  wasmChunks.push(%s);\n' % json.dumps(chunk))
        pos += CHUNK
    buf.write('  const zipChunks = [];\n')
    pos = 0
    while pos < len(zip_b64):
        chunk = zip_b64[pos:pos + CHUNK]
        buf.write('  zipChunks.push(%s);\n' % json.dumps(chunk))
        pos += CHUNK
    buf.write('  window.__PYODIDE_EMBED = {\n')
    buf.write('    marker: "pyodide-embed-v1",\n')
    buf.write('    wasmB64: wasmChunks.join(""),\n')
    buf.write('    zipB64: zipChunks.join(""),\n')
    buf.write('    lockText: %s,\n' % json.dumps(lock))
    buf.write('    loaderJs: %s,\n' % json.dumps(loader))
    buf.write('    asmJs: %s,\n' % json.dumps(asm_js))
    buf.write('    workerSrc: %s\n' % json.dumps(worker))
    buf.write('  };\n')
    buf.write('})();\n')

    with open('src/vendor/pyodide/pyodide-embed.js', 'w', encoding='utf-8', newline='') as f:
        f.write(buf.getvalue())

    print('OK: src/vendor/pyodide/pyodide-embed.js %.1f MB' % (
        os.path.getsize('src/vendor/pyodide/pyodide-embed.js') / 1048576))


if __name__ == '__main__':
    main()
