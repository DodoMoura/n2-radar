import { dataTable, icon } from "../ui/components.js";
import { exportarCSV } from "../services/export.js";
import { label } from "../core/taxonomy.js";
import { fmtDateTime, fmtNum } from "../ui/format.js";

export function linhaExport(p) {
  const h = (ms) => (ms == null ? "" : (ms / 3600e3).toFixed(2).replace(".", ","));
  return [
    p.protocolo || p.externalId, p.titulo, p.cliente, label("status", p.status), label("prioridade", p.prioridade), p.responsavel, p.solicitante,
    fmtDateTime(p.abertura), fmtDateTime(p.primeiraInteracao), fmtDateTime(p.fechamento), h(p.primeiraMs), h(p.total),
  ];
}
export const COLUNAS_EXPORT = ["Pedido", "Motivo", "Cliente", "Status", "Urgência", "Analista", "Solicitante (N1)",
  "Abertura", "Assumido em", "Fechamento", "Tempo p/ assumir (h)", "Tempo total (h)"];

export function render(el, ctx) {
  const { lista, ir, colunasPedido, f } = ctx;
  el.innerHTML = `<section class="panel" id="tbl"></section>`;
  dataTable(el.querySelector("#tbl"), {
    linhas: lista, colunas: colunasPedido(false), porPagina: 25, ordenacao: { k: "abertura", dir: -1 },
    buscaFn: (p) => `${p.protocolo} ${p.titulo} ${p.cliente} ${p.responsavel} ${p.solicitante} ${p.externalId}`,
    onRow: (p) => ir(`pedido/${p.id}`),
    extraTools: `<button class="btn sm" data-csv style="margin-left:auto">${icon("download")} Exportar CSV</button>`,
    vazio: "Nenhum pedido com os filtros atuais.",
    onRender: (b, rows) => {
      b.querySelector("[data-csv]").onclick = () => exportarCSV({
        titulo: "Pedidos N2", subtitulo: `${fmtNum(rows.length)} pedidos · abertura entre ${fmtDateTime(f.inicio)} e ${fmtDateTime(f.fim)}`,
        secoes: [{ titulo: "Pedidos", colunas: COLUNAS_EXPORT, linhas: rows.map(linhaExport) }],
      });
    },
  });
}
