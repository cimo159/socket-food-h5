# 食咩 · 今天吃什么（美食拼单 H5）

校园美食点单与多人拼单小工具。前端是纯静态 H5（可直接部署 GitHub Pages），
拼单功能由一个**零依赖的 Node.js Socket 服务端**支持——服务端用 `net` 模块手写
HTTP 应答与 WebSocket（RFC 6455）握手/帧解析，没有使用 ws、socket.io 等任何第三方库。

## 功能一览

- **点单**：菜品分类筛选、关键词搜索、加入餐盘、数量加减、随机来一份、生成订单文案（可一键复制）
- **拼单房间**：昵称 + 房间号加入，实时看到房间里每个人点了什么、每人合计与房间合计
- **房间聊天**：公屏聊天、系统提示（进房 / 离房 / 掉线重连）
- **跟随点单**：看到别人点了想吃的，点“我也要一样的”一键加入自己餐盘
- **本地记忆**：餐盘、昵称、房间号保存在浏览器 localStorage，刷新不丢
- **断线处理**：心跳保活、掉线自动重连（最多 5 次、指数退避）、连接状态条实时提示
- **响应式**：手机与电脑都能用；带昵称参数的链接可直接进同一房间

## 目录结构

```
socket-food-h5/
├── index.html               # 单页应用入口
├── assets/
│   ├── css/app.css          # 界面样式
│   └── js/
│       ├── data.js          # 菜品数据（内置 16 道菜）
│       ├── realtime.js      # Socket 客户端封装（连接/心跳/重连）
│       └── app.js           # 界面与业务逻辑
├── server/
│   └── server.js            # Socket 服务端（手写 HTTP + WebSocket）
├── package.json             # 仅声明 npm start 脚本，无任何依赖
├── 部署到GitHub-Pages.md     # 一步步部署教程
└── .nojekyll                # 关闭 GitHub Pages 的 Jekyll 处理
```

## 本地运行

1. 安装 [Node.js](https://nodejs.org)（18 以上，无需任何 npm 依赖）。
2. 在项目目录（就是有 `index.html` 的这一层）打开命令行，执行：

   ```bash
   node server/server.js
   ```

   也可以执行 `npm start`，效果相同。

   > 说明：本项目不提供 `.bat` 双击启动脚本。批处理文件里包含 `cmd /c`、
   > `start` 等命令，容易被 Windows Defender 的启发式规则误判为木马脚本，
   > 所以改成直接在命令行运行。`server.js` 只用了 Node 内置的 `net` /
   > `crypto` / `fs`，可以直接用记事本打开逐行核对。

3. 浏览器打开 <http://127.0.0.1:8080>。局域网同学直接访问控制台打印的
   `http://你的IP:8080`，点“拼单房间”输入同一个房间号即可实时拼单。

### 页面参数

| 参数 | 说明 | 示例 |
|---|---|---|
| `?server=ws://主机:端口` | 指定服务端地址（部署在 GitHub Pages 后用它连自己的服务器） | `?server=ws://10.0.0.5:8080` |
| `?nick=昵称&room=房间号` | 带上参数自动加入房间，适合分享链接 | `?nick=小美&room=888` |

## 通信协议（JSON 文本帧）

客户端 → 服务端：

| type | 字段 | 说明 |
|---|---|---|
| join | room, nick | 加入房间，重名自动加序号 |
| chat | text | 房间聊天（最长 120 字） |
| order | items[{id,name,price,qty}] | 同步我的餐盘到房间 |
| ping | t | 心跳 |
| leave | — | 主动离开 |

服务端 → 客户端：

| type | 字段 | 说明 |
|---|---|---|
| joined | room, you, members | 加入成功，返回成员快照 |
| state | room, members[{nick,items,total}] | 房间最新点单状态 |
| chat | from, text, ts | 聊天消息 |
| system | text, ts | 进房/离房/掉线等系统提示 |
| error | text | 服务端校验失败提示 |
| pong | t | 心跳应答 |

## 关于“永久公网链接”

- **前端**（点单、餐盘、订单文案）部署到 GitHub Pages 后即可永久访问，
  详见《部署到GitHub-Pages.md》。
- **拼单房间**需要 Socket 服务端常驻。可用：宿舍电脑 / 云服务器运行
  `node server/server.js`，然后在网页地址后加 `?server=ws://服务器IP:8080`；
  也可以把端口映射到公网后填公网地址。
