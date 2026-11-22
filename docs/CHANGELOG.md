# 变更日志

> Qoder 每完成一个模块，在这里追加一行：`- [完成] <时间> <模块说明>`
> 用户据此验收进度。

## 2026-11-13
- 项目初始化完成（目录结构、需求说明书、示例数据、README）

## 2026-11-14
- [完成] 页面框架与整体样式：顶部固定导航 + 4 页签（导入数据/数据预览/智能分析/生成报告），Notion 白底风格、蓝青主色、卡片布局、响应式与空状态提示（src/index.html、src/style.css）
- [完成] 解析引擎：CSV（PapaParse）/ Excel（SheetJS）/ 串口日志清洗（去前缀与乱码、key=value、混合分隔符、剥单位、HH:mm:ss/日期/纯秒时间戳、坏行跳过计数、UTF-8/GBK、列类型识别）（src/parser.js）
- [完成] 导入页签：拖拽/点选上传、粘贴串口日志、内置示例一键加载、解析设置（起始行/时间戳列/分隔符）、解析结果反馈（src/app.js）
- [完成] 数据预览页签：表格展示、数值列高亮、异常点/脏单元格标记、顶部小结（行数/列数/时间范围/跳过行）、原始文本与清洗后对照、被跳过行清单（src/app.js）
- [完成] 智能分析页签：最大值/最小值/平均值/标准差/极差/漂移统计卡片，Chart.js 折线图（可切散点、滚轮/拖拽缩放平移、多通道开关对比、异常点红点标记），中文结论引擎（趋势/波动分级/离群检测/分段描述，含大模型深度分析折叠区）（src/app.js、src/analysis.js）
- [完成] 生成报告页签：实验名称/目的可编辑，模板自动填（设备与来源/统计表/分析结论/附录摘录），一键复制与导出 .txt/.md（src/report.js、src/app.js）
- [完成] 浏览器实测：file:// 双击打开、串口/CSV/Excel(aoa)/粘贴四种输入全流程走通，无控制台报错
- [修复] 图表多 Y 轴：2~4 条量级差异大的通道各挂独立 Y 轴（y/y1/y2，左侧 1 条+右侧其余），刻度与轴标题按曲线颜色标注，量程各自独立；关到 1 条通道恢复单轴，5 条以上回退共享轴避免拥挤（src/app.js renderChart）
- [完成] 部署上线：发布至 Qoder Sites（webDirectory: dist），并开启公开访问，线上地址 https://lab-insight-vwpscnfaoht.qoder.zone
- [完成] v2 功能 A「校准换算」新页签（置于数据预览与智能分析之间）：NTC 热敏电阻 B 值式 / Steinhart-Hart 双模式温度换算、ADC 读数转电压（位数/Vref/分压系数）、MQ 系列电阻比 Rs/R₀ + log-log 拟合 ppm 近似（MQ-2/MQ-135 预设系数可改）；单值即时换算（支持粘贴一列多行）、批量模式选列换算生成新列（进入统计/图表/报告，原始数据不动），页面注明所用公式与当前参数并保留换算记录列表（src/calib.js、src/app.js、src/index.html、src/style.css）
- [修复] 顶部导航适配 5 页签：窄屏改为横向可滚动，不再挤压换行
- [完成] v2 功能 B「采样质量分析」卡片（数据预览页签底部）：实际平均采样率（Hz）、平均/标称（中位）间隔、间隔抖动（标准差）与最大偏差、丢帧检测（相邻间隔 > 标称×3 列出时间点与估计丢帧数）、时间倒流/重复时间戳检测；无时间戳或行数不足时友好降级提示不报错（src/analysis.js samplingQuality、src/app.js renderSamplingCard、src/index.html、src/style.css）
- [完成] v2 功能 C「滤波实验」新页签（智能分析之后）：滑动平均 / 中值滤波（窗口 3~51 滑块）与一阶低通（α 滑块）三种滤波器可多选叠加对比，原始浅色细线 + 滤波彩色实线同图、图例可开关；统计对比卡片显示处理前后标准差 / 极差 / 异常点数变化；「追加为新列」把滤波结果生成新列供后续统计图表报告使用，滤波公式写在页面上可追溯（src/filter.js、src/app.js、src/index.html、src/style.css）
- [完成] v2 功能 D「FFT 频域分析」（并入滤波实验页签）：本地自实现迭代式基-2 Cooley-Tukey FFT（位反转+蝶形，不足 2 的幂零填充，注明出处无外部依赖），幅度谱折线图 + 谱峰红点自动标注主频/次频/第三频率；变换前扣除均值并在 0 Hz 单独标注直流分量，避免直流零填充泄漏淹没真实谱峰；48.5~51.5 Hz 频带内幅值达全谱 10% 提示疑似工频干扰；采样率取自采样质量分析，无时间戳按 1s 估算并提示（不阻塞）；幅值按实际样本数折算，零填充不稀释（src/fft.js、src/app.js renderFFT、src/index.html、src/style.css）
- [完成] v2 功能 E「导出 PDF」（生成报告页签）：「导出 PDF」按钮走浏览器打印方案（window.print + @media print 样式表），打印视图隐藏导航/按钮/页脚，只保留报告正文——标题、列表、统计表格（真 HTML 表格带边框）、附录代码块均排版输出；报告文本经轻量 Markdown 渲染（src/report.js toHtml、src/app.js、src/index.html、src/style.css 打印样式）
- [完成] v2 功能 F「曲线回放」（智能分析图表区）：「▶ 回放」按钮曲线从左到右逐点绘出（requestAnimationFrame，横轴量程固定），速度 0.5×/1×/2×/4×/瞬时可调、可暂停继续、可重置；系统开启「减弱动态效果」时默认选瞬时不动画；折线/散点两种模式均可用，切换图表或重导数据自动停止回放（src/app.js setupReplay/startReplay/replayFrame 等）
- [完成] v2 收尾检查：375px 窄屏六个页签全部无横向溢出（顶部页签横向滚动、卡片与控件自适应收窄），全流程控制台无报错
- [完成] v2 验收通过后重新部署上线：src 同步至 dist 并发布至 Qoder Sites（同 Project/地址，公开访问保持），线上已核验为 v2（六页签、校准/滤波/FFT/回放/导出 PDF 全部可用），地址不变 https://lab-insight-vwpscnfaoht.qoder.zone

## 2026-11-16
- [完成] v2.1 功能 ①「首屏三步引导」（导入数据页签顶部横幅）：①加载示例 → ②开始解析 → ③查看数据预览三步路径，解析完成前隐藏「下一步」按钮，解析完成后出现并一键跳转数据预览页签（src/index.html guide-steps、src/app.js setupImport、src/style.css）
- [完成] v2.1 功能 ②「导出增强」：智能分析/滤波/FFT 三张图表各加「导出 PNG」按钮（canvas.toBlob 本地导出，无外部依赖），生成报告页签加「复制 LaTeX 统计表」按钮（三通道统计表 \begin{tabular} 格式，一键复制）（src/app.js exportChartPng/buildLatexTable）
- [完成] v2.1 功能 ③「大数据兜底」：粘贴/上传超 2 万行先出黄色提示告知可能耗时，解析完成反馈显示行数与耗时；图表超 5000 点自动 LTTB 降采样（只影响画图，统计/异常/结论/报告/滤波/FFT 仍用全量数据计算），图表下方标注「已降采样显示（N → 5000 点）」；文件超 5MB 提示（src/app.js LTTB_THRESHOLD/lttb、src/analysis.js）
- [完成] v2.1 功能 ④「可访问性 + 统计口径」：图表主色板换 Okabe-Ito 色盲友好八色（['#0072B2','#E69F00','#009E73','#CC79A7','#56B4E9','#D55E00','#999999','#F0E442']，异常红点保持 #ef4444）；统计卡片区加口径说明行（标准差为样本标准差 n-1、漂移量 = 末值 − 初值、异常点判定：稳健 z 分数（基于 MAD）> 3.5 或偏离中位数超 4×MAD），各统计卡加悬浮 title 说明（src/app.js PALETTE、src/index.html stats-caliber-note、src/style.css）
- [修复] 大数据解析成功反馈文案补充「数据量较大」前缀，黄色提示被覆盖后口径仍可见（src/app.js:297）
- [完成] v2.1 验收 17/17 通过（chrome-devtools 主世界实测）：引导 4 项（横幅三步/解析前隐藏/解析后出现/跳转预览）、导出 5 项（三图 PNG 下载触发 + toast + LaTeX tabular/hline）、色板口径 3 项（#0072B2 生效/口径文案一字不差/统计卡带 n-1 title）、大数据 5 项（22000 行粘贴/数据量较大提示/耗时显示/全量均值 25.05 未被降采样污染/降采样标注 22000 → 5000）；回归抽查 v1/v2 核心全过（NTC 41.44/10.19、ADC 1.6504、采样 0.95Hz/1.05s/无丢帧、滤波 0.542→0.347 毛刺已削平、报告六节结构含 n-1/漂移/异常）
- [完成] v2.2 功能 A「数据体检卡」（数据预览页签，采样质量卡片旁）：自动检查每个数值列的缺失数、整行重复、常数列并给出结论；发现问题时提供「删除缺失行」「去除重复行」一键清理与撤销（清理前自动快照，撤销完整恢复），清理后统计/图表/报告自动重算（src/app.js healthCheck/renderHealthCard/setupHealth、src/index.html health-card、src/style.css）
- [完成] v2.2 功能 B「300 dpi 高清 PNG 导出」：三张图表导出改为离屏 canvas 以 3 倍 devicePixelRatio 重建（引用共享图表配置保留多轴/刻度回调，失败自动回退原画布），PNG 实测 1275×840 = 页面尺寸 ×3，toast 标注（300 dpi）（src/app.js exportChartPng）
- [完成] v2.2 功能 C「项目保存与恢复」：解析成功后自动存 IndexedDB（原始输入/解析设置/报告信息/操作流水，800ms 防抖），刷新页面弹出恢复横幅（来源+行数+保存时间），一键恢复重新解析并接回流水；另支持导出/导入项目 JSON 文件（labinsight-project-日期.json，无 BOM，可换设备备份）（src/project.js 新建、src/app.js、src/index.html project-banner、src/style.css）
- [完成] v2.2 功能 D「标准误与 95% 置信区间」：统计卡平均值显示「均值 ± 95% CI 半宽」（悬浮说明 t 分布），统计引擎新增 SEM/置信半宽（t0.975 表 df≤30 精确、更大 n 用 1.96 近似），报告统计表加 SEM 与 95% 置信区间两列，LaTeX 表同步，口径说明行补 t 分布一句（src/analysis.js meanCI/T975、src/report.js、src/app.js、src/index.html）
- [完成] v2.2 功能 E「通道相关矩阵」：智能分析页签统计口径下方自动生成数值通道 Pearson 相关系数表（≤6 列），|r|≥0.7 强相关橙底、0.4–0.7 中等相关底色，图例注明强度含义（temp-humi 0.779 / humi-press 0.991 与独立计算一致）（src/analysis.js pearson/corrMatrix、src/app.js renderCorr、src/index.html corr-card）
- [完成] v2.2 功能 F「可复现处理流水」：解析/换算/滤波/体检清理全程自动记录操作流水（上限 30 条），生成报告时写入「处理与计算流程（可复现）」列表，每步含方式与参数（如中值滤波窗口 5、输入列 → 新列），评委可按流水复现同样结果（src/app.js pushOp、src/report.js）
- [完成] v2.2 验收全过（chrome-devtools 主世界实测）：体检 A 组 4 项（39 行体检通过/构造缺失+重复检出/去重 7→6 可撤销/撤销复原）、B 组高清导出（PNG 1275×840=3x）、C 组项目保存 4 项（IndexedDB 快照含 pending/parseOpts/ops/刷新横幅出现/恢复 7 行体检卡复原/JSON 导出无 BOM 结构完整）、D 组 SEM/CI（25.94 ± 0.17 与独立计算 25.9392±0.1701 一致/报告含 SEM 与 CI 列 25.15~25.45）、E 组相关矩阵（0.779/0.736/0.991 全对基准）、F 组流水进报告（含解析与滤波参数）；恢复流水过滤规则验证（旧解析/体检记录不接回，列加工类保留）；回归抽查 v1/v2/v2.1 全过（引导 G2/G3、解析 39 行异常 2、NTC 41.46、ADC 1.6504、滤波 0.542→0.347 毛刺已削平、口径 note 含 t 分布）

