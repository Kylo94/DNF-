# DNF 打团排表 · 角色登记

> 当前版本 **v0.1.0 · 内测版**（版本号以 `package.json` 为准，界面标题右侧会显示）。
> **1.0 之前的全部版本都是内测版本**，功能与 Excel 数据结构仍可能调整，重要数据请及时导出备份。
> 变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

给团长用的 DNF 打团排表工具，当前完成 **第一步：角色登记**。
登记每位玩家的角色，一键导出 Excel 存档，也可以直接导入现有的角色数据表继续登记。

## 功能

**角色登记（已实现）**

- 每个角色登记 5 个字段：归属玩家、角色称呼、角色类型、面板数值、难度类型
- 角色类型下拉：`输出C` / `辅助奶`；难度类型下拉：`普通团` / `困难团`
- 面板数值随类型切换提示：输出C 填 **站街模拟伤害**，辅助奶 填 **面板三攻**
- 支持「万 / 亿」单位输入（如 `4.47万` → 44,700），自动格式化千分位
- 连续登记模式：提交后保留玩家/类型/难度，只清空称呼与面板，适合一口气登记一个玩家的全部角色
- 同名角色二次登记会提示是否覆盖（同一个玩家可以有两个同名角色，例如两个「奶萝」，此时点取消再改称呼即可）
- 列表按玩家分组，支持搜索、类型筛选、难度筛选、排序（登记顺序 / 玩家 / 面板高低）
- 支持编辑、删除单条、删除某玩家全部、清空
- 数据自动存进浏览器 localStorage，刷新/关闭页面不丢；**换电脑或清缓存前请先导出 Excel**

**Excel 导入 / 导出**

- 「保存到 Excel（下载）」导出 `.xlsx` 并直接通过浏览器下载到本地
  - 工作表 `角色登记`：归属玩家 / 角色称呼 / 角色类型 / 面板数值 / 难度类型
  - 工作表 `玩家统计`：每位玩家的角色总数、输出C、辅助奶、普通团、困难团数量
- 「导入 Excel」读取本地文件，表头智能识别：
  - 新格式：`归属玩家 / 角色称呼 / 角色类型 / 面板数值 / 难度类型`
  - 旧格式（本次的案例文件）：`归属玩家 / 角色名称 / 战力数值 / 类型 / Ban状态`
    - `类型` 列的 `C` → 输出C，`N` → 辅助奶
    - 原来的 `Ban状态`（正常）列会被忽略，并自动映射为 `普通团`
  - 缺表头时按列位置兜底：A 玩家 / B 角色 / C 面板 / D 类型 / E 难度
  - 导入时可选「追加导入（默认全部保留，可勾选跳过重复）」或「覆盖导入（先清空）」

## 运行

```bash
npm install        # 若报 EPERM（npm 缓存权限问题）改用：npm install --cache ./.npm-cache
npm run dev        # 开发模式，浏览器打开 http://localhost:5173/
```

打包：

```bash
npm run build         # 常规打包到 dist/
npm run build:single  # 打包成单个 dist-single/index.html，双击即可用（无需服务器）
```

`npm run build` 之后用 `npm run preview` 预览打包结果（直接双击 `dist/index.html` 会因为浏览器限制 ES module 而打不开，用单文件版本可以）。

## 版本与发版

版本阶段划分（详见 [CHANGELOG.md](./CHANGELOG.md)）：

| 版本段 | 阶段 | 说明 |
| --- | --- | --- |
| `0.x.y` | **内测版** | 1.0 之前的全部版本，团队内部测试用 |
| `1.0.0` 起 | 正式版 | 功能稳定、数据结构冻结后发布 |

- 版本号唯一数据源：`package.json` → 构建时注入界面显示 `v版本号 · 内测版`
- 每个版本对应一个 git 标签 `v<版本号>`（内测版在 GitHub 上标记为 Pre-release）
- 发版（自动改版本号 → 写 CHANGELOG → 提交 → 打标签）：

