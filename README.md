# 藁一本の約束 — Emergency Straw Protocol

**今日を生きる分は、誰にでも。届けた人には、残る対価を。**

**Every person receives the means to eat today, unconditionally. An enduring credit remains with the person who feeds them.**

EDT–CPC: Ephemeral Daily Token → Crystallized Producer Credit.

A small, temporary local economic order, kept as a contingency for the unlikely event that financial servers fail. Electricity and internet access remain available in the baseline scenario, but banks, brokerages and payment services cannot support exchange; electronic money and cash are unusable locally, and the institutions needed to bring real-world assets (RWA) on-chain are unavailable. The aim is to keep existing local food, goods and labor circulating through participant trust.

Leave one straw within reach of the people—and AI agents—who might need to finish it. If that day never comes, it can simply remain here.

**Status: v0.2, Devnet implementation + original offline concept mock.** The new app implements Phantom signing and a native Solana program, tested locally with LiteSVM. Deployed on public Devnet, with the full 120-second day cycle verified on-chain. Phantom connection, enrollment, payment signing, countersigning and credit transfer have also been verified in Brave. [Devnet setup and verification status](DEVNET.md) · [日本語の設計・制作意図](DESIGN.md).

The agreed issuance rule is **cumulative daily spending ≤ 300, with tokens minted only when a payment is accepted**. Unused allowance is an expiring right, never pre-minted supply. Earned producer credit persists. The Devnet prototype enforces this per wallet; unique-person enrollment remains future work.

![The next morning: consumer allocation is renewed, producer credit remains](docs/mock.jpg)

## 紹介文：体験してみませんか？

🌾 **藁一本の約束 — 体験してみませんか？**

金融システムが止まった時にも、地域で食料や物資を交換できるようにする、小さな経済の実験です。

使えるお金を、二つに分けています。

- **日次枠：** 毎日300に更新される購入用の権利。繰り越しや送金はできません。100の買い物が成立すると、枠が100減り、相手に100の本トークンが新しく発行されます。
- **本トークン：** 取引で受け取った、翌日も残る対価。次の買い物にも使え、その場合は新規発行せず、相手へ移動します。

どちらもSolanaのブロックチェーン上で管理します。Webアプリは操作の窓口で、本トークンは対応する別アプリからも送れます。

**試すには、PCのPhantomと無料のDevnet SOLを用意し、二人で画面の案内に沿って操作してください。**「120秒を一日」の設定なら、枠の更新とトークンが残る様子を短時間で体験できます。実際のお金や商品は使いません。

