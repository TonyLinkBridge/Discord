function publicSchema(value) {
  return value || "public";
}

function postgresIdentifier(value) {
  return value.slice(0, 63);
}

function normalizedDefault(value, enumType) {
  if (value === null || value === undefined) return null;

  let normalized = String(value).trim().toLowerCase().replaceAll('"', "");
  if (enumType) {
    const escapedType = enumType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(
      new RegExp(`::(?:public\\.)?${escapedType}$`),
      "",
    );
  }
  return normalized.replace(/\s+/g, "");
}

function normalizedIdentifier(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/^[a-z_][a-z0-9_]*\./, "");
}

function parsedSetPredicate(value) {
  if (!value) return null;
  let normalized = value
    .trim()
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/[a-z_][a-z0-9_]*\./g, "");
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  const inMatch = normalized.match(/^([a-z_][a-z0-9_]*)\s+in\s*\((.*)\)$/s);
  const anyMatch = normalized.match(
    /^([a-z_][a-z0-9_]*)\s*=\s*any\s*\(\s*array\[(.*)\]\s*\)$/s,
  );
  const match = inMatch ?? anyMatch;
  if (!match) return null;

  return {
    column: match[1],
    values: [...match[2].matchAll(/'([^']*)'/g)].map((entry) => entry[1]),
  };
}

function predicatesMatch(expected, actual) {
  if (expected === null || expected === undefined) return actual === null;
  if (actual === null || actual === undefined) return false;
  const expectedSet = parsedSetPredicate(expected);
  const actualSet = parsedSetPredicate(actual);
  if (expectedSet && actualSet) {
    return JSON.stringify(expectedSet) === JSON.stringify(actualSet);
  }
  return normalizedIdentifier(expected).replace(/\s+/g, "") ===
    normalizedIdentifier(actual).replace(/\s+/g, "");
}

function expectedBaseline(snapshot) {
  const tables = Object.values(snapshot.tables).map((table) => ({
    ...table,
    schema: publicSchema(table.schema),
  }));
  const enums = Object.values(snapshot.enums);
  const foreignKeys = tables.flatMap((table) =>
    Object.values(table.foreignKeys).map((foreignKey) => ({
      ...foreignKey,
      name: postgresIdentifier(foreignKey.name),
      schema: table.schema,
      referencedSchema: "public",
    })),
  );
  const indexes = tables.flatMap((table) =>
    Object.values(table.indexes).map((index) => ({
      ...index,
      schema: table.schema,
      tableName: table.name,
    })),
  );

  return { tables, enums, foreignKeys, indexes };
}

export async function inspectBaselineSchema(sql, snapshot) {
  const expected = expectedBaseline(snapshot);
  const tableNames = expected.tables.map((table) => table.name);
  const enumNames = expected.enums.map((entry) => entry.name);
  const foreignKeyNames = expected.foreignKeys.map((entry) => entry.name);
  const indexNames = expected.indexes.map((entry) => entry.name);

  const [columns, enums, foreignKeys, indexes] = await Promise.all([
    sql.query(
      `
        select
          ns.nspname as schema_name,
          relation.relname as table_name,
          attribute.attname as column_name,
          format_type(attribute.atttypid, attribute.atttypmod) as data_type,
          type_ns.nspname as type_schema,
          type.typname as type_name,
          attribute.attnotnull as not_null,
          pg_get_expr(default_value.adbin, default_value.adrelid) as default_expr,
          exists (
            select 1
            from pg_constraint primary_key
            where primary_key.contype = 'p'
              and primary_key.conrelid = relation.oid
              and attribute.attnum = any(primary_key.conkey)
          ) as primary_key
        from pg_attribute attribute
        join pg_class relation on relation.oid = attribute.attrelid
        join pg_namespace ns on ns.oid = relation.relnamespace
        join pg_type type on type.oid = attribute.atttypid
        join pg_namespace type_ns on type_ns.oid = type.typnamespace
        left join pg_attrdef default_value
          on default_value.adrelid = relation.oid
          and default_value.adnum = attribute.attnum
        where ns.nspname = 'public'
          and relation.relkind in ('r', 'p')
          and relation.relname = any($1::text[])
          and attribute.attnum > 0
          and not attribute.attisdropped
        order by relation.relname, attribute.attnum
      `,
      [tableNames],
    ),
    sql.query(
      `
        select
          ns.nspname as schema_name,
          type.typname as enum_name,
          jsonb_agg(enum.enumlabel order by enum.enumsortorder) as enum_values
        from pg_type type
        join pg_namespace ns on ns.oid = type.typnamespace
        join pg_enum enum on enum.enumtypid = type.oid
        where ns.nspname = 'public'
          and type.typname = any($1::text[])
        group by ns.nspname, type.typname
        order by type.typname
      `,
      [enumNames],
    ),
    sql.query(
      `
        select
          source_ns.nspname as schema_name,
          source.relname as table_name,
          foreign_key.conname as constraint_name,
          target_ns.nspname as referenced_schema,
          target.relname as referenced_table,
          (
            select jsonb_agg(source_attribute.attname order by key.position)
            from unnest(foreign_key.conkey) with ordinality as key(attnum, position)
            join pg_attribute source_attribute
              on source_attribute.attrelid = source.oid
              and source_attribute.attnum = key.attnum
          ) as columns_from,
          (
            select jsonb_agg(target_attribute.attname order by key.position)
            from unnest(foreign_key.confkey) with ordinality as key(attnum, position)
            join pg_attribute target_attribute
              on target_attribute.attrelid = target.oid
              and target_attribute.attnum = key.attnum
          ) as columns_to,
          foreign_key.confdeltype as on_delete,
          foreign_key.confupdtype as on_update
        from pg_constraint foreign_key
        join pg_class source on source.oid = foreign_key.conrelid
        join pg_namespace source_ns on source_ns.oid = source.relnamespace
        join pg_class target on target.oid = foreign_key.confrelid
        join pg_namespace target_ns on target_ns.oid = target.relnamespace
        where foreign_key.contype = 'f'
          and source_ns.nspname = 'public'
          and foreign_key.conname = any($1::text[])
        order by foreign_key.conname
      `,
      [foreignKeyNames],
    ),
    sql.query(
      `
        select
          ns.nspname as schema_name,
          relation.relname as table_name,
          index_relation.relname as index_name,
          index.indisunique as is_unique,
          access_method.amname as method,
          (
            select jsonb_agg(
              pg_get_indexdef(index.indexrelid, position, true)
              order by position
            )
            from generate_series(1, index.indnkeyatts::integer) as position
          ) as key_expressions,
          pg_get_expr(index.indpred, index.indrelid) as predicate
        from pg_index index
        join pg_class index_relation on index_relation.oid = index.indexrelid
        join pg_class relation on relation.oid = index.indrelid
        join pg_namespace ns on ns.oid = relation.relnamespace
        join pg_am access_method on access_method.oid = index_relation.relam
        where ns.nspname = 'public'
          and index_relation.relname = any($1::text[])
        order by index_relation.relname
      `,
      [indexNames],
    ),
  ]);

  return { columns, enums, foreignKeys, indexes };
}