## 2026-11-17
- [完成] v2.3 功能 ①「实时串口采集」（导入数据页签）：Web Serial API 直连硬件（波特率 9600~115200 可选），边采边看实时曲线（最多 3 条通道、每条 500 点滑动窗口、绿色呼吸指示灯 + 行数计数），「停止并进入分析」把整段日志自动送进解析流程（与粘贴/上传同一条管线，清洗/统计/图表全链路可用）；设备拔出等异常断开自动提示并把已收数据转入分析；无硬件时「模拟串口数据」按钮生成含缓变信号 + 噪声 + 毛刺的仿真数据流，评委没设备也能完整体验（src/serial.js 新建、src/app.js setupSerial、src/index.html serial-card、src/style.css）
- [完成] v2.3 功能 ②「图表进报告」：生成报告时自动抓取趋势图/滤波对比图/频谱图位图，「导出 PDF」打印版末尾追加「图表附录」（figure + 图注，page-break-inside: avoid 防跨页截断）；页签隐藏导致 canvas 未布局（0×0）时用离屏 canvas 重建兜底，txt/md 文本版保持纯文字不含图（src/app.js collectReportCharts/snapshotChart、src/report.js、src/style.css print-figure）
- [完成] v2.3 功能 ③「数据导出 CSV / Excel」（数据预览页签）：一键导出清洗后全量数据（含换算/滤波生成的新列与时间戳列），CSV 带 BOM（Excel 直开不乱码、含引号/逗号/换行转义），Excel 用 SheetJS 生成 .xlsx；组件未联网加载时提示改用 CSV（src/app.js buildExportAoa/exportDataCsv/exportDataXlsx、src/index.html）
- [完成] v2.3 功能 ④「线性拟合」（校准换算页签）：任选两列做最小二乘拟合 y = k·x + b，输出 k/b/R²/有效样本数与四级评语（R²≥0.99 显著 / ≥0.95 较好 / ≥0.90 检查线性度 / 更低为弱），结果写入换算记录与处理流水；典型用途——传感器读数 vs 标准仪器读数的线性度核查（src/fit.js 新建 LabFit.linreg、src/app.js setupFit、src/index.html calib-fit 卡）
- [完成] v2.3 功能 ⑤「自定义多项式换算」（校准换算页签第四模式）：y = a·x + b（一次）与 y = a·x² + b·x + c（二次）自由定义系数，单值即时换算 + 批量选列生成新列（与 NTC/ADC/MQ 同一套交互），公式上墙注明当前参数；系数可先用「线性拟合」求出再回填（src/app.js polyConvert/applyCalibBatch、src/index.html calib-poly 卡）
- [完成] v2.3 功能 ⑥「非均匀数据重采样后 FFT」（滤波实验页签）：默认开启「重采样后变换」——有真实时间戳时先按采样率线性插值到均匀间隔网格再 FFT，消除采样间隔不均导致的谱线展宽/失真；频谱说明区标注重采样点数与步长，取消勾选恢复原始直接变换（src/fft.js resampleUniform、src/app.js renderFFT、src/index.html fft-resample-on）
- [完成] v2.3 功能 ⑦「可访问性小修」：六个页签按钮补 role=tab/aria-selected/aria-controls（面板 role=tabpanel），切换时 aria-selected 同步更新，读屏软件可正确识别当前页签；图表多轴 Y 轴标题只显示单位（°C/%/hPa，从列名后缀自动推断），不再与图例通道名重复（src/index.html、src/app.js switchTab/renderChart/renderFilter、src/analysis.js unitOf）
- [完成] v2.3 验收全过（chrome-devtools 主世界实测）：串口模拟采集 35 行/实时曲线 3 通道/停止后 37 行自动解析进分析；拟合 humi→press k=0.926380 b=954.977499 R²=0.9819 与独立计算一致（temp→press 0.770997/993.275303/0.5424 同验）；多项式一次 2x+1@3=7、二次 x²+2x+1@3=16 精确，批量生成 temp·换算新列数值与手算一致；重采样说明 39→39 点步长 1050ms、取消后恢复；CSV/XLSX 下载触发且表头含时间与单位列；报告图表附录 3 张位图（80KB/71KB/42KB）全有效；ARIA 六页签同步；回归 v1/v2/v2.1/v2.2 全过（39 行 7 跳过异常 2、25.94 ± 0.17、相关矩阵 0.779/0.736/0.991、NTC 41.46、滤波 0.542→0.347 毛刺已削平、口径 note 四要素、LaTeX tabular+SEM+CI、300dpi PNG 1275×840、体检卡/引导/口径）
- [修复] 图表 Y 轴标题：unit 字段为空时原 c.unit || 判断失效导致轴标题回退完整列名与图例重复，新增 unitOf()（unit 字段优先、_c/_pct 等后缀映射兜底）统一三处调用（src/analysis.js、src/app.js renderChart/renderFilter）
- [修复] 报告图表附录空图：页签隐藏时 Chart.js 未布局 canvas 为 0×0，toDataURL 得到 data:, 空 URL；snapshotChart() 先试原 canvas、无效则离屏重建（引用共享配置，固定尺寸 responsive:false）再导出（src/app.js）
- [修复] 四项体验小修：①辅助文字对比度 --text-4 #9b9b9b→#71717a（白底约 4.8:1 过 WCAG AA，card-hint/field-help/chart-tip 等 12px 小字不再发虚，src/style.css）；②375px 下页签换行平铺（原横向滚动无提示导致「生成报告」被裁一半），实测 375px 六页签两行全部可见、全页无横向溢出（src/style.css 媒体查询）；③NTC/MQ 批量换算默认列避开温度列（温度当电阻输入是无意义换算），优先按列名匹配电阻（R/Rs/res/Ω/ohm/电阻），无匹配则选第一个非温度列（src/app.js pickDefaultCol）；④线性拟合默认 X=第一列、Y=第二列，不再 X=Y 拟合出恒等线（src/app.js renderFitCols）
- [修复] 串口授权取消无提示：requestPort 被用户取消或端口打开失败时 startReal 的 catch 误调 onEnd（此刻 running 仍为 false 被早退，提示静默丢失），改为 catch 只返回 false、由连接按钮统一 toast「串口连接未建立：已取消授权，或设备打开失败」（src/serial.js startReal、src/app.js connectBtn）
- [修复] 报告标题预填生硬：原直接拼 sourceLabel（「文件名 · 类型」组合串）+「数据分析实验」成病句，改取类型段生成「数据分析实验报告（串口日志）」统一格式（src/app.js afterParse、src/parser.js buildSourceLabel 说明）
- [修复] 报告图表附录静默少图：滤波/频谱图只在访问过对应页签后才创建，生成报告时缺图无任何说明；现生成报告时自动补渲染缺失图表（隐藏 canvas 0×0 走离屏兜底），确实无法生成的图在附录以文字注明原因（src/app.js collectReportCharts/fillPrintRoot）——实测不逛滤波页签直接生成报告，附录三图齐
- [修复] 实时串口图三项：①裸数字行（无 key=value 形式）只画第一条，改为按出现顺序编号「数值/数值2/数值3」全部上曲线（src/app.js handleLine）；②实时曲线只有单 Y 轴，多通道量级差异大时小量程贴地，改 2~3 通道自动各挂独立 Y 轴（y 左/y1 右/y2 右，与主图同规则，通道数变化自动重建）（src/app.js updateLiveChart）；③页面上初始文案写死「采集中」，改为空由状态函数控制（src/index.html）
- [完成] dist 同步：src 全量 13 文件（含新 fit.js/serial.js/project.js）复制到 dist，修掉 dist 停留在 11-14 v1 版本的问题（部署即用最新）
- [完成] README 功能表补齐 v2.1/v2.2/v2.3 全部功能（实时串口采集/项目保存/数据体检/CSV 与 Excel 导出/线性拟合/多项式换算/SEM 与置信区间/相关矩阵/300dpi 导出/LaTeX/图表附录/重采样 FFT/可复现流水/ARIA/Okabe-Ito 色板/大数据兜底），此前功能表停留在 v2

## 2026-11-17（晚，v2.4）
- [完成] v2.4 功能 ①「导出 Word (.docx)」（生成报告页签）：引入 docx 库（CDP UMD）生成真 OOXML 文档——标题/五节正文/统计表为真表格（含 SEM 与 95% CI 列）/处理流水列表/图表附录位图（等比缩放）/附录等宽字体，文件名取报告标题；CDN 未加载时提示先导出 PDF（src/report.js buildDocx、src/app.js downloadBlob）
- [完成] v2.4 功能 ②「单文件 HTML 报告」（生成报告页签）：报告正文 + 图表 base64 内联 + 样式内联打包成一个 .html 文件，无外部依赖，发给老师同学双击即可看（src/report.js buildStaticHtml）
- [完成] v2.4 功能 ③「区间选取分析」（智能分析页签）：图表滚轮缩放 / 框选后自动统计所选区间（通道/样本数/最大/最小/均值±95%CI/标准差/异常点），区间外数据不参与；重置或覆盖全量时卡片自动隐藏；小样本置信区间按 t 分布如实显示（n=2 时 CI 很宽是正确行为）（src/app.js updateRangeStats、src/index.html range-card）
- [完成] v2.4 功能 ④「直方图」（智能分析页签）：任选数值通道画 15 bin 频数分布柱状图（区间标签/频数+占比提示），一眼看出分布形状与双峰（src/app.js drawHist、src/index.html hist-card）
- [完成] v2.4 第一、二轮验收（chrome-devtools）：docx 全局加载 ✓、buildDocx 产物 JSZip 解压验证（word/media/ 3 张 PNG、document.xml 24852 字符含统计表/CI/流水/图表附录、<w:tbl> 4 行）✓、按钮下载管线 122KB PK 头 ✓；静态 HTML 159KB 无外部 script、3 img 内联 ✓；直方图 15 bin counts 总和=39=有效值 ✓；区间 zoomScale 精确生效、合成 wheel 事件触发 onZoomComplete 自动联动区间卡（真滚轮/拖框路径成立）、清除恢复 ✓；回归（相关矩阵 0.779/0.736/0.991、口径 n-1/MAD/t 分布）✓
- [修复] 区间统计随缩放联动：onZoomComplete 挂接 chartjs-plugin-zoom 缩放完成回调，滚轮/框选后区间卡自动更新；程序化 zoomScale 不触发回调属插件行为，重置按钮与清除按钮均同步处理（src/app.js）

## 2026-11-17（v2.4 第三轮）
- [完成] v2.4 功能 ⑤「传感器标定评估」（校准换算页签·拟合卡内）：一键输出灵敏度 S（拟合斜率，带 Y/X 单位）、零点输出 b（X=0 外推值，附 X 实际范围提醒）、线性度 δ = 最大残差 / 输出量程 ×100%（四级评语：≤1% 优 / ≤2% 良 / ≤5% 合格 / >5% 提示检查线性关系）、迟滞简版（前半 / 后半行程各自拟合并比较斜率差，n<6 不做，注明真正迟滞需正反行程交替采集）；结果写入换算记录与处理流水（src/app.js setupEval、src/index.html eval 区块）——实测 humi→press：线性度 19.25%（最大残差 0.365823 / 量程 1.9）、迟滞斜率差 16.15%（前 0.957546 / 后 0.802949），与独立计算逐位一致
- [完成] v2.4 功能 ⑦「NTC R-T 标定图」（校准换算页签·NTC 卡内）：选电阻列 + 实测温度列画实测散点，叠加当前 B / R₀ / T₀ 参数的理论 R-T 特性曲线（61 点光滑线），附平均偏差与最大偏差统计；NTC 参数或 B 值式 / Steinhart-Hart 方法切换时已生成的曲线即时重画；默认电阻列避开温度列、实测温度列优先单位 ℃ 的换算生成列（src/app.js renderNTCTheoryCols/ntc-theory 处理器、src/index.html ntc-theory 区块）——实测 B 3950→3435 曲线即时跟随（同点 209.68 → 259.10 °C）
## 2026-11-17（v2.4 第四轮）
- [完成] v2.4 功能 ⑥「异常判定口径可切换」（智能分析页签·统计区上方）：MAD 稳健 / 3σ / IQR 三种口径一键切换，统计卡的异常点数、结论、区间统计随之重算，主图叠加当前口径的±阈值红色虚线；MAD 对毛刺不敏感（默认）、3σ 经典但对毛刺敏感、IQR 箱线图口径；口径说明文案（stats-caliber-note 里异常判定句）随选择同步更新（src/analysis.js detectOutliers/computeStats、src/app.js thresholdPlugin/APPLY_OUTLIER、src/index.html outlier-method）
- [完成] v2.4 功能 ⑧「采集面板增强」（导入数据页签·串口采集）：采集时显示每通道当前值、最小/最大值、运行时长（秒级心跳），并实时做毛刺（瞬时尖峰）判定——超限通道卡片红色高亮呼吸闪烁；停止/取消时清空；毛刺判定用二阶差分中位数作稳健基线（不受平缓通道量化抖动/常态噪声误报，真尖峰能被远超），无新数据时运行时长仍走秒（src/app.js hasRecentSpike/updateSerialMetrics/durationTimer、src/style.css serial-metric）
- [完成] v2.4 第四轮验收（chrome-devtools）：口径切换——MAD temp 异常 2、3σ temp 1、IQR temp 2，切换后口径文案与 active 态同步、主图阈值插件随重渲染保留 ✓；采集面板——模拟采集 6 秒时长走秒（00:00→00:06）、3 通道芯片当前值/最小最大正确、temp 尖峰命中 max≈31 且仅 temp 闪烁（humi/press 零误报）、停止后 107 行自动进分析、面板清空 ✓；回归——串口示例 39 行/跳过 7/异常 2、NTC 5000Ω→41.46 °C、滤波 0.542→0.347 极差 2.59→1.11 异常 2→0 毛刺已削平、拟合 humi→press k=0.92638 b=954.977499 R²=0.9819、标定评估线性度 19.25%/迟滞斜率差 16.15%、平均值卡 25.94±0.17/62.93±0.19/1013.27±0.18、直方图 bins 总和=39、体检卡 39 行无缺失无重复、报告 2902 字符含图表附录/处理流水/95%置信区间、引导横幅① ② ③ ✓
- [修复] 采集毛刺误报：初版用「最近几点偏离中位数超 4×MAD / 稳健 z>3.5」在低方差或量化通道上 MAD 趋零导致频繁误报（press/humi 被误闪）；改为二阶差分 |v[i+1]-2v[i]+v[i-1]| 与其中位数×6（并加量程 5% 下限）比较，实测仅 temp 尖峰闪烁、humi/press 零误报（src/app.js hasRecentSpike）

