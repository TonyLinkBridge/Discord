import { AdminShell } from "@/components/admin-shell/admin-shell";
import { LocalAdminDataProvider } from "@/components/admin-shell/admin-data-provider";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LocalAdminDataProvider>
      <AdminShell>{children}</AdminShell>
    </LocalAdminDataProvider>
  );
}