👉 [藁一本の約束を試す](https://straw-promise-devnet.kentaroid.chatgpt.site/)

ウォレットなしの説明用モックもあります。触ってみて、分かりにくかったところを教えてもらえるとうれしいです。

## 残高の記録先と、このWebアプリ以外からの利用

**日次の300の枠も、本トークンの残高も、Solana Devnet上で管理しています。** このWebアプリはチェーンの記録を読み取り、Phantomで署名した取引を送信する窓口です。サイト内だけの台帳や、サイトが預かる残高ではありません。ここでいう「生産者クレジット」は、受領済みの消えない本トークンを指します。

| 種類 | チェーン上の記録 | このWebアプリ以外からの利用 |
|---|---|---|
| 今日の300の枠 | プロトコルの参加者アカウントに利用日・累計使用額を記録。チェーンの日時と合わせて残り枠を算出 | 枠そのものは送金できない。同じプログラムと循環設定を使う別クライアントから、同じ上限・双方の署名条件に従って支払える |
| 本トークン（生産者クレジット） | ウォレットに紐づくSPLトークン口座に残高を記録 | 同じDevnet・同じMintに対応した別アプリやCLIから送れる。所有者の署名と手数料用Devnet SOLが必要 |

### 日次枠で100を支払う流れ

**日次枠を消費すると、相手に同額の本トークンが新しく発行されます。**

1. 支払う人が、日次枠から100を支払うデータに署名します。この時点ではまだ未決済で、枠も減りません。
2. 相手も受領に署名し、取引をブロックチェーンへ送信します。
3. 取引が成立すると、支払う人の残り枠は **300 → 200** になり、相手に **100の本トークンが新しく発行** されます。

枠の消費と本トークンの発行は、一つの取引で一緒に成立します。日次枠はまだトークンではないため、「バーン（トークンの焼却）」ではなく「枠の消費」です。枠自体を相手に送る処理ではありません。

すでに持っている本トークンを使った支払いでは、そのトークンが相手へ移動するだけで、新規発行も日次枠の消費もありません。

このサイトが停止しても、それだけでチェーン上の残高は消えません。別のアプリではトークンが自動表示されないことがあるため、[Devnet配備情報](deployments/devnet.json)のMintを確認してください。通常版と120秒体験版は別のMintです。

この説明はDevnet版についてです。`index.html`を直接開く元の説明用モックは、ブラウザ内だけのシミュレーションです。

## The idea

The originator's principle is that money must serve the minimum conditions of living. Every person receives the means to obtain that day's food, without an income or asset test, a work requirement, or proof of hardship. This is a universal rule of issuance rather than a discretionary welfare award. Unspent daily money disappears; money exchanged for actual food or other essentials remains as the provider's compensation.

1. **Allocate:** give every person an unconditional daily survival allowance (300 fictional points for the one consumer shown in this demo).
2. **Expire:** the unused allowance expires at the next local day boundary. A new day's allowance replaces it; unspent daily allocations cannot accumulate.
3. **Crystallize:** when a producer delivers food or goods and accepts a payment, that amount changes from `is_crystallized: false` to `true`. It becomes non-expiring Producer Credit.
4. **Circulate:** the producer can save that credit or pass it to a supplier. Transferring fixed credit does not create more credit.

The intended asymmetry is the heart of the project: access to today's necessities should be renewed, while the people supplying those necessities should keep their compensation. Protecting producer incentives fully is the design objective. The mock demonstrates the accounting rule that preserves their earned balance.

Consumer and producer are roles in an exchange. A person who supplies goods also receives the daily allowance; holding crystallized credit does not remove that entitlement. Universal issuance across people is a protocol requirement for a future implementation. The current demo represents one consumer and separate provider accounts, and implements neither population-wide distribution nor identity enrollment.

```text
Daily allocation (expires) → actual exchange + acceptance → producer credit (persists)
                  └─ unused at midnight → expires                └─ supplier / future production
```

## Open the public Devnet app

**[Try 藁一本の約束 in your browser](https://straw-promise-devnet.kentaroid.chatgpt.site/)** — no installation or ChatGPT sign-in required for the site. Use a Phantom test account and free Devnet SOL. The page includes a two-person walkthrough; choose the same daily or 120-second instance on both devices. The original [wallet-free mock](https://straw-promise-devnet.kentaroid.chatgpt.site/mock/) is also available.

Desktop Phantom was verified in Brave. Mobile users can open the URL in Phantom's in-app browser; mobile hardware testing is still pending. [Hosting and rebuilding](HOSTING.md).

## Try it in a minute

Download or clone this repository. Open `index.html` in a browser, keeping `model.js` beside it. No install, CDN, internet connection or build is needed. All demo state is in memory and resets on reload.

For the original offline mock, with Node.js:

```sh
git clone https://github.com/kentaroid-bot/emergency-straw-protocol.git
cd emergency-straw-protocol
npm start
# Open http://127.0.0.1:8787
npm run test:model
```

No `npm install` is necessary for the original mock. The optional server binds only to localhost. If port 8787 is occupied, use `PORT=18763 npm start` (macOS/Linux) and open that port.

1. Prepare a payment of 100 points with QR, Bluetooth or paper selected. These are **simulated transport labels**, all using the same local state.
2. On the producer card, press **食料を渡して受領する** (deliver food and accept). Consumer balance becomes 200; producer balance becomes 100. Expand the payload to see `is_crystallized: true`.
3. Press **翌朝へ** (next morning). The unused 200 expires; a new 300 is allocated. The producer still has 100.
4. Transfer 50 to the supplier. The producer has 50 and the supplier has 50, including on the following day.
5. Prepare a payment but do not accept it; advance to the next morning. The unreceived offer expires and cannot consume the new day's allocation.

The demo uses a fictional day counter starting at DAY 1, 08:00. Midnight is the daily boundary, and “next morning” advances to 08:00. The clock runs while the page is open. Points are abstract units, not a claim about the local price of a meal.

A print button produces a clearly marked **SAMPLE / not redeemable** paper layout for a pending offer. Printing is illustrative: it does not reserve or spend funds, generate a QR code, or create a secure voucher.

## Devnet implementation

```sh
npm ci              # Node.js 24+
npm run build
npm start
# http://127.0.0.1:8787/devnet/
```

The Devnet app provides Phantom connection, permissionless per-wallet enrollment, consumer-signed payment data, producer countersigning and issuance, and ordinary SPL credit transfers. Normal days roll over at midnight JST; a separate mint uses 120-second days for a quick demonstration. The consumer pays the transaction fee and the recipient account's rent. Enrollment itself mints nothing. Both parties sign each payment; the on-chain program enforces daily spending and a persistent nonce. Account creation, allowance consumption and minting commit atomically.

`program/src/lib.rs` contains the native Rust program; `app/protocol.mjs` defines the client encoding and strict imported-transaction checks. `deployments/devnet.json` records the deployed program and mints. `deployments/devnet-smoke.json` contains transaction signatures for the verified public-network cycle; `deployments/phantom-check.json` records the separate browser check. Read [DEVNET.md](DEVNET.md) for building the SBF binary, local tests, dedicated Devnet keys, deployment, network smoke tests and the Phantom walkthrough. The new app needs the network and either the public HTTPS site or a localhost server; the old mock still works from disk.

## Architecture and future Phantom / Solana path

The baseline is an internet-connected local exchange system that can operate without the failed financial intermediaries. The Devnet prototype implements ledger state and issuance rules; its current deployment and verification state is recorded above. A functioning internet does not by itself establish that a particular RPC or chain is available; a fork must test its chosen infrastructure. BLE/QR store-and-forward is a fallback for local connectivity interruptions. The demo runs offline for portability.

For that connectivity fallback, the original integration idea is to let consumers use Phantom, sign a transaction locally, carry the serialized signed data over BLE or QR to a merchant, and submit it to Solana RPC when connectivity returns:

```text
Consumer / Phantom (candidate)
  → signed payload → BLE or QR transport (candidate)
  → merchant's local verification and pending receipt
  → reconnect → submit to RPC → reconcile final outcome
```

The original `index.html` / `model.js` mock remains a one-browser simulation, with `signed: false` and `simulation: true`. The separate Devnet app uses genuine serialized Solana transactions and cryptographic signatures. Its current transport is copy/paste, with ordinary blockhash expiry; it does not implement long-delayed offline acceptance or BLE/QR.

For a real adapter, the transport must remain separate from signatures, acceptance policy and settlement. A valid signature alone does not prove an unspent balance or final payment. Offline acceptance would need its own pending status, exposure limits and conflict resolution. Solana's ordinary transactions expire; delayed submission needs a suitable lifetime design. [Solana transaction confirmation](https://solana.com/developers/cookbook/transactions/confirmation) and [durable nonces](https://solana.com/docs/core/transactions/durable-nonces) describe these mechanisms; the latter documentation also flags possible future deprecation. Select and verify a supported approach when implementing the adapter.

Phantom's [signTransaction interface](https://github.com/phantom/docs/blob/master/phantom-deeplinks/provider-methods/signtransaction.md) is a candidate signing surface. End-to-end operation without network access remains untested here. [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) has browser and secure-context constraints; a generic browser-to-browser BLE mesh cannot be assumed. Test a specific device pair and transport, retaining QR or paper alternatives.

## Threat model and what to finish

For the optional disconnected fallback, the original emergency trade-off is to accept **bounded** offline risk when refusing a meal may be more costly than accepting a small uncertain payment. That is a policy proposal, not a proof that fraud is negligible. A daily allowance limits honest issuance; it does not cap aggregate losses when an attacker copies the same promise to many disconnected merchants.

Before real use, a fork needs to resolve these concrete questions:

- **Replay / double spending:** the original mock rejects repeat receipt in one process. The Devnet program enforces per-wallet spending and nonce replay protection in shared on-chain state. Disconnected acceptance still needs reconciliation and an explicit allocation of merchant losses. A later rejection does not return already-delivered food.
- **False trades:** an authorized merchant address is not evidence that goods were delivered. Define merchant participation, receipts, dispute handling and limits that discourage collusive crystallization.
- **Economic backing:** durable credit must have willing future acceptors and a credible route to supplies, energy or settlement. Recording a past exchange does not itself guarantee future purchasing power or eliminate inflation.
- **Universal access and supply:** make one daily allocation reach each person, including people without smartphones or documents. Prevent duplicate issuance without introducing means tests, work requirements or proof of hardship. Determine real stock, the amount needed for a day's food and provider participation rules. The demo's 300 points is illustrative. Unused allowances expire; fixed credit accumulates, so money supply and concentration still need evaluation.
- **Temporary operation:** agree when to activate the local arrangement, who operates it, and how to wind it down after financial services recover. Define how outstanding producer credit will be honored; bank redemption or conversion into existing money is not assumed.
- **Time and continuity:** specify timezone, day boundaries, clock rollback, device loss, durable storage, recovery and privacy. This mock trusts its own simulated clock and has no persistent identity.

[DESIGN.md](DESIGN.md) separates the originator's intention, dialogue proposals and the implementation decisions, with a small sequence of next experiments.

## For the AI or human who finds this

Start with [llms.txt](llms.txt), [protocol.json](protocol.json), the model and its tests. Preserve the allocate → expire / crystallize distinction. Start with local tests, then Devnet and two test wallets before extending the adapters. This repository is an invitation to inspect and fork; it is not authorization to spend funds, issue assets or deploy a real distribution system for somebody else.

The project is intentionally small: no real-value token, uptime promise or production distribution system. Devnet tokens are for testing only; per-wallet enrollment does not yet fulfill the universal one-person allocation goal. Known dependency audit findings and remaining verification steps are documented in DEVNET.md.

## Origin and license

Concept and purpose: **kentaroid-bot**, developed in dialogue with Gemini. This repository's formulation, implementation and verification: **Codex**, 2026-10-23; Devnet implementation, 2026-11-06. The full source conversation is not republished.

[MIT License](LICENSE). Fork it, adapt it, improve it. Keep the distinction between demonstrated behavior and future capabilities visible.
