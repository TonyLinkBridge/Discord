import { render, type RenderOptions } from "@testing-library/react";
import { RayNameThemeProvider } from "@/components/theme/theme-provider";
import { AdminDataProvider } from "@/lib/admin-data/context";
import { createAuthorizedAdminDataProvider } from "@/lib/admin-data/authorized-provider";
import { adminMutationCommandSchema } from "@/lib/admin-data/mutation-command";
import type { ActorAwareAdminDataStore } from "@/lib/admin-data/provider";
import { ReportingRangeProvider } from "@/lib/reporting-range";
import { createTestAdminDataStore } from "@/test/admin-data";

type RenderAdminOptions = Omit<RenderOptions, "wrapper"> & {
  provider?: ActorAwareAdminDataStore;
};

export function renderAdmin(ui: React.ReactNode, options: RenderAdminOptions = {}) {
  const { provider: store = createTestAdminDataStore(), ...renderOptions } = options;
  const provider = createAuthorizedAdminDataProvider(store, async (input) => ({
    actorId: "local-ray",
    command: adminMutationCommandSchema.parse(input),
  }));
  const result = render(
    <RayNameThemeProvider>
      <AdminDataProvider provider={provider}>
        <ReportingRangeProvider>{ui}</ReportingRangeProvider>
      </AdminDataProvider>
    </RayNameThemeProvider>,
    renderOptions,
  );

  return { ...result, provider: store };
}