## 2026-11-17（v2.5 第一批）
- [完成] v2.5 功能 ①「完全离线化」：把原先 5 个 CDN 依赖（PapaParse / SheetJS / Chart.js / chartjs-plugin-zoom / docx）下载到項目 src/vendor/，index.html 改为引用本地 vendor/ 路径；移除 Google Fonts 三处外链，字体改走系统栈（Windows 微软雅黑 / macOS 苹方）。断网、机房屏蔽 jsdelivr 时图表/Excel/Word 全部照常可用，真正双击即用。实测页面 17 个请求全为 file:// 本地、零外部请求，Chart/ChartZoom/Papa/XLSX/docx 全局均在
- [完成] v2.5 功能 ②「报告编辑增强」（生成报告页签·报告信息）：在「实验名称 / 实验目的」之外新增「实验器材 / 实验步骤 / 注意事项 / 数据记录说明」四个可编辑区块（选填，每行一条）；自动填入 txt / md / 静态 HTML / Word(.docx) 四种导出，章节按内容有无动态编号（无选填时数据结果自动成为第三节），Word 里用真实段落+项目符号，静态 HTML 用 h2+ul（src/index.html report-equipment/steps/notes/datarec、src/report.js buildReport/buildDocx 动态章节计数器、src/app.js setupReport extraInfo、src/style.css field-opt）
- [完成] v2.5 第一批验收（chrome-devtools）：填全四块→报告 8 节「一 名称与目的 / 二 器材与数据来源 / 三 实验步骤 / 四 注意事项 / 五 数据记录说明 / 六 数据结果 / 七 分析结论 / 八 附录」，器材多行自动合并为「；」分隔，步骤/注意/记录说明逐条项目符号 ✓；清空四块→自动收敛为「一/二/三 数据结果/四 分析结论/五 附录」 ✓；Word 解压校验 23 文件 3 图 document.xml 25940 字符含全部新增章节标题且顺序正确、1 张统计表、3 张图 ✓；静态 HTML 163KB 含四块+9 个 h2+3 图 ✓

## 2026-11-17（v2.5 第二批）
- [完成] v2.5 功能 ③「实验事件标注」：智能分析页签新增「实验事件标注」卡。在趋势图上单击即可把该时刻回填到输入框（Chart.js 包装事件的 evt.x 为画布内像素坐标，经 scales.x.getValueForPixel 还原成时间轴值），填描述后点「添加事件」，图上画竖直虚线+顶部标签、下方列出事件芯片（时间+描述+删除）；事件随数据重置清空，添加/删除写入操作流水。导出的 txt / md / 静态 HTML / Word(.docx) 自动多出「实验事件记录」一节（时间+描述），章节顺序在「数据结果」之后、「分析结论」之前，动态编号自动收敛；无事件时不出现该节（src/index.html events-card/event-x/event-label/event-add-btn/events-list、src/app.js state.events + renderChart 内 eventsPlugin 与 options.onClick + setupEvents/renderEventsList/fmtEventTime + afterParse 重置、src/report.js buildReport 与 buildDocx 的 evtTime/实验事件记录节 + buildDocx info 增加 events 字段、src/style.css events-* 样式）
- [完成] v2.5 第二批验收（chrome-devtools）：串口示例解析 39 行/跳过 7；单击图表回填时刻 ✓（经 _eventHandler 包装事件路径验证，evt.x→77665）；加两个事件后图上插件 eventsOverlay 存在、列表显示「21:33:50 开始加热 / 21:34:30 更换探头」；报告文本含「实验事件记录」节（- 时间：描述）且在分析结论前；Word 解压 Heading2 顺序「一 名称与目的 / 二 器材与数据来源 / 三 数据结果 / 四 实验事件记录 / 五 分析结论 / 六 附录」✓；清空事件后报告收敛为 5 节且无事件节 ✓
- [修复] buildDocx 组装 info 时漏带 events 字段（导致 Word 里事件节缺失，仅操作流水里出现事件字样）——补 events: pkg.events

## 2026-11-17（v2.5 第三批）
- [完成] v2.5 功能 ⑥「图表高清 / 矢量导出」：趋势图工具条新增「导出 SVG」按钮——用当前图表实例重建矢量图（坐标轴/网格/多 Y 轴刻度与颜色/各通道折线/异常点/图例），贴进 Word 或打印放大不糊（src/app.js exportChartSvg + export-chart-svg-btn 绑定、src/index.html 按钮）。同时把报告内嵌图表位图的分辨率从 1× 提到 2×（snapshotChart devicePixelRatio 2），Word/静态 HTML 里的图更清晰
- [完成] v2.5 第三批验收（chrome-devtools）：点导出 SVG 捕获下载 blob，8542 字符、以 <svg 开头、含 <path 折线、120 个 circle（39 点×3 通道+3 图例）、25 个 text（6 个 x 时间刻度 + 4/6/6 三支 Y 轴刻度 + 3 图例 temp/humi/press），矢量元素齐全 ✓；报告三张图尺寸 637×420 / 1520×800 / 960×600（2× 离屏）✓

## 2026-11-17（v2.5 第四批）
- [完成] v2.5 功能 ④「多组数据合并（拼表）」：导入区新增「合并数据」按钮 + 隐藏文件选择器（src/index.html #merge-file-btn / #merge-file-input），可把另一份同结构数据（.csv/.txt/.log/.xlsx/.xls）按行追加到当前数据集。src/app.js 新增 fileToPending()（与 handleFile 同源的文件读取，含 GBK 兜底）与 mergeFile()：按列名对齐（列数或列名对不上直接报错不写入）、逐行重排 cells、累加 meta（totalLines/dataRows/skippedRows/skippedList）、两边同时间模式时合并时间轴区间并按时间排序、pushOp 记一条「合并数据…」进处理流水、refreshDerived 全链重算（统计/异常/结论/图表/报告均含新数据）
- [完成] v2.5 第四批验收（chrome-devtools）：串口示例 39 行 → 合并第二份 10 行 → 49 行、dataRows 49、temp 均值 25.94→26.86 重算、时间范围延伸到 21:36:09、反馈区显示「已合并「session2.txt」：新增 10 行」✓；列数不一致的 .csv（2 列 vs 3 列）被拒、行数不变、提示「合并失败：列数不一致（当前 3 列，新数据 2 列）」✓；报告含 49 行且「处理与计算流程」出现合并记录、三张图齐全 ✓；控制台零报错 ✓

## 2026-11-17（v2.6）
- [完成] v2.6 新增「工具箱」页签（置于校准换算之后，共 7 页签）：①嵌入式 C 代码生成（NTC B 值式含 21 点电阻-温度分度表数组 / Steinhart-Hart 三系数 / ADC 读数转电压 / 自定义多项式换算，读校准页当前参数，一键复制，直接粘进 Keil/Arduino 工程）；②采样率定時器配置助手（STM32 按主频算 PSC/ARR 与实际采样率并给 HAL 写法；Arduino UNO 16MHz 按预分频选 OCR1A；附 16 倍过采样提分辨率提示）；③分压电阻 / ADC 位数助手（1 LSB 分辨率、量程利用率、超出 Vref 时按 E24 标准阻值推荐 R1/R2 分压对）；④十六进制字节流解码（HEX→ASCII / uint16 大端 / int16 大端）（src/index.html #tab-toolbox、src/app.js genCCode/calcTimer/calcDivider/hexDecode/setupToolbox）
- [完成] v2.6 测量不确定度计算卡片（智能分析页）：选测量列 → 按当前数据算 A 类 uA=s/√n、B 类 uB=a/√3（仪器最大允差 a 可填）、合成 uC=√(uA²+uB²)、扩展 U=k·uC，输出 mean±U（k）结果表示（src/app.js calcUncertainty/renderUncertaintyCols/setupUncertainty、index.html #uncert-card）
- [完成] v2.6 串口实时采集增强：采集面板新增「＋ 标记」（也可按空格键）在采集过程中打时间标记，停止进入分析后自动转成图上事件标注并写入报告；新增发送行（文本框+换行勾选+发送），真实串口可向设备下发指令，模拟模式提示只演示接收（src/serial.js send()、src/app.js addMark/sendCmd/pendingMarks→events 注入）
- [完成] v2.6 报告模板一键预填：报告信息卡新增三个按钮——「温度传感器标定实验」「通用数据采集」预填器材/步骤/注意事项/数据记录四块，「清空选填」一键清空（src/index.html [data-report-tpl]、src/app.js setupReport 内模板处理）
- [修复] Word 导出 pkg 漏带 events 字段（导致 Word 里事件节缺失）——补 events: info.events
- [完成] v2.6 验收（chrome-devtools pageId 7）：C 代码生成四型（NTC 含 ntc_temp 与 21 点分度表、ADC 含 adc_to_volt/4095.0f）、STM32 100Hz@72MHz 得 PSC10/ARR65454/实际 100Hz、分压 5V→3.3V 推荐 R1 47k/R2 91k 比值 0.6594、hex "48 65 6C 6C 6F"→Hello、uint16 [258,772] 全对 ✓；不确定度 temp n=39 s=0.542 uA=0.087 uB=0.058 uC=0.104 U=0.208 结果 25.94±0.208（k=2）✓；模拟采集打两标记→停下进分析事件 x=62361.468/62362.182「开始加热/更换探头」✓；报告含实验器材/实验步骤/注意事项/实验事件记录且顺序正确、Word document.xml 含事件节在数据结果与分析结论之间 ✓；回归串口 39 行/跳过 7、NTC 5000Ω→41.46°C、滤波 0.542→0.347 毛刺已削平 ✓；控制台零报错

## 2026-11-17（v2.7）
- [修复] 主图数据点悬停 tooltip 显示「undefined：25.43」——tooltip label 回调误用了 `c.pretty`（列对象只有 name/unit/type/index，pretty 是统计项字段），改 `LabAnalysis.prettyColName(c)`；同类隐患一并修复：SVG 导出里单通道 Y 轴标题 `cols[0].pretty` → `LabAnalysis.prettyColName(cols[0])`
- [修复] 校准页「多项式换算」分段按钮文案切到二次后不变——poly-deg 切换时同步 `#calib-mode .seg[data-mode=poly]` 文案（二次显示「y = ax² + bx + c」）
- [修复] 平均值卡片「1013.27 ± 0.18」折行——主值与 ±置信区间拆成主值 + 小字 `.stat-ci` 同排，`.stat-value` 加 white-space:nowrap
- [完成] v2.7 功能①「误差分析与讨论」自动成节：报告在「分析结论」之后、「附录」之前新增一节，四段内容——采样质量（实际采样率/平均与中位间隔/抖动/丢帧）、异常值检测（当前判定口径 + 各通道异常点数）、测量不确定度（A 类 uA=s/√n + B 类 uB=a/√3 合成 uC、扩展 U=k·uC + 每通道「结果表示 mean±U」）、综合判断（扩展不确定度占均值比例→可信度分级；A 类/B 类哪个主导误差来源；丢帧提示；最近的标定评估记录引用）。txt / md / 静态 HTML / Word 四种导出同步，章节号随内容动态编号（src/report.js buildErrorText + parseInstruments；src/app.js setupReport extraInfo 带 uncertainty/outlierMethod/evalRecord；src/index.html #report-instruments）
- [完成] v2.7 功能③「仪器台账进报告」：报告信息卡新增「仪器台账」多行输入（每行一台：名称, 型号, 编号, 精度等级/允差, 校准日期），自动进报告「实验器材与数据来源」小节——txt/HTML 用 Markdown 表格，Word 用真实 5 列表格；与不确定度 B 类（仪器允差 a）配合评估（src/report.js parseInstruments + buildReport/buildDocx 台账表、src/index.html #report-instruments）
- [完成] v2.7 功能④「C 代码导出 .h」：工具箱 C 代码卡新增「下载 .h」，自动带 include guard（`#ifndef NTC_TEMP_H ... #endif`），文件名按来源 ntc_temp.h / adc_to_volt.h / poly_conv.h，学生可直接存进工程目录编译（src/app.js setupToolbox 内 #cg-dl-btn 绑定、src/index.html 按钮）
- [完成] v2.7 验收（chrome-devtools pageId 8）：tooltip 回调输出「temp：25.43」「humi：62.9 ⚠ 异常点」无 undefined ✓；poly 分段按钮文案「y = ax + b」→「y = ax² + bx + c」✓；平均值卡 25.94±0.17 / 62.93±0.19 / 1013.27±0.18 主值+小字同排 nowrap ✓；报告 3305 字符含误差节（采样质量 0.95 Hz / 平均 1.05 s / 未发现丢帧；MAD 口径 temp 2 处；temp uA 0.087 uC 0.104 U 0.208 → 25.94±0.208；综合判断扩展不确定度占均值 0.8% 可信度高、A 类主导；标定评估 humi→press 线性度 19.25%）✓；仪器台账 UT61E 行进报告 ✓；Word 解压 23 文件 4 media、document.xml 30906 字符、Heading2 顺序「一 名称与目的 / 二 器材与数据来源 / 三 数据结果 / 四 分析结论 / 五 误差分析与讨论 / 六 附录 / 图表附录」、2 张表（统计表 + 台账表）、含「仪器台账」「测量不确定度」✓；下载 ntc_temp.h 1047 字节含 `#ifndef NTC_TEMP_H` ✓；回归串口示例 39 行/跳过 7、NTC 5000Ω→41.46°C、滤波 0.542→0.347「毛刺已削平」✓
- [备注] v2.7 第②项「多组并列对比（均值 ± σ 带）」留待下一轮单独立项：需按分组维度叠加多组曲线与均值/标准差带，涉及图表数据模型改动，风险较高，单独一轮做并做完整回归

