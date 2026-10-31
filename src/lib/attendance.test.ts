import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deviceAttendanceTime, selectedAttendance } from "./attendance";

describe("barista attendance", () => {
  test("uses the device's local date and exact time", () => {
    const now = new Date(2026, 9, 31, 0, 12, 34);
    assert.deepEqual(deviceAttendanceTime(now), { work_date: "2026-10-31", check_in: now.toISOString() });
  });
  test("requires a selected name and isolates attendance by name", () => {
    const rows = [{ barista_name_id: "ani", work_date: "2026-10-31", check_out: null }];
    assert.equal(selectedAttendance(rows, "", "2026-10-31"), undefined);
    assert.equal(selectedAttendance(rows, "budi", "2026-10-31"), undefined);
    assert.deepEqual(selectedAttendance(rows, "ani", "2026-10-31"), rows[0]);
  });
  test("keeps an overnight shift available for checkout", () => {
    const row = { barista_name_id: "ani", work_date: "2026-10-30", check_out: null };
    assert.deepEqual(selectedAttendance([row], "ani", "2026-10-31"), row);
  });
});