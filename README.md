# remotion-video-mcp

一台电脑只装一套 Remotion 运行时的视频制作方案：仓库里同时提供 **MCP 服务（stdio + HTTP）**、**可执行命令入口**、**纯文件 skill**。业务项目里不再出现 `package.json` / `node_modules` / 浏览器缓存。

## 安装（一次）

要求 Node `^20.19 || ^22.13 || >=24`。

```bash
git clone https://github.com/gaelthas/remotion-video-mcp.git
cd remotion-video-mcp
node scripts/install.mjs
```

`install.mjs` 依次完成：`npm ci`（唯一一套依赖）→ `ensureBrowser()`（Chrome Headless Shell 缓存到本仓库 `node_modules/.remotion`，全机一份）→ 一次真实冒烟渲染。

然后：

1. 把 `mcp.json.example` 里的路径改成本机绝对路径，合并进 `~/.codebuddy/mcp.json`。macOS / Linux 下 `command` 建议填 `which node` 得到的绝对路径（GUI 启动的 Agent 通常拿不到 nvm 的 PATH）：

```json
{
  "mcpServers": {
    "remotion": {
      "type": "stdio",
      "command": "/Users/you/.nvm/versions/node/v22.22.2/bin/node",
      "args": ["/Users/you/workspace/remotion-video-mcp/server/stdio.mjs"]
    }
  }
}
```

仅 Windows 才需要 `cmd /c`：

```json
{
  "mcpServers": {
    "remotion": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "node", "D:\\path\\to\\remotion-video-mcp\\server\\stdio.mjs"]
    }
  }
}
```

2. 把 `skill/` 复制为 `~/.codebuddy/skills/remotion-video-mcp/`（纯文本文件，零依赖）。
3. 重启 Agent。旧 `remotion-video` skill 可停用，但不要动 `.codebuddy` 目录本身。

可选：

```bash
npm link                      # 生成 remotion-video-mcp / remotion-video-mcp-http 命令
node server/http.mjs          # 或 http://127.0.0.1:3789/mcp，mcp.json 里 type: "http"
npm run check                 # 语法与配置检查
npm run selftest              # 真实 MCP 握手 + 无浏览器链路自检
npm run selftest -- --full    # 追加真实单帧与视频渲染（需浏览器已下载）
npm run selftest:http         # HTTP 传输自检
npm run smoke                 # 真实打包 + 单帧 + 视频回归
```

`config.json`（从 `config.example.json` 复制）可覆盖并发、超时、帧数上限、HTTP 端口与 token。

## 目录

```
server/     MCP 服务、任务队列、worker、路径与安全边界
template/   纯 TSX 骨架（无 package.json）
skill/      纯文件 SKILL.md + references/
scripts/    安装、升级、冒烟、自检、可执行文件说明
VERSION     当前锁定的 Remotion 版本
node_modules/   唯一依赖 + 唯一浏览器缓存（gitignore）
workspaces/ 任务源码（gitignore）
cache/      打包缓存（gitignore）
out/        默认产物（gitignore）
state/ logs/ 任务状态与日志（gitignore）
```

## 工具（17 个）

`remotion_status` · `remotion_create_project` · `remotion_write_files` · `remotion_read_files` · `remotion_put_assets` · `remotion_validate` · `remotion_list_compositions` · `remotion_render_still` · `remotion_render_video` · `remotion_render_batch` · `remotion_job_status` · `remotion_job_log` · `remotion_cancel_job` · `remotion_open_studio` · `remotion_close_studio` · `remotion_export_source` · `remotion_cleanup`

设计要点：

- `bundle({rootDir: <仓库根>, publicDir: <任务 public>, webpackOverride: resolve.modules})` 让零依赖目录也能解析到唯一 `node_modules`；`react` / `remotion` 由 Remotion 自身 alias 到运行时绝对路径。
- `bundle()` 会全局 `process.chdir()`，所以每个任务起独立 worker 子进程，`cwd` 固定为仓库根；浏览器缓存路径也由此确定，全机一份。
- 打包结果按源码哈希复用；批量出片只打包一次。任务状态持久化在 `state/jobs.json`，文件锁 + 并发槽支持 stdio 与 HTTP 多进程共享。
- 源码默认在 `workspaces/<jobId>/`，也可通过 `create_project` 的 `sourceDir` 放进用户项目；`remotion_export_source` 导出时不复制依赖。

## 上游同步

**同步 Remotion 上游源码 ≠ 升级运行时**。运行时用的是 npm 上精确锁版本的包，版本写在 `package.json` 与 `VERSION`。`remotion-dev/remotion` 的 fork 只是可选的源码阅读副本，不参与安装。

- 自动：`.github/workflows/sync-upstream.yml` 定时查上游最新 release，改版本与 lockfile 并开 PR。
- 手动：`node scripts/upgrade-runtime.mjs 4.0.xxx`，会统一所有 `remotion` / `@remotion/*` 版本、重装依赖、刷新浏览器、跑冒烟渲染，最后提交 `package.json`、`package-lock.json`、`VERSION`。
- 官方 skill 知识：`npx skills add remotion-dev/skills` 全机装一次；本仓库的 skill 只描述工具调用，不复制 API 文档。
- 不要在 Agent 出片过程中自动升级，否则同一份代码可能渲染出不同结果。

## 许可

本仓库自研代码的许可由仓库所有者确定（尚未放置 `LICENSE`）。依赖的 Remotion 受 [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) 约束：个人与 ≤3 人的营利组织可免费使用，更大规模组织需要公司许可。分发前请确认。
