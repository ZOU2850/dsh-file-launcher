# QA / 兼容性检查

检查时间：2026-11-15  
版本：dsh-file-launcher 1.4.2  
运行环境：DeepSeek Harness Desktop 0.2.2-rc.3，Electron 44.7，Node 24.21，Windows

## 自动化检查

| 项目 | 结果 |
|---|---|
| `node --check`（index / client / lib / tests 全部 JS/MJS） | 通过 |
| `tests/self-test.mjs` | 通过 |
| `tests/client-test.mjs` | 通过（203 个中英文字典键一致，分类扩展名、主题与可选服务降级全覆盖） |
| `tests/inventory-observation-test.mjs` | 通过 |
| `package.json` / `locale/*.json` JSON 解析 | 通过 |
| 设置读写的边界值（5–300 秒、1–40 页、80–160 DPI、100–2000 行、自定义 `archiveDir`） | 通过 |
| 外观主题（跟随 DSH/浅色/深色/跟随系统）保存与非法值回退 | 通过 |
| 缺失文件空壳、`@文件夹`、相对与绝对路径去重合并、`unpin` 相对路径及并发写安全 | 通过 |
| DSH 社区包清单规范（`MIT` `LICENSE`、`exports`、`engines.dsh`、非阻塞可选服务） | 通过 |

## 资源与隔离设计

| 项目 | 说明 |
|---|---|
| 运行持久目录 | `$DSH_HOME/file-launcher/`（含 `pins.json`、`sent-index.json`、`archive.json`、`settings.json`、`deleted.json`） |
| 默认归档根目录 | 系统文档目录下的 `DeepSeekHarnessFileLauncher/Archived_Docs`（可被 `archiveDir` 或环境变量覆盖） |
| 预览链接清理 | `$DSH_HOME/file-launcher/previews` 自动裁剪保留上限（120 份），删除文件时同步清理对应预览缓存 |
| 可控内存项 | 单次列表上限（默认 800 行）、PDF 渲染上限（默认 20 页，最大 40 页）；普通 PDF 直接按 Host 磁盘路径渲染避免 base64 传输 |

PDF 页面图片是主要可控内存项，默认最多 20 页，可在设置中降低。

## Token

面板、预览、自动刷新都不调用 LLM，不消耗模型 token。只有模型显式调用 `file_launcher` 工具时才进入上下文；默认最多 60 行，可用 `limit` 参数降低。自动刷新是本地 HTTP + 会话日志读取，不是模型请求。

## 兼容性

- 只使用公开的 Host/Client 扩展点：`ctx.tools`、`ctx.connection.fetch`、Cordis 服务、Client `slots` / `sidebarRightTabs` / `locale` / remotes。
- 不 import 任何 `@deepseek-ai/dsh-*` 内部包，也不在 `dsh.client.immediately` 或顶层 `inject` 阻塞可选包（`officeKit` / `fileDrag`），可安全运行于精简或标准社区 DSH 环境。
- 设置页通过 `settings.section` 公共 slot 注册并附带容错降级；这是升级时需要重点回归的契约。
- 可编辑设置写入 `$DSH_HOME/file-launcher/settings.json`，不写 profile 的 `cordis.patch.yml`。
- 收藏、发送索引、归档清单、删除墓碑都在 `$DSH_HOME/file-launcher/`，升级/重装不会丢失。

## 稳定性 / OOM 修复

- 已移除启动阶段的 `sent` 索引预热扫描。旧实现会在插件启动 1.5 秒后读取大量会话日志，Host 堆内存可涨到 4 GB，网关退出后所有客户端请求 `Failed to fetch`。
- 「我发送的」首次构建现在最多读取最近 **20** 个会话，并且**逐个串行**读取；打开时会先用本地持久化索引，启动不再扫描。
- 不再按定时器自动重建全局索引；只有用户显式点击刷新才会触发有上限的重建。自动刷新只复用短期缓存和当前会话合并。
- 新增 `tests/inventory-observation-test.mjs`，覆盖串行扫描、并发等待、租约释放、取消和缓存上限。

## 已知风险

1. **自动刷新是轮询**：默认 60 秒（5–300 秒可配），不是文件系统 watcher；自动刷新复用短期缓存，新创建文件会在下一周期或手动点击“刷新”出现。
2. **移动文件不能凭空发现**：跨盘移动且没有新引用时保留旧空壳；需要重新发送新路径或手动清理记录。
3. **纯工作区文件删除**：没有出现在对话历史中的工作区文件被外部删除后，没有历史路径可保留为空壳。
4. **Office/PDF 预览依赖本地工具**：`office-kit`、`pdfinfo`、`pdftoppm` 缺失时回退为侧边栏预览。
5. **设置页 slot 兼容性**：未来 DSH 若改变 `settings.section` 契约，需要跟随适配。

## 升级回归清单

> 若新增设置字段或 Host 路由，升级后请完全退出并重开 DSH，只刷新页面可能仍运行旧的 Host 模块。

- [ ] 插件启用后，右侧边栏、标题栏、输入框三个入口都能打开面板
- [ ] 设置 → 文件启动器可读写（含主题跟随宿主与自定义归档目录），保存后即时更新已打开面板
- [ ] 当前对话、我发送的、当前项目、收藏、历史对话五个范围可用
- [ ] 自动刷新可关闭/调间隔，慢会话不堆叠请求；无 `officeKit`/`fileDrag` 时插件仍正常加载
- [ ] 删除文件写入 tombstone 并清理对应预览缓存；缺失文件显示“不存在”；右键“移除不存在记录”有效
- [ ] PDF/PPT 页面工具栏、右键菜单、外部点击不关闭均正常
- [ ] `file_launcher` 工具仍能 list / pin / unpin / archive
