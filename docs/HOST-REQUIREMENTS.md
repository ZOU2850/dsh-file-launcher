# 宿主要求 / Host requirements

## Plugin 支持范围

- **DSH Desktop 0.2.2-rc.3** 测试通过（Electron 44.7 / Node 24.21）。
- 标准 **DSH Web bundle** 也可用；精简 SDK / 自组装 profile 未必包含 Office 转换。
- 仅 UI 主题、文件盘点、PDF、图片、文本不需要 Office 服务。

## Office 预览依赖

`Word / PowerPoint` 在插件内预览需要 Host 的 **`office-kit`** 服务：

1. Host 侧挂载 `@deepseek-ai/dsh-office-kit` 提供方。
2. Client 侧挂载 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`，它提供 `remote.officeKit`。
3. `office-kit` 的 LibreOffice Kit（`@deepseek-ai/libreoffice-kit` 0.2.3 对应版本）可导入：
   - 官方 Desktop/Web 包会带匹配的原生包或 WASM；
   - 自组装 profile 可能只有 provider，没有 LibreOffice 引擎，转换会失败。

Excel `.xlsx/.xls/.xlsm` 在标准 DSH 中由浏览器表格 renderer 处理，不依赖 Office 转换；本插件在检测到 Host 没有 `officeKit` 时会尝试打开侧边栏的 Excel 预览。

## 检查当前宿主

打开：

```text
GET /api/file-launcher.health
```

返回中：

```json
{
  "officeKit": true,
  "capabilities": { "officeKit": true }
}
```

表示 Host 找到了 `officeKit`。`false` 时插件会显示宿主提示，Word/PPT 无法在插件内转换。

也可以直接使用 DSH 右侧栏的文档预览打开同一个 Office 文件：

- 能预览 → 说明 Host 的 document preview / OfficeKit 链路存在，问题在本插件的 client 注入或版本；
- 也不能预览 → 说明宿主缺少 office-kit / LibreOffice，先修宿主。

## 版本与更新

- `remote.officeKit` 是 DSH 公共 Remote；插件通过可选的 `ctx.inject(['remote', 'remote.officeKit'])` 获取，不会因为缺少它而让其余功能加载失败。
- 新增 Host 服务或切换 LibreOffice Kit 后，**完全退出并重新打开 DSH**；只刷新页面可能仍在使用旧的 Host 模块。
- 不建议把 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 从 Web bundle 中裁掉；否则插件无法取得 `officeKit` Remote。

## 常见失败

| 现象 | 原因 |
|---|---|
| 所有 Office 文件提示“Office 预览不可用” | `remote.officeKit` 没注入，或 Host 未挂载 provider |
| `document-render/failed`，reason `unavailable` | provider 在，但 LibreOffice Kit / 原生引擎缺失 |
| 只有 Excel 失败 | 通常是宿主 document preview / Excel renderer 被裁剪；标准 DSH 不应出现 |
| 截图/PDF 正常，Word/PPT 失败 | Office 转换链路问题，不是 PDF 渲染 |
| 换电脑后全失败 | 目标 profile 是精简包或没有 office-kit，不是文件损坏 |

## 最小可用宿主

- 官方 DSH Desktop，或官方 Web bundle；
- `office-kit` provider；
- 匹配的 LibreOffice Kit（原生或 WASM）；
- `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 客户端包存在。

不满足时插件仍可正常使用文件清单、预览图片/PDF/文本、收藏、归档、引用等；只有 Office 转换预览降级。
