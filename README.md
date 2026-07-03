# 像素番茄钟 · Pixel Pomodoro

一个 Electron + React + TypeScript 打造的像素风番茄钟桌面应用，专注于「番茄工作法 + 强制屏蔽干扰」的一体化体验：

- 任务管理与番茄进度追踪
- 专注期间自动屏蔽干扰网站（写 hosts）与后台软件（结束进程）
- 屏蔽事件实时统计（网址通过 SNI 采集，软件通过进程扫描采集）
- 像素风 UI + 明暗双主题

> 只在 Windows 上完整验证过（hosts + taskkill 都需要管理员权限）。macOS / Linux 可以正常构建和运行，屏蔽相关功能会自动降级。

## 界面预览

| 模块 | 说明 |
| --- | --- |
| 计时（Timer） | 大字号剩余时间、进度条、模式切换、任务选择下拉 |
| 任务管理（Quest Log） | 新增任务时可自定义预估番茄数，行内 −/+ 微调 |
| 网站与软件屏蔽（Focus Shield） | 域名清单 + 本地 EXE 选择 / 手动进程名 |
| 屏蔽实时统计（Shield Monitor） | 启用数 / 本次拦截 / 累计拦截 + 排行 + 最近拦截，分页展示 |
| 统计图表（Stats） | 每个任务的完成进度条 |
| 设置（Config） | 专注/短休/长休时长、长休间隔、像素风拨杆开关、主题切换 |

## 功能亮点

### 番茄钟
- 三种模式：`focus` / `shortBreak` / `longBreak`，长休息按可配置间隔自动触发
- 完成一个专注周期后自动 +1 番茄到当前选中任务
- 会话记录持久化到 `localStorage`

### 任务管理
- 新建任务时输入预估番茄数（最少 1）
- 行内 `−` / `+` 实时调整预估，完成数会与预估动态比较更新状态（`todo` / `doing` / `done`）
- 番茄完成时会向系统弹通知（Electron `Notification`）

### 网站屏蔽（Windows）
- 将启用的域名写入 `C:\Windows\System32\drivers\etc\hosts`，指向 `127.0.0.1`
- 在渲染进程无关的 Node 端启动：
  - 本地 HTTP 服务监听 `127.0.0.1:80`，收到请求 → 返回 403 → 触发事件
  - 本地 TCP 服务监听 `127.0.0.1:443`，解析 TLS ClientHello 的 SNI → 拿到 HTTPS 目标域名 → 触发事件 → 断开
- 番茄专注结束或退出应用时清理 hosts 段落 + `ipconfig /flushdns`

> HTTPS 无法伪造证书，所以只做「记录 + 拦截」，不做重定向；HTTP 只做拦截 (`403`)，也不做重定向。

### 软件屏蔽（Windows）
- 选择本地 `.exe` 或手动输入进程名
- 番茄专注期间每 3 秒 `tasklist` 检测目标进程，命中就 `taskkill /F`
- 触发一次杀进程会向渲染进程发 `blocker:app-killed` 事件

### 屏蔽实时统计
- 「监控中 / 待机」状态徽章跟随番茄钟状态变化
- 4 张卡片：启用网址 / 启用软件 / 本次拦截（附 mm:ss 已用时长）/ 累计拦截
- 网址与软件的拦截排行独立分页，每页 5 条
- 最近拦截列表显示 tag（软件 / 网址）+ 名称 + 相对时间，每秒刷新
- 累计次数持久化到 `localStorage`，专注刚开始时自动清空「本次」计数

## 技术栈

| 层级 | 选型 |
| --- | --- |
| UI | React 18+ · Vite · TypeScript |
| 桌面 | Electron 43 · electron-builder |
| 主进程 | Node HTTP · Node net (TLS SNI 手写解析) · `execFile('taskkill' / 'tasklist' / 'ipconfig')` |
| 持久化 | `localStorage`（设置、任务、会话、屏蔽名单、拦截历史） |
| 通信 | contextBridge / ipcRenderer（`invoke` + `on`） |
| 样式 | 手写像素风 CSS，含明暗主题变量 |