## 2026-11-17（v2.8）
- [完成] v2.8 功能②「多组并列对比（均值 ± σ 带）」：智能分析页签新增「多组并列对比」卡。A 组固定为当前数据，粘贴第二组/第三组数据（串口日志或 CSV，列名需与当前数据一致）点「添加为对比组」即成 B/C 组；按采样序号对齐（重复实验通常采样率相同），选定共有通道后画对比图——各组细线（Okabe-Ito 色）+ 组间均值粗线 + ±1σ 标准差带（Chart.js fill:'+1' 半透明带）；下方统计表列每组有效点数/均值/标准差与「组间均值极差」（越小说明重复性越好）；某组点数不足时该采样点只按有值的组计算均值（单组处 σ=0，带收敛到均值线）；切对比通道即时重画；「清空对比组」复位；重新解析数据时对比组自动清空（A 组始终跟随当前数据）。添加/清空写入操作流水（src/index.html #compare-card/#compare-paste/#compare-add-btn/#compare-col/#compare-chart/#compare-table、src/app.js state.compareSets/compareChart + compareAllSets/compareCommonCols/setupCompare/addCompareSet/renderCompareCols/renderCompareChart + afterParse 重置 + switchTab resize、src/style.css compare-* 样式）
- [完成] v2.8 验收（chrome-devtools pageId 9）：A 组=串口示例 39 行，粘贴 20 行构造数据（temp=26+0.05i）→ B 组 20 行、对比图 5 个数据集（A 组/B 组/均值 +1σ fill:'+1'/均值 −1σ/组间均值）、x 轴 linear 采样序号 ✓；数值交叉验证：第 1 采样点 mean=(25.32+26.00)/2=25.66、σ=|25.32−26.00|/√2=0.4808 → 带 [25.179, 26.141] 与图表 data 逐位一致 ✓；统计表 A 组 25.939/0.542（与基准一致）、B 组 26.475/0.296（手算 Σ(i−9.5)²·0.0025/19=0.0875→σ=0.2958 一致）、组间均值极差 0.536 ✓；切 humi 通道重画（第 1 点 mean=62.49=(61.98+63.00)/2）✓；短组对齐：5 行 B 组在第 6 采样点只有 A 组 → mean=62.2 且带收敛（σ=0）✓；常数列 B 组 σ=0 如实显示 ✓；清空后芯片/图表/状态全复位 ✓；回归主图与统计不受影响（39 行、平均卡 25.94±0.17）✓

## 2026-11-17（v2.9）
- [修复] 多组并列对比「第二组是 CSV 文件时加不进来」：原卡只有粘贴框，整段 CSV 带逗号与表头粘进去容易解析失败，看着像功能坏了。新增「从文件选择（CSV / Excel）」按钮（#compare-file-btn + #compare-file-input），复用 fileToPending 读取（xlsx→SheetJS、csv/txt→文本 + GB18030 兜底），与粘贴共用 addComparePending 的解析/列名校验/加组逻辑（src/index.html、src/app.js）
- [完成] 两点标定反算 NTC 参数：校准页 NTC 卡新增「两点标定反算 B 值」区块，填两组「标准温度 → 实测电阻」（默认 0°C/32650Ω、100°C/680Ω），点「反算 B / R₀ 并回填」按 B = ln(R₁/R₂)/(1/T₁−1/T₂) 求 B，R₀ 以 25°C 标称点由 R₁ 反推；自动回填 B/R₀/T₀ 并重画 R-T 标定图。另有「取标定图首尾两点」，直接拿选中的电阻列与温度列的最低/最高温实测点代入。结果写进操作流水，进报告「处理与计算流程」（src/app.js twoPointCalib/twoPointFromChart、src/index.html #ntc-twopoint-block、src/style.css）
- [完成] 传感器预设库：NTC 参数区加「型号预设」下拉（B=3950/3435/3380/4050 · 10kΩ、B=3977 · 100kΩ），选中自动填 B 与 R₀；MQ 系列预设保持原样（src/index.html #ntc-preset、src/app.js setupCalib）
- [完成] 图表不确定度误差棒：主图每个数据点按该通道扩展不确定度 ±U（U = k·√(uA²+uB²)，uA = sem，uB = a/√3）画误差棒（竖线 + 上下横杠），按各自 Y 轴换算像素；工具条加「误差棒」勾选随时开关；仪器允差 a 与包含因子 k 改动时误差棒即时更新；报告误差节补一句「趋势图误差棒即 ±U」（src/app.js errBarPlugin + setupChartControls + setupUncertainty、src/index.html #chart-errbar-toggle、src/style.css、src/report.js buildErrorText）
- [完成] Arduino 完整示例 .ino：工具箱 C 代码卡新增「下载 Arduino .ino」，按当前来源（NTC / ADC / 多项式）生成可直接编译烧录的完整 sketch——顶部 5 个用户常量（ADC 引脚、VCC、分压电阻 R_REF、ADC_MAX、采样周期），换算函数复用 C 代码的同一套参数，setup() 起串口，loop() 每秒 analogRead → 换算 → 打印 raw / V / R / T（ADC 与多项式型打印对应量）（src/app.js genArduinoSketch、src/index.html #cg-ino-btn）
- [完成] v2.9 验收（chrome-devtools pageId 9）：CSV 文件对比组（session2.csv 12 行）经 #compare-file-input 成功加入 B 组、统计表 3 行 ✓；两点标定 (0°C,32650Ω)/(100°C,680Ω) → B=3946.07、R₀=9723Ω，回代 32650Ω→0.00°C、680Ω→100.00°C ✓；另一组 (25°C,10000Ω)/(50°C,3603Ω) → B=3934.12、R₀=10000（T₁ 即标称点，自洽）✓；预设切 3435 → B=3435、R₀=10000，下拉 6 项 ✓；误差棒插件 uncertaintyBars 已注册，temp 每点像素高 20.7px 图上可见（截图确认三通道都有、异常红点也在），开关切 false/true 生效 ✓，a 未填时 U = k·sem（temp 0.1736 / humi 0.1944 / press 0.1817）✓；.ino 三型 ntc 1760B / adc 866B / poly 793B，均含 setup/loop/analogRead/delay 与对应函数，ntc 版内嵌 21 点分度表 ✓；报告 2931 字符含「误差棒即该通道的 ±U」与误差节、uA 0.087/0.097/0.091、两点标定进流水 ✓；Word 23 文件 4 media、document.xml 26693 字符、6 节顺序「一~六」含误差节与误差棒句 ✓；回归串口示例 39 行/跳过 7、temp 25.9392±0.542、异常 2、NTC 5000Ω→41.46°C ✓
- [备注] 用户 v2.9 建议的四项（CSV 对比修复、两点标定、误差棒、Arduino .ino、传感器预设）本轮全部落地；两点标定把 v2.7 理论图里「可用两点标定重新求 B」的提示闭环了

## 2026-11-18（发布与部署验收）
- [发布] GitHub 仓库同步 v2.4~v2.9：README 补充 v2.9 功能行（两点标定 + 型号预设 / 多组对比 + 误差棒 / Arduino 示例）后提交 dd6b15d（18 文件，+24854 −117，含 src/fit.js、src/project.js、src/serial.js、src/vendor/ 5 个本地依赖与两份 docs），推送 main 成功；作品帖更新稿另行提交 ab56ae9
- [部署] Qoder Sites 重新发布 v2.9 至 https://lab-insight-vwpscnfaoht.qoder.zone（部署目录 dist/，18 文件）。线上实测：七页签齐全（导入数据 / 数据预览 / 校准换算 / 工具箱 / 智能分析 / 滤波实验 / 生成报告）；17 个新增元素 id 全部存在；17 个资源请求全部同域、零外部 CDN（Chart / ChartZoom / Papa / XLSX / docx 均从本地 vendor 加载）
- [验收] 线上功能抽查与本地 v2.9 基准逐位一致：CSV 示例 30 行解析 + 18 张统计卡（temp 24.2±0.44、std 1.181）；主图 1189×570、直方图 1189×360、相关矩阵 3×3、异常口径默认 MAD、误差棒默认开、结论 647 字；生成报告 3195 字符六节（含「五、误差分析与讨论」）带仪器台账表、测量不确定度、处理与计算流程；工具箱 C 代码 870 字、.h 1047B、.ino 2066B、STM32 100Hz→PSC 10 / ARR 65454、5V→3.3V 推荐 E24 47k/91k、uA 0.216 / uC 0.216；两点标定 (0°C,32650Ω)/(100°C,680Ω) → B=3946.07、R₀=9723.0；SVG 导出 9749B；模拟串口采集 49 行、3 通道实时当前值·最值、temp 尖峰超限闪烁、时长计时；控制台 JS 报错 0 条
- [发布] 天池作品帖（https://tianchi.aliyun.com/forum/post/1097925）更新提交：标题修正 HTML 实体（&mdash;&mdash; → ——）、正文 4749→6570 字符、13 张原图保留、页签六→七并并入 v2.4~v2.9 全部功能与「完全离线」技术栈说明；提交请求体经抓包核对无误（PUT /forum/api/forum/post/update），平台提示「保存成功，内容将在审核后展示」，审核通过后公开页生效

