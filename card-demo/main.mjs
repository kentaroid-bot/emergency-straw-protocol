import QRCode from "qrcode";
import { fresh, transition, PIN } from "./model.mjs";
const KEY = "straw-card-ui-demo-v1",
  $ = (id) => document.getElementById(id);
const route = location.pathname.split("/").filter(Boolean)[0];
const role = ["user", "shop", "support"].includes(route) ? route : "user";
const escape = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let cardOpen = false,
  storageWarning = false;
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !Number.isSafeInteger(s.spent) ||
      s.spent < 0 ||
      s.spent > 300 ||
      !Number.isSafeInteger(s.day) ||
      s.day < 1 ||
      !Number.isSafeInteger(s.shopWara) ||
      s.shopWara < 0 ||
      !Number.isSafeInteger(s.cardVersion) ||
      s.cardVersion < 1 ||
      !Array.isArray(s.history) ||
      typeof s.cardActive !== "boolean" ||
      !Number.isInteger(s.attempts) ||
      s.attempts < 0
    )
      throw Error("invalid");
    const validPayment = (p) =>
      p &&
      typeof p.id === "string" &&
      Number.isSafeInteger(p.amount) &&
      p.amount >= 1 &&
      p.amount <= 300 &&
      Number.isSafeInteger(p.day) &&
      p.day >= 1 &&
      Number.isSafeInteger(p.cardVersion) &&
      p.cardVersion >= 1;
    if (
      s.pending &&
      (!validPayment(s.pending) ||
        !["confirm", "support"].includes(s.pending.status))
    )
      throw Error("invalid pending");
    if (
      !s.history.every(
        (p) =>
          validPayment(p) &&
          Number.isSafeInteger(p.remaining) &&
          p.remaining >= 0 &&
          p.remaining <= 300 &&
          typeof p.time === "string" &&
          ["pin", "support"].includes(p.method),
      )
    )
      throw Error("invalid history");
    return s;
  } catch {
    storageWarning = true;
    return fresh();
  }
}
let state = read();
function message(text) {
  $("feedback").hidden = !text;
  $("feedback").textContent = text;
}
function write(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
  state = s;
}
function update(action) {
  try {
    write(transition(read(), action));
    render();
    return true;
  } catch (e) {
    message(
      e.message || "保存できません。ブラウザの保存設定を確認してください。",
    );
    return false;
  }
}
function time(x) {
  const d = new Date(x);
  return Number.isNaN(d.valueOf())
    ? "デモ時刻"
    : d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
function historyRows(shop = false) {
  return state.history.length
    ? state.history
        .map(
          (h) =>
            `<div class="history-row"><div>${shop ? "あおいさん（デモ）" : "田中商店"}<small>体験 ${escape(h.day)}日目 · ${escape(time(h.time))} · ${h.method === "support" ? "確認役が立ち会い" : "デモ暗証番号で確認"}</small></div><strong>${escape(h.amount)} ${shop ? "WARA" : "Kusa"}<small>${shop ? "受取完了" : "支払い完了"}</small></strong></div>`,
        )
        .join("")
    : '<p class="empty">まだお会計はありません。</p>';
}
const link = (href, label, secondary = false) =>
  `<a class="button${secondary ? " secondary" : ""}" href="${href}">${label}</a>`;
const today = () =>
  state.history
    .filter((h) => h.day === state.day)
    .reduce((sum, h) => sum + h.amount, 0);
function user() {
  return `<div class="grid">
<section class="panel balance"><p class="muted">今日あと使えるKusa</p><div class="big">${300 - state.spent} <small class="gold">Kusa</small></div><p class="muted">あおいさん · Kusaアカウント C-001（デモ）</p><div class="balance-track"><span style="width:${(300 - state.spent) / 3}%"></span></div><p class="small" style="color:#d5e0cf">今日使った ${state.spent} / 300 Kusa · 未使用分は繰越なし</p>
</section>
<section class="panel"><h2>持っているWARA</h2><div class="number">0 <small>WARA</small></div><p class="muted">この体験ではKusaだけで買い物します。受け取ったWARAは、翌日も残る対価です。</p><p class="info-strip">WARA用ウォレットの接続は、このモックでは行いません。</p>
</section></div>
<section class="panel"><h2>あなたのQRカード</h2><p class="muted">${state.cardActive ? "紙のカードをお店に出すだけ。端末を持たない人も、地域窓口でカードを受け取る想定です。" : "カードは停止中です。地域窓口で再発行できます。"}</p>
<div class="actions" style="margin-top:18px"><button id="showCard" ${state.cardActive ? "" : "disabled"}>${cardOpen ? "カードを閉じる" : "QRカードを表示"}</button>${link("/shop", "お店で100 Kusaを試す", true)}</div>${cardOpen && state.cardActive ? `<div class="qr-card"><span class="pill">画面モック専用 · 実際には使えません</span><p><strong>あおいさんの Kusaカード</strong></p><img id="cardQr" alt="デモ参加者C-001を示すQRコード"><p>C-001 · カード ${state.cardVersion}</p><p class="small">公開IDのみ。QRは本人の同意や署名ではありません。</p><button id="printCard" class="secondary">このカードを印刷</button></div>` : ""}</section>
<section class="panel" id="history"><h2>買い物の履歴</h2>${historyRows()}</section>
<section class="panel"><h2>カード・暗証番号の相談</h2><p class="muted">なくしたとき、暗証番号を使えないときは地域の窓口へ。端末がない場合は、窓口で残り枠や履歴も確認できる想定です。</p><p>${link("/support", "地域の窓口を見る", true)}</p>
</section>`;
}
function success(receipt) {
  return `
<section class="panel confirm"><div class="receipt-mark" aria-hidden="true">✓</div><h2>支払いが完了しました</h2><p class="small">デモのお会計 · ${escape(receipt.id)}</p><div class="big">${escape(receipt.amount)} <small>Kusa</small></div><p>田中商店に <b>${escape(receipt.amount)} WARA</b> 届きました</p><div class="receipt-meta"><div>お客さんの支払い直後の残り<strong>${escape(receipt.remaining)} Kusa</strong></div><div>店の今日の受取<strong>${today()} WARA</strong></div></div>
<div class="actions"><button id="nextCheckout">次のお会計</button>${link("/user", "利用者の残りを確認", true)}<button id="printReceipt" class="secondary">紙の控えを出す</button></div><p class="small">実際の送金はありません。${receipt.method === "support" ? "地域の確認役が立ち会う流れを体験しました。" : "デモ暗証番号で確認しました。"}</p>
</section>`;
}
function shop() {
  const p = state.pending,
    id = new URLSearchParams(location.search).get("checkout"),
    receipt = state.history.find((h) => h.id === id);
  let panel;
  if (receipt) panel = success(receipt);
  else if (p?.status === "support")
    panel = `
<section class="panel confirm"><p class="eyebrow">確認役の立ち会い</p><h2>地域の窓口で確認を待っています</h2><div class="big">${p.amount} <small>Kusa</small></div><p>あおいさん → 田中商店</p><p class="muted">まだ枠は減っていません。店員だけで代理承認する流れにはしません。</p><p>${link("/support", "確認役の画面へ")}</p><button id="cancel" class="secondary">このお会計を取り消す</button>
</section>`;
  else if (p)
    panel = `
<section class="panel confirm"><p class="flow-steps">カード読取 → <b>本人が金額を確認</b> → 完了</p><h2>田中商店へ支払います</h2><div class="big">${p.amount} <small>Kusa</small></div><p>あおいさん · 支払い後の残り <b>${300 - state.spent - p.amount} Kusa</b></p>
<form id="payForm"><label class="label" for="pin">本人がデモ暗証番号を入力</label><input id="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required aria-describedby="pinHelp" ${state.attempts >= 3 ? "disabled" : ""}><p class="small" id="pinHelp">体験用は <b>${PIN}</b>。本物の暗証番号は入力しないでください。<br>${state.attempts ? `入力間違い ${state.attempts}/3回。` : ""}</p><button type="submit" ${state.attempts >= 3 ? "disabled" : ""}>${p.amount} Kusaで支払う</button>
</form><p><button id="askSupport" class="secondary">暗証番号を使えない方</button></p><button id="cancel" class="secondary">取り消す</button>
</section>`;
  else
    panel = `
<section class="panel"><p class="flow-steps"><b>金額入力・カード読取</b> → 本人が確認 → 完了</p><h2>新しいお会計</h2>
<form id="checkoutForm"><label for="checkoutAmount" class="label">受け取る金額</label><div class="input-row"><input id="checkoutAmount" type="number" min="1" max="${300 - state.spent}" step="1" value="100" required><small>Kusa</small></div><button type="submit" ${state.cardActive ? "" : "disabled"}>デモカードを読み取る</button>
</form><p class="small">カメラの代わりに、あおいさんのデモカードを読み取った状態へ進みます。</p>${!state.cardActive ? '<p class="disabled-note">カードは停止中です。地域窓口で再発行してください。</p>' : ""}<p class="info-strip">店員が金額を入れたら、次の画面をお客さんに向けます。</p>
</section>`;
  return (
    panel +
    `<div class="grid">
<section class="panel"><h2>今日の受取</h2><div class="number">${today()} <small>WARA</small></div><p class="muted">体験 ${state.day}日目 · ${state.history.filter((h) => h.day === state.day).length}件</p>
</section>
<section class="panel"><h2>店のWARA残高</h2><div class="number">${state.shopWara} <small>WARA</small></div><p class="muted">翌日に進んでも残ります。</p>
</section></div>
<section class="panel"><h2>お会計ごとの受取履歴</h2>${historyRows(true)}</section><details class="panel"><summary>店の設定（見本）</summary><p>田中商店 · みどり地区（架空）</p><p class="small">受取先：デモ店舗 S-001。店舗登録・ウォレット設定・店員権限は未実装です。</p></details>`
  );
}
function support() {
  const p = state.pending;
  return `
<section class="panel"><p class="eyebrow">立ち会い承認</p><h2>${p?.status === "support" ? "確認を待っているお会計" : "今は立ち会いの依頼がありません"}</h2>${
    p?.status === "support"
      ? `<p>あおいさん → <b>田中商店</b></p><div class="number">${p.amount} <small>Kusa</small></div><p>支払い後の残り：<b>${300 - state.spent - p.amount} Kusa</b></p>
<form id="supportForm"><label class="check"><input id="consent" type="checkbox" required><span>本人と店名・金額を確認し、本人がこの支払いを希望していることを確かめました（デモ）。</span></label><button type="submit">確認役として承認する（デモ）</button>
</form><p class="small">確認役：地域窓口の青葉さん（架空）。この画面は誰でも切り替えられるモックで、実際の権限チェックはありません。</p>`
      : `<p class="muted">店の金額確認画面で「暗証番号を使えない方」を選ぶと、ここに届きます。</p>${link("/shop", "店の画面へ", true)}`
  }</section><div class="support-list">
<section class="panel"><h2>カードの相談</h2><p>あおいさん · C-001</p><p><span class="pill">${state.cardActive ? "カード有効" : "カード停止中"} · 第${state.cardVersion}版</span></p><p class="muted">今日の残り：${300 - state.spent} Kusa</p>
<div class="actions" style="margin-top:18px"><button id="stopCard" class="danger" ${state.cardActive ? "" : "disabled"}>カードを停止</button><button id="reissueCard" class="secondary">再発行を試す</button></div><p class="small">再発行しても今日の使用額は引き継ぎます。進行中のお会計は取り消されます。デモの暗証番号は123456です。</p>
</section>
<section class="panel"><h2>初めての参加・利用相談</h2><p class="muted">地域で実在と重複登録を確認し、Kusaアカウントとカードを用意する想定です。</p><p class="info-strip">この体験ではC-001を登録済みとして用意しています。実際の受付・本人確認・暗証番号再設定は未実装です。</p>${link("/user", "残り枠と履歴を見る", true)}</section></div>`;
}
function bind(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
}
function checkoutURL(id) {
  history.replaceState(
    null,
    "",
    id ? `/shop?checkout=${encodeURIComponent(id)}` : "/shop",
  );
}
function render() {
  const meta = {
    user: ["今日のあなたの財布", "今日使える枠と買い物の履歴を確認できます。"],
    shop: ["田中商店のレジ", "みどり地区 · 店も人も架空のデモです。"],
    support: [
      "地域の確認窓口",
      "支払いへの立ち会いと、カードの停止・再発行ができます。",
    ],
  }[role];
  $("title").textContent = meta[0];
  $("subtitle").textContent = meta[1];
  $("demoDay").textContent = `体験 ${state.day}日目`;
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === role) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("content").innerHTML =
    role === "user" ? user() : role === "shop" ? shop() : support();
  bind("showCard", "click", () => {
    cardOpen = !cardOpen;
    render();
  });
  if ($("cardQr")) {
    const img = $("cardQr");
    QRCode.toDataURL(
      JSON.stringify({
        type: "wara-card-ui-demo",
        participant: "C-001",
        cardVersion: state.cardVersion,
      }),
      { width: 220, margin: 2 },
    )
      .then((url) => {
        if (img.isConnected) img.src = url;
      })
      .catch(() => message("QR画像を作れませんでした。"));
  }
  for (const id of ["printCard", "printReceipt"])
    bind(id, "click", () => window.print());
  bind("checkoutForm", "submit", (e) => {
    e.preventDefault();
    const id = crypto.randomUUID();
    if (
      update({
        type: "checkout",
        id,
        amount: Number($("checkoutAmount").value),
      })
    ) {
      checkoutURL(id);
      message("デモカードを読み取りました。次は本人が金額を確認します。");
    }
  });
  bind("payForm", "submit", (e) => {
    e.preventDefault();
    const id = state.pending?.id,
      pin = $("pin").value;
    if (update({ type: "pay", id, pin, time: new Date().toISOString() })) {
      if (state.pending)
        message(
          state.attempts >= 3
            ? "入力を3回間違えました。立ち会いの経路を利用できます。"
            : "デモ暗証番号が違います。123456で試してください。",
        );
      else {
        checkoutURL(id);
        render();
        message("模擬決済が完了しました。");
      }
    }
  });
  bind("askSupport", "click", () => {
    if (update({ type: "requestSupport" }))
      message("地域の確認役へ立ち会いを依頼しました（デモ）。");
  });
  bind("cancel", "click", () => {
    if (update({ type: "cancel" })) {
      checkoutURL(null);
      render();
      message("取り消しました。Kusaは使っていません。");
    }
  });
  bind("nextCheckout", "click", () => {
    checkoutURL(null);
    render();
    message("次のお会計を準備できます。");
    $("checkoutAmount")?.focus();
  });
  bind("supportForm", "submit", (e) => {
    e.preventDefault();
    const id = state.pending?.id;
    if (
      update({
        type: "approve",
        id,
        consent: $("consent").checked,
        time: new Date().toISOString(),
      })
    ) {
      message("本人の希望を確認し、承認しました（デモ）。");
      const a = document.createElement("a");
      a.href = `/shop?checkout=${encodeURIComponent(id)}`;
      a.textContent = " 店の完了画面を見る →";
      $("feedback").append(a);
    }
  });
  bind("stopCard", "click", () => {
    if (update({ type: "stop" })) message("カードを停止しました。");
  });
  bind("reissueCard", "click", () => {
    if (update({ type: "reissue" }))
      message("カードを再発行しました。今日の使用額は増減しません。");
  });
}
$("nextDay").onclick = () => {
  if (update({ type: "nextDay" })) {
    if (role === "shop") checkoutURL(null);
    render();
    message(
      "体験の日付を進めました。Kusaは300に更新され、店のWARAは残ります。",
    );
  }
};
$("resetDemo").onclick = () => {
  if (
    !window.confirm(
      "このブラウザの体験データを消して、300 Kusaからやり直しますか？",
    )
  )
    return;
  try {
    write(fresh());
    cardOpen = false;
    if (role === "shop") checkoutURL(null);
    render();
    message("体験を初期状態へ戻しました。");
  } catch {
    message("体験データを保存できません。");
  }
};
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    state = read();
    render();
    message("別の画面で行った操作を反映しました。");
  }
});
render();
if (storageWarning)
  message("保存データを読み取れなかったため、初期状態を表示しています。");
