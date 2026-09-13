# GeoBox 地理课件舱

面向希沃白板大屏授课场景的**地理交互式可视化课件运行时 + 课件库管理器**（Windows 桌面端，开源 MIT）。

- 📦 **统一课件包格式 `.gpak`**：预置课件与用户课件同权——你用 vibe coding 写的 HTML 网页程序，点「导入课件」填个名字即可上架（`manifest.json` 自动生成，无需手写）
- 🖥️ **大屏授课优化**：独立播放器窗口、触控友好、纯离线可用
- 📚 **内置教程**：应用内「教程」页含上手引导、AI 自制课件提示词模板、manifest 字段参考
- 🔌 **桥接 API `window.geobox`**：课件可导入真实地理数据（DEM/GeoJSON）、做课件级持久化
- 💾 **本地优先**：SQLite 存储课件库，架构预留云端 API 抽象层（社区功能后置）
- 🔗 **单文件分享**：导出 `.gpak`，双击即导入另一台电脑

## 内置课件（4 个，开机即用）

| 课件 | 内容 |
|---|---|
| 等高线 3D 沙盘 | 程序生成/真实 DEM 地形 · 实时等高线投影 · 剖面测量（可缩放剖面图） |
| 晨昏线示意 | 地球自转公转 · 晨昏圈摆动 · 侧视/极地俯视双视角 · 真实地球贴图 |
| 时区换算器 | Natural Earth 真实时区边界地图 · 点击城市换算区时 · 日界线演示 |
| 水循环动态示意图 | 三种水循环类型切换 · 粒子流动画 · 环节逻辑关系图联动高亮 |

另内置课程标准要点等教学资料（「资料」页），支持上传自己的电子教材。

## 技术栈

Electron · React 18 · TypeScript · Vite（electron-vite）· Three.js（课件运行时）· node:sqlite

## 开发

```bash
npm install   # 自动执行 postinstall：把 three.js 运行时复制到课件 assets（课件离线可用）
npm run dev      # 开发模式（热更新）
npm run build    # 构建
npm run dist     # 打包 Windows 安装包（electron-builder）
```

## 课件包格式 `.gpak`

一个 `.gpak` 就是一个 ZIP：

```
课件名.gpak
├── manifest.json   # id/名称/作者/标签/入口/权限（可用「导入课件」弹窗自动生成）
├── index.html      # 入口页面
└── assets/         # JS/CSS/图片/数据文件，相对路径引用
```

`samples/demo-courseware/` 是一个最小示例课件，四个预置课件的源码（`courseware/`）是完整的自制参考样板。

## 课件桥接 API

```js
// 调起系统对话框导入真实地理数据（DEM/GeoJSON 等）
const file = await window.geobox.importFile({ accept: ['.tif', '.asc', '.geojson'] })
// 课件级持久化
await window.geobox.storage.set('progress', JSON.stringify({ step: 3 }))
// 全屏 / 退出
await window.geobox.setFullscreen(true)
await window.geobox.exit()
```

普通 HTML 课件不调用桥接也能正常运行。

## 路线图

- [x] P0 工程骨架：课件库 + 导入导出 + 沙箱播放器
- [x] P1 预置课件：等高线 3D 沙盘（虚拟地形/实时等高线/剖面测量/DEM 导入）
- [x] P2 预置课件扩充：晨昏线示意、时区换算器、水循环动态示意图
- [x] P3 v1.0 发布：教程页 + 统一导入向导 + 安装版/便携版打包
- [ ] P4 云端社区（另立项）

详见 [架构方案与路线图.md](./架构方案与路线图.md)
