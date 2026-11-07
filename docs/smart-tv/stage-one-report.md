# Smart TV API 第一阶段交付

已完成用户确认的“只读适配器 + 最小服务骨架”阶段，完整 V1 需求中的跨源合并、模糊匹配、缓存及自动选源后续再实施。

## 开发隔离

- 开发目录：`/Users/huanyan/Documents/Codex/2026-11-07/bang/work/LibreTV-SmartTV-Dev`
- 开发分支：`feature/smart-tv-api`，独立 Clone，Git 对象无共享 alternates。
- 上游基线：`dd1c744c40d60ee553bd9f7eb3df55dd79a8f7dc`；定制源保存功能已独立保存为本地基线提交 `a3986de`。
- 服务器源码与本地定制版的 148 个源码/关键构建文件整体哈希已核对一致。
- 原项目的 171 个文件校验值保持不变。未拷贝生产密码、Cookie、源列表或数据库。
- 本阶段未连接生产服务器、部署、重启、Push、Merge 或 Rebase。

## 已实现

- 独立 Node 24 LTS / TypeScript strict / Fastify / Zod 服务。
- 独立 SQLite WAL 数据库、Drizzle Schema 和可重复执行迁移；当前只存服务迁移元数据。
- `GET /health`：真实数据库和 LibreTV 认证访问就绪检查。
- `GET /api/v1/search?q=...`：读取共享启用源，排除停用订阅，分批调用现有聚合搜索；规范化逐源结果，保留部分失败标识。
- `GET /api/v1/movies/:id`：签名、绑定源配置的 ID，重新检查源启用状态后读取单来源详情和剧集 URL 数组。
- 独立 TV Bearer token；LibreTV 密码/会话只在内存；并发登录去重、会话复用、一次 401 重试、拒绝新会话时共享退避。
- 固定上游 origin、拒绝跳转、限制响应体大小/超时/并发/排队/结果数量，错误与日志不输出上游敏感信息。
- ARM64 Dockerfile、独立 Compose/数据卷、非 root、健康检查、内存限制和环境变量模板。
- README、API 契约、LibreTV 适配说明、Android TV 接入说明、Mock 测试与隔离 HTTP/容器验证脚本。

## 验证结果

| 检查 | 结果 |
|---|---|
| Smart TV API TypeScript strict | 通过 |
| Smart TV API ESLint | 通过，零警告 |
| Smart TV API Vitest | 27/27 通过 |
| 本机临时端口完整 HTTP 链路 | 通过；本地合成 LibreTV 后端和独立临时 SQLite |
| Compose 仅配置解析 | 通过，未运行部署 |
| Docker linux/arm64 构建 | 通过，镜像 `libretv-smart-tv-api:0.1.0-dev` |
| 编译产物容器验证 | 通过；ARM64、非 root、禁用网络、SQLite 原生模块与 WAL、Mock API 链路 |
| 开发副本内原 LibreTV 测试 | 439/439 通过 |
| 开发副本内原 LibreTV 类型/ESLint/生产构建 | 通过 |
| 原项目文件校验 | 171 个基线文件无变化 |
| 生产依赖审计 | 未发现已知漏洞 |

独立审查发现并通过回归测试修复了缺失封面导致整批失败、持续 401 导致重复认证、有效长中文/转义源标识生成不可用详情 ID 等边界问题。

## 当前限制与下一步

1. 完整链路验证使用 Mock、本机合成后端和测试数据库，未进行生产实例或真实第三方片源联调。
2. 搜索结果仍按来源分别返回，不执行跨源影视合并，也没有拼音、繁简体、别名或全库模糊搜索。
3. 当前详情 ID 绑定单个来源，不是未来的聚合影视目录 ID；API token 更换或源地址变更会让旧 ID 失效。
4. 原 LibreTV 详情只保留选中线路和按位置排列的 URL，原集名、特别篇和其他线路不可见，不能据此假定跨源剧集对齐。
5. SQLite 已具备基础，但影视/搜索缓存、健康评分、自动选源、备用线路和播放反馈尚未实现。
6. Compose 只提供隔离配置，暂未部署到 8081。后续先用独立开发 LibreTV 验证，再进入元数据缓存和跨源影视识别。

代码位于 `smart-tv-api/`。根目录仅增加独立服务的 TypeScript 排除项与 Docker context 排除项，不改现有 LibreTV 核心 API。