## 2026-11-21（v3.0 第一刺）
- [修复] 粘贴带表头 CSV 被误判成串口日志（v2.2 遗留）：此前 detectSerial 命中的粘贴文本一律走串口解析，date,temp,humi 开头的 CSV 报「没有同名的数值列」。现在当文本既像串口、又嗅探到 CSV 类分隔符（逗号 / Tab / 分号 / 竖线）时双路解析：表格路径必须产出「表头命名的数值列」（自动名 列N / 数值N 不算）才优先表格，否则仍按串口解析——空格分隔的串口日志不进回退，内置串口示例行为不变（src/parser.js parse）
- [修复] 粘贴区文案与提示语更新：placeholder 改为「串口日志或表格都能粘」（两种格式各给一行示例），toast/pendingNote 改「粘贴内容（自动识别串口日志 / 表格）」（src/index.html、src/app.js setupPasteAndSamples）
- [验收] chrome-devtools 实测：粘贴 date,temp,humi 表头 + 日期时间行 → sourceType=table、header=true、列 [date:time,temp:numeric,humi:numeric]、5 行 0 跳过 ✓；time 表头 + 时钟行 → table / 3 行 ✓；串口日志粘贴 → serial、[temp,humi,press]、3 行 1 跳过 ✓；逗号分隔无表头数值行 → 仍 serial、自动名「数值/数值2」（回退正确拒绝自动名）✓；回归：内置串口示例 serial 39 行跳 7、temp mean 25.9392 ± 0.1701 / std 0.542 / 异常 2、直方图 15 bin、报告 2925 字符含误差节；内置 CSV 示例 csv 30 行 ✓
- [完成] v3.0 功能 ①「实验项目库」：IndexedDB 升到 v2 并新增 projects 表（keyPath id），导入页签新增实验库卡片——「存为实验」把当前数据/解析设置/报告信息/事件标注/异常口径整体存成一条；列表显示名称、数据来源与保存时间，支持打开（切回该实验，自动重新解析并恢复事件与口径）、重命名、删除，当前实验高亮。同名保存更新原条目、换名新建，避免每次另存堆出重复项（src/project.js openDB/tx/listAll/getOne/putOne/delOne/saveToLibrary/loadFromLibrary/renameInLibrary/deleteFromLibrary/renderLibrary/wireLibrary、src/index.html #project-lib-card、src/style.css .project-item 等）
- [完成] 快照格式升级到 version 2：新增 reportInfo 的器材/步骤/注意事项/数据记录说明/仪器台账五个字段、events 事件标注、outlierMethod 异常口径（此前只存标题与目的，恢复后要重填）；autoSave 只写「上次项目」快照，不再顺手覆盖项目库条目——否则打开某个实验后的一次自动保存就会把该实验存档改成当前内存状态（src/project.js snapshot/autoSave）
- [修复] 项目恢复时事件标注被清空、异常口径文案不同步：afterParse 原先无条件清 state.events，改为仅在非恢复流程清（state.restoringProject 标志）；异常口径的按钮高亮与口径说明抽成 syncOutlierUI()，在 afterParse 与切换时统一同步（此前只点按钮才更新，恢复后按钮 active 与文案不一致）（src/app.js afterParse/syncOutlierUI/setupChartControls）
- [验收] chrome-devtools 实测实验库：串口示例加 1 个事件 + 切 3σ → 存「实验A-带事件」；CSV 示例存「实验B-CSV」，库内 2 条、DOM 2 项、计数「共 2 个实验」✓；切回 A → 39 行 7 跳过、事件「开始加热」回到列表（DOM 1 项）、口径 sigma3 且按钮 active 与文案「偏离均值超过 3 倍标准差」一致、temp 异常 1 处 ✓；同名再存 → 条数不变、id 不变（不产生重复）✓；重命名 → 列表名称更新 ✓；删除 A → 库剩 1 条、DOM 1 项 ✓；刷新页面后库内条目仍在（IndexedDB 持久化）✓；A 的存档在切回后未被自动保存覆盖（仍 1 条 1 事件）✓
- [验收] 全链回归：串口示例 39 行跳 7、temp 25.9392 ± 0.1701 / std 0.542、humi 62.9297、press 1013.2744、直方图 15 bin 求和 39、主图 3 数据集、NTC 5000Ω → 41.46°C、报告 2876 字符六节（一~六，含「五、误差分析与讨论」）、异常口径 MAD 2 / 3σ 1 / IQR 2 三档切换正常、控制台零报错 ✓

## 2026-11-21（v3.0 第二刺）
- [完成] v3.0 功能 ②「答辩演示模式」：智能分析页签顶部新增「答辩演示」按钮，一键进入全屏投影视图（尝试 requestFullscreen，被浏览器拒绝时退回普通覆盖层不报错）。演示按「概览 → 数据曲线 →（有对比组时）多组对比 → 分析结论」四页组织：概览页大字号呈现实验名称、数据来源、有效行数/列数/跳过行数与采样时段，并把前 4 个通道的「均值 ± 95% CI / 范围 / 标准差」做成大卡片；曲线页复用当前主图配置重画一张放大版（不动原图实例）；对比页复用多组对比图；结论页把自动结论按句拆成要点列表（最多 6 条），顶部给出通道数、行数、异常点总数（src/app.js presentState/buildPresentSlides/presentOverviewHtml/presentChartHtml/presentCompareHtml/presentConclusionHtml/renderPresentSlide/drawPresentChart/drawPresentCompareChart/openPresent/closePresent/presentStep/setupPresent、src/index.html #present-overlay、src/style.css .present-* 与 .ps-*）
- [完成] 键盘与退出交互：← / PageUp 上一页，→ / PageDown / 空格 下一页（首页禁用「上一页」、末页禁用「下一页」），Esc 退出；用户按 Esc 退出系统全屏时通过 fullscreenchange 一并收起覆盖层，退出时销毁演示用的两张图表实例，原主图与对比图不受影响；翻页带淡入上移动画，演示期间锁 body 滚动（src/app.js setupPresent）
- [验收] chrome-devtools 实测（1440×900）：串口示例 39 行 → 演示页 3 页（overview/chart/conclusion）、进度「1 / 3」、首页「上一页」禁用 ✓；概览页文案「有效数据 39 行 × 3 列（跳过 7 行）」「21:34:05.001 — 21:34:44.901」、四张统计卡（temp 25.94±0.17、humi 62.93±0.19、press 1013.27±0.18）✓；→ 翻到曲线页，canvas 1291×609、折线 3 数据集、标题 42px ✓；→ 翻到结论页 6 条要点、末页「下一页」禁用、再按 → 不越界 ✓；Esc 退出后覆盖层隐藏、body.presenting 移除、演示图表已销毁 ✓；加一组对比数据后页数变 4 页、对比页 canvas 存在、图表 6 个数据集、退出后销毁 ✓；回归：主图实例存活、temp 均值 25.93923076923077、39 行不变、控制台零报错 ✓

## 2026-11-21（v3.0 第三刺）
- [完成] v3.0 功能 ③「SPC 控制图」：新增 src/spc.js（纯本地，无外部依赖）——按固定子组大小 n（2~10）把有效数据顺序切组，算子组均值 Xbar 与子组极差 R，用 GB/T 4091 / ISO 7870 常用系数表（A₂ / D₃ / D₄）按 3σ 口径给出控制限：Xbar 图 CL = X̿、UCL/LCL = X̿ ± A₂·R̄；R 图 CL = R̄、UCL = D₄·R̄、LCL = D₃·R̄。末尾不足一个子组的点丢弃并在界面注明。compute() 返回 groups/xbar/rbar/控制限/越界组号/系数，verdict() 按「均值图越界 / 极差图越界 / 两者都越界」给出不同归因（中心漂移 vs 波动变大 vs 两者皆有），src/spc.js compute/subgroup/verdict/constants
- [完成] SPC 界面（智能分析页签，取值分布卡之后）：监控通道下拉 + 子组大小下拉（2~10，默认 5）+ 一行样本概览「N 点 → K 个子组（每 n 点一组，末尾 x 点未用）」；三张汇总卡显示 Xbar 图 CL/UCL/LCL、R 图 CL/UCL/LCL、越界子组数（无越界绿字、有越界红字）；上下两张控制图（均值图蓝、极差图绿），CL 点划线 + UCL/LCL 虚线由自定义插件 spcLimits 绘制并带标签，越界子组点标红加大，tooltip 显示该子组均值/极差与原始值区间、越界时追加「⚠ 越界」；底部注明系数取值与控制限公式并附 verdict 判定句（src/app.js renderSPC/drawSPC/setupSPC、src/index.html #spc-card、src/style.css .spc-*）
- [验收] chrome-devtools 实测：系数表核对 n=5 → A₂ 0.577 / D₃ 0 / D₄ 2.114 ✓；纯函数校验 [1..10] 按 n=5 分两组 → 组均值 3 / 8、极差 4 / 4、X̿ 5.5、R̄ 4、UCL 7.808 / LCL 3.192 / R UCL 8.456（手算一致）✓；串口示例 temp → 39 点 7 子组（末尾 4 点未用），CL 25.885 / UCL 26.237 / LCL 25.532，R CL 0.611 / UCL 1.293 / LCL 0，越界 7 处（均值 5 / 极差 2），两张图 7 个点、spcLimits 插件在位 ✓；切 humi → CL 62.82 / UCL 63.011 / LCL 62.63、越界 6 处（均值 5 / 极差 1）✓；子组大小改 3 → 13 个子组、A₂ 显示 1.023（与系数表一致）✓；改 10 → 3 个子组（末尾 9 点未用）✓；回到 5 → 7 个点 ✓
- [验收] 回归：统计卡 18 张、直方图 15 bin、相关矩阵 3×3、通道 chips 3 个、主图/直方图实例存活、异常口径默认 MAD、误差棒默认开、报告 6 节、NTC 5000Ω → 41.46°C、temp 均值 25.93923076923077、39 行不变、控制台零报错 ✓

## 2026-11-21（v3.0 第四刺）
- [完成] v3.0 功能 ④「PPT 大纲导出」：报告页签工具栏新增「导出 PPT 大纲」按钮，按报告结构自动生成答辩演示大纲（Markdown）并同时复制到剪贴板。大纲固定 6 页——标题页（题目 / 一句话说明 / 数据规模 / 采集时段）、数据概览（来源 + 通道清单 + 清洗情况 + 通道统计 markdown 表）、数据曲线（主图讲解要点 + 前 3 通道起止与均值）、误差分析与不确定度（uA/uB/uC/U 与相对扩展不确定度、主要误差来源、采样率、标定评估）、分析结论（结论按句拆前 5 条）、总结与展望（数据质量 / 可改进点 / 演示提示）；页数在正文里自动回填（src/report.js buildPptOutline、src/app.js export-ppt-btn 绑定、src/index.html #export-ppt-btn）
- [验收] chrome-devtools 实测：串口示例 + 标题「温湿度气压采集实验」+ 目的 + 允差 a=0.1、k=2 → 大纲 1414 字符、6 页、页标题依次「标题页 / 数据概览 / 数据曲线（主图）/ 误差分析与不确定度 / 分析结论 / 总结与展望」✓；概览页 markdown 表三行（temp 25.94 / σ 0.542 / 25.31~27.9 / 异常 2；humi 62.93 / 0.607 / 0；press 1013.27 / 0.567）✓；误差页「uA = 0.09，uB = 0.06（a = 0.1），uC = 0.1，U = 0.21（k = 2）」「25.94 ± 0.21，相对扩展不确定度约 0.8%」「A 类（重复性波动）主导」「采样率约 0.95 Hz」✓；下载 blob 2591 字节 text/plain、toast「PPT 大纲已生成并复制到剪贴板」✓
- [验收] 回归：报告仍 2905 字符含「误差分析与讨论」、SPC 两张图在位 7 个子组、演示模式三页正常开关、temp 均值 25.93923076923077 ✓

## 2026-11-21（v4.0，ZCode 接手批次）

> 本批共 9 个功能（3 个 3D + 6 个升级），全部纯本地实现，未引入任何 CDN。

