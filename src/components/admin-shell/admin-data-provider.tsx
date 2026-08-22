"use client";

import { useState } from "react";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { ReportingRangeProvider } from "@/lib/reporting-range";

export function LocalAdminDataProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [provider] = useState(createLocalAdminDataProvider);

  return (
    <AdminDataProvider provider={provider}>
      <ReportingRangeProvider>{children}</ReportingRangeProvider>
    </AdminDataProvider>
  );
}
