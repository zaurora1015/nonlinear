# 画布

支持手动编辑与 Codex 协作的本地脑暴画布。图结构以 JSON 保存，Codex 修改文件后，画布自动同步。

## 运行

需要 Node.js（建议 22 或更新版本）。

```bash
cd 画布
npm ci
npm run dev
```

浏览器访问终端显示的 Vite 地址。

```bash
npm run build
```

## 文件

- `src/`：画布界面与交互
- `server.mjs`：本地文件桥
- `data/workspace.brainstorm.json`：图结构
- `data/workspace.brainstorm.view.json`：当前选区与视图

自然语言编辑通过外部 Codex 修改本地 JSON 实现，需要同时运行本地服务。
