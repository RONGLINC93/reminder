# 提醒 · Reminder

一个轻量级的「提醒」网站：事件 / 生日 / 办事 / 纪念日一个日历全记住，支持农历提醒、重复规则、提前提醒，并可把到点的提醒推送到企业微信、QQ、微信或自定义接口。数据保存在本地 JSON 文件，无需数据库。

## 功能特性

- 月历视图 + 列表视图，鼠标点日期即可新建提醒
- 提醒类型：事件 / 生日 / 办事 / 纪念日 / 其他，支持 6 种颜色标记
- 重复规则：不重复 / 每天 / 每周 / 每月 / 每年，自动推算下一次日期
- 农历提醒：按农历月日换算，显示农历日期、生肖干支等
- 日历显示农历与节日，国家法定假日与调休自动标注
- 提前提醒（0-365 天）+ 每日推送时间，到点自动推送且不重复推送
- 多通知渠道：企业微信群机器人、企业微信应用、QQ 机器人（OneBot v11）、微信推送（Server 酱 / PushPlus）、自定义通知接口
- 通知测试、手动推送指定提醒、推送记录查看
- 对外入站接口：外部系统带 Token 调用即可把消息转发到已启用的机器人
- 顶部统计（今日提醒 / 本月安排 / 7 天内）与「即将到来」侧栏

## 技术栈

