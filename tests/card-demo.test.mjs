import test from "node:test";
import assert from "node:assert/strict";
import { fresh, transition, balances } from "../card-demo/model.mjs";
const start = (s = fresh(), amount = 1, id = "one", communityId = "midori-shoptown") =>
  transition(s, { type: "checkout", amount, id, communityId });
const pay = (s, id = "one") =>
  transition(s, {
    type: "pay",
    pin: "123456",
    id,
    time: "2026-11-08T04:00:00Z",
  });
for (const [amount, shopCredit, userRefund] of [[1, 90, 10], [5, 450, 50]]) {
  test(`${amount} Kusa pays ${shopCredit} to shop and refunds ${userRefund} with the same origin`, () => {
    const pending = start(fresh(), amount, "one", "waseda-univ");
    assert.equal(pending.spent, 0);
    assert.deepEqual(balances(pending.history), { shopWara: 0, userWara: 0 });
    const paid = pay(pending);
    assert.equal(paid.spent, amount);
    assert.equal(paid.pending, null);
    assert.equal(paid.history.length, 1);
    const receipt = paid.history[0];
    assert.equal(receipt.communityId, "waseda-univ");
    assert.equal(receipt.remaining, 10 - amount);
    assert.deepEqual(balances(paid.history), { shopWara: shopCredit, userWara: userRefund });
    assert.throws(() => pay(paid));
    assert.throws(() => start(paid, 1, "one"));
  });
}
test("wrong demo PIN never spends; three attempts require the support path", () => {
  let s = start();
  for (let i = 0; i < 3; i++)
    s = transition(s, { type: "pay", pin: "999999", id: "one" });
  assert.equal(s.spent, 0);
  assert.deepEqual(balances(s.history), { shopWara: 0, userWara: 0 });
  assert.throws(() => pay(s));
  s = transition(s, { type: "requestSupport" });
  assert.throws(() =>
    transition(s, { type: "approve", id: "one", consent: false }),
  );
  s = transition(s, { type: "approve", id: "one", consent: true, time: "now" });
  assert.equal(s.spent, 1);
  assert.deepEqual(balances(s.history), { shopWara: 90, userWara: 10 });
  assert.equal(s.history[0].method, "support");
});
test("support cannot approve a normal checkout or an obsolete invoice", () => {
  const s = start();
  assert.throws(() =>
    transition(s, { type: "approve", id: "one", consent: true }),
  );
  const waiting = transition(s, { type: "requestSupport" });
  assert.throws(() => pay(waiting));
  assert.throws(() =>
    transition(waiting, { type: "approve", id: "old", consent: true }),
  );
  const canceled = transition(waiting, { type: "cancel" });
  assert.equal(canceled.spent, 0);
  assert.throws(() =>
    transition(canceled, { type: "approve", id: "one", consent: true }),
  );
});
test("ten Kusa shared across communities, next day renews only the quota", () => {
  for (const amount of [0, -1, 1.5, 11, NaN])
    assert.throws(() => start(fresh(), amount));
  assert.throws(() => start(fresh(), 1, "one", "unknown"));
  let s = pay(start(fresh(), 5));
  assert.throws(() => start(s, 6, "two", "waseda-univ"));
  s = pay(start(s, 5, "two", "waseda-univ"), "two");
  assert.equal(s.spent, 10);
  assert.throws(() => start(s, 1, "three"));
  s = transition(s, { type: "nextDay" });
  assert.equal(s.spent, 0);
  assert.deepEqual(balances(s.history), { shopWara: 900, userWara: 100 });
  assert.deepEqual(s.history.map(h => h.communityId), ["waseda-univ", "midori-shoptown"]);
  s = pay(start(s, 10, "three"), "three");
  assert.deepEqual(balances(s.history), { shopWara: 1800, userWara: 200 });
});
test("stopping/reissuing a card and changing day cancel pending payments without restoring used allowance", () => {
  let s = start(pay(start()), 1, "two");
  s = transition(s, { type: "stop" });
  assert.equal(s.pending, null);
  assert.throws(() => start(s, 1, "three"));
  s = transition(s, { type: "reissue" });
  assert.equal(s.spent, 1);
  assert.equal(s.cardVersion, 2);
  assert.throws(() => pay(s, "two"));
  s = start(s, 1, "three");
  s = transition(s, { type: "nextDay" });
  assert.equal(s.pending, null);
  assert.throws(() => pay(s, "three"));
  assert.deepEqual(balances(s.history), { shopWara: 90, userWara: 10 });
});
