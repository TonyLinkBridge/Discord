"use client";

import { useState } from "react";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createAuthorizedAdminDataProvider } from "@/lib/admin-data/authorized-provider";
import { createUnavailableAvailability, type AdminAvailability, type SafeAdminRuntimeConfig } from "@/lib/admin-data/availability";
import { createUnavailableAdminDataStore } from "@/lib/admin-data/unavailable-provider";
import type { AdminMutationGate } from "@/lib/admin-data/mutation-command";
import { ReportingRangeProvider } from "@/lib/reporting-range";

type RuntimeAdminDataProviderProps = {
  children: React.ReactNode;
  mutationGate: AdminMutationGate;
  config: SafeAdminRuntimeConfig;
  availability?: AdminAvailability;
};

export function RuntimeAdminDataProvider({
  children,
  mutationGate,
  config,
  availability: resolvedAvailability,
}: Readonly<RuntimeAdminDataProviderProps>) {
  const [provider] = useState(() => {
    const availability = resolvedAvailability ?? createUnavailableAvailability(config);
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
