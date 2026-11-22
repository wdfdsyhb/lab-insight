#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_dist.py — 生成部署包 dist/

只做一件事：把 src/ 复制到 dist/，并排除只给 file:// 双击场景用的
vendor/pyodide/pyodide-embed.js（17 MB）。

为什么排除：embed 是 Pyodide 运行时的 base64 内嵌副本，只在 file:// 下被
动态加载（app.js 的 ensureEmbed，location.protocol === 'file:' 才触发）。
http/https 部署走 vendor/pyodide/ 里的原始文件，那 17 MB 传上去没人用。

本地想双击 file:// 试 Python，直接开 src/index.html（src 里始终保留 embed）。

用法：在项目根目录运行  python build_dist.py

注意：脚本会先删掉整个 dist/ 再重建。如果正用 `python -m http.server`
挂着 dist 目录预览，先停掉那个进程，否则 Windows 会因文件被占用报
PermissionError [WinError 32]。
"""

import os
import shutil
import sys

SRC = 'src'
DIST = 'dist'
SKIP = {os.path.join('vendor', 'pyodide', 'pyodide-embed.js')}


def main():
    root = os.path.abspath(os.path.dirname(__file__))
    os.chdir(root)

    if not os.path.isdir(SRC):
        print('找不到 src/，请在项目根目录运行', file=sys.stderr)
        return 1

    if os.path.isdir(DIST):
        shutil.rmtree(DIST)

    copied = 0
    skipped = []
    for dirpath, _dirnames, filenames in os.walk(SRC):
        rel_dir = os.path.relpath(dirpath, SRC)
        for name in filenames:
            rel = name if rel_dir == '.' else os.path.join(rel_dir, name)
            if rel in SKIP:
                skipped.append(rel)
                continue
            dst_dir = DIST if rel_dir == '.' else os.path.join(DIST, rel_dir)
            os.makedirs(dst_dir, exist_ok=True)
            shutil.copy2(os.path.join(dirpath, name), os.path.join(dst_dir, name))
            copied += 1

    total = 0
    for dirpath, _dirnames, filenames in os.walk(DIST):
        for name in filenames:
            total += os.path.getsize(os.path.join(dirpath, name))

    print('dist/ 就绪：%d 个文件，%.1f MB' % (copied, total / 1048576))
    for rel in skipped:
        print('  已排除（仅 file:// 需要）：%s' % rel)
    return 0


if __name__ == '__main__':
    sys.exit(main())
