import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
const prefix = "wara.v03.identity.",
  sessionKey = "wara.v03.active";
const enc = new TextEncoder();
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (a) => btoa(String.fromCharCode(...new Uint8Array(a)));
const bytes = (s) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));

export function normalizePhone(s) {
  const n = String(s)
    .normalize("NFKC")
    .replace(/[ ()-]/g, "");
  const intl = n.startsWith("0") ? "+81" + n.slice(1) : n;
  if (!/^\+[1-9][0-9]{7,14}$/.test(intl))
    throw Error("国番号付き、または国内の電話番号を入力してください。");
  return intl;
}
async function phoneId(s) {
  let salt = localStorage.getItem(prefix + "salt");
  if (!salt) {
    salt = b64(random(24));
    localStorage.setItem(prefix + "salt", salt);
  }
  return b64(
    await crypto.subtle.digest("SHA-256", enc.encode(salt + normalizePhone(s))),
  );
}
export function challenge(now = Date.now()) {
  let n;
  do {
    [n] = crypto.getRandomValues(new Uint32Array(1));
  } while (n >= 4294000000);
  return {
    code: String(n % 1000000).padStart(6, "0"),
    expires: now + 300000,
    tries: 0,
    used: false,
  };
}
export function verify(c, code, now = Date.now()) {
  if (!c || c.used || now >= c.expires || c.tries >= 5)
    throw Error("確認コードを発行し直してください。");
  c.tries++;
  if (c.code !== code) throw Error("確認コードが違います。");
  c.used = true;
}
async function wrapping(pass, salt) {
  if (pass.length < 8)
    throw Error("ウォレット用パスワードは8文字以上にしてください。");
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(pair, pass) {
  const salt = random(16),
    iv = random(12),
    key = await wrapping(pass, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    pair.secretKey,
  );
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
function phantom() {
  const p = globalThis.phantom?.solana;
  if (!p?.isPhantom) throw Error("Phantomをこのブラウザで開いてください。");
  return p;
}
async function connectPhantom(address) {
  const p = phantom();
  const { publicKey } = await p.connect();
  if (address && publicKey.toBase58() !== address)
    throw Error("登録したPhantomアカウントを選んでください。");
  return p;
}
export async function unlock(profile, pass) {
  if (profile.type === "phantom") return connectPhantom(profile.address);
  try {
    const { salt, iv, ct } = profile.vault;
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv) },
      await wrapping(pass, bytes(salt)),
      bytes(ct),
    );
    const k = Keypair.fromSecretKey(new Uint8Array(raw));
    if (k.publicKey.toBase58() !== profile.address) throw Error();
    return {
      publicKey: k.publicKey,
      signTransaction: async (tx) => {
        tx.partialSign(k);
        return tx;
      },
    };
  } catch {
    throw Error(
      "この端末のウォレットを開けません。パスワードを確認してください。",
    );
  }
}
export async function activate(phone, type, pass, intent) {
  const id = await phoneId(phone),
    key = prefix + "account." + id;
  let profile = JSON.parse(localStorage.getItem(key) || "null");
  if (intent === "signin") {
    if (!profile)
      throw Error("このブラウザに登録がありません。新規登録を選んでください。");
    await unlock(profile, pass);
  } else {
    if (profile)
      throw Error(
        "この番号はこのブラウザで登録済みです。サインインしてください。",
      );
    if (!["embedded", "phantom", "paper"].includes(type))
      throw Error("ウォレットを選んでください。");
    if (type === "phantom")
      profile = {
        type,
        address: (await connectPhantom()).publicKey.toBase58(),
      };
    else {
      const pair = Keypair.generate();
      profile = {
        type,
        address: pair.publicKey.toBase58(),
        vault: await seal(pair, pass),
      };
    }
    localStorage.setItem(key, JSON.stringify(profile));
  }
  sessionStorage.setItem(sessionKey, id);
  return profile;
}
export function active() {
  const id = sessionStorage.getItem(sessionKey);
  if (!id) return null;
  try {
    const p = JSON.parse(localStorage.getItem(prefix + "account." + id));
    new PublicKey(p.address);
    return p;
  } catch {
    return null;
  }
}
export function signout() {
  sessionStorage.removeItem(sessionKey);
}
export const inviteSecret = () => bs58.encode(random(32));
