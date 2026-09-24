import { dataTable, icon } from "../ui/components.js";
import { exportarCSV } from "../services/export.js";
import { label } from "../core/taxonomy.js";
import { fmtDateTime, fmtNum } from "../ui/format.js";

let escopo = "todos";

export function linhaExport(p) {
  const h = (ms) => (ms == null ? "" : (ms / 3600e3).toFixed(2).replace(".", ","));
  return [
    p.protocolo || p.externalId, p.titulo, p.cliente, p.produto, label("status", p.status), label("prioridade", p.prioridade),
    p.responsavel, p.equipe, label("categoria", p.categoria), label("motivoDemora", p.motivoDemora), p.motivoDemoraOrigem || "",
    fmtDateTime(p.abertura), fmtDateTime(p.primeiraInteracao), fmtDateTime(p.fechamento),
    h(p.total), h(p.tempo.fila), h(p.tempo.trabalho), h(p.tempo.espera_interna), h(p.tempo.espera_externa), h(p.slaMs), h(p.alvoMs),
    p.slaStatus, (p.esforcoMin / 60).toFixed(2).replace(".", ","), p.nTarefas, p.reaberturas, p.retrabalho ? "sim" : "não",
    p.concluido ? (p.fcr ? "sim" : "não") : "", p.concluido ? (p.eficaz ? "sim" : "não") : "", p.escalonado ? "sim" : "não", p.resultadoFinal || "",
  ];
}
export const COLUNAS_EXPORT = ["Pedido", "Motivo", "Cliente", "Produto/módulo", "Status", "Prioridade", "Responsável", "Equipe", "Categoria", "Motivo da demora", "Origem do motivo",
  "Abertura", "1ª interação", "Fechamento", "Tempo total (h)", "Fila (h)", "Em atendimento (h)", "Espera interna (h)", "Espera externa (h)", "Tempo SLA (h)", "Alvo SLA (h)",
  "SLA", "Esforço registrado (h)", "Tarefas", "Reaberturas", "Retrabalho", "1ª intervenção", "Eficaz", "Escalonado", "Resultado"];

export function render(el, ctx) {
  const { lista, ir, colunasPedido, f } = ctx;
  const filtrar = () => (escopo === "abertos" ? lista.filter((p) => p.aberto) : escopo === "atencao" ? lista.filter((p) => p.atrasado || p.parado || p.slaStatus === "risco") : lista);
  el.innerHTML = `<section class="panel" id="tbl"></section>`;
  const box = el.querySelector("#tbl");
  const montar = () => {
    const linhas = filtrar();
    const t = dataTable(box, {
      linhas, colunas: colunasPedido(false), porPagina: 25, ordenacao: { k: "abertura", dir: -1 },
      buscaFn: (p) => `${p.protocolo} ${p.titulo} ${p.cliente} ${p.responsavel} ${p.equipe} ${p.produto} ${p.externalId}`,
      onRow: (p) => ir(`pedido/${p.id}`),
      extraTools: `<div class="seg" role="group" aria-label="Escopo">${[["todos", "Todos"], ["abertos", "Abertos"], ["atencao", "Precisam de atenção"]].map(([v, t]) => `<button data-esc="${v}" aria-pressed="${escopo === v}">${t}</button>`).join("")}</div>
        <button class="btn sm" data-csv style="margin-left:auto">${icon("download")} CSV</button>`,
      vazio: "Nenhum pedido no filtro atual.",
      onRender: (b, rows) => {
        b.querySelectorAll("[data-esc]").forEach((x) => (x.onclick = () => { escopo = x.dataset.esc; montar(); }));
        b.querySelector("[data-csv]").onclick = () => exportarCSV({
          titulo: "Pedidos N2", subtitulo: `${fmtNum(rows.length)} pedidos · abertura entre ${fmtDateTime(f.inicio)} e ${fmtDateTime(f.fim)}`,
          secoes: [{ titulo: "Pedidos", colunas: COLUNAS_EXPORT, linhas: rows.map(linhaExport) }],
        });
      },
    });
    void t;
  };
  montar();
}
