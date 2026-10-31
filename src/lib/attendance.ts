export type AttendanceIdentity = {
  barista_name_id: string | null;
  work_date: string;
  check_out: string | null;
};

export function deviceAttendanceTime(now = new Date()) {
  const work_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { work_date, check_in: now.toISOString() };
}

export function selectedAttendance<T extends AttendanceIdentity>(rows: T[], nameId: string, day: string) {
  if (!nameId) return undefined;
  return rows.find((row) => row.barista_name_id === nameId && !row.check_out)
    ?? rows.find((row) => row.barista_name_id === nameId && row.work_date === day);
}