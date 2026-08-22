"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { DateRange } from "./admin-data/types";

export type ReportingRangeOption = DateRange & { id: string; label: string };

export const reportingRangeOptions: readonly ReportingRangeOption[] = [
  { id: "aug-16-22", from: "2026-08-16", to: "2026-08-22", label: "Aug 16–22, 2026" },
  { id: "aug-18-22", from: "2026-08-18", to: "2026-08-22", label: "Aug 18–22, 2026" },
  { id: "aug-01-22", from: "2026-08-01", to: "2026-08-22", label: "Aug 1–22, 2026" },
];

type ReportingRangeValue = {
  selectedRange: ReportingRangeOption;
  setSelectedRange: (range: ReportingRangeOption) => void;
};

const ReportingRangeContext = createContext<ReportingRangeValue | null>(null);

export function ReportingRangeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [selectedRange, setSelectedRange] = useState(reportingRangeOptions[0]);
  const value = useMemo(
    () => ({ selectedRange, setSelectedRange }),
    [selectedRange],
  );

  return (
    <ReportingRangeContext.Provider value={value}>
      {children}
    </ReportingRangeContext.Provider>
  );
}

export function useReportingRange(): ReportingRangeValue {
  const value = useContext(ReportingRangeContext);
  if (!value) throw new Error("useReportingRange must be used within a ReportingRangeProvider.");
  return value;
}

export const accessibleReportingRangeLabel = (label: string) => label.replace("–", " to ");
