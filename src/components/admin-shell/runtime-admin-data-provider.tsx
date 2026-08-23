"use client";

import { useState } from "react";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createAuthorizedAdminDataProvider } from "@/lib/admin-data/authorized-provider";
import { createUnavailableAvailability, type SafeAdminRuntimeConfig } from "@/lib/admin-data/availability";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import type { AdminMutationGate } from "@/lib/admin-data/mutation-command";
import { ReportingRangeProvider } from "@/lib/reporting-range";

type RuntimeAdminDataProviderProps = {
  children: React.ReactNode;
  mutationGate: AdminMutationGate;
  config: SafeAdminRuntimeConfig;
};

export function RuntimeAdminDataProvider({
  children,
  mutationGate,
  config,
}: Readonly<RuntimeAdminDataProviderProps>) {
  const [provider] = useState(() => {
    const availability = createUnavailableAvailability(config);
    return createAuthorizedAdminDataProvider(
      createUnavailableAdminDataStore(availability, config),
      mutationGate,
    );
  });

  return (
    <AdminDataProvider provider={provider}>
      <ReportingRangeProvider>{children}</ReportingRangeProvider>
    </AdminDataProvider>
  );
}