## 目录结构

```
electron/
  main.ts        Electron 主进程：窗口、hosts、80/443 服务、进程扫描、IPC
  preload.cts    contextBridge 暴露 pixelPomodoro API
  preload.ts     旧路径的类型样例（构建走 .cts）
src/
  App.tsx        全局状态与面板编排
  data.ts        默认设置 / 默认任务 / localStorage 读取
  types.ts       Task / Settings / BlockedSite / BlockedApp 等类型
  components/
    TimerPanel.tsx        计时器
    TaskPanel.tsx         任务清单 + 新增（可自定义预估）
    BlockPanel.tsx        屏蔽名单管理
    BlockStatsPanel.tsx   屏蔽实时统计（含分页）
    StatsPanel.tsx        统计图表（含分页）
    SettingsPanel.tsx     设置（含像素风拨杆开关）
    Pagination.tsx        通用分页组件
  styles.css     像素风样式，明暗主题
  types/electron.d.ts     window.pixelPomodoro 类型
```

## 快速开始

### 环境
- Node.js 18+
- Windows 建议以管理员运行（hosts 与 80/443 端口需要权限）

### 安装 & 开发

```bash
npm install
npm run dev          # vite + tsc --watch + electron
```

`npm run dev` 会并行启动：
1. Vite 开发服务器（默认 5173）
2. Electron 主进程 tsc 监视编译到 `dist-electron/`
3. `wait-on tcp:5173` 后拉起 electron

### 类型检查

```bash
npm run typecheck
```

### 生产构建

```bash
npm run build        # 产出 dist/ + dist-electron/
npm run dist         # 构建 + 打包（默认 Windows NSIS 到 release/）
```

### 打包时不写 C 盘（可选）

electron-builder / electron 默认会把缓存写到 `%LOCALAPPDATA%`。想让整个构建过程保持在项目内，可以在打包前设置以下环境变量：

```powershell
$base = ".\.build-cache"
$env:ELECTRON_BUILDER_CACHE = "$base\eb"
$env:ELECTRON_CACHE         = "$base\electron"
$env:TMP                    = "$base\tmp"
$env:TEMP                   = "$base\tmp"
$env:npm_config_cache       = "$base\npm"
npm run dist
```

> `.build-cache/` 已在 `.gitignore` 中。

## 权限说明

- **Windows**：`package.json > build.win.requestedExecutionLevel = requireAdministrator`，安装/运行需要管理员，否则无法写 hosts、监听 80/443、`taskkill`。
- **hosts 修改**：只写入项目自定义的段落（`# Pixel Pomodoro Block Start` / `# Pixel Pomodoro Block End`），退出时会自动清理。
- **网络**：本地 80/443 只监听 `127.0.0.1`，不对外通信；不发送任何遥测。

## 已知限制

- macOS / Linux 未实现进程屏蔽（`taskkill` 是 Windows 命令）
- 80 / 443 端口如被其它服务占用（IIS、Skype 老版本等），事件采集会失败但 hosts 拦截仍生效
- HTTPS 无法重定向到指定网址（浏览器证书校验限制），因此仅做拦截 + 事件记录

## 版本记录

近期主要提交（`master` 分支）：

- `c955495` 用像素风拨杆开关替代原生复选框
- `b5a838d` 移除重定向 URL 设置，改为一律拦截 + 记录
- `2f52ea0` 修复屏蔽面板窄窗口下的溢出
- `7a40478` 屏蔽实时统计跨两行对齐设置与统计
- `f655ea1` 统计图表 / 屏蔽实时统计增加分页
- `0f2b848` HTTPS 拦截通过 443 SNI 采集
- `43edb1a` HTTP 重定向修复，网址拦截也发事件
- `39cabbb` 新增屏蔽实时统计面板 + 加宽新任务输入
- `bac9fb1` 任务卡片单行紧凑排版
- `627802b` 添加任务时可自定义预估番茄数

## License

MIT
