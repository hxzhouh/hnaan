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

旧图片、CSS、JS 在本机保留原路径。公开代码仓库包含模板资源；历史 `Uploads/` 与生产种子数据不进入 Git。首次部署必须单独将历史图片传入 R2，并逐文件检查，结果记录于 `deployment/target.json`。部署脚本会核对目标账号、数据库和图片可访问性，再从静态发布包排除已迁移的图片。直接构建默认保留本机现有图片，避免未迁移时丢失资源。新上传文件写入 R2，并在返回成功前预热当前 Cloudflare 节点的媒体缓存；其他地区首次访问后缓存。上传图片使用浏览器一天、边缘七天缓存；静态图片、字体和视频由浏览器重新验证、边缘缓存七天，响应头 `X-Media-Cache: HIT/MISS/BYPASS` 表示实际结果，支持 HEAD、ETag 和缓存命中后的 Range 分段读取。静态文件按 Worker 版本隔离缓存，部署更新立即使用新版本。上传文件使用唯一名称，数据库保留相对路径；后台预览使用当前站点，复制按钮返回 `SITE_URL` 下的完整加速地址。存储适配器不依赖 Cloudflare 缓存。覆盖或删除已有路径只自动清理当前节点，若需立即撤销所有地区旧文件，须额外执行 Cloudflare 全局缓存清理。`/Uploads/` 先查静态资源，再查存储接口，所以以后可以把旧图片搬到对象存储，而无需改变内容中的地址。上传文件限制为25MB，并检查扩展名与文件签名。

`hnaan.cn` 的 DNS 已由 Cloudflare 托管，注册商保持原有设置。根域名和 `www.hnaan.cn` 通过 `wrangler.jsonc` 绑定同一个 Worker，规范地址为 `https://hnaan.cn`；原 workers.dev 地址保留。百度地图、在线客服和视频等原第三方服务的域名授权需另行核对。

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

MySQL 迁移脚本在 `migrations-mysql/`，使用 MySQL 原生 upsert 语法；D1 迁移脚本在 `migrations/`，使用 SQLite 语法。数据库结构相同，业务逻辑不需要修改。迁移脚本只应对空的新数据库运行，备份原数据库后再做正式切换。

`src/ports.ts` 定义 Database、Storage、Services；新增 PostgreSQL 或 S3 等适配时，实现对应接口并在入口注入即可。当前已提供的存储适配为 R2 与本地文件，不声称已提供 S3 适配。

已在 GitHub Actions 的真实 MySQL 8.4 实例上通过内容创建、草稿发布、译文更新和限流计数的集成测试；同一流水线的 10 项测试全部通过，并完成 Cloudflare 与 Node 两个目标的构建。验证记录：[首次完整检查](https://github.com/hxzhouh/hnaan/actions/runs/43862775429)。

## 内容管理与双语

支持新闻、案例、服务项目、单页、栏目、轮播和区块编辑；正文有富文本编辑器。图片可上传、浏览、复制地址；访客留言在后台查看。旧会员密码、旧后台登录、历史日志和历史访客留言没有作为新后台认证系统导入。

默认中文沿用原网址，英文使用 `/en/` 前缀。同一内容共享 ID、栏目和网址，翻译保存在独立表中，英文有独立草稿和发布状态。中英文切换保留当前页面。关键中文内容未补齐英文前不能发布该条英文版本。

原备份只有中文正文。英文界面提供初始词典，原文章和案例的英文正文仍需在后台编辑发布；未翻译页面明确提示当前显示中文原文，并设置 noindex。横幅图片中已有的中文也保留原稿，可以在内容编辑中的英文图片字段替换有翻译版本的图片。页面中硬编码的横幅素材需要在模板中替换为对应语言的素材，不能把现有中文图片称为已经完成英文翻译。

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
