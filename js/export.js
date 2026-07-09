/* Requires the consuming page to load, via <script> tags:
   - https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js        (window.XLSX)
   - https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js  (window.jspdf.jsPDF)
   - https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js
*/

export function exportToCSV(rows, columns, filename) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => `"${String(c.value(r) ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const csv = header + "\n" + body;
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    filename + ".csv",
  );
}

export function exportToExcel(rows, columns, filename, sheetName = "Sheet1") {
  if (!window.XLSX) {
    alert("Excel export library didn't load — check your internet connection.");
    return;
  }
  const data = rows.map((r) =>
    Object.fromEntries(columns.map((c) => [c.label, c.value(r)])),
  );
  const ws = window.XLSX.utils.json_to_sheet(data);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
  window.XLSX.writeFile(wb, filename + ".xlsx");
}

export function exportToPDF(title, rows, columns, filename) {
  if (!window.jspdf) {
    alert("PDF export library didn't load — check your internet connection.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: columns.length > 6 ? "landscape" : "portrait",
  });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleDateString("en-IN")}`, 14, 22);

  doc.autoTable({
    startY: 28,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ""))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [22, 33, 62] },
    alternateRowStyles: { fillColor: [246, 247, 250] },
  });

  doc.save(filename + ".pdf");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
