"use client";

import { useState } from "react";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createAuthorizedAdminDataProvider } from "@/lib/admin-data/authorized-provider";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import type { AdminMutationGate } from "@/lib/admin-data/mutation-command";
import { ReportingRangeProvider } from "@/lib/reporting-range";

export function LocalAdminDataProvider({
  children,
  mutationGate,
}: Readonly<{
  children: React.ReactNode;
  mutationGate: AdminMutationGate;
}>) {
  const [provider] = useState(() => createAuthorizedAdminDataProvider(
    createLocalAdminDataProvider(),
    mutationGate,
  ));

  return (
    <AdminDataProvider provider={provider}>
      <ReportingRangeProvider>{children}</ReportingRangeProvider>
    </AdminDataProvider>
  );
}
