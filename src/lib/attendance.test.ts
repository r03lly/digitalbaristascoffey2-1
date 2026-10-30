import { describe, expect, test } from "bun:test";
import { deviceAttendanceTime, selectedAttendance } from "./attendance";

describe("barista attendance", () => {
  test("uses the device's local date and exact time", () => {
    const now = new Date(2026, 9, 31, 0, 12, 34);
    expect(deviceAttendanceTime(now)).toEqual({ work_date: "2026-10-31", check_in: now.toISOString() });
  });
  test("requires a selected name and isolates attendance by name", () => {
    const rows = [{ barista_name_id: "ani", work_date: "2026-10-31", check_out: null }];
    expect(selectedAttendance(rows, "", "2026-10-31")).toBeUndefined();
    expect(selectedAttendance(rows, "budi", "2026-10-31")).toBeUndefined();
    expect(selectedAttendance(rows, "ani", "2026-10-31")).toEqual(rows[0]);
  });
  test("keeps an overnight shift available for checkout", () => {
    const row = { barista_name_id: "ani", work_date: "2026-10-30", check_out: null };
    expect(selectedAttendance([row], "ani", "2026-10-31")).toEqual(row);
  });
});