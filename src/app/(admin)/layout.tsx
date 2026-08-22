import { AdminShell } from "@/components/admin-shell/admin-shell";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell title="Overview">{children}</AdminShell>;
}
