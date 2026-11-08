import { activate, challenge, verify } from "./identity.mjs";
export function signup(el, info) {
  let proof = null,
    verified = false;
  el.innerHTML =
    '<h1>藁一本の約束をはじめる</h1><p>毎日10枚のKusa。1枚で支払うと、お店に90 WARA、自分に10 WARAが届きます。</p><form id="phoneForm"><h2>電話番号を確認</h2><p>SMS認証の試験版です。SMSは送信しません。架空の番号を使えます。</p><label>電話番号<input name="phone" type="tel" required placeholder="090-0000-0000"></label><button>確認コードを表示する</button></form><div id="second"></div>';
  const f = el.querySelector("#phoneForm"),
    step = el.querySelector("#second");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const phone = f.phone.value;
    try {
      const { normalizePhone } = await import("./identity.mjs");
      normalizePhone(phone);
      proof = challenge();
      verified = false;
      step.innerHTML =
        '<form id="verify"><label>画面に表示された6桁<input name="otp" inputmode="numeric" maxlength="6" required></label><p>試験用コード：<b id="otp"></b>（5分間）</p><button>確認する</button></form>';
      step.querySelector("#otp").textContent = proof.code;
      step.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        try {
          verify(proof, e.target.otp.value);
          verified = true;
          f.hidden = true;
          step.innerHTML =
            '<form id="walletForm"><h2>ウォレットを選ぶ</h2><label>手続き<select name="intent"><option value="signup">新規登録</option><option value="signin">この端末でサインイン</option></select></label><label>新規登録の方法<select name="type"><option value="embedded">おすすめ：組み込みウォレットを自動生成</option><option value="phantom">既存のPhantomを接続</option><option value="paper">紙カード：地域窓口で対面発行</option></select></label><p>組み込み・紙カードの鍵はこのブラウザに暗号化して保存します。端末のデータを消すと復元できません。紙カードのQRは公開アドレスだけで、署名には発行端末と本人のパスワードが必要です。</p><label>ウォレット用パスワード（8文字以上、Phantomでは不要）<input name="pass" type="password" autocomplete="off"></label><button>お財布を開く</button></form>';
          step.querySelector("form").onsubmit = async (ev) => {
            ev.preventDefault();
            const w = ev.target;
            const btn = w.querySelector("button");
            btn.disabled = true;
            try {
              if (!verified) throw Error("確認をやり直してください。");
              await activate(phone, w.type.value, w.pass.value, w.intent.value);
              location.assign("/");
            } catch (x) {
              info(x.message);
            } finally {
              btn.disabled = false;
            }
          };
        } catch (x) {
          info(x.message);
        }
      };
    } catch (x) {
      info(x.message);
    }
  };
}
