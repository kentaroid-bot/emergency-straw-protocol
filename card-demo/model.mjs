export const PIN = "123456";
export const fresh = () => ({
  version: 1,
  day: 1,
  spent: 0,
  shopWara: 0,
  cardVersion: 1,
  cardActive: true,
  attempts: 0,
  pending: null,
  history: [],
});
export function transition(state, action) {
  const s = structuredClone(state),
    p = s.pending;
  if (action.type === "checkout") {
    if (p) throw Error("進行中のお会計を完了または取り消してください。");
    if (!s.cardActive)
      throw Error("カードは停止中です。地域窓口で再発行してください。");
    if (
      !Number.isInteger(action.amount) ||
      action.amount < 1 ||
      action.amount > 300 - s.spent
    )
      throw Error("今日の残りKusaの範囲で、1以上の整数を入力してください。");
    if (!action.id || s.history.some((x) => x.id === action.id))
      throw Error("このお会計番号は使用済みです。");
    s.pending = {
      id: action.id,
      amount: action.amount,
      day: s.day,
      cardVersion: s.cardVersion,
      status: "confirm",
    };
  } else if (action.type === "cancel") {
    s.pending = null;
  } else if (action.type === "requestSupport") {
    if (!p) throw Error("店でお会計を準備してください。");
    s.pending.status = "support";
  } else if (action.type === "pay" || action.type === "approve") {
    if (!p || p.id !== action.id)
      throw Error("このお会計は終了または変更されています。");
    if (!s.cardActive || p.cardVersion !== s.cardVersion || p.day !== s.day)
      throw Error(
        "カードまたは日付が変わりました。お会計を作り直してください。",
      );
    if (action.type === "pay") {
      if (p.status !== "confirm")
        throw Error("地域窓口での確認を待っています。");
      if (s.attempts >= 3)
        throw Error("3回間違えました。地域窓口の立ち会いを使ってください。");
      if (action.pin !== PIN) {
        s.attempts++;
        return s;
      }
    } else if (p.status !== "support" || !action.consent)
      throw Error("本人と店名・金額への同意を確認してください。");
    if (p.amount > 300 - s.spent) throw Error("今日の残りKusaを超えています。");
    s.spent += p.amount;
    s.shopWara += p.amount;
    s.attempts = 0;
    s.history.unshift({
      ...p,
      status: "paid",
      method: action.type === "pay" ? "pin" : "support",
      remaining: 300 - s.spent,
      time: action.time,
    });
    s.pending = null;
  } else if (action.type === "stop") {
    s.cardActive = false;
    s.pending = null;
  } else if (action.type === "reissue") {
    s.cardVersion++;
    s.cardActive = true;
    s.pending = null;
    s.attempts = 0;
  } else if (action.type === "nextDay") {
    s.day++;
    s.spent = 0;
    s.pending = null;
    s.attempts = 0;
  } else throw Error("未対応の操作です。");
  return s;
}
