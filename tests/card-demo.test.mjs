import test from "node:test";
import assert from "node:assert/strict";
import { fresh, transition } from "../card-demo/model.mjs";
const start = (s = fresh(), amount = 100, id = "one") =>
  transition(s, { type: "checkout", amount, id });
const pay = (s, id = "one") =>
  transition(s, {
    type: "pay",
    pin: "123456",
    id,
    time: "2026-11-08T04:00:00Z",
  });
test("card demo: 100 Kusa becomes remaining 200 and merchant WARA 100, without double settlement", () => {
  const initial = fresh(),
    pending = start(initial),
    paid = pay(pending);
  assert.equal(initial.spent, 0);
  assert.equal(pending.spent, 0);
  assert.equal(paid.spent, 100);
  assert.equal(paid.shopWara, 100);
  assert.equal(paid.history[0].remaining, 200);
  assert.equal(paid.pending, null);
  assert.throws(() => pay(paid));
  assert.throws(() => start(paid, 100, "one"));
  assert.equal(paid.history.length, 1);
});
test("wrong demo PIN never spends; three attempts require the support path", () => {
  let s = start();
  for (let i = 0; i < 3; i++)
    s = transition(s, { type: "pay", pin: "999999", id: "one" });
  assert.equal(s.spent, 0);
  assert.equal(s.shopWara, 0);
  assert.throws(() => pay(s));
  s = transition(s, { type: "requestSupport" });
  assert.throws(() =>
    transition(s, { type: "approve", id: "one", consent: false }),
  );
  s = transition(s, { type: "approve", id: "one", consent: true, time: "now" });
  assert.equal(s.spent, 100);
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
test("daily cumulative limit, integer amounts and next-day renewal preserve merchant credits", () => {
  for (const amount of [0, -1, 1.5, 301, NaN])
    assert.throws(() => start(fresh(), amount));
  let s = pay(start(fresh(), 300));
  assert.throws(() => start(s, 1, "two"));
  s = transition(s, { type: "nextDay" });
  assert.equal(s.spent, 0);
  assert.equal(s.shopWara, 300);
  s = pay(start(s, 100, "two"), "two");
  assert.equal(s.shopWara, 400);
  assert.equal(s.spent, 100);
});
test("stopping/reissuing a card and changing day cancel pending payments without restoring used allowance", () => {
  let s = start(pay(start()), 100, "two");
  s = transition(s, { type: "stop" });
  assert.equal(s.pending, null);
  assert.throws(() => start(s, 100, "three"));
  s = transition(s, { type: "reissue" });
  assert.equal(s.spent, 100);
  assert.equal(s.cardVersion, 2);
  assert.throws(() => pay(s, "two"));
  s = start(s, 100, "three");
  s = transition(s, { type: "nextDay" });
  assert.equal(s.pending, null);
  assert.throws(() => pay(s, "three"));
  assert.equal(s.shopWara, 100);
});
