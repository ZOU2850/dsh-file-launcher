# 1.3.1：修复文件盘点导致宿主失去响应

修复重复刷新会话文件列表时，Host 内存持续上涨、最终出现 JavaScript heap out of memory，连带模型、插件列表、Agent 预设和 Office 设置出现 Failed to fetch 的问题。

- 当前 DSH 使用 `sessionQuery.observeSession`，关闭额外投影，借用历史并在成功或失败时释放 lease，避免每次完整复制并重放会话日志。
- 同一会话的并发刷新共享任务；不同会话的扫描串行执行。
- 文件盘点结果缓存最多保留 16 项；取消的排队扫描不再读取历史。
- 保持“我发送的”索引按需加载，不在启动时预热全部历史。
- 修正健康检查返回的版本号。

验证：`node tests/inventory-observation-test.mjs`、`node tests/self-test.mjs`、`node tests/client-test.mjs`。内存回归测试覆盖观察 API、并发合并、串行扫描、缓存上限、失败释放和取消。
