# 爱奥尼官网迁移

保留原站桌面与手机模板，提供简体中文、英文和内容管理后台。业务层使用 Web 标准 Request/Response，数据库与文件存储通过接口注入。

部署地址：[官网](https://hnaan.cn/) · [英文入口](https://hnaan.cn/en/) · [内容管理](https://hnaan.cn/cms/)。后台凭据单独交付，不存入仓库。

| 运行方式 | 数据库 | 文件存储 | 入口 |
|---|---|---|---|
| Cloudflare Workers | D1 | 静态资源 + R2 | `src/index.ts` |
| Node.js 22+ | MySQL | 本地目录 | `src/node.ts` |

原始 PHP 源码没有被修改，也不会上传执行。`templates/` 保留页面模板；编译器将限定范围的模板逻辑转为 JavaScript，不在生产环境使用 PHP 或 eval。D1、MySQL 的访问分别集中在 `src/adapters/d1.ts` 和 `src/adapters/mysql.ts`。

## 本地启动

```sh
npm ci
npm run db:local
npm run db:seed:local # 首次导入私有备份后执行一次
npm run dev
```

前台 `http://localhost:8787/`，英文 `/en/`，后台 `/cms/`。本次生成的本地登录配置在被忽略的 `.dev.vars` 中；登录信息另存于交付目录的访问说明。

首次自行配置时，创建 `.dev.vars`，填写 `ADMIN_USER`、`ADMIN_PASSWORD_HASH`、`SESSION_SECRET`。密码哈希格式是 `pbkdf2$100000$盐的十六进制$哈希的十六进制`。`scripts/password-hash.mjs` 从标准输入读取密码并输出哈希，要求至少14字符。会话密钥使用至少32字符的随机值。禁止把开发配置提交到 Git。

## Cloudflare

`wrangler.jsonc` 中的 D1、R2 是为本项目新建的独立资源。发布命令：

```sh
npm run check
npm test
npm run build
npm run db:remote
# 新的空数据库首次执行 npm run db:seed:remote；日常部署不要重复导入
npm run deploy
```

生产环境必须另外设置 `ADMIN_PASSWORD_HASH`、`SESSION_SECRET` 两个 Wrangler secret，并把 `SITE_URL` 改为最终公开网址。已有自定义 API token 没有相应权限时，可显式使用本机已有的 OAuth 登录，例如 `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler ...`；这不会更改全局凭据。

旧图片、CSS、JS 在本机保留原路径。公开代码仓库包含模板资源；历史 `Uploads/` 与生产种子数据不进入 Git。首次部署必须单独将历史图片传入 R2，并逐文件检查，结果记录于 `deployment/target.json`。部署脚本会核对目标账号、数据库和图片可访问性，再从静态发布包排除已迁移的图片。直接构建默认保留本机现有图片，避免未迁移时丢失资源。新上传文件写入 R2，并在返回成功前预热当前 Cloudflare 节点的媒体缓存；其他地区首次访问后缓存。上传图片使用浏览器一天、边缘七天缓存；静态图片、字体和视频由浏览器重新验证、边缘缓存七天，响应头 `X-Media-Cache: HIT/MISS/BYPASS` 表示实际结果，支持 HEAD、ETag 和缓存命中后的 Range 分段读取。静态文件按 Worker 版本隔离缓存，部署更新立即使用新版本。上传文件使用唯一名称，数据库保留相对路径；后台预览使用当前站点，复制按钮返回 `SITE_URL` 下的完整加速地址。存储适配器不依赖 Cloudflare 缓存。覆盖或删除已有路径只自动清理当前节点，若需立即撤销所有地区旧文件，须额外执行 Cloudflare 全局缓存清理。`/Uploads/` 先查静态资源，再查存储接口，所以以后可以把旧图片搬到对象存储，而无需改变内容中的地址。HTML 直接将桌面前三张、手机前四张关键图片设为优先加载，其余图片默认延迟加载；历史原图尺寸清单为未指定尺寸的图片提供正确的比例占位，避免加载前高度塌缩触发所有原图请求，保留作者显式指定的尺寸及 loading 属性，避免长文章在 JS 执行前就请求全部原图。上传文件限制为25MB，并检查扩展名与文件签名。

`hnaan.cn` 的 DNS 已由 Cloudflare 托管，注册商保持原有设置。根域名和 `www.hnaan.cn` 通过 `wrangler.jsonc` 绑定同一个 Worker，规范地址为 `https://hnaan.cn`；原 workers.dev 地址保留。旧百度地图 AK 已实测触发授权禁用弹窗，v1.2 接口也已停止维护，因此目前不加载这两套旧 SDK。地图区域显示中英文联系方式提示，公司地址、电话及原路线/导航链接保留。嵌入式交互地图需取得有效的百度地图浏览器端 AK 并核对服务和域名授权后恢复。在线客服和外部视频仍依赖其服务状态。

## Node.js + MySQL

创建一个空的 MySQL 数据库，配置 `.env`：

```dotenv
DATABASE_URL=mysql://user:password@127.0.0.1:3306/hnaan
SITE_URL=https://www.example.com
PORT=8788
ASSETS_DIR=public
MEDIA_DIR=public
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=替换为PBKDF2哈希
SESSION_SECRET=替换为足够长的随机密钥
```

执行：

```sh
npm run db:mysql
npm run db:seed:mysql # 首次导入私有备份后执行一次
npm run build:node
npm run start:node
```

MySQL 迁移脚本在 `migrations-mysql/`，使用 MySQL 原生 upsert 语法；D1 迁移脚本在 `migrations/`，使用 SQLite 语法。数据库结构相同，业务逻辑不需要修改。首次初始化应使用空数据库；日常增量迁移由迁移记录跳过已执行文件。正式切换前备份数据库。0002 为公开内容表和翻译表安装版本触发器，MySQL 迁移账号需要 TRIGGER 权限。

`src/ports.ts` 定义 Database、Storage、Services；新增 PostgreSQL 或 S3 等适配时，实现对应接口并在入口注入即可。当前已提供的存储适配为 R2 与本地文件，不声称已提供 S3 适配。

已在 GitHub Actions 的真实 MySQL 8.4 实例上通过内容创建、草稿发布、译文更新和限流计数的集成测试；同一流水线的 10 项测试全部通过，并完成 Cloudflare 与 Node 两个目标的构建。验证记录：[首次完整检查](https://github.com/hxzhouh/hnaan/actions/runs/43862775429)。

## 内容管理与双语

支持新闻、案例、服务项目、单页、栏目、轮播和区块编辑；正文有富文本编辑器。图片可上传、浏览、复制地址；访客留言在后台查看。旧会员密码、旧后台登录、历史日志和历史访客留言没有作为新后台认证系统导入。

公共导航、列表与英文摘要在进程内按数据库内容版本复用；每次请求读取最新版本，源内容与翻译的增删改由数据库触发器原子更新版本。只保留已完成的公开数据，最多 256 个查询结果和 2 份英文摘要，不跨请求共享数据库 Promise。详情仍按 ID 读取，后台保存/发布/撤稿后下一次请求使用新版本；HTML、CMS 和访客留言不做共享响应缓存。UI 字典随请求读取，修改后立即重新编译。未执行版本迁移时自动回退为逐请求查询。

默认中文沿用原网址，英文使用 `/en/` 前缀。同一内容共享 ID、栏目和网址，翻译保存在独立表中，英文有独立草稿和发布状态。中英文切换保留当前页面。关键中文内容未补齐英文前不能发布该条英文版本。

已补齐原站 601 条内容的英文初稿，包括 45 个栏目、274 篇文章、96 个案例、18 个服务项目、34 个单页、132 条轮播展示和 2 个区块。译文通过后台 API 单独发布，中文原稿、内容 ID 和原网址保持不变。正文保留原图片和链接；分类名称与行业术语已统一，后续可在后台继续校改。

英文页同时处理导航、SEO、表单提示和动态加载文案。已知营销横幅使用英文文字覆盖原促销文案，资源整合图示用可读取的英文流程呈现；真实项目照片、客户标志和品牌名称保留原貌。更换为新的英文横幅图片后，旧图覆盖规则不会继续作用。

模板查询多且零散。英文列表使用一次轻量译文查询，排除文章和单页的大段正文；详情页再按 ID 加载正文，兼容 D1 与 MySQL 的 JSON 函数。866 个页面/设备组合的数据库调用最高为 30 次，避免 D1 免费计划每次请求 50 次查询的限制。

英文搜索同时匹配已发布的英文标题和中文原标题，计数与分页使用相同条件；撤稿内容和未发布英文译文不进入译文搜索，关键词使用绑定参数。

后台“界面翻译”可覆盖或补充中文到英文的文案词典。原站第三方地图、视频、客服依赖其服务状态，本项目没有复制第三方账号。

## 导入与验证

本次采用2026年11月13日14:39:24的 Navicat 备份。导入脚本只读取备份的 SQL 字面量，不执行原备份 SQL 或 PHP：

```sh
python3 scripts/import.py --source /path/to/201810aiaoni --backup /path/to/backup.nb3
node scripts/compile-templates.mjs
```

已导入13张网站内容相关表、4,380个资源文件；另有后台翻译、媒体索引、修订记录、留言和限流等表。公开网站配置只导入必要字段；数据库连接密码和邮件认证配置不会进入网页。

检查命令：`npm run check`、`npm test`、`npm run build`、`npm run build:node`。截图和像素对照结果在旁边的 `hnaan-validation/` 交付目录。

对照基准是原模板在原生 PHP 解释器中直接渲染、配以数据库兼容层；不等同于已恢复原 ThinkPHP 应用的完整运行环境。原完整应用因本机 Docker 环境问题未成功运行。对照时使用相同数据库、尺寸和浏览器，屏蔽外部第三方服务，关闭动画并隐藏新增的语言切换按钮。差异报告会保留主动修复的原站问题，不将所有结果包装为零像素差异。

## GitHub Actions

仓库工作流固定使用 `.node-version` 指定的 Node 22.23.5，并使用 `npm ci` 读取锁文件。本机 Node 版本不会传入 CI。Cloudflare 生产运行时由 `compatibility_date` 和 `nodejs_compat` 控制。

仓库 Secret：`CLOUDFLARE_API_TOKEN`。仓库 Variables：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_SITE_URL`。完成账号、D1 和 R2 初始化核对后，将 `CLOUDFLARE_DEPLOY_ENABLED` 设置为 `true`。否则流水线仍执行类型检查、D1/SQLite 测试、MySQL 8.4 集成测试及两个运行目标构建，但明确跳过部署。

首次初始化顺序：导入私有备份 → 应用表结构 → 导入种子数据 → 迁移并逐文件验证历史图片 → 写入后台密钥 → 开启自动部署。GitHub Actions 的日常部署只运行结构迁移，保留后台已编辑内容。


本轮闭环记录：[页面修复 #1](https://github.com/hxzhouh/hnaan/issues/1)、[媒体缓存 #2](https://github.com/hxzhouh/hnaan/issues/2)、[英文补全 #3](https://github.com/hxzhouh/hnaan/issues/3)。原备份缺少 84 张历史图片，源码目录、原 tar.gz 和旧服务器均已核对；清单见 `docs/missing-images.json` 和后续原图恢复 Issue。前台以品牌占位图显示并保留原地址记录，没有冒充恢复原图。
