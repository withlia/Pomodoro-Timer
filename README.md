# 像素番茄钟 · Pixel Pomodoro

一个 Electron + React + TypeScript 打造的像素风番茄钟桌面应用，专注于「番茄工作法 + 强制屏蔽干扰」的一体化体验。

## 下载 & 安装

前往 [Releases](https://github.com/withlia/Pomodoro-Timer/releases/latest) 下载最新 Windows 安装包 `Pixel.Pomodoro.Setup.<version>.exe`，双击运行即可。

> 无需管理员权限。网站屏蔽通过本地代理 + 系统代理设置实现，专注结束后自动恢复原有代理配置。

## 功能

### 番茄钟
- 三种模式：专注 / 短休息 / 长休息，长休息按可配置间隔自动触发
- 完成一个专注周期自动 +1 番茄到当前选中任务，并弹出系统通知
- 会话记录持久化到 `localStorage`

### 任务管理
- 新建任务时可自定义预估番茄数（最少 1）
- 行内 `−` / `+` 实时调整预估，状态自动在 `待办 / 进行中 / 已完成` 间流转
- 支持选中、删除

### 网站屏蔽（Windows）
- 专注开始时启动本地 HTTP/HTTPS 代理（`127.0.0.1:8878`）
- 通过 `HKCU` 注册表设置 Windows 系统代理，Chrome / Edge / Firefox 等浏览器自动走代理
- HTTP 请求按 `Host` 头匹配，HTTPS 请求按 `CONNECT` 目标匹配，命中屏蔽域名返回 403
- 专注结束或退出应用时自动关闭代理并恢复用户原有代理设置
- 无需修改 `hosts`、无需管理员权限，不会被杀软拦截

### 软件屏蔽（Windows）
- 支持选择本地 `.exe` 或手动输入进程名
- 专注期间每 3 秒 `tasklist` 检测目标进程，命中就 `taskkill /F`（用户级进程无需管理员）

### 屏蔽实时统计
- 「监控中 / 待机」状态徽章跟随番茄钟状态变化
- 4 张卡片：启用网址 / 启用软件 / 本次拦截（附已用时长）/ 累计拦截
- 网址与软件拦截排行独立分页，每页 5 条
- 最近拦截列表显示 tag、名称、相对时间，每秒刷新
- 累计次数持久化到 `localStorage`

### 其他
- 统计图表：每个任务的完成进度条，分页展示
- 明暗双主题一键切换
- 全局像素风 UI，含像素风拨杆开关

## 技术栈

| 层级 | 选型 |
| --- | --- |
| UI | React 18 · Vite · TypeScript |
| 桌面 | Electron 43 · electron-builder |
| 主进程 | Node HTTP 代理 · `reg` 注册表操作 · `execFile('tasklist' / 'taskkill')` |
| 通信 | contextBridge / ipcRenderer（`invoke` + `on`） |
| 持久化 | `localStorage` |
| 样式 | 手写 CSS，含明暗主题变量 |

## 目录结构

```
electron/
  main.ts        Electron 主进程：窗口、本地代理、系统代理注册表、进程扫描、IPC
  preload.cts    contextBridge 暴露 window.pixelPomodoro API
src/
  App.tsx        全局状态与面板编排
  data.ts        默认设置 / 默认任务 / localStorage 读取
  types.ts       Task / Settings / BlockedSite / BlockedApp 等类型
  components/
    TimerPanel.tsx        计时器
    TaskPanel.tsx         任务清单
    BlockPanel.tsx        屏蔽名单管理
    BlockStatsPanel.tsx   屏蔽实时统计
    StatsPanel.tsx        统计图表
    SettingsPanel.tsx     设置
    Pagination.tsx        通用分页组件
  styles.css              像素风样式
  types/electron.d.ts     window.pixelPomodoro 类型
index.html
package.json
tsconfig.json
tsconfig.electron.json
vite.config.ts
```

## 开发

### 环境
- Node.js 18+
- Windows（网站屏蔽依赖系统代理，软件屏蔽依赖 `tasklist` / `taskkill`）

### 安装

```bash
npm install
```

### 启动开发

```bash
npm run dev
```

`npm run dev` 会并行启动：
1. Vite 开发服务器（默认 5173）
2. Electron 主进程 tsc 监视编译到 `dist-electron/`
3. `wait-on tcp:5173` 后拉起 Electron

### 类型检查

```bash
npm run typecheck
```

## 构建 & 打包

```bash
npm run build        # 产出 dist/ + dist-electron/
npm run dist         # 构建 + 打包（Windows NSIS 安装包到 release/）
```

打包完成后可在 `release/` 目录找到安装包 `Pixel Pomodoro Setup <version>.exe`。

### CI/CD

推送到 `master` 时 GitHub Actions 自动构建并上传 artifact；推送 `v*` 标签时自动构建并发布 Release：

```bash
# 发新版
git tag v0.3.0
git push origin v0.3.0
```

构建配置见 `.github/workflows/build.yml`。

## License

MIT