function findRow(rows, predicate) {
  return rows.find(predicate);
}

function foreignKeyAction(code) {
  return {
    a: "no action",
    c: "cascade",
    d: "set default",
    n: "set null",
    r: "restrict",
  }[code];
}

export function assertBaselineMatchesSnapshot(snapshot, catalog) {
  const expected = expectedBaseline(snapshot);
  const mismatches = [];

  for (const table of expected.tables) {
    for (const column of Object.values(table.columns)) {
      const actual = findRow(
        catalog.columns,
        (row) =>
          row.schema_name === table.schema &&
          row.table_name === table.name &&
          row.column_name === column.name,
      );
      const label = `${table.schema}.${table.name}.${column.name}`;
      if (!actual) {
        mismatches.push(`${label} is missing`);
        continue;
      }

      const expectedTypeSchema = column.typeSchema ?? "pg_catalog";
      const enumType = column.typeSchema ? column.type : null;
      if (
        actual.data_type !== column.type ||
        actual.type_schema !== expectedTypeSchema
      ) {
        mismatches.push(`${label} has the wrong type`);
      }
      if (Boolean(actual.not_null) !== Boolean(column.notNull)) {
        mismatches.push(`${label} has the wrong nullability`);
      }
      if (Boolean(actual.primary_key) !== Boolean(column.primaryKey)) {
        mismatches.push(`${label} has the wrong primary-key membership`);
      }
      if (
        normalizedDefault(actual.default_expr, enumType) !==
        normalizedDefault(column.default, enumType)
      ) {
        mismatches.push(`${label} has the wrong default`);
      }
    }
  }

  for (const enumDefinition of expected.enums) {
    const actual = findRow(
      catalog.enums,
      (row) =>
        row.schema_name === enumDefinition.schema &&
        row.enum_name === enumDefinition.name,
    );
    const label = `${enumDefinition.schema}.${enumDefinition.name}`;
    if (!actual) {
      mismatches.push(`${label} is missing`);
    } else if (
      JSON.stringify(actual.enum_values) !== JSON.stringify(enumDefinition.values)
    ) {
      mismatches.push(`${label} has the wrong labels or ordering`);
    }
  }

  for (const foreignKey of expected.foreignKeys) {
    const actual = findRow(
      catalog.foreignKeys,
      (row) =>
        row.schema_name === foreignKey.schema &&
        row.table_name === foreignKey.tableFrom &&
        row.constraint_name === foreignKey.name,
    );
    const label = `${foreignKey.schema}.${foreignKey.name}`;
    if (!actual) {
      mismatches.push(`${label} is missing`);
      continue;
    }
    if (
      actual.referenced_schema !== foreignKey.referencedSchema ||
      actual.referenced_table !== foreignKey.tableTo ||
      JSON.stringify(actual.columns_from) !== JSON.stringify(foreignKey.columnsFrom) ||
      JSON.stringify(actual.columns_to) !== JSON.stringify(foreignKey.columnsTo) ||
      foreignKeyAction(actual.on_delete) !== foreignKey.onDelete ||
      foreignKeyAction(actual.on_update) !== foreignKey.onUpdate
    ) {
      mismatches.push(`${label} has the wrong foreign-key definition`);
    }
  }

  for (const index of expected.indexes) {
    const actual = findRow(
      catalog.indexes,
      (row) =>
        row.schema_name === index.schema &&
        row.table_name === index.tableName &&
        row.index_name === index.name,
    );
    const label = `${index.schema}.${index.name}`;
    if (!actual) {
      mismatches.push(`${label} is missing`);
      continue;
    }
    const expectedKeys = index.columns.map((column) =>
      normalizedIdentifier(column.expression),
    );
    const actualKeys = actual.key_expressions.map(normalizedIdentifier);
    if (
      Boolean(actual.is_unique) !== Boolean(index.isUnique) ||
      actual.method !== index.method ||
      JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys) ||
      !predicatesMatch(index.where, actual.predicate)
    ) {
      mismatches.push(`${label} has the wrong index definition`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Existing verification schema does not match migration 0000; refusing to baseline:\n- ${mismatches.join("\n- ")}`,
    );
  }
}
