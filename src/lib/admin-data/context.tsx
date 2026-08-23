"use client";

import { createContext, useContext } from "react";
import type { AdminDataProvider } from "./provider";
import type { AdminAvailability } from "./availability";

export const AdminDataContext = createContext<AdminDataProvider | null>(null);

export function AdminDataProvider({
  children,
  provider,
}: Readonly<{
  children: React.ReactNode;
  provider: AdminDataProvider;
}>) {
  return <AdminDataContext.Provider value={provider}>{children}</AdminDataContext.Provider>;
}

export function useAdminData(): AdminDataProvider {
  const provider = useContext(AdminDataContext);

  if (!provider) {
    throw new Error("useAdminData must be used within an AdminDataProvider.");
  }

  return provider;
}

export function useAdminAvailability(): AdminAvailability {
  return useAdminData().availability;
}
