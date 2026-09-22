import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCentralDateTime } from "./central-time.ts";

describe("getCentralDateTime", () => {
  it("reads Monday 4:00 PM CDT as hour 16, not 4", () => {
    const central = getCentralDateTime(new Date("2026-09-21T21:00:00.000Z"));
    assert.equal(central.hour, 16);
    assert.equal(central.timeHm, "16:00");
    assert.equal(central.dayOfWeek, 1);
  });

  it("still reads Monday 9:00 AM CDT as hour 9", () => {
    const central = getCentralDateTime(new Date("2026-09-21T14:00:00.000Z"));
    assert.equal(central.hour, 9);
    assert.equal(central.timeHm, "09:00");
    assert.equal(central.dayOfWeek, 1);
  });
});
