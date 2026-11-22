# 方案 Z：ESP32 指令级仿真（esp-qemu WASM 化）落地路径

> 2026-11-22 调研与规划。这是 LabInsight 电路仿真的第三层（X 引脚级已交付、Y Pyodide Python 已交付，本文档是 Z 的实施手册）。
> 当前状态：**未实施**——需要 emscripten + QEMU 构建链，本机（Windows，无 WSL 构建环境）无法完成编译，需在 Linux/macOS 或 CI 上做。

## 一、为什么必须 QEMU

ESP32 是 Xtensa LX6/LX7（或 RISC-V for C3）双核架构，专有指令集——浏览器里跑真固件只有三条路：

1. **QEMU 的 espressif 分支编译成 WASM**（Wokwi 的做法，也是本方案）
2. 教育性 ISA 解释器（自写 Xtensa 解释器——工作量大于 QEMU 移植，放弃）
3. 服务端仿真 + 流式回传（需要服务器，违背"纯本地"定位，仅作为付费/企业备选）

开源可用底座：`espressif/esp-qemu`（GPL，espressif 官方维护的 QEMU fork，支持 ESP32/C3/S3/H2 等）。Wokwi 与 espressif 有过合作（wokwi 的 ESP32 仿真即基于该分支）。

## 二、实施步骤（预计 3~6 周）

### 第 1 步：构建 esp-qemu WASM（1~2 周）

```bash
# Linux 或 macOS（WSL2 亦可）
git clone https://github.com/espressif/esp-qemu.git
cd esp-qemu
# QEMU 标准构建依赖 + emscripten
source ~/emsdk/emsdk_env.sh
# 参考 esp-qemu 的构建说明（--target-list=xtensa-softmmu,riscv32-softmmu）
./configure --enable-wasm --target-list=xtensa-softmmu
make -j$(nproc)
```

- 产出：`qemu-system-xtensa.wasm` + 对应 JS glue
- 关键配置：`--enable-wasm` 需要 emscripten 的 QEMU 补丁；espressif 分支已含必要修改
- 验收：在浏览器 Node 环境 run 一个最小 ESP32 镜像（blinky ELF），串口输出到 console

### 第 2 步：与 LabInsight 电路仿真页集成（1 周）

- `sim.js` 的 MCU 规则引擎保留为「无固件模式」；新增「固件模式」：
  - 用户上传 `.bin`（Arduino/IDF 编译产物）或粘贴 ELF
  - 加载到 QEMU WASM 实例：flash 映射 + 复位
  - **串口桥**：QEMU UART 输出 → 仿真页事件日志/串口监视器 → `LabSim.pyPrint`
  - **GPIO 桥**：QEMU 的 GPIO 外设 MMIO 挂钩（esp-q 提供 qtest/虚拟 GPIO 接口——需要在 QEMU 侧开一个 GPIO 虚拟外设 patch，这是第 2 步里唯一要改 QEMU 源码的点）→ `LabSim.pyPinWrite`
- 元件层（LED/按钮/数码管）零改动——直接复用现有引脚级模型

### 第 3 步：编译服务（可选，1 周）

- 浏览器端无法编译 Xtensa C 代码。两条路：
  a. 内置 gcc-xtensa-esp32 的 WASM 版（emscripten 编译工具链——工程量大）
  b. **上传 .bin**：让用户用本地 Arduino IDE/PlatformIO 编译后上传固件（零服务端，推荐起步）
  c. 可选自建编译微服务（违背纯本地，仅比赛演示用）

### 第 4 步：降级与融合（0.5 周）

- 固件模式加载失败时自动回退规则引擎（与现有 pyMode 同样的降级模式）
- 模式切换 UI 扩展为三选：规则引擎 / Python（Pyodide）/ 固件（QEMU）

## 三、风险与已知点

| 风险 | 说明 |
|---|---|
| emscripten 编译 QEMU 的工具链摩擦 | esp-qemu 分支已含大部分 wasm 补丁；若 `--enable-wasm` 不存在，需按 Wokwi 开源过的 qemu 构建脚本（github.com/wokwi/qemu 有部分公开） |
| license | esp-qemu 是 GPL——LabInsight 本体 MIT 不受影响，但 QEMU WASM 文件需单独分发并注明来源 |
| 性能 | WASM QEMU 跑 ESP32 约 20~50 MIPS（Wokwi 实测级别），对教学 blink/传感器足够，跑 WiFi/PSRAM 密集固件会卡 |
| GPIO 外设 patch | QEMU 的 ESP32 机器模型未实现全部 GPIO 外设——需要自己补 GPIO MMIO → 虚拟引脚的映射（这是唯一要写 C 的地方，约 200~400 行） |

## 四、验收标准（实施时用）

1. 上传一个 Arduino 编译的 blink.bin（GPIO2），页面加载后 LED 元件按固件逻辑闪烁
2. 串口监视器打印固件的 Serial.print 输出
3. 波形导出到分析链路（与现有功能一致）
4. 规则引擎模式不受影响（回归）
