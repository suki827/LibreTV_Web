# LibreTV_Web 分支工作流

## 分支职责

| 分支 | 职责 | 接收规则 |
| --- | --- | --- |
| `main` | 官方同步分支，目标是与 `upstream/main` 的代码一致 | 不开发个人功能；当前历史对齐需单独确认 |
| `deploy/stable` | 长期维护的个人稳定部署版本 | 保留服务端配置保存功能；仅接收经过测试、审查的 PR |
| `feature/smart-tv-api` | 独立 Smart TV API 开发 | 基于稳定基线，完成测试后 PR 到 `deploy/stable`；完整 V1 尚未完成 |
| `feature/*` | 其他新功能 | 从最新 `deploy/stable` 创建 |
| `integration/*` | 官方更新的隔离集成与测试 | 从稳定分支创建，评估官方更新后人工批准合入 |
| `backup/*` | 保留调整前提交 | 长期保留，不删除、不覆盖 |

## 2026-11-08 整理依据

- 官方共同基线：`dd1c744`（v2.19.2）。
- `a3986de`：已部署的服务端配置保存功能、Dockerfile 和通用 Compose 数据卷支持，以及开发范围文档。不包含 `smart-tv-api/` 的实现，因此作为 `deploy/stable` 的起点。
- `46c3ab4`：独立 Smart TV API 第一阶段，以及根目录 TypeScript/Docker context 隔离调整。全部保留在原有开发分支。
- `backup/2026-11-08-before-branch-restructure` 保留原 main 的 `46c3ab4`，原有两笔个人提交保持不变。
- 现有 `feature/smart-tv-api` 已从 `a3986de` 分叉，无需重新创建或 rebase。稳定分支的工作流文档通过普通 merge 同步到开发分支，保证新的稳定分支提交也是开发分支祖先。
- 本轮不修改 `main`，不推送，不创建 PR，不修改生产部署。文档中的未来推送、PR 和部署步骤均需另行授权。

## 日常开发

每次任务先检查工作区；如果有未提交或未跟踪文件，先报告，不清理、不覆盖。下述切换和合并命令只在确认工作区安全后执行。

```sh
git status --short --branch
git branch -avv
git remote -v
git fetch origin
git switch deploy/stable
git merge --ff-only origin/deploy/stable
git switch -c feature/my-change deploy/stable
```

远程 `deploy/stable` 在本轮尚未推送，首次推送经确认后才能运行上面的远程同步命令。目标分支已存在时改用检查和切换，禁止覆盖。逐项暂存相关文件，不把生产数据或缓存加入 Git。

## Smart TV API 开发与合并

继续在已有 `feature/smart-tv-api` 上开发；代码放在 `smart-tv-api/`，独立 Node 24、环境变量、SQLite 和测试。根目录 LibreTV 与 API 必须分别验证。第一阶段只实现只读适配和基础搜索/详情，不代表完整 V1 已完成。

```sh
git switch feature/smart-tv-api
git merge deploy/stable
npm test
npm run typecheck
npm run lint
npm run build
cd smart-tv-api
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

如发生业务冲突，停止并报告，不自动选择任意一侧。完成功能、接口兼容检查和隔离联调之后，经授权推送开发分支，创建 **base 为 `deploy/stable`** 的 PR。保留独立提交、检查记录和功能范围；未经批准，不合并未完成工作，不直接推送稳定分支。

## 官方 LibreTV 更新

`upstream` 已指向 `https://github.com/LibreSpark/LibreTV.git`，存在时不得覆盖其他配置。

```sh
git fetch upstream
git log --left-right --oneline deploy/stable...upstream/main
git diff --stat deploy/stable upstream/main
git switch -c integration/upstream-YYYY-MM-DD deploy/stable
git merge --no-commit --no-ff upstream/main
```

确认目标 integration 分支不存在后才创建。后两条是未来更新的人工操作示例，本轮未执行。合并遇到冲突先审查，尤其是鉴权、订阅同步、源数据格式和数据卷；不明确的业务逻辑必须等待确认。完成测试、ARM64 镜像构建、隔离环境验证与源配置持久化/兼容检查后提交，在授权后通过 PR 合入稳定分支。不要把包含未完成功能的旧 main 直接合入 stable。

本次官方 `upstream/main` 为 `722e86f`（v2.21.2），较共同基线新增 45 个提交，涉及 SSRF、订阅自动刷新、播放器、搜索和发布流程。`git merge-tree` 的无工作区模拟发现 `src/components/auth.tsx` 内容冲突；自动合并成功的文件也须人工评估，不能据此认定业务兼容。本轮未建立或提交官方更新的 integration 分支。

## main 对齐：等待确认

当前 main 已有两个个人提交。保留历史且不 force-push 时，不能把它的分支指针直接改成官方提交并正常快进推送。

建议在单独的整理分支上：先以新增 revert 提交依次撤销 `46c3ab4`、`a3986de` 的代码效果（原提交仍保留），验证代码树等于 `dd1c744`；再合并 `upstream/main`，验证代码树等于官方版本。经确认后才把该结果快进到 main。原 main 不直接尝试冲突解决；模拟和测试先在整理分支完成。

这能使 main 的代码与官方一致，但历史会额外保留个人提交、撤销和合并记录，不能宣称提交历史完全等同。备份和功能分支保留个人成果。不要再从这个 main 向 stable 自动合并；用明确官方提交进行 integration。未来官方更新可在 main 使用普通快进或合并同步，禁止重写历史。本轮未执行上述撤销和 main 对齐操作。

## 稳定部署

只从已验收的 `deploy/stable` 或明确稳定 tag 构建 Raspberry Pi ARM64 镜像，记录代码 SHA、镜像 ID、测试结果和前一个可回滚镜像。部署前备份运行配置和持久化数据；备份置于仓库之外。部署、构建生产镜像和重启容器须获得授权。

176 当前使用定制镜像 `libretv:2.19.2-server-sources-20261107`，其源码不是受分支管理的生产 checkout。本轮建立分支不代表生产已切换到该分支。未来迁移构建来源需另行确认。

仓库通用 Compose 使用命名卷，176 实际使用宿主机目录绑定到 `/app/data`。不能直接拿仓库 Compose 覆盖生产 Compose，也不能替换数据卷。密码、Token、源列表、数据库和运行配置不得入库。Smart TV API 作为独立服务，未完成前不纳入稳定部署。

## 回滚

部署回滚：经授权恢复上一个确认过的镜像与配置，保留现有数据挂载；若涉及数据格式变化，先评估备份兼容性，禁止自动覆盖当前数据。代码回滚通过新的 revert 提交和 PR 进入稳定分支，重新测试，不能 reset 稳定分支或强推。备份分支只用于查看和恢复依据，不删除。

```sh
git show <known-good-commit>
git diff <known-good-commit> deploy/stable
git switch -c feature/revert-change deploy/stable
git revert <ordinary-commit-to-revert>
```

合并提交需要明确主线父提交和业务影响，不能照搬普通 revert 命令自动操作。任何回滚都先确认工作区和范围，不覆盖本地修改。
