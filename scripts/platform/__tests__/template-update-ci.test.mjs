import test from "node:test";
import assert from "node:assert/strict";
import { planUpdate } from "../template-update-ci.mjs";

function statusWithBehind(behind) {
  return { template: { behind } };
}

test("planUpdate: no behind tags -> none, up-to-date", () => {
  const plan = planUpdate({ status: statusWithBehind([]) });
  assert.deepEqual(plan, { action: "none", tag: undefined, reason: "up-to-date" });
});

test("planUpdate: behind with an open PR for the first tag -> none, pr-open", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0", "v2.4.0"]), openPrs: ["v2.3.0"] });
  assert.deepEqual(plan, { action: "none", tag: "v2.3.0", reason: "pr-open" });
});

test("planUpdate: behind with a closed-unmerged PR for the first tag -> none, pr-closed (does not reopen)", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0"]), closedPrs: ["v2.3.0"] });
  assert.deepEqual(plan, { action: "none", tag: "v2.3.0", reason: "pr-closed" });
});

test("planUpdate: behind, no PR at all -> update targeting the first behind tag", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0", "v2.4.0"]) });
  assert.deepEqual(plan, { action: "update", tag: "v2.3.0", reason: "behind" });
});
