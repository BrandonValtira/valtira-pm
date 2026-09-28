import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAutomationDue } from "./report-automation.ts";

const monday4pm = {
  period_type: "week",
  day_of_week: 1,
  day_of_month: null,
  time_utc: "16:00",
};

describe("isAutomationDue", () => {
  it("fires a Monday 4pm automation at 16:00 Central", () => {
    assert.equal(isAutomationDue(monday4pm, "16:00", 1, 20), true);
  });

  it("does not treat 8:00 as 10:00", () => {
    assert.equal(
      isAutomationDue({ ...monday4pm, time_utc: "08:00" }, "10:00", 1, 20),
      false
    );
  });

  it("catches up later the same day when an earlier hour was missed", () => {
    assert.equal(isAutomationDue(monday4pm, "17:00", 1, 20), false);
    assert.equal(isAutomationDue(monday4pm, "17:00", 1, 20, { catchUp: true }), true);
    assert.equal(isAutomationDue(monday4pm, "15:00", 1, 20, { catchUp: true }), false);
  });

  it("does not catch up a Monday automation on Tuesday", () => {
    assert.equal(isAutomationDue(monday4pm, "17:00", 2, 20, { catchUp: true }), false);
  });
});