- [完成] v4.0 功能 A「Web Worker 大数据引擎」：新增 src/engine.js + src/engine-worker.js——超过 2 万行的解析下放到 Worker 子线程（importScripts 复用同一份 parser.js，主线程与 Worker 结果逐位一致）；解析完成后统计/结论仍由主线程 refreshDerived 统一计算（口径切换/合并/换算共用同一后处理，Worker 只承担 parse 这个 CPU 大头）；file:// 双击环境 Worker 受限时自动回退主线程同步解析，30 秒超时同样回退，保证"双击即用"不缺失；回退时解析反馈注明「Web Worker 后台解析，界面不卡顿」仅在 Worker 真正生效时显示（src/engine.js LabEngine.parseAsync、src/engine-worker.js、src/app.js doParse）
- [完成] v4.0 功能 B「自动模型辨识」：新增 src/modelid.js——7 种候选模型（线性/二次/三次/指数/对数/幂函数/倒数）自动竞选：变换转线性回归或正规方程多项式拟合，预测值反变换回**原始 y 空间**计算 R² 与修正 R²（惩罚参数数，避免变换域 R² 虚高的经典陷阱）；校准页拟合卡新增「自动辨识最优模型」按钮输出候选表（模型/公式/R²/修正 R²/最大残差）与「生成该模型 C 代码」（exp→expf、log→logf、power→powf，域约束带运行时校验），辨识结果写入操作流水（src/modelid.js identify/cCode、src/app.js setupV4、src/index.html #mid-result）
- [完成] v4.0 功能 C「可复现实验包 + 数据指纹」：新增 src/repro.js——指纹 = SHA-256(原始数据文本 + 处理流水 JSON)，顺序敏感（流水变了指纹就变）；crypto.subtle 不可用时回退 FNV-1a 并在指纹串标注算法名，保证验证双方算法一致；「导出复现包」用 JSZip 打包 package.json(指纹/流水/设置/事件/口径) + data.raw(原始输入) + report.txt + charts/*.png + README.txt(验证方法)；「验证复现包」重算指纹与包内比对：一致 →「结论可信：报告由这份数据经这条流水得出」，不一致 → 明确提示数据或流水被改动；另有「只算当前指纹」快速查看（vendor/jszip.min.js、src/index.html #rp-*、src/app.js setupV4）
- [完成] v4.0 功能 D「无后端分享链接」：LZ-String 把 {原始文本, 解析设置, 报告信息} 压缩进 URL 的 #share= 段（30 行实测压缩后 1.0 KB）；对方用本工具打开带 #share= 的链接自动恢复 pending 并解析，报告信息一并回填，恢复后清掉 hash；压缩后超 60 KB 提示改用复现包；Excel 来源（无原始文本）明确提示不支持改用复现包（vendor/lz-string.min.js、src/app.js setupV4 内 hash 恢复）
- [完成] v4.0 功能 E「虚拟仪表盘」：新增 src/dashboard.js——串口采集时的 SVG 拟物仪表台：第 1 通道温度计（液柱高度 + 蓝→红色相映射）、第 2 通道指针表盘（-120°~+120°）、第 3 通道七段数码管（段码绘制，支持负号）；标度取当前采集滑动范围归一化；毛刺告警通道的仪表加红色呼吸光（复用采集面板 hasRecentSpike）；导入页串口卡「虚拟仪表」开关随时关；随采集停/开自动清空与重建（vendor 无依赖、src/app.js setupSerial 内 dashOn/spikeKeysNow、src/index.html #dash-root、src/style.css .dash-root）
- [完成] v4.0 功能 F「摄像头实验记录」：事件标注卡新增「📷 拍照关联」——选择/拍摄照片后压缩到最长边 480px JPEG（质量 0.6）暂存 state.pendingEventPhoto，添加事件时随事件存入 state.events[i].photo；事件列表显示 44px 缩略图，操作流水记「（附现场照片）」；照片仅存本地与复现包，不经过服务器（src/app.js setupEvents、src/index.html #event-photo-btn/#event-photo-input、src/style.css .event-photo）
- [完成] v4.0 功能 G「3D 数据星系」：新增 src/galaxy.js（Three.js 本地 vendor/three.min.js r149 UMD，无 CDN）——多通道时间序列升维成 3D 地形：X=时间、Z=通道（每通道一条山脊，间距 34）、Y=归一化数值（上限 26）；异常点为发光红晶体（脉动动画）、事件标注为地面石碑（CanvasTexture 文字贴图）；飞行模式 WASD/方向键移动 + 鼠标拖动转视角（初始 yaw 由「相机位置 → 数据中心」方向反解，避免开局看空场景）、R 键回放（相机沿时间轴匀速飞行、地形随之呈现）；每通道等距抽样 ≤900 点；Esc 退出销毁实例与监听（src/index.html #galaxy-open-btn、src/app.js setupV4）
- [完成] v4.0 功能 H「虚拟实验台数字孪生 + 接线挑战」：新增 src/bench.js——3D 实验桌面全部程序化几何（无外部模型文件）：实验桌、主控板（芯片 + 3V3/GND/PA0/PA1 四引脚）、传感器模块（VCC/GND/DATA 三脚 + LED）、玻璃温度计（液柱升降 + 蓝→红变色）、七段数码管屏（CanvasTexture 重绘）、状态 LED；串口采集实时驱动（LabBench.updateFromSeries 由采集管线每 150ms 调用）；「接线挑战」：点选模块引脚 → 目标引脚生成杜邦线（CatmullRomCurve3 + TubeGeometry，中段高度用确定性偏移），VCC→3V3 / GND→GND / DATA→PA0 全部接对后状态 LED 变绿并提示「虚拟串口开始出数」，错误连线红色高亮（src/index.html #bench-open-btn）
- [完成] v4.0 功能 I「异常猎人游戏」：复用数据星系场景的 hunter 模式——飞行器沿第一条通道地形以 6 点/秒推进，鼠标点击红晶体（raycast）弹出「真异常 / 误报」判定框：误报晶体变绿倒地、真异常晶体增亮；推进到数据尽头自动结算（真异常/误报计数），复核清单写入操作流水（进报告「处理与计算流程」）并挂 state.hunterVerdicts（src/galaxy.js tryShoot/showVerdict/finishHunter、src/index.html #hunter-open-btn）
- [验证] chrome-devtools 实测（file:// 协议；http 路径因本机 Chrome 代理故障未在浏览器直验，但 Worker 回退逻辑已覆盖该场景，部署后生效）：模块全局 LabSPC/LabModelID/LabRepro/LabDashboard/LabGalaxy/LabBench/LabEngine/LZString/JSZip/THREE 全部加载 ✓；CSV 示例 30 行解析 ✓；模型辨识 temp→humi 七模型排序（三次 0.8220 > 二次 0.8124 > 倒数 0.8008 > 对数 0.7946 > …）✓；指纹 SHA-256 输出 64 位 hex ✓；分享链接 30 行 → 压缩后 1.0 KB ✓；3D 星系 canvas 渲染 + 三通道山脊（temp_c 蓝 / humi_pct 橙 / pressure 绿）+ 通道标签可见 ✓；猎人模式 overlay + HUD（推进百分比/复核计数）✓；3D 实验台场景（桌面/主控板/模块/温度计/数码管/引脚）渲染 ✓；虚拟仪表盘三仪表随模拟采集实时更新（temp 26.01 / humi 62.53 / press 1013.2）✓；事件拍照按钮与缩略图挂载 ✓
- [验证] 回归：串口示例 39 行跳 7、报告 2931 字符含「误差分析与讨论」、答辩演示模式开/关正常、控制台 JS 报错 0 条 ✓
- [备注] 部署提醒：dist/ 需同步 src/ 后重新发布（本批代码已完成 dist 同步，但线上发布需要走 Qoder Sites 的发布流程）；vendor/ 新增 three.min.js(608KB)、lz-string.min.js(4.8KB)、jszip.min.js(97KB) 需一并上传；粘贴 CSV 的 detectSerial 双路解析（v3.0）不受本批影响；v3.0 的「对比组列序错位」问题（renderCompareChart 按共享列 index 取各组数据）仍待修复

## 2026-11-21（v4.0 验收与三处修复）

- [修复] 虚拟仪表开关点了没反应：setupV4 里绑定按钮用的是 setupSerial 函数内的局部变量 `dashOn`，跨函数不可见，点击抛 `ReferenceError: dashOn is not defined`（页面表现为按钮无响应、控制台一条 Script error）。改为把开关并入 state（state.dashOn），setupSerial 内删局部声明，采集管线与 setupV4 三处统一读写 state.dashOn（src/app.js）
- [修复] v3.0 遗留 P1「对比组列序错位」：renderCompareCols 的 option value 原存列 index，renderCompareChart 拿同一个 index 去各组取 cells，B 组列顺序与 A 组不同时静默取错列。改为 option value 存列名，取数时各组各自 `ds.columns.find(c => c.name === colName)` 定位自己的 index（src/app.js renderCompareCols / renderCompareChart）
- [修复] 异常猎人复核清单丢失：galaxy.js 用 `window.state` 写读 hunterVerdicts，而 state 是 app.js 的顶层 const（全局词法绑定，不挂 window），`window.state` 恒为 undefined，复核结果永不落盘、getHunterVerdicts 永远读空。改为 `typeof state !== 'undefined'` 探测后直接读写（src/galaxy.js finishHunter / getHunterVerdicts）；`window.pushOp` 本身有效（函数声明会挂到 window），流水写入未受影响
- [验收] 功能 A「Web Worker 引擎」：http 环境（python -m http.server 8791）30000 行 / 1.08 MB 文本 parseAsync 104 ms、LabEngine._workerBroken=false、与主线程逐位一致（identical=true）；file:// 下 _workerBroken 自动置位走回退，25000 行 61 ms 结果一致；UI 全链 25000 行粘贴 6 s 内完成、statsOk=3、temp 均值 25.0061124、控制台零报错
- [验收] 功能 B「模型辨识」：humi→press 推荐三次多项式（修正 R² 0.9884），候选表 7 行（三次 0.9896/0.9884、二次 0.9873/0.9863、倒数 0.9832/0.9822、对数 0.9826、幂 0.9825、线性 0.9819、指数 0.9819）
- [验收] 功能 C「复现包」往返：导出 zip 条目 [package.json, data.raw, report.txt, README.txt, charts/, charts/trend.png]，verifyPackage 原包 ok=true（SHA-256:67b148e9ab0e03f4）；用 JSZip 把 data.raw 里 25.→26. 重打包后 ok=false（expect 67b148… / actual 8039687a…），防篡改生效
- [验收] 功能 D「分享链接」：makeShareUrl 返回 {url,size,rows}（39 行压缩后 1575 字节、url 1613 字符）；带 #share= 打开后 hash 被 replaceState 清空、state.ds 恢复 39 行跳 7、#report-title 回填、pendingNote='来自分享链接'
- [验收] 功能 E/G/H/I：三仪表 SVG 随模拟采集实时更新（temp 26.43→26.55、humi 62.86→62.58）；采集面板 3 张指标卡（当前值 / 最小·最大）+ 运行时长；虚拟实验台 canvas 2160×1350、3D 星系与猎人 overlay 均可打开并 Esc 退出销毁（猎人 HUD「前进 x% 已复核 n / m 处」）
- [验收] 报告与导出：报告 2931 字符七节（一名称与目的 / 二器材与数据来源 / 三数据结果 / 四实验事件记录 / 五分析结论 / 六误差分析与讨论 / 七附录）；Word 221515 字节、23 文件、4 张图、document.xml 31028 字符、11 个二级标题、2 张表、章节顺序一~十全对；PPT 大纲 1393 字符 6 页
- [验收] 回归：串口示例 39 行跳 7、temp 25.93923076923077（σ 0.541987 / 95%CI 0.170103）、humi 62.9297、press 1013.2744、异常 2 处、SPC 7 子组、直方图 15 bin、主图 3 数据集、NTC 5000Ω→41.46 °C、答辩演示 3 页、控制台零报错
- [备注] dist/ 已按 src/ 全量同步（19 个文件 + vendor 8 个）；docs/交接说明-v4.0.md 第 7 条「P1 列序错位」已标记为已修；本批仍需走 Qoder Sites 发布流程才会上线

## 2026-11-21（v4.0 归档与同步）

- [完成] dist/ 与 src/ 全量对齐并逐文件哈希校验（29 个文件一致，vendor 8 个）；README 补 v3.0~v4.0 能力（七页签、SPC 控制图、项目库、答辩演示、PPT 大纲、3D 星系/实验台、仪表盘、模型辨识、复现包/指纹、分享链接）与目录结构、技术栈
- [完成] git 提交 780fb3c 并推送 main（20 个文件，+3035 / −60），origin/main 与本地一致（ahead/behind = 0/0）
- [备注] 线上仍为 v2.9，v3.0~v4.0 需走 Qoder Sites 发布流程上线；dist/vendor 三个新文件（three.min.js 608KB、lz-string.min.js 4.8KB、jszip.min.js 97KB）必须一并上传

## 2026-11-21（v4.1，ZCode 第二批）

> 本批四项：三项新功能（Welch t 检验 / 传感器驱动包 / 实验知识卡）+ 一项确认（对比组列序错位 P1 已由 DSH 修复并验证）。全部纯本地，无新 CDN 依赖。

- [完成] v4.1 功能 A「Welch's t 检验（组间差异显著性）」：analysis.js 新增 tTestWelch(a, b)——独立两样本 t 检验（Welch 版，不假设方差齐），自由度 Welch–Satterthwaite；双尾 p 值由不完全贝塔函数（连分数法，Numerical Recipes 标准实现）纯本地计算，含 log-gamma Lanczos 近似。多组对比卡在组数 ≥2 时自动对前两组做检验并展示（t / 自由度 / 双尾 p / 显著性分级），结果存 state.compareTTest；report.js 数据结果节自动追加「组间差异检验」段落（生成报告时经 info.tTest 传入），Word / 静态 HTML 同步（src/analysis.js lgamma/betacf/ibeta/tTestWelch、src/app.js renderCompareChart、src/report.js）
- [修复] t 检验 p 值计算初版符号错误：ibeta 的 ln B(a,b) 写成 +lgamma(a)+lgamma(b)（正确为 lgamma(a+b)−lgamma(a)−lgamma(b)），导致 p 值虚大——实测 t=8.63、df≈23 时 p=0.136（应为 1e-8 量级）。修正后 t=8.63 → p=1.11e-8「差异高度显著」，与理论一致；不显著正例（两组同均值）p=0.734 亦正确（src/analysis.js ibeta）
- [完成] v4.1 功能 B「传感器驱动包生成」：工具箱 C 代码卡新增「下载驱动包 (.zip)」——按当前来源（NTC B 值式 / NTC Steinhart-Hart / ADC / 多项式）生成可直接进工程的三件套：sensor.h（参数宏化 + include guard + 接口声明）、sensor.c（实现引用宏，换标定只改头文件）、driver.md（换算模型说明 + 典型接线 + 使用示例 + 换算记录快照 + 参数指纹）；NTC B 值式额外内置 21 点分度表数组与 ntc_temp_lut() 查表插值版（无 math.h 依赖）；指纹与复现包同源（SHA-256(参数 JSON + 换算记录)）（src/app.js genDriverPackage/genCCodeParamsSnapshot、src/index.html #cg-pkg-btn）
- [完成] v4.1 功能 C「实验知识卡」：页签栏新增「📖 实验知识」按钮，弹出左目录右正文的弹层（6 组 17 卡，按当前页签自动定位组）——把工具里每个方法背后的"为什么"写成卡片：串口容错解析哲学、两点标定原理、B 值式 vs S-H 选型、线性度/迟滞含义、修正 R² 的作用、三种异常口径选择、A 类/B 类不确定度、SPC 读图法、Welch t 检验含义、误差棒含义、滤波选型、FFT 重采样原因、指纹与可复现性、驱动包用法、定时器/过采样原理、处理流水价值、误差分析节构成；Esc / 点遮罩关闭（src/app.js KNOWLEDGE/setupKnowledge、src/index.html #know-overlay、src/style.css .know-*）
- [确认] v3.0 遗留 P1「对比组列序错位」已由 DSH 修复并代码复核：renderCompareCols 的 option value 存列名、renderCompareChart 各组按 ds.columns.find(name) 定位自己的 index（v4.0 验收与三处修复一节有完整记录）——本批实测多组对比 + t 检验路径时列序错位不再出现
- [验收] chrome-devtools 实测（file://）：显显著正例——串口示例（39 行 press 均值 1013.274）+ 构造 B 组（1012.25）→ t = 8.63、自由度 ≈ 23.1、双尾 p = 1.11e-8「差异高度显著」；不显著正例——两组同均值数据 p = 0.734「差异不显著」✓；报告 3195 字符数据结果节自动出现「组间差异检验（Welch's t，通道 press）…差异高度显著」段 ✓；驱动包下载 ntc_b-driver.zip（ntc_temp + ntc_temp_lut + 21 点分度表宏化）✓；知识卡弹层 6 组 17 卡、按当前页签定位、目录点击切换 ✓；回归：串口示例 39 行跳 7、报告含误差分析节、答辩演示开/关、3D 星系开/关、控制台 JS 报错 0 条 ✓
- [备注] dist/ 同步与发布仍待手动执行（同 v4.0 批次备注）；t 检验当前只对比前两组，三组以上需要两两比较（多重比较校正 Bonferroni），如有需求在下批扩展

## 2026-11-21（v4.1 验收与四处修复，DSH）

> 本批验收 ZCode 交付的 v4.1 三项功能，验收过程中发现并修掉四个问题（一个算法精度、两个接线遗漏、一个定位逻辑）。

- [验收] Welch t 检验与 scipy 1.18.1 逐位比对：三组已知样本（n=10/10、n=5/5、n=5/5）的 t / 自由度 / 双尾 p 全部一致到机器精度——case1 t=-25.436488070744645 df=18 p=1.4642031880879274e-15（scipy 1.4642031880878227e-15）；case2 t=-0.17960530202677139 df=7.711133400200595 p=0.8620918996972431；case3 t=-1.8973665961010275 df=5.882352941176471 p=0.1075311949306115；样本不足（n<2）返回 null ✓
- [验收] 多组对比联动：串口示例（temp 25.9392）作 A 组 + 构造列序打乱的 B 组（humi,temp,press，10 行）→ 下拉框选项为列名、A 组取 temp 首点 25.32、B 组取 temp 首点 28（列序错位不复现）→ t = -23.062、df ≈ 46.5、p = 4.36e-27「差异高度显著」，与按两组均值/标准差手算的 scipy 值（t=-23.075、p=4.175e-27）在 3 位有效数字内一致
- [验收] 驱动包三型全通：ntc → sensor.h 503 B / sensor.c 1317 B / driver.md 1020 B，include guard 齐、含 math.h、指纹 SHA-256:62a697b5；adc → 236/180/655 B、无 math.h、指纹 771e048f；poly → 201/87/605 B、指纹 7875e74e；改 B 值 3950→3435 后指纹变 c6da207d、改回后指纹复原 62a697b5（指纹确由参数决定）✓
- [验收] 实验知识卡：6 组 17 卡全渲染；六个页签逐个切换后打开弹层，默认定位分别落在「导入数据 / 校准换算 / 智能分析 / 滤波实验 / 工具箱 / 生成报告」组（修复后，见下）✓
- [修复] NTC 分度表按线性等距取点导致查表插值误差过大：旧实现 R 从 1000 Ω 到 100000 Ω 线性等分 21 点，低阻段一格跨约 5 kΩ，全量程最大偏差 12.66 °C（R=2711 Ω 处精确 57.58 °C、查表 70.24 °C），R=10 kΩ 处也有 0.64 °C 偏差。改为对数等距取点后最大偏差降到 0.25 °C（R=1124 Ω），R=10 kΩ 处偏差 0（src/app.js genDriverPackage 的 rs 生成；driver.md 增补取点说明）
- [修复] Word 报告缺「组间差异检验」段：report.js buildDocx 的 info 解构漏了 tTest，且 app.js 构造 pkg 时未带 tTest —— 文本报告有、Word 没有。两处补齐后 document.xml 23113 字符、含 Welch 段（n=39 均值 25.939 vs n=10 均值 28.225，t=-23.062，df≈46.5，p=4.36e-27）（src/report.js buildDocx、src/app.js export-docx-btn）
- [修复] 清空对比组后 t 检验残留：compare-clear-btn 与 afterParse 只清 compareSets 不清 compareTTest，导致报告里留着上一轮的组间检验。两处补 delete state.compareTTest；实测清空后 state.compareTTest 为 undefined、报告不再含 Welch 段（src/app.js）
- [修复] 知识卡不按页签定位：页签元素的 data-tab 是英文标识（如 toolbox），而知识卡分组键是中文页签名，旧代码用 dataset.tab 去 groups.indexOf 恒为 -1，每次都落到第一组。改为读页签文本（textContent.trim()）匹配；实测六页签定位全对（src/app.js setupKnowledge）
- [验收] 回归：串口示例 39 行跳 7、temp 25.93923076923077（σ 0.541987 / 95%CI 0.170103 / 异常 2）、humi 62.9297、press 1013.2744、直方图 15 bin 求和 39、SPC 7 子组、主图 3 数据集、报告 2917 字符六节含误差分析与讨论与测量不确定度、PPT 大纲导出正常、控制台 JS 报错 0 条

## 2026-11-22（v4.2 两两比较 + Bonferroni 校正）

> 上一轮遗留：t 检验只比前两组，三组以上直接按 0.05 判定会把假阳性放大。本轮补两两比较与多重比较校正。

- [完成] `LabAnalysis.tTestPairwise(groups, alpha)`（analysis.js）：输入 [{label, values}]，对全部 C(k,2) 组配对做 Welch's t，返回 {k, m, alpha, pairs:[{labelA,labelB,t,df,p,pAdj,sig,rawSig,m1,m2,n1,n2}]}；校正后 p = min(1, p × m)，m = k(k−1)/2；分组不足 2 组或有效样本 < 2 返回 null。校正保守但不需要额外分布假设（不依赖各检验独立性假设）
- [完成] 对比卡自适应（app.js renderCompareChart）：两组时保持 v4.1 的单次检验文案；三组以上渲染两两比较表（比较 / t / 自由度 / 原始 p / 校正后 p / 结论），达校正后 p < 0.05 的行标红，末尾附族错误率说明（m 次比较各自按 0.05 判定时的假阳性概率 1−0.95^m）；state.compareTTest 在两组时存单次结构、多组时存 {multi:true,k,m,alpha,pairs}
- [完成] 报告同步（report.js buildReport / buildDocx）：多组时「数据结果」节输出引导句 + 六列 markdown 表 + 族错误率说明；Word 里生成真 Table（表头 + 每对一行，达显著的行结论列加粗），两组时仍是 v4.1 的单段文案。pkg 的 tTest 字段两种结构共用，无需改接线
- [完成] 样式与知识卡：style.css 加 .pair-table（表头浅蓝底、显著行淡红底 + 结论列加粗深红）；KNOWLEDGE['智能分析'] 新增「三组以上为什么要 Bonferroni 校正」卡（6 组 17 卡 → 18 卡），讲清族错误率、校正公式与保守代价、组数多时可用 Holm 逐步法
- [验收] 算法与 scipy 1.18.1 逐位一致（tmp/pairwise_ref.py）：三组样例 A/B/C 的 3 对 t / df / 原始 p / 校正后 p 全部吻合——A vs B t=-25.436488070744645 df=18 p=1.4642031880879274e-15 pAdj=4.3926095642637824e-15（scipy 4.392609564263448e-15）；A vs C t=0.11854572724905363 df=16.682456033955905 p=0.9070509902406652 pAdj=1；B vs C t=28.908222344899556 df=16.682456033955884 p=1.0920836305649748e-15 pAdj=3.2762508916949246e-15
- [验收] 校正真的起作用（tmp/pairwise_flip.js，确定性伪随机）：5 组各 n=40、均值梯度 0.16、σ=0.5 → m=10，10 对中 2 对「原始 p < 0.05 但校正后 ≥ 0.05」被翻成不显著（B vs D p=0.00899→pAdj=0.08985、C vs E p=0.00657→pAdj=0.06575），浏览器实测同样两组翻转，界面标为「弱显著（校正后 0.05 ≤ p < 0.10）」且不高亮
- [验收] 界面（chrome-devtools，file:///D:/Qlder/src/index.html）：3 组 → 表 3 行、m=3、族错误率 14.3%；5 组 → 表 10 行、m=10、族错误率 40.1%、7 行高亮；表头背景 rgb(240,245,255)、显著行 rgb(254,246,246) 生效；两组时无 pair-table、文案回落到单次检验（t=-23.866 df=50.9 p=2.71e-29）
- [验收] 报告与 Word：报告 3494 字符含引导句 + 3 行表格 + 族错误率说明；Word 225183 字节 / 23 文件 / document.xml 32661 字符 / 2 表，含「两两比较」「Bonferroni」「校正后 p」列与三对行，族错误率文字在位
- [验收] 边界：单组 / 有效样本 <2 / 两组全同值 / 空数组 / null 均返回 null（不抛错）；pAdj 上限截断到 1
- [验收] 回归：串口示例 39 行跳 7、temp 25.93923076923077（σ 0.541987 / CI 0.170103 / 异常 2）、humi 62.9297、press 1013.2744、SPC 7 子组（CL 25.885 / UCL 26.237 / R̄ 0.611 / 越界 7）、主图 3 数据集、直方图 15 bin 求和 39、报告 2931 字符六节且无 Welch 段、清空对比组后 compareTTest 为 undefined、控制台 0 报错

## 2026-11-22（v4.2，ZCode 第三批：电路仿真页）

> 调研依据：本地 CRUMB v091226 解剖（Unity + AVR 指令级内核，闭源不可复用，只支持 ATmega328P）+ Wokwi 官方文档（QEMU-WASM 内核 / diagram.json 格式 / Chips API / 支持硬件清单）。结论与分层方案（X 引脚级 → Y MicroPython → Z esp-qemu WASM）记录在调研对话中，本批交付方案 X 第一版。

- [完成] v4.2 功能 A「电路仿真页签（第八页签）」：新增 src/sim.js（约 900 行，纯本地无依赖）——元件注册表 10 种（ESP32 DevKit-C（15+15 引脚真实命名）、LED、电阻、按钮、电位器、数码管、LCD1602（I2C 占位）、蜂鸣器、拨动开关、NTC 温度源）；画布拖放 + 点引脚连线（Bezier 导线，Wokwi 五色）；引脚级电气模型：并查集网络解算，强驱动（GND/3V3/GPIO 输出）> 上拉 > 悬空，元件内部导通桥接（电阻/NTC 两脚永久导通、按钮按下导通、拨动开关按位导通；LED 单向导通在点亮判定处理）
- [完成] v4.2 功能 B「MCU 规则引擎（无代码执行面）」：每个 GPIO 一条规则——常高 / 常低 / 交替翻转（可设周期帧）/ PWM 呼吸（三角波）/ 输入+上拉 / 输入悬空；右侧「MCU 规则」面板实时编辑，双击 ESP32 芯片定位；GPIO 电平变化写事件日志（时间戳 + HIGH/LOW）。设计取舍：不做用户字符串→JS 执行（Mimosa 安全基线，规避注入面）；指令级仿真属方案 Z（esp-qemu WASM）
- [完成] v4.2 功能 C「示波器（4 通道）」：右键已连线引脚加入示波器，canvas 轨迹（600 帧滑窗，数字电平 0/1 + PWM 模拟值），通道图例显示引脚；「清空示波器」复位
- [完成] v4.2 功能 D「波形一键导出到分析链路（核心卖点）」：仿真跑出的网络电平导出为 CSV（时间戳_ms + chN 列），自动写入 state.pending → doParse → 切「数据预览」——实测 600 帧 × 5 通道解析成功，可直接进统计/FFT/SPC/t 检验/报告。这是 Wokwi/CRUMB 都没有的闭环：仿真 → 数据 → 分析 → 报告在同一个工具里
- [完成] v4.2 功能 E「diagram.json 导入 / 导出（Wokwi 兼容）」：导出 {version:1, parts:[{id,type,top,left,attrs}], connections:[[from,to,color,[]]]} 与 Wokwi 格式一致；导入吃 Wokwi 项目文件（wokwi-led / board-esp32-devkit-c-v4 等命名直接映射）
- [验证] LED 闪烁链路：GPIO2 规则「交替翻转 15 帧」→ 220Ω → LED(A/C) → GND：运行时 LED 亮灭交替（toggle 相位与 tick 数学一致：tick 331→552 均为 HIGH 相位）；事件日志滚动 GPIO2 HIGH/LOW
- [验证] 波形导出：运行 600 帧 → 「波形导出到分析」→ 解析「识别到 5 列 · 共 600 行 电路仿真波形」→ 自动切数据预览 ✓
- [验证] 回归：串口示例 39 行跳 7、报告含误差分析节、控制台 0 报错 ✓
- [修复] 本批开发中修掉四个自引入 bug：fullRender 清空画布时误删连线 SVG 容器（连线全部消失）；netOf 只登记网络根键导致非根引脚（led1:C、r1:2 等）get 全 undefined（LED 判定/桥接/示波器全失效）→ collect 改为每引脚键全量映射网络号；桥接 merge 时 strong[1] 为 undefined 抛错（单侧强驱动场景）→ reduce 合并 drivers；r1 两脚导通未建模导致 LED 恒灭（电阻两侧网络断开）→ 元件内部导通桥
- [修复] 用户体验：元件库图标错字（mobx → ▬）；tickLoop 加 try/catch 把运行异常写进事件日志（file:// 下 window.onerror 看不到细节）
- [备注] ①MCU 逻辑脚本（Serial.print/analogRead 用户代码）因安全扫描拦截字符串→JS 执行，本版以规则引擎替代——等价覆盖教学场景，Serial.println 类需求待方案 Y（MicroPython WASM）落地后回归；②电位器/NTC 的模拟值路径（analogRead）在规则引擎下为占位，波形记录暂只含数字电平与 PWM；③dist/ 同步与发布待手动执行（新文件 src/sim.js，无新 vendor）

## 2026-11-22（v4.3，ZCode 第四批：方案 Y Python 执行 + 方案 Z 路径书）

> 方案 Y 交付（浏览器内真 Python 执行）；方案 Z 交付实施手册（本机无 emscripten 构建链，编译属 CI/环境工程，手册见 docs/方案Z-esp-qemu-wasm.md）。

- [完成] v4.3 功能 A「Pyodide vendor 本地化」：vendor/pyodide/ 新增 pyodide.js(14.7KB) / pyodide.asm.js(1.2MB) / pyodide.asm.wasm(10MB) / python_stdlib.zip(2.3MB) / pyodide-lock.json——CPython 3.12 WASM 完整运行时离线可用，零 CDN
- [完成] v4.3 功能 B「Python 执行 Worker + machine 模拟层」：新增 src/sim-py-worker.js——Worker 线程加载 Pyodide，注入 machine 模拟层（Pin：value/on/off/toggle 与 PULL_UP 语义；ADC：read/read_u16；PWM：duty/duty_u16 → 主线程 PWM 占空比；time.sleep → JS 忙等桥短等待），注册为可导入模块（types.ModuleType('machine') + sys.modules），print 经 setStdout 桥到仿真页串口。**诚实定位**：Pyodide 是 CPython WASM，machine 是语义模拟层（接口与真板一致，学生代码语法原样可跑），非 ESP32 固件执行——真固件 = 方案 Z
- [完成] v4.3 功能 C「仿真页 MCU 模式切换」：sim-side 新增「规则引擎 / 🐍 Python 脚本」双模式切换——Python 模式含代码编辑框（默认 LED 闪烁示例）、运行/停止按钮；file:// 环境提示需本地服务器（Worker/WASM 受限）；Python 模式下 applyRules 跳过（MCU 输出由 Worker 驱动），渲染循环照常（solveAll/示波器/波形记录与规则引擎共用）
- [完成] v4.3 功能 D「桥协议与输入快照」：sim.js 新增 setPyMode/pyPinWrite/pyInputsSnapshot/pyPrint——Worker 的 pin/pwm 消息经主线程 pyPinWrite 直接写 esp.outputs 并即时解算渲染；主线程每 100ms 向 Worker 推送输入快照（digital: 各 GPIO 网络电平；analog: 电位器 SIG 0~1），Python 的 analogRead/pinRead 读快照（滞后 ≤100ms）；Python 的 print/status/error 统一写入 LabSim 串口数组 pyPrint（修复：直接写 DOM 被 renderSerial 每帧覆盖）
- [验证] Python 闪烁全链（http://127.0.0.1:8123，file:// 不支持）：worker 加载探针 ✓ → Pyodide「运行时加载中→Python 就绪」✓ → 用户代码 print「LED 闪烁开始 · GPIO2」✓ → GPIO2 HIGH/LOW 交替（004s~013s 持续）✓
- [验证] 回归：串口示例 39 行跳 7、报告含误差分析节、规则引擎模式 LED 运行正常（pyMode=false 时 applyRules 恢复）✓
- [修复] 本批开发中修掉三个自引入 bug：Python print/status 直接写 DOM 被 renderSerial 每帧覆盖 → 改走 LabSim.pyPrint 串口数组；machine 未注册为模块（from machine import Pin 报 ModuleNotFoundError）→ types.ModuleType 注册；桥函数带双下划线前缀在类方法内被 Python name mangling 改写（AttributeError: _Pin__simPinMode）→ 桥函数改名 simPin* 并逐个挂 worker 全局
- [完成] v4.3 功能 E「方案 Z 实施手册」：docs/方案Z-esp-qemu-wasm.md——esp-qemu WASM 化四步路线（构建/集成/编译服务/降级融合）、风险表（工具链摩擦、GPL 分发、性能 ~20-50 MIPS、GPIO MMIO patch 约 200-400 行 C）、验收标准；**本机无构建链未实施，属 CI/环境工程**
- [备注] ①Pyodide Worker 内 Python 死循环用 time.sleep 忙等，worker 满负荷但 postMessage 不阻塞——实测闪烁持续 ~10s 后观察到停止现象一次，疑似消息/资源问题，转交 DSH 用 devtools worker 断点诊断（代码路径已闭环，重现步骤：sim 页 → Python 模式 → 运行默认示例）；②Pyodide 13MB 建议部署时预压缩（wasm 可 gzip 至 ~4MB）；③dist 同步含 vendor/pyodide/ 整目录（5 文件）

## 2026-11-22（v4.3 验收与七处修复，DSH）

> 验收 ZCode v4.2（电路仿真页）/v4.3（Python 执行）两批。实测出 7 个问题，全部已修并复验；ZCode 遗留的「Python 闪烁约 10s 后停止」已定位到两个真实根因（非 Worker 崩溃）。

- [修复] **仿真时钟被 rAF 节流**：`tickLoop` 原用 `requestAnimationFrame` 驱动，窗口不可见时 Chrome 把 rAF 限到 ~1 fps，而每帧只 `st.tick++` 一次、时间却按 20 ms/帧换算 → 仿真时钟慢 50 倍，看起来像「跑一会儿自己停了」。实测对照：`setInterval(20ms)` 1.5 s 跑 80 次、`rAF` 只 3 帧（`document.visibilityState` 仍报 visible）。修法：改 `setInterval(tickLoop, STEP_MS=20)` + 按真实墙钟补步 `steps = Math.floor((now-lastTs)/STEP_MS)`，clamp 1..MAX_CATCHUP(6)，`start/stop/catch` 三处管理 timer。复验：2 s 涨 100 tick（49.75 步/秒）、12 s 涨 600（50 步/秒，GPIO2 翻转 66 次）、32 s 涨 1600，无衰减、无 done/error
- [修复] **Python sleep 忙等冻结输入**：`simSleep` 在 Worker 内 `while (Date.now() < end) {}` 忙等，期间不消费 postMessage，主线程每 100 ms 推的 `{cmd:'inputs'}` 全被丢弃 → `ADC(34).read()` 恒为启动瞬间的值（改电位器 75%→20% 也不变）。修法：`wrapAsync()` 把 `time.sleep(` / 裸 `sleep(` 改写成 `await asyncio.sleep(`，整段包进 `async def __lab_main():` 走 `py.runPythonAsync`；语法异常回退同步 `py.runPython`。**踩坑**：初版 `import asyncio as _lab_asyncio` 但代码体写 `asyncio.sleep` → `NameError: name 'asyncio' is not defined`（Traceback 在 `_pyodide/_base.py` eval_code_async），必须 `import asyncio`。复验：40 次循环每 0.25 s 读 ADC，电位器 80%→10%→90% → 串口 `3276 / 410 / 3686`，读数实时跟随；`time.time()` 计时 0.001/0.511/1.022/1.534/2.043/2.555（步长 0.5 s 准确）
- [修复] **`LabSim.getParts` 未导出**：`app.js` 元件库按钮调 `LabSim.getParts()` 算摆放位置，而 sim.js 的 return 对象只有 `_st()` → 点任一元件库按钮必抛 `LabSim.getParts is not a function`（被 catch 成 toast，元件加不进去）。修法：补 `getParts: function () { return st ? st.order.map(id => st.parts[id]) : []; }`。复验：10 个元件库按钮全点 → state 14 件、DOM 14 件
- [修复] **模拟量硬编码 `analog[0]`**：电位器接 D34 时 `ADC(34).read()` 恒 0，只有 `ADC(0)` 有值。修法：`pyInputsSnapshot()` 遍历电位器 SIG 网络里每个 `pid:pin` 键，解析 ESP32 引脚号写入 `analog[g]`，只有该网络没接 MCU 时才回退 `analog[0]`。复验：电位器 75% 接 D34 → `snap.analog = {34: 0.75}`，Python `ADC(34).read()` = 3071（=0.75×4095）
- [修复] **`addPart` 只改状态不渲染**：元件加进 `st.parts` 但画布上看不到（ghost 元件），导出 diagram.json 却包含它。修法：`addPart` 末尾调 `fullRender()`。复验：连点 10 次后 DOM 元件数与状态一致（4→14）
- [修复] **数码管永灭（大小写不匹配）**：`solveAll` 写 `p.lit` 用大写键 A~G，`drawSevenSeg` 用小写 a~g 查 → 全部 undefined。修法：`const on = lit[k] !== undefined ? lit[k] : lit[k.toUpperCase()];`。复验：数码管 A←D2、B←D4、COM.1←GND.1，`setRule('2',{mode:'high'})` 后前两段 stroke `#ff5d3a`、其余 `#2a2f3a`
- [修复] **Worker 不释放**：停止 Python 或切回规则模式后 `window.__simPyWorker` 仍存活，再点运行会新建第二个 Worker。修法：`switchMode(false)` 与 `pyStop` 两处都 `terminate()` 并置 `window.__simPyWorker = null`，pyStop 另把按钮文案恢复为「▶ 运行」。复验：pyStop 后 worker 为 null、`LabSim.isRunning()` false、串口尾行「[Python 已停止]」
- [验证] **八页签全链回归**（http://127.0.0.1:8791/src/index.html）：导入数据/数据预览/校准换算/工具箱/智能分析/滤波实验/生成报告/电路仿真齐全；串口示例 39 行跳 7、temp 25.93923076923077（σ 0.5419865 / CI 0.1701031 / 异常 2）、humi 62.929743589743595、press 1013.2743589743588；仿真默认电路 4 元件 5 连线，2 s 后 tick 76；波形导出 → 101 行 × 6 列（时间戳_ms + ch0..ch4）自动切「数据预览」，统计全 ok（ch0/ch1 均值 0.5033、ch2 恒 0、ch3/ch4 恒 1）、直方图 151 bin 求和 151、SPC 30 子组、主图 6 数据集；报告 2513 字符六节含「电路仿真波形」来源与测量不确定度；演示 3 页；NTC 5000 Ω → 41.46 °C；两点标定 → B 3946.0696 / R0 9723.0311；模型辨识三次 0.9884；知识卡 18 张；3 组以上两两比较 6 行高度显著、清空后 compareTTest 已删；控制台 0 报错
- [验证] **Word 导出结构**：填全选填项 + 2 行仪器台账 → 10194 B / 19 entries / document.xml 33485 字符 / 9 个 Heading2（一实验名称与目的、二实验器材与数据来源、三实验步骤、四注意事项、五数据记录说明、六数据结果、七分析结论、八误差分析与讨论、九附录：原始数据摘录）/ 2 表 / 含 DT9205A、DS1054Z、搭电路、注意共地、电路仿真波形
- [备注] ①`SharedArrayBuffer` 路线已排除：本机 `crossOriginIsolated:false`、构造即抛 `SharedArrayBuffer is not defined`，需 COOP/COEP 响应头，成本高于 async sleep；②仿真页 Python 模式必须走 http（Worker/WASM fetch 受限），file:// 下 UI 已提示；③vendor/pyodide 13 MB，部署时整目录上传，wasm 可 gzip 至约 4 MB
