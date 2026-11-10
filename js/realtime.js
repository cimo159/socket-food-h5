/* =========================================================
   realtime.js —— 拼单房间的 Socket 客户端封装
   基于浏览器原生 WebSocket（底层即 TCP 长连接），
   对外只暴露：connect / join / sendChat / sendOrder / leave
   并统一处理断线、重连、心跳与状态回调。
   ========================================================= */
(function (global) {
  "use strict";

  var HEARTBEAT_MS = 25000;   // 心跳间隔
  var RECONNECT_MAX = 5;      // 最多重连次数
  var RECONNECT_BASE = 1500;  // 重连退避基数（毫秒）

  function RoomSocket(options) {
    options = options || {};
    this.url = options.url || "ws://127.0.0.1:8080";
    this.onStatus = options.onStatus || function () {};
    this.onMessage = options.onMessage || function () {};

    this.ws = null;
    this.room = "";
    this.nick = "";
    this.connected = false;
    this.joined = false;
    this._retry = 0;
    this._timer = null;
    this._beat = null;
  }

  RoomSocket.prototype.status = function (state, text) {
    this.onStatus(state, text || "");
  };

  RoomSocket.prototype.connect = function () {
    var self = this;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    this.status("connecting", "正在连接 " + this.url + " …");

    var ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.status("error", "地址无法解析：" + this.url);
      return;
    }
    this.ws = ws;

    ws.onopen = function () {
      self.connected = true;
      self._retry = 0;
      self.status("online", "已连接拼单服务器");
      self._startHeartbeat();
      // 重连成功后自动回到原房间
      if (self.joined && self.room && self.nick) self._sendJoin();
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "joined") { self.joined = true; self.room = msg.room || self.room; }
      self.onMessage(msg);
    };

    ws.onclose = function () {
      var wasJoined = self.joined;
      self.connected = false;
      self.joined = false;
      self._stopHeartbeat();
      self.onMessage({ type: "sysonlocal", text: "与服务器的连接已断开" });
      if (wasJoined && self._retry < RECONNECT_MAX) {
        self._scheduleReconnect();
      } else {
        self.status("offline", "未连接拼单服务器 · 本地模式可用");
      }
    };

    ws.onerror = function () {
      self.status("error", "连接失败，请确认服务端已启动");
    };
  };

  RoomSocket.prototype._scheduleReconnect = function () {
    var self = this;
    this._retry += 1;
    var wait = RECONNECT_BASE * this._retry;
    this.status("connecting", "连接中断，" + Math.round(wait / 1000) + " 秒后第 " + this._retry + " 次重连…");
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { self.connect(); }, wait);
  };

  RoomSocket.prototype._startHeartbeat = function () {
    var self = this;
    this._stopHeartbeat();
    this._beat = setInterval(function () {
      if (self.ws && self.ws.readyState === 1) self.ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, HEARTBEAT_MS);
  };

  RoomSocket.prototype._stopHeartbeat = function () {
    if (this._beat) { clearInterval(this._beat); this._beat = null; }
  };

  RoomSocket.prototype._sendJoin = function () {
    this.send({ type: "join", room: this.room, nick: this.nick });
  };

  RoomSocket.prototype.send = function (obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  /** 加入房间；未连接时先建立连接，连接成功回调里再补发 */
  RoomSocket.prototype.join = function (room, nick) {
    this.room = String(room).trim();
    this.nick = String(nick).trim();
    this.joined = true;
    if (this.connected) {
      this._sendJoin();
    } else {
      this.connect();
      var self = this;
      // onopen 里已处理自动 join，这里只兜底
      setTimeout(function () { if (self.connected && self.joined) { /* noop */ } }, 0);
    }
  };

  RoomSocket.prototype.sendChat = function (text) {
    return this.send({ type: "chat", text: text });
  };

  RoomSocket.prototype.sendOrder = function (items) {
    return this.send({ type: "order", items: items });
  };

  RoomSocket.prototype.leave = function () {
    this.joined = false;
    this.send({ type: "leave" });
    if (this.ws) this.ws.close();
    this.room = "";
    this.nick = "";
    this.status("offline", "已离开房间 · 未连接拼单服务器");
  };

  global.RoomSocket = RoomSocket;
})(window);
