import { render, type RenderOptions } from "@testing-library/react";
import { RayNameThemeProvider } from "@/components/theme/theme-provider";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import type { AdminDataProvider as AdminDataProviderType } from "@/lib/admin-data/provider";

type RenderAdminOptions = Omit<RenderOptions, "wrapper"> & {
  provider?: AdminDataProviderType;
};

export function renderAdmin(ui: React.ReactNode, options: RenderAdminOptions = {}) {
  const { provider = createLocalAdminDataProvider(), ...renderOptions } = options;
  const result = render(
    <RayNameThemeProvider>
      <AdminDataProvider provider={provider}>{ui}</AdminDataProvider>
    </RayNameThemeProvider>,
    renderOptions,
  );

  return { ...result, provider };
}