```bash
npm run release                      # 看当前版本和用法
npm run release -- patch "修复导入表头识别"      # 0.1.0 → 0.1.1
npm run release -- minor "新增排表试算"          # 0.1.1 → 0.2.0
npm run release -- patch "说明" --push           # 发版并推送提交与标签
npm run release -- major "首个正式版" --stable    # 只有加 --stable 才允许升到 1.x
```

> 脚本会把当前工作区的改动一起提交为 `chore(release): vX.Y.Z 内测版`。

## Git 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，一条提交只做一件事，便于回溯每个内测版本包含的内容：

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| `feat` | 新功能 | `feat(登记): 支持按玩家批量导入角色` |
| `fix` | 修 bug | `fix(导入): 修正旧表 Ban状态 列映射为普通团` |
| `refactor` | 重构（不改行为） | `refactor(excel): 抽出表头别名映射` |
| `perf` | 性能优化 | `perf(列表): 大名单渲染去掉重复分组计算` |
| `docs` | 文档 | `docs: 补充 Excel 字段说明` |
| `test` | 测试 | `test(smoke): 增加版本号显示断言` |
| `style` | 格式/样式（不改逻辑） | `style: 统一按钮圆角` |
| `chore` | 构建、依赖、发版 | `chore(release): v0.1.1 内测版` |

常用流程：`git commit -m "feat(排表): 新增拖拽分团"` → 累积若干条后 `npm run release -- minor "排表功能上线"`。

## 目录结构

```
├── index.html                    入口页面
├── CHANGELOG.md                  更新日志（版本阶段划分）
├── public/favicon.svg            图标
├── src/
│   ├── main.js                   应用入口
│   ├── App.vue                   页面布局、筛选、导入导出、增删改调度
│   ├── style.css                 全局样式（深色 + 金色主题）
│   ├── constants.js              角色类型 / 难度 / Excel 表头等常量
│   ├── version.js                版本信息（构建时从 package.json 注入）
│   ├── components/
│   │   ├── CharacterForm.vue     角色登记表单（校验、连续登记）
│   │   ├── CharacterTable.vue    按玩家分组的角色列表
│   │   ├── StatsPanel.vue        统计卡片 + 玩家明细
│   │   └── ToastHost.vue         消息提示
│   ├── composables/
│   │   ├── useCharacters.js      登记数据 store（增删改查、统计、localStorage）
│   │   └── useToast.js           全局消息提示
│   └── utils/
│       ├── excel.js              Excel 导入解析 / 导出下载
│       └── format.js             数值解析与格式化
└── scripts/
    ├── smoke-test.mjs            端到端冒烟测试（28 项）
    └── release.mjs               内测版发版脚本（版本号 + CHANGELOG + 标签）
```

## 测试

```bash
npm run dev -- --port 5273     # 一个终端跑开发服务器
npm run test:smoke             # 另一个终端跑冒烟测试（用本机 Edge/Chrome 无头模式）
```

覆盖：表单校验、C/奶登记、万单位解析、同名覆盖、统计、筛选、本地持久化、
导出 xlsx 内容校验、导入旧案例表（175 个角色 / 12 位玩家）、编辑、删除。

## 数据字段说明

| 列 | 说明 |
| --- | --- |
| 归属玩家 | 该角色属于哪个玩家（登记人昵称 / ID） |
| 角色称呼 | 职业名称或角色 ID，排表时用来识别配置 |
| 角色类型 | `C` = 输出C，`N` = 辅助奶（下拉选择） |
| 面板数值 | 输出C 填站街模拟伤害；辅助奶 填面板三攻 |
| 难度类型 | `普通团` / `困难团`（由原案例文件的 Ban状态 列改来） |

## 后续可做（排表）

数据层已经按 `难度 → 类型 → 角色` 组织好（`useCharacters().grouped`），
下一步可以直接做：拖拽排团、每团人数校验、C/奶配比检查、按面板均衡分队、导出排表结果。
