# TokenNote

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="TokenNote Logo" width="80">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue" alt="Platform">
  <img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial-orange" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/语言-简体中文-red" alt="语言">
</p>

<p align="center">
  <b>📊 多站点余额监控 · 趋势分析 · 桌面悬浮窗常驻概览</b>
</p>

> **📢 语言支持**：本项目**仅支持简体中文界面**。

---

## 🏗️ 项目概览

TokenNote 是一个基于 **Tauri 2 + React 19** 的桌面应用，用来集中查看多个站点的余额、请求量、消耗趋势与状态变化，并通过悬浮窗在桌面上提供轻量概览。

**技术栈**：React 19 + TypeScript + Vite + Tailwind CSS | Rust + Tauri 2 | Windows / macOS

**核心模块**：

- 总览面板：多站点余额、消耗、请求与状态摘要的集中视图
- 站点详情：余额趋势、模型消耗分布、近期统计
- 桌面悬浮窗：胶囊态 / 展开态、贴边吸附、自动隐藏
- 提醒系统：低余额阈值提醒、异常状态高亮
- 配置管理：加密导入导出、本机偏好保存
- 站点适配：NewAPI / Sub2API / DeepSeek

---

## 📸 截图

<p align="center">
  <img src="screenshots/generated-1779327486129.png" alt="TokenNote 主界面" width="720">
</p>

---

## ✨ 核心功能

### 📊 总览面板

- 集中展示多站点余额、历史消耗、请求次数和状态摘要
- 支持按站点单独刷新，也支持统一刷新全部已启用站点
- 支持拖动排序，便于把更关注的站点放在前面
- 当站点数量较多时支持搜索站点名、地址、用户名和类型

### 🔍 站点详情

- 查看站点当前余额、历史消耗、请求次数、统计次数等核心指标
- 展示近一段时间的余额趋势，便于观察波动与异常变化
- 提供模型维度的消耗分布与明细统计，快速定位主要消耗来源
- 针对不同站点类型展示更贴合的指标内容

### 🪟 桌面悬浮窗

- 提供胶囊态和展开态两种展示模式
- 支持桌面常驻、双击切换形态、拖动吸附到屏幕边缘
- 可开启贴边自动隐藏，减少遮挡桌面内容
- 在紧凑空间下快速查看站点余额、异常数与低余额数量

### 🔔 提醒与状态

- 支持低余额阈值提醒，减少余额跌破后未及时发现的情况
- 主界面与悬浮窗都会对异常、待刷新、低余额状态进行醒目标识
- 保留最近一段时间的余额历史，方便观察变化趋势

### ⚙️ 配置与维护

- 支持导入 / 导出配置，便于在本机备份或迁移使用
- 导出内容会加密保存，可同时包含站点配置、偏好设置和本机评价记录
- 内置版本检查与更新提示入口
- 在 macOS 上支持菜单栏驻留与恢复主界面

### 🔌 支持的站点类型

| 类型 | 站点 |
|------|------|
| 中转站 | `NewAPI` · `Sub2API` |
| 服务商 | `DeepSeek` |

---

## 🚀 使用方式

1. 启动应用后先添加要监控的站点
2. 在总览页查看所有站点的余额、请求和状态摘要
3. 点击任意站点卡片进入详情页，查看趋势图与模型统计
4. 如需桌面常驻概览，可在设置中开启悬浮窗
5. 按需配置低余额阈值、刷新间隔、并发数和透明度等参数

---

## ❓ 常见问题

**Q：macOS 打开应用提示「已损坏，无法打开」？**
A：执行 `xattr -dr com.apple.quarantine /Applications/TokenNote.app` 后重新打开。

**Q：悬浮窗如何调出或隐藏？**
A：在「设置」中开启 / 关闭悬浮窗；双击悬浮窗可在胶囊态与展开态之间切换；拖动到屏幕边缘可触发贴边吸附与自动隐藏。

**Q：站点添加后没有数据？**
A：先确认站点类型选择正确，再尝试单独刷新该站点；总览页对处于异常或待刷新的站点会有醒目标识。

**Q：怎么备份当前的所有站点配置？**
A：在「设置」中使用配置导出，导出文件已加密保存，可在本机或新设备中再次导入。

---

## 📝 自行编译

### 环境要求

- Node.js（建议使用 LTS）
- Rust stable
- Cargo

| 平台 | 额外依赖 |
|------|----------|
| 🪟 Windows | MSVC Build Tools · WebView2 |
| 🍎 macOS | Xcode Command Line Tools |

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run tauri dev
```

### 构建应用

```bash
npm run tauri build
```

### macOS 本地安装说明

如果是本地构建后的 `TokenNote.app` 被 macOS 拦截，可在将应用复制到 `应用程序` 目录后执行：

```bash
xattr -dr com.apple.quarantine /Applications/TokenNote.app
```

---

## 🔗 友情链接

- [LINUX DO](https://linux.do/)

---

## 📄 License

本项目采用 **PolyForm Noncommercial License 1.0.0** 发布，**禁止任何商业用途**。详见 [LICENSE](LICENSE)。

**简要说明**：
- ✅ 允许：个人使用、学习研究、教育用途、非营利组织使用
- ❌ 禁止：任何形式的商业使用（包括但不限于销售、收费服务、企业内部商业产品）
- 📋 要求：必须保留版权声明和许可证链接；衍生作品必须使用相同协议

如需商业使用，请联系作者获取授权。

---

<p align="center">Made with ❤️ using Tauri + React</p>
