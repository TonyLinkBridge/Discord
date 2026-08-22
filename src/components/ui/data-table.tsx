import type { ReactNode } from "react";
import styles from "./data-table.module.css";

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  render: (row: Row) => ReactNode;
}

export function DataTable<Row extends { id: string }>({
  caption,
  columns,
  emptyMessage,
  rows,
}: Readonly<{
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  emptyMessage: string;
  rows: readonly Row[];
}>) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{caption}</caption>
        <thead>
          <tr>{columns.map((column) => <th key={column.id} scope="col">{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.id}>{column.render(row)}</td>)}
            </tr>
          )) : (
            <tr><td className={styles.empty} colSpan={columns.length}>{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
