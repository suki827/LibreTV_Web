# Codex 开发任务：LibreTV Smart TV API V1

你现在是一名资深 TypeScript 后端工程师和 Android TV 系统架构师。

请基于现有 LibreTV 项目，开发独立的 Smart TV API 服务。

**本次要求实际编写代码、完成测试和 Docker 配置，不要只输出分析报告。**

## 一、现有环境

硬件：

- Raspberry Pi 5
- 4GB RAM
- ARM64 Linux

现有 LibreTV：

- 版本：2.19.2 定制版
- 镜像：`libretv:2.19.2-server-sources-20261107`
- 容器名称：`libretv`
- 端口：8080
- Docker Compose 部署目录：`/mnt/data/server/compose/libreTv`
- `/api/status` 已验证返回 HTTP 200

重要：

当前 LibreTV 已经经过二次开发，视频源订阅数据保存在服务端。

请优先分析本地定制版源码，不要直接假设官方 LibreTV 的接口与当前版本完全一致。

参考项目：

- https://github.com/LibreSpark/LibreTV
- https://github.com/AresCNZJ/DpadTV
- https://github.com/MoonTechLab/Selene-TV

## 二、开发目录隔离（必须首先执行）

### 1. 检查原始项目

开始任何代码修改之前：

- 确认 LibreTV 原始项目的绝对路径。
- 检查 Git 状态、分支、Commit Hash。
- 检查是否存在未提交修改。
- 确认源码与当前运行的定制版本之间的关系。

如果没有找到实际定制版源码，不要擅自用官方最新版代替。

### 2. 创建独立开发副本

在原始 LibreTV 项目的同级目录，创建：

`LibreTV-SmartTV-Dev/`

要求：

- 完整保留项目源码和必要配置。
- 保留 Git 历史。
- 优先采用独立 Git Clone；必要时采用 Git Worktree。
- 如果存在未提交修改，必须确保不会丢失，并说明如何安全处理。
- 排除 `node_modules`、`.next`、编译产物、缓存和日志。
- 不复制生产密码、密钥、Cookie、私人订阅数据和生产数据库。
- 不得修改、删除或覆盖原始项目的任何文件。

如果采用 Git Worktree，必须确认其与原项目共享 Git 元数据的影响；如果需要彻底独立，优先使用独立 Clone。

**所有后续开发必须在 `LibreTV-SmartTV-Dev/` 中进行。**

### 3. Git 开发规则

- 创建开发分支：`feature/smart-tv-api`。
- 不允许直接修改原始项目 main 分支。
- 不允许自动 Push、Merge、Rebase。
- 不允许覆盖已有未提交修改。
- 每次修改前确认当前工作目录。

### 4. AGENTS.md

在开发副本根目录创建或更新 `AGENTS.md`。

写入以下长期规则：

- 原始 LibreTV 项目为只读。
- 所有开发只允许在 `LibreTV-SmartTV-Dev/` 中进行。
- Smart TV API 代码位于 `smart-tv-api/`。
- 不得修改生产 Docker 容器、Compose、数据库或视频源订阅数据。
- 不得未经授权执行生产部署。
- 所有功能必须有必要的测试。
- 不得将敏感配置写入 Git、日志或测试报告。
- 每次任务开始前检查工作目录和 Git 状态。
- 如果操作可能影响原始项目，必须停止并请求用户确认。

如果已经存在 `AGENTS.md`，保留原有规则并追加新规则。

## 三、项目目录结构

目标结构：

```text
LibreTV-SmartTV-Dev/
├── src/                        # 现有 LibreTV 源码
├── public/
├── package.json
├── Dockerfile
├── AGENTS.md
│
└── smart-tv-api/
    ├── src/
    │   ├── app.ts
    │   ├── server.ts
    │   ├── routes/
    │   │   ├── health.ts
    │   │   ├── search.ts
    │   │   ├── movies.ts
    │   │   ├── play.ts
    │   │   └── playback-report.ts
    │   ├── services/
    │   │   ├── libretv-client.ts
    │   │   ├── movie-matcher.ts
    │   │   ├── source-selector.ts
    │   │   ├── source-probe.ts
    │   │   └── source-health.ts
    │   ├── db/
    │   └── schemas/
    ├── tests/
    ├── Dockerfile
    ├── compose.yaml
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    └── README.md
```

## 四、技术栈

必须使用：

- TypeScript（strict mode）
- Node.js LTS
- Fastify
- Zod
- SQLite
- Drizzle ORM
- fetch / Undici
- Vitest
- Docker Compose

运行环境要求：

- Raspberry Pi 5 4GB
- Linux ARM64
- 低内存占用
- 异步网络请求
- 可配置超时与并发数
- 结构化日志
- 环境变量配置

Smart TV API 必须作为独立服务运行，不与 LibreTV 共用 Node.js 进程。

## 五、首先分析现有 LibreTV

在开始实现 API 之前，阅读实际源码，确认：

1. 服务端订阅源的存储位置和格式。
2. 如何获取当前启用的视频源。
3. `/api/status` 的真实响应结构。
4. `/api/search` 的真实 HTTP 方法、参数和响应结构。
5. `/api/detail` 的真实 HTTP 方法、参数和响应结构。
6. 认证、Cookie 与 Session 机制。
7. 已有 Apple CMS 解析逻辑。
8. 已有 M3U8 处理逻辑。
9. 是否已有片源健康检测与自动停用功能。
10. 是否支持服务端直接读取已保存的订阅源。

优先复用现有 TypeScript 逻辑。

如果某个模块依赖 Next.js Runtime，评估是否适合通过 HTTP 调用，而不是强行复制。

不要复制一套新的订阅源管理系统。

如果现有接口不足，先在 Smart TV API 中设计兼容适配器，不要直接修改原有 LibreTV 核心代码。

## 六、开发 Smart TV API

### 1. 健康检查

`GET /health`

返回：

- Smart TV API 状态
- LibreTV 连接状态
- 数据库状态

### 2. 模糊搜索与去重

`GET /api/v1/search?q=关键词`

要求：

- 调用 LibreTV 已有聚合搜索能力。
- 自动搜索所有已启用视频源。
- 关键词标准化。
- 支持部分片名。
- 支持繁简体转换。
- 支持基础拼音与拼音首字母匹配。
- 支持影视别名匹配（有元数据时）。
- 对不同视频源的相同影片进行合并。
- 按相关度排序。
- 返回统一影视结果。

去重必须考虑：

- 标准化名称
- 上映年份
- 电影 / 电视剧类型
- 别名
- 季数
- 系列续作

例如：

- 流浪地球
- 流浪地球 (2019)
- 流浪地球 高清版

在证据充分时可合并。

但：

- 流浪地球
- 流浪地球2

不能合并。

如果信息不足，优先避免错误合并。

注意：

模糊搜索只能基于已有搜索结果和已缓存元数据进行匹配。如果上游视频源未返回相关影片，需要通过关键词扩展或后续索引改善，不能声称已经支持全库模糊搜索。

### 3. 影视详情

`GET /api/v1/movies/:id`

要求：

- 获取聚合影视详情。
- 返回名称、年份、类型、封面、简介。
- 聚合各个来源的信息。
- 电视剧返回统一剧集列表。
- 保留内部来源映射。
- 不强制用户选择播放线路。

### 4. 自动选择播放源

`GET /api/v1/play/:id?episode=1`

实现：

1. 获取所有候选视频源。
2. 获取对应影片及剧集的播放地址。
3. 排除重复和无效地址。
4. 根据历史健康评分排序。
5. 对候选播放地址进行有限并发检测。
6. 优先返回可用的首选线路。
7. 同时返回备用线路。
8. 支持播放失败后重新选择线路。

默认并发检测数：3。

检查项目：

- URL 合法性。
- HTTP 响应状态。
- 重定向。
- M3U8 清单。
- 必要的媒体分片可访问性。
- 是否返回 HTML 错误页面。
- 必要的 Referer、User-Agent 等请求头。

要求：

- 不下载完整视频。
- 不进行视频转码。
- 不代理完整视频流。
- 不因一个视频源失败阻塞其他来源。
- 严格限制请求超时、响应大小、重定向次数和并发数量。
- 实现 SSRF 防护，包括重定向目标和 DNS 解析检查。

注意：

服务端检测通过不代表 Android TV 一定能够解码。

Android TV 实际播放失败时，应调用反馈接口并尝试备用线路。

### 5. 播放反馈

`POST /api/v1/playback/report`

接收：

