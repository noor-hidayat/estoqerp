import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn<T> {
  key: keyof T;
  header: string;
  width?: number;
  format?: (value: unknown, row: T) => string | number;
}

export function exportXlsx<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = "Data"
) {
  const data = rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const col of columns) {
      const value = row[col.key];
      out[col.header] = col.format ? col.format(value, row) : String(value ?? "");
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPdf<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  meta: { title: string; subtitle?: string }
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(meta.title, 40, 44);

  if (meta.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 140);
    doc.text(meta.subtitle, 40, 62);
  }

  doc.setFontSize(7);
  doc.setTextColor(160, 160, 170);
  const now = new Date().toLocaleString("id-ID");
  doc.text(`Dicetak: ${now}`, 812 - 40, 44, { align: "right" });

  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: rows.map((row) =>
      columns.map((col) =>
        col.format
          ? String(col.format(row[col.key], row))
          : String(row[col.key] ?? "")
      )
    ),
    startY: 78,
    margin: { left: 40, right: 40 },
    styles: {
      fontSize: 8,
      textColor: [63, 63, 70],
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [247, 247, 248],
    },
  });

  doc.save(`${filename}.pdf`);
}