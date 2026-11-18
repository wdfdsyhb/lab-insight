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