- **后端**：Node.js + [Express](https://expressjs.com/)
- **前端**：原生 HTML + CSS + JavaScript（单页应用）
- **依赖**：`express`、`lunar-javascript`（农历换算）

## 目录结构

```
reminder/
├── server.js            # 服务端：REST API + 静态资源 + 定时推送
├── package.json
├── lib/
│   ├── dates.js         # 日期键、加减天数、重复规则推算
│   ├── lunar.js         # 农历 / 节日 / 干支生肖换算
│   └── notifier.js      # 各通知渠道发送与到点检查
├── public/
│   ├── index.html       # 前端单页应用
│   ├── styles.css
│   ├── app.js
│   └── vendor/lunar.js  # 前端农历库
├── data/                # 运行时数据（已 gitignore，不会入库）
│   ├── reminders.json   # 提醒列表
│   ├── settings.json    # 站点设置与通知配置
│   ├── notify-sent.json # 已推送记录（防重复）
│   └── notify-log.json  # 推送日志
├── 运行.bat / 停止.bat  # Windows 一键启动 / 停止
├── 推送.bat / 拉取.bat  # GitHub 同步入口
└── push.js / pull.js    # 推送 / 拉取脚本（读取 .env）
```

## 快速开始

### 环境要求

- Node.js >= 16

### 安装与运行

```bash
cd reminder
npm install   # 依赖已随仓库提交，可跳过此步
npm start
```

启动后访问：<http://localhost:9530>

Windows 用户直接双击 `运行.bat` 即可（自动释放占用的 9530 端口并打开浏览器），需要停止时双击 `停止.bat`。

### 修改端口

默认端口 `9530`，可在 `server.js` 顶部的 `PORT` 常量修改；用 bat 启动时同步修改 `运行.bat` / `停止.bat` 里的 `PORT` 即可（也可用环境变量 `PORT` 覆盖）。

## 使用说明

1. 打开 <http://localhost:9530>，顶部切换「日历 / 通知」
2. 日历视图下点击任意日期，或点右上角「+ 新建提醒」填写标题、日期、时间、类型、重复与提前天数
3. 勾选「农历」后按农历日期提醒，每年自动换算
4. 列表视图可按类型筛选，支持编辑、删除、标记完成
5. 「通知」页配置机器人：填好对应通道参数后点「测试」验证，可查看推送记录
6. 设置里可调整每周第一天、是否显示农历 / 节假日、每日推送时间

## 通知渠道配置

| 通道 | 关键参数 |
| ---- | -------- |
| 企业微信群机器人 | `webhook`（机器人 Webhook 地址） |
| 企业微信应用 | `corpid`、`corpsecret`、`agentid`、`touser` |
| QQ 机器人 | `baseUrl`（OneBot v11 接口地址，如 `http://127.0.0.1:5700`）、`token`、`targetType`、`targetId` |
| 微信推送 | `provider`（serverchan / pushplus）、`sendKey`（Server 酱）或 `token`（PushPlus） |
| 自定义通知接口 | `url`、可选 `token`（Bearer） |

入站接口：`POST /api/webhook/notify`，需在设置中填写「入站 Token」，请求头 `Authorization: Bearer <token>`，body 支持 `{ "title": "...", "content": "..." }`。

## API 接口

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/api/reminders` | 提醒列表（按日期、时间排序） |
| POST | `/api/reminders` | 新建提醒 |
| PUT | `/api/reminders/:id` | 修改提醒（部分字段） |
| DELETE | `/api/reminders/:id` | 删除提醒 |
| POST | `/api/reminders/:id/toggle` | 切换完成状态 |
| GET | `/api/settings` | 获取设置与通知配置 |
| PUT | `/api/settings` | 保存设置与通知配置 |
| POST | `/api/notify/test` | 发送测试消息（body 可选 `channel`） |
| POST | `/api/notify/send` | 手动推送指定提醒（body：`id`） |
| GET | `/api/notify/logs` | 推送记录（`?limit`，最多 100） |
| POST | `/api/webhook/notify` | 入站通知转发（需 Token） |
| GET | `/api/health` | 健康检查 |

### 提醒对象结构

```json
{
  "id": "m1x2y3z4abc",
  "title": "妈妈生日",
  "type": "birthday",
  "date": "2026-05-20",
  "time": "09:00",
  "repeat": "yearly",
  "leadDays": 3,
  "note": "别忘了订蛋糕",
  "color": "rose",
  "lunar": false,
  "done": false,
  "createdAt": "2026-01-02T03:04:05.000Z",
  "updatedAt": "2026-01-02T03:04:05.000Z"
}
```

## 数据存储

所有数据以 JSON 文件保存在 `data/` 目录，无数据库依赖，建议定期备份该目录。

## 打包发布

| 脚本 | 平台 | 产物 |
| ---- | ---- | ---- |
| `打包fpk.bat` | Windows（需 `fnos\fnpack.exe`） | `fpk/reminder-<版本>.fpk`（飞牛 fnOS 安装包） |
| `fnos/build-fpk.sh` | Linux / macOS / WSL | 同上 |
| `打包win-zip.bat` | Windows | `dist/reminder-<版本>-win.zip`（含 `运行.bat`） |
| `打包linux-zip.sh` | Linux | `dist/reminder-<版本>-linux.zip`（含 `启动.sh`） |
| `打包macos-zip.sh` | macOS | `dist/reminder-<版本>-macos.zip`（含 `启动.command`，Finder 双击即可） |

说明：

- 依赖已随仓库提交，`node_modules` 会一并打进包内；若本地缺失，脚本会自动 `npm install --omit=dev`
- 服务默认监听 `::`（IPv6 双栈），**同时支持 IPv4 与 IPv6 访问**；宿主不支持 IPv6 时自动回退 `0.0.0.0`
- fnOS 上提醒数据保存在共享文件夹 `reminder/data`，升级 / 卸载不会丢失
- fpk 安装：飞牛应用中心上传，或 SSH 执行 `appcenter-cli install-fpk reminder-<版本>.fpk`

## GitHub 同步（推送 / 拉取）

1. 在项目根目录创建 `.env`（已 gitignore，不会入库）：

```
GITHUB_REPO_URL=https://github.com/用户名/仓库名.git
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

2. 双击 `推送.bat`（可带提交说明：`推送.bat "修复日历显示"`）提交并推送；双击 `拉取.bat` 拉取最新代码（本地有改动会自动暂存并恢复）。

## 注意事项

- 项目未做鉴权，仅建议在本地或内网使用，不要直接暴露到公网
- `.env` 与 `data/` 已加入 `.gitignore`，令牌与提醒数据不会上传到仓库
- 定时推送默认每分钟检查一次，同一条提醒的同一天只会推送一次

---

版权所有 © 2026 RONGLINC93