- movie_id
- episode
- source_id
- playback_success
- startup_time_ms
- buffering_count
- error_code

要求：

- 校验参数。
- 更新来源健康度。
- 记录播放成功率。
- 对失败来源临时降权。
- 避免一次偶发失败永久封禁来源。

客户端反馈必须具备适当的认证或访问控制，防止任意请求污染健康评分。

### 6. 备用线路机制

设计以下能力：

- 首选线路。
- 备用线路。
- 按健康评分排序。
- 排除本次播放已经失败的候选。
- 播放失败后返回下一候选。
- 避免同一线路反复重试。
- 支持后续断点续播。

## 七、SQLite 数据库

建立独立数据库。

建议表：

- `movie_cache`
- `movie_source_mapping`
- `search_cache`
- `source_health`
- `playback_reports`

要求：

- SQLite WAL 模式。
- 必要索引。
- 缓存 TTL。
- 过期记录清理。
- 数据迁移。
- 避免无限增长。
- 不存储明文服务密码。
- 不修改 LibreTV 原有数据库。

## 八、Docker 部署配置

在 `smart-tv-api/` 中创建：

- Dockerfile
- compose.yaml
- .env.example

目标：

- LibreTV：8080。
- Smart TV API：8081。
- 独立容器。
- 独立数据卷。
- 支持 ARM64。
- 自动重启。
- 健康检查。
- 合理内存限制。

注意 Docker 网络：

容器内部的 `localhost` 不等于树莓派宿主机。

请检查当前 LibreTV Docker 网络配置，设计可靠的容器间访问方式。

不要直接修改现有 LibreTV Compose。

不要直接执行生产部署。

## 九、测试要求

使用 Vitest 编写自动化测试，至少覆盖：

1. 搜索结果解析。
2. 中文模糊搜索。
3. 繁简体匹配。
4. 拼音匹配。
5. 跨源影视去重。
6. 同名不同年份。
7. 电影系列续作。
8. 电视剧剧集匹配。
9. 无效视频地址。
10. M3U8 清单异常。
11. HTTP 请求超时。
12. 多源并发检测。
13. 自动选择备用线路。
14. 视频源健康评分。
15. SQLite 缓存。
16. LibreTV 服务不可用。
17. SSRF 防护。
18. API 参数校验。
19. 不同请求之间的候选隔离。
20. 播放反馈认证。

优先使用 Mock 网络请求。

不要依赖真实第三方视频源完成单元测试。

## 十、验证要求

完成代码后执行：

- TypeScript 类型检查。
- ESLint。
- Vitest 测试。
- Docker 构建验证。
- LibreTV 原有项目构建兼容性检查。

如需运行集成测试，使用独立端口和测试数据库。

不得修改生产服务或生产数据。

## 十一、交付内容

请提供：

1. 完整 Smart TV API 源码。
2. 独立 Docker Compose 配置。
3. `.env.example`。
4. 数据库 Schema 和迁移。
5. 自动化测试。
6. README。
7. API 接口文档。
8. LibreTV 适配说明。
9. Android TV 客户端接入指南。
10. 测试结果与已知问题。

## 十二、执行流程

按以下顺序执行：

**阶段 A：开发隔离**

- 检查原项目。
- 创建独立开发副本。
- 创建开发分支。
- 更新 AGENTS.md。
- 确认原项目未受影响。

**阶段 B：源码分析**

- 阅读当前定制版 LibreTV。
- 确认服务端订阅源和实际 API。
- 确定可复用模块。

**阶段 C：实现**

- 创建 `smart-tv-api/`。
- 实现 API、搜索、去重、自动选源、缓存和数据库。
- 完成 Docker 配置。

**阶段 D：验证**

- 运行自动化测试。
- 修复发现的问题。
- 完成构建检查。
- 输出交付报告。

### 强制安全规则

- 原始 LibreTV 项目必须保持不变。
- 不修改生产 Docker Compose。
- 不重启现有 LibreTV。
- 不修改生产订阅数据。
- 不自动部署。
- 不自动 Push 或 Merge。
- 不删除任何已有用户代码。
- 不将敏感信息写入 Git。
- 遇到无法安全复制的未提交修改、无法确认的源码版本或必要权限不足时，暂停并说明问题。

**现在开始实际执行，不要只做方案分析。完成后报告新增文件、测试结果和下一步工作。**