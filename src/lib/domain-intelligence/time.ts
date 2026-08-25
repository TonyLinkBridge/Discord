const usageDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function usageDayAt(date: Date): string {
  return usageDayFormatter.format(date);
}
