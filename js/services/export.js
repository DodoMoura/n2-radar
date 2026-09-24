// Exportação de relatórios: CSV (nativo), Excel (SheetJS) e PDF (jsPDF + AutoTable).
// As bibliotecas só são baixadas na primeira exportação.
const LIBS = {
  xlsx: ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"],
  pdf: [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  ],
};
const carregados = new Set();
function script(src) {
  if (carregados.has(src)) return Promise.resolve();
  return new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => { carregados.add(src); ok(); };
    s.onerror = () => erro(new Error(`Não foi possível carregar ${src.split("/").slice(-3, -1).join(" ")}. Verifique a conexão.`));
    document.head.appendChild(s);
  });
}
async function lib(nome) {
  for (const src of LIBS[nome]) await script(src);
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// relatorio = { titulo, subtitulo, resumo: [[rotulo, valor]], secoes: [{ titulo, colunas: [..], linhas: [[..]] }], notas: [..] }
export function exportarCSV(rel) {
  const q = (v) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [[rel.titulo], [rel.subtitulo], []];
  if (rel.resumo?.length) { linhas.push(["Indicador", "Valor"]); rel.resumo.forEach((r) => linhas.push(r)); linhas.push([]); }
  rel.secoes.forEach((s) => { linhas.push([s.titulo]); linhas.push(s.colunas); s.linhas.forEach((l) => linhas.push(l)); linhas.push([]); });
  (rel.notas || []).forEach((n) => linhas.push([n]));
  // ; como separador e BOM para abrir corretamente no Excel em pt-BR
  const csv = "﻿" + linhas.map((l) => l.map(q).join(";")).join("\r\n");
  baixar(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slug(rel.titulo)}.csv`);
}

export async function exportarExcel(rel) {
  await lib("xlsx");
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const resumo = [[rel.titulo], [rel.subtitulo], [], ["Indicador", "Valor"], ...(rel.resumo || []), [], ...(rel.notas || []).map((n) => [n])];
  const ws0 = XLSX.utils.aoa_to_sheet(resumo);
  ws0["!cols"] = [{ wch: 48 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws0, "Resumo");
  const usados = new Set(["Resumo"]);
  rel.secoes.forEach((s) => {
    let nome = s.titulo.replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Dados";
    while (usados.has(nome)) nome = nome.slice(0, 26) + usados.size;
    usados.add(nome);
    const ws = XLSX.utils.aoa_to_sheet([s.colunas, ...s.linhas]);
    ws["!cols"] = s.colunas.map((c, i) => ({ wch: Math.min(48, Math.max(String(c).length, ...s.linhas.slice(0, 200).map((l) => String(l[i] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  baixar(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${slug(rel.titulo)}.xlsx`);
}

export async function exportarPDF(rel) {
  await lib("pdf");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const cor = [15, 110, 115];
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(22, 32, 42);
  doc.text(rel.titulo, 40, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(90, 100, 110);
  doc.text(rel.subtitulo, 40, 64);
  let y = 84;
  if (rel.resumo?.length) {
    doc.autoTable({ startY: y, head: [["Indicador", "Valor"]], body: rel.resumo, theme: "grid", styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: cor }, columnStyles: { 0: { cellWidth: 280 } }, tableWidth: 460, margin: { left: 40 } });
    y = doc.lastAutoTable.finalY + 18;
  }
  rel.secoes.forEach((s) => {
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(22, 32, 42);
    doc.text(s.titulo, 40, y);
    doc.autoTable({ startY: y + 6, head: [s.colunas], body: s.linhas.slice(0, 1500), theme: "striped", styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: cor }, margin: { left: 40, right: 40 } });
    y = doc.lastAutoTable.finalY + 22;
  });
  if (rel.notas?.length) {
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90, 100, 110);
    rel.notas.forEach((n) => { const l = doc.splitTextToSize(n, W - 80); doc.text(l, 40, y); y += l.length * 11 + 4; });
  }
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 150, 160);
    doc.text(`N2 Radar · gerado em ${new Date().toLocaleString("pt-BR")} · página ${i} de ${n}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(`${slug(rel.titulo)}.pdf`);
}
