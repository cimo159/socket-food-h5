/* =========================================================
   app.js —— 食咩 · 今天吃什么（界面与业务逻辑）
   依赖：data.js（菜品数据）、realtime.js（房间 Socket 客户端）
   持久化：localStorage 保存餐盘、昵称与房间号
   ========================================================= */
(function () {
  "use strict";

  var DATA = window.FOOD_DATA;
  var STORE_KEY = "shime.cart.v1";
  var PROF_KEY = "shime.profile.v1";

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    filter: "全部",
    keyword: "",
    cart: {},            // { dishId: qty }
    nick: "",
    room: "888",
    joined: false,
    members: [],         // [{nick, items:[{id,name,price,qty}], total}]
    messages: []         // [{kind:'chat'|'system', from, text, ts}]
  };

  /* ---------------- 持久化 ---------------- */
  function loadLocal() {
    try {
      var c = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (c && typeof c === "object") state.cart = c;
    } catch (e) { state.cart = {}; }
    try {
      var p = JSON.parse(localStorage.getItem(PROF_KEY) || "{}");
      if (p.nick) state.nick = p.nick;
      if (p.room) state.room = p.room;
    } catch (e) { /* ignore */ }
  }
  function saveCart() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.cart)); } catch (e) {}
  }
  function saveProfile() {
    try { localStorage.setItem(PROF_KEY, JSON.stringify({ nick: state.nick, room: state.room })); } catch (e) {}
  }

  /* ---------------- 工具 ---------------- */
  function dishById(id) {
    for (var i = 0; i < DATA.dishes.length; i++) if (DATA.dishes[i].id === id) return DATA.dishes[i];
    return null;
  }
  function cartItems() {
    var out = [];
    Object.keys(state.cart).forEach(function (id) {
      var d = dishById(id);
      if (d && state.cart[id] > 0) out.push({ id: d.id, name: d.name, price: d.price, qty: state.cart[id] });
    });
    return out;
  }
  function cartTotal() {
    return cartItems().reduce(function (s, it) { return s + it.price * it.qty; }, 0);
  }
  function cartCount() {
    return cartItems().reduce(function (s, it) { return s + it.qty; }, 0);
  }
  function money(n) { return "¥" + (Math.round(n * 100) / 100); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function timeStr(ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---------------- 菜单渲染 ---------------- */
  function renderChips() {
    $("chips").innerHTML = DATA.categories.map(function (c) {
      return '<button class="chip' + (c === state.filter ? " on" : "") + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");
  }

  function visibleDishes() {
    var kw = state.keyword.trim();
    return DATA.dishes.filter(function (d) {
      var okCat = state.filter === "全部" || d.cat === state.filter;
      var okKw = !kw || d.name.indexOf(kw) >= 0 || d.desc.indexOf(kw) >= 0 || d.cat.indexOf(kw) >= 0;
      return okCat && okKw;
    });
  }

  function renderMenu() {
    var list = visibleDishes();
    $("menuEmpty").hidden = list.length > 0;
    $("menuGrid").innerHTML = list.map(function (d) {
      var qty = state.cart[d.id] || 0;
      var spicy = d.spicy ? '<span class="spicy">' + "🌶".repeat(d.spicy) + "</span>" : "";
      return '' +
        '<article class="card' + (qty ? " in-cart" : "") + '" data-id="' + d.id + '">' +
          '<div class="card-thumb"><span>' + d.emoji + "</span>" + spicy + "</div>" +
          '<div class="card-body">' +
            '<div class="card-title">' + esc(d.name) + (d.tag ? '<em class="tag">' + esc(d.tag) + "</em>" : "") + "</div>" +
            '<p class="card-desc">' + esc(d.desc) + "</p>" +
            '<div class="card-foot">' +
              '<span class="price">' + money(d.price) + "</span>" +
              (qty
                ? '<span class="stepper"><button data-act="dec" aria-label="减少">−</button><b>' + qty + '</b><button data-act="inc" aria-label="增加">+</button></span>'
                : '<button class="btn btn-add" data-act="inc">加入餐盘</button>') +
            "</div>" +
          "</div>" +
        "</article>";
    }).join("");
  }

  /* ---------------- 餐盘渲染 ---------------- */
  function renderCart() {
    var items = cartItems();
    $("cartCount").textContent = cartCount();
    $("cartEmpty").hidden = items.length > 0;
    $("cartList").innerHTML = items.map(function (it) {
      return '<li>' +
        '<div class="ci-main"><b>' + esc(it.name) + "</b><span>" + money(it.price) + " × " + it.qty + "</span></div>" +
        '<div class="stepper">' +
          '<button data-act="dec" data-id="' + it.id + '">−</button><b>' + it.qty + '</b>' +
          '<button data-act="inc" data-id="' + it.id + '">+</button>' +
        "</div>" +
      "</li>";
    }).join("");
    $("cartTotal").textContent = money(cartTotal());
    $("btnCheckout").disabled = items.length === 0;
    $("btnSyncMine").disabled = !state.joined || items.length === 0;
  }

  /* ---------------- 房间渲染 ---------------- */
  function renderMembers() {
    $("memberCount").textContent = state.members.length;
    $("memberEmpty").hidden = state.members.length > 0;
    $("memberList").innerHTML = state.members.map(function (m) {
      var mine = m.nick === state.nick ? " me" : "";
      return '<li class="member' + mine + '">' +
        '<span class="avatar">' + esc(m.nick.slice(0, 1)) + "</span>" +
        '<span class="m-nick">' + esc(m.nick) + (mine ? "（我）" : "") + "</span>" +
        '<span class="m-sum">' + (m.total ? money(m.total) : "未点") + "</span>" +
      "</li>";
    }).join("");
  }

  function renderBoard() {
    var withOrders = state.members.filter(function (m) { return m.items && m.items.length; });
    $("boardEmpty").hidden = withOrders.length > 0;
    var roomTotal = 0;
    $("orderBoard").innerHTML = withOrders.map(function (m) {
      roomTotal += m.total || 0;
      return '<div class="board-card">' +
        '<div class="bc-head"><b>' + esc(m.nick) + "</b><span>" + money(m.total || 0) + "</span></div>" +
        "<ul>" + m.items.map(function (it) {
          return "<li><span>" + esc(it.name) + " × " + it.qty + "</span><em>" + money(it.price * it.qty) + "</em></li>";
        }).join("") + "</ul>" +
        '<button class="link-btn" data-copy-nick="' + esc(m.nick) + '">我也要一样的</button>' +
      "</div>";
    }).join("");
    $("roomTotalText").textContent = "房间合计：" + money(roomTotal);
  }

  function renderChat() {
    var log = $("chatLog");
    if (!state.messages.length) {
      log.innerHTML = '<p class="chat-empty">加入房间后，这里会显示大家的聊天和系统提示。</p>';
      return;
    }
    log.innerHTML = state.messages.map(function (m) {
      if (m.kind === "system") {
        return '<div class="msg sys"><span class="t">' + timeStr(m.ts) + "</span>" + esc(m.text) + "</div>";
      }
      var me = m.from === state.nick ? " me" : "";
      return '<div class="msg' + me + '"><span class="who">' + esc(m.from) + '</span><span class="t">' + timeStr(m.ts) + "</span><p>" + esc(m.text) + "</p></div>";
    }).join("");
    log.scrollTop = log.scrollHeight;
  }

  function pushMsg(m) {
    state.messages.push(m);
    if (state.messages.length > 200) state.messages.shift();
    renderChat();
  }

  /* ---------------- Socket 事件 ---------------- */
  var serverUrl = (function () {
    var q = new URLSearchParams(location.search);
    if (q.get("server")) return q.get("server");
    if (location.protocol === "http:" || location.protocol === "https:") {
      var host = location.hostname || "127.0.0.1";
      var port = location.port || (location.protocol === "https:" ? "443" : "80");
      return "ws://" + host + ":" + port;
    }
    return "ws://127.0.0.1:8080";
  })();

  var room = new window.RoomSocket({
    url: serverUrl,
    onStatus: function (stateName, text) {
      var bar = $("connbar");
      bar.dataset.state = stateName;
      bar.className = "connbar";
      bar.classList.add("s-" + stateName);
      $("connText").textContent = text;
      $("connRetry").hidden = stateName !== "error" && stateName !== "offline";
      var online = stateName === "online";
      $("chatInput").disabled = !online || !state.joined;
      $("btnSend").disabled = !online || !state.joined;
      $("btnLeave").disabled = !state.joined;
      $("btnJoin").disabled = state.joined;
      $("roomDot").hidden = !state.joined;
      $("btnSyncMine").disabled = !state.joined || cartItems().length === 0;
    },
    onMessage: function (msg) {
      switch (msg.type) {
        case "joined":
          state.joined = true;
          state.room = msg.room || state.room;
          if (msg.you) state.nick = msg.you;
          pushMsg({ kind: "system", text: "已加入房间 " + state.room + "，共 " + (msg.members || []).length + " 人", ts: Date.now() });
          break;
        case "state":
          state.members = msg.members || [];
          renderMembers();
          renderBoard();
          break;
        case "chat":
          pushMsg({ kind: "chat", from: msg.from, text: msg.text, ts: msg.ts });
          break;
        case "system":
          pushMsg({ kind: "system", text: msg.text, ts: msg.ts });
          break;
        case "error":
          pushMsg({ kind: "system", text: "服务器提示：" + msg.text, ts: Date.now() });
          break;
        default:
          break;
      }
    }
  });

  $("serverAddr").textContent = serverUrl;

  /* ---------------- 交互绑定 ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act], [data-cat], [data-view], [data-copy-nick]");
    if (!t) return;

    if (t.dataset.cat) {
      state.filter = t.dataset.cat;
      renderChips();
      renderMenu();
      return;
    }
    if (t.dataset.view) {
      switchView(t.dataset.view);
      return;
    }
    if (t.dataset.copyNick) {
      var m = state.members.filter(function (x) { return x.nick === t.dataset.copyNick; })[0];
      if (m && m.items) {
        m.items.forEach(function (it) {
          var d = dishById(it.id);
          if (d) state.cart[d.id] = (state.cart[d.id] || 0) + it.qty;
        });
        saveCart(); renderMenu(); renderCart(); syncMyOrder();
      }
      return;
    }

    var act = t.dataset.act;
    if (!act) return;
    var card = t.closest(".card");
    var id = t.dataset.id || (card && card.dataset.id);
    if (!id) return;
    if (act === "inc") state.cart[id] = (state.cart[id] || 0) + 1;
    if (act === "dec") {
      state.cart[id] = (state.cart[id] || 0) - 1;
      if (state.cart[id] <= 0) delete state.cart[id];
    }
    saveCart(); renderMenu(); renderCart(); syncMyOrder();
  });

  function switchView(name) {
    $("view-menu").hidden = name !== "menu";
    $("view-room").hidden = name !== "room";
    Array.prototype.forEach.call(document.querySelectorAll(".nav-btn"), function (b) {
      b.classList.toggle("active", b.dataset.view === name);
    });
    if (name === "room") renderChat();
  }

  $("searchInput").addEventListener("input", function (e) {
    state.keyword = e.target.value;
    renderMenu();
  });

  $("btnRandom").addEventListener("click", function () {
    var pool = visibleDishes();
    if (!pool.length) return;
    var d = pool[Math.floor(Math.random() * pool.length)];
    state.cart[d.id] = (state.cart[d.id] || 0) + 1;
    saveCart(); renderMenu(); renderCart(); syncMyOrder();
  });

  $("btnClear").addEventListener("click", function () {
    state.cart = {}; saveCart(); renderMenu(); renderCart(); syncMyOrder();
  });

  $("btnCheckout").addEventListener("click", function () {
    var items = cartItems();
    if (!items.length) return;
    var lines = ["【食咩点单】", "昵称：" + (state.nick || "匿名同学"), "房间：" + (state.joined ? state.room : "未加入")];
    items.forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.name + " × " + it.qty + "  " + money(it.price * it.qty));
    });
    lines.push("----------------");
    lines.push("合计：" + money(cartTotal()) + "（共 " + cartCount() + " 件）");
    openModal("订单文案", lines.join("\n"));
  });

  $("btnJoin").addEventListener("click", function () {
    var nick = $("inputNick").value.trim();
    var roomNo = $("inputRoom").value.trim();
    if (!nick) { $("inputNick").focus(); $("roomHint").textContent = "请先填写昵称，再加入房间。"; return; }
    if (!roomNo) { $("inputRoom").focus(); return; }
    state.nick = nick; state.room = roomNo; saveProfile();
    room.join(roomNo, nick);
    pushMsg({ kind: "system", text: "正在加入房间 " + roomNo + "…", ts: Date.now() });
    syncMyOrder();
  });

  $("btnLeave").addEventListener("click", function () {
    room.leave();
    state.joined = false;
    state.members = [];
    renderMembers(); renderBoard();
    pushMsg({ kind: "system", text: "你已离开房间", ts: Date.now() });
  });

  $("btnSyncMine").addEventListener("click", function () { syncMyOrder(true); });

  function syncMyOrder(force) {
    if (!state.joined) return;
    var items = cartItems();
    room.sendOrder(items);
    if (force) pushMsg({ kind: "system", text: "已把我的餐盘同步到房间（" + items.length + " 种菜品）", ts: Date.now() });
  }

  $("chatForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = $("chatInput").value.trim();
    if (!text) return;
    if (!room.sendChat(text)) {
      pushMsg({ kind: "system", text: "消息未发出：当前未连接服务器", ts: Date.now() });
      return;
    }
    $("chatInput").value = "";
  });

  $("connRetry").addEventListener("click", function () { room.connect(); });

  /* ---------------- 弹窗 ---------------- */
  function openModal(title, text) {
    $("modalTitle").textContent = title;
    $("orderText").textContent = text;
    $("modal").hidden = false;
  }
  $("btnCloseModal").addEventListener("click", function () { $("modal").hidden = true; });
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) $("modal").hidden = true; });
  $("btnCopy").addEventListener("click", function () {
    var text = $("orderText").textContent;
    var done = function () { $("btnCopy").textContent = "已复制 ✓"; setTimeout(function () { $("btnCopy").textContent = "复制文案"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    loadLocal();
    var q = new URLSearchParams(location.search);
    if (q.get("nick")) state.nick = q.get("nick");
    if (q.get("room")) state.room = q.get("room");

    renderChips();
    renderMenu();
    renderCart();
    renderMembers();
    renderBoard();
    renderChat();

    $("inputNick").value = state.nick;
    $("inputRoom").value = state.room;

    // 带参数打开时自动进房间，便于分享链接直接进同一房间
    if (q.get("nick")) {
      switchView("room");
      room.join(state.room, state.nick);
      syncMyOrder();
    }
  }

  boot();
})();
