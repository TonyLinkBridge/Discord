export type BaselineCatalog = {
  columns: Array<Record<string, unknown>>;
  enums: Array<Record<string, unknown>>;
  foreignKeys: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
};

export function inspectBaselineSchema(
  sql: unknown,
  snapshot: unknown,
): Promise<BaselineCatalog>;

export function assertBaselineMatchesSnapshot(
  snapshot: unknown,
  catalog: BaselineCatalog,
): void;
