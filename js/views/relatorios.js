import { applyFilters, periodoAnterior, kpis, countBy, performance, taskStats, groupBy, stats, rate, motivoDemoraAcima, DAY } from "../core/metrics.js";
import { gerarInsights } from "../core/insights.js";
import { label, PRIORIDADES, TIPOS_TEMPO } from "../core/taxonomy.js";
import { icon, toast } from "../ui/components.js";
import { exportarCSV, exportarExcel, exportarPDF } from "../services/export.js";
import { esc, fmtNum, fmtPct, fmtDur, fmtDate, fmtDateTime, toDateInput } from "../ui/format.js";
import { linhaExport, COLUNAS_EXPORT } from "./pedidos.js";

const TIPOS = [
  ["diario", "Diário", "Um dia: volume, status, SLA e pedidos do dia"],
  ["semanal", "Semanal", "Sete dias até a data escolhida, com comparação"],
  ["mensal", "Mensal", "Mês completo, com evolução e comparação"],
  ["equipe", "Por equipe", "Volume, velocidade e eficácia de cada equipe"],
  ["responsavel", "Por responsável", "Mesmos indicadores, por pessoa, com contexto"],
  ["sla", "SLA", "Cumprimento por prioridade e equipe, e violações"],
  ["gargalos", "Gargalos", "Etapas, motivos de demora, paradas e esforço"],
  ["motivos", "Motivos", "Motivos de abertura, categorias e motivos de demora"],
  ["eficacia", "Eficácia", "Tarefas que resolvem, primeira intervenção e retrabalho"],
];
let tipo = "semanal";
let dataRef = null;
let atual = null;

const h = (ms) => (ms == null ? "" : fmtDur(ms));
const pct = (r) => fmtPct(r, 1);

function janela(t, ref) {
  const d = new Date(ref); d.setHours(0, 0, 0, 0);
  if (t === "diario") return [d.getTime(), d.getTime() + DAY - 1];
  if (t === "semanal") return [d.getTime() - 6 * DAY, d.getTime() + DAY - 1];
  const ini = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
  return [ini, fim];
}

function resumoKpis(k) {
  return [
    ["Total de pedidos", fmtNum(k.total)], ["Novos na fila", fmtNum(k.novos)], ["Em andamento", fmtNum(k.andamento)], ["Concluídos", fmtNum(k.concluidos)],
    ["Atrasados (abertos com SLA estourado)", fmtNum(k.atrasados)], ["Tempo médio de atendimento (ativo)", h(k.trabalho.mean)],
    ["Tempo médio até 1ª interação", h(k.primeira.mean)], ["Tempo médio até resolução (total)", h(k.resolucao.mean)],
    ["Tempo mediano até resolução (sem pausas)", h(k.resolucaoSla.median)], ["Dentro do SLA", pct(k.slaDentro)], ["Fora do SLA", pct(k.slaFora)],
    ["Taxa de retrabalho", pct(k.retrabalho)], ["Resolução eficaz", pct(k.eficaz)], ["Resolução na 1ª intervenção", pct(k.fcr)],
  ];
}
const secDim = (titulo, lista, key, tipoLabel) => ({
  titulo, colunas: [titulo.replace("Por ", "").replace(/^./, (c) => c.toUpperCase()), "Pedidos", "%", "Concluídos", "Dentro do SLA", "Resolução mediana"],
  linhas: countBy(lista, key).map((g) => {
    const c = g.items.filter((p) => p.concluido), s = g.items.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado");
    return [g.k === "__vazio" ? "(não informado)" : tipoLabel ? label(tipoLabel, g.k) : g.k, g.n, pct(g.n / lista.length), c.length, pct(rate(s.filter((p) => p.slaStatus === "cumprido").length, s.length)), h(stats(c.map((p) => p.total)).median)];
  }),
});
const secPerf = (titulo, linhas) => ({
  titulo, colunas: [titulo.includes("equipe") ? "Equipe" : "Responsável", "Pedidos", "Concluídos", "Tarefas", "Esforço (h)", "Atendimento (med.)", "Resolução s/ pausa (med.)", "Índice de ritmo", "SLA", "1ª intervenção", "Retrabalho", "Eficaz", "Mix complexo", "Amostra"],
  linhas: linhas.map((r) => [r.k, r.n, r.concluidos, r.tarefas, r.esforcoH.toFixed(1).replace(".", ","), h(r.trabalhoMed), h(r.resolucaoMed), r.indiceRitmo == null ? "" : r.indiceRitmo.toFixed(2).replace(".", ","), pct(r.sla), pct(r.fcr), pct(r.retrabalho), pct(r.eficaz), pct(r.mixComplexo), r.amostraOk ? "ok" : "pequena"]),
});
const secComp = (lista) => {
  const t = { fila: 0, trabalho: 0, espera_interna: 0, espera_externa: 0 };
  lista.forEach((p) => Object.keys(t).forEach((k) => (t[k] += p.tempo[k])));
  const tot = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  return { titulo: "Composição do tempo", colunas: ["Tipo de tempo", "Horas somadas", "% do total", "Descrição"], linhas: TIPOS_TEMPO.map((x) => [x.rotulo, (t[x.id] / 3600e3).toFixed(1).replace(".", ","), pct(t[x.id] / tot), x.desc]) };
};

function gerar(ctx) {
  const { S, f, regras } = ctx;
  let ini = f.inicio, fim = f.fim;
  if (["diario", "semanal", "mensal"].includes(tipo)) [ini, fim] = janela(tipo, dataRef || Date.now());
  const filtro = { ...f, inicio: ini, fim };
  const lista = applyFilters(S.E, filtro);
  const prev = applyFilters(S.E, periodoAnterior(filtro));
  const ids = new Set(lista.map((p) => p.id));
  const tarefas = S.raw.tarefas.filter((t) => ids.has(t.pedidoId));
  const k = kpis(lista), kp = kpis(prev);
  const nome = TIPOS.find((t) => t[0] === tipo)[1];
  const sub = `Pedidos abertos entre ${fmtDate(ini)} e ${fmtDate(fim)} · ${fmtNum(lista.length)} pedido(s) · gerado em ${fmtDateTime(Date.now())}`;
  const notas = [
    ...gerarInsights(lista, prev, S.raw.tarefas, regras).map((i) => `• ${i.texto} (n=${i.base})`),
    "Tempo de atendimento = status ativos; espera = aguardando solicitante, terceiros, outra equipe ou desenvolvimento; esforço = soma das tarefas registradas.",
    `SLA considera ${regras.sla.horarioComercial.ativo ? "horário comercial" : "tempo corrido"} e pausa nos status: ${regras.sla.statusQuePausam.map((s) => label("status", s)).join(", ") || "nenhum"}.`,
  ];
  const listaPedidos = { titulo: "Pedidos", colunas: COLUNAS_EXPORT, linhas: lista.slice().sort((a, b) => a.abertura - b.abertura).map(linhaExport) };
  const base = { titulo: `Relatório ${nome.toLowerCase()} N2`, subtitulo: sub, notas };
  const comparativo = [["Total (período anterior)", fmtNum(kp.total)], ["Dentro do SLA (período anterior)", pct(kp.slaDentro)], ["Retrabalho (período anterior)", pct(kp.retrabalho)]];
  const md = motivoDemoraAcima(lista, regras.limiteDemoraHoras);

  switch (tipo) {
    case "diario": case "semanal": case "mensal":
      return { ...base, resumo: [...resumoKpis(k), ...comparativo], secoes: [secComp(lista), secDim("Por status", lista, "status", "status"), secDim("Por responsável", lista, "responsavel"), secDim("Por equipe", lista, "equipe"), secDim("Por categoria", lista, "categoria", "categoria"), secDim("Por motivo", lista, "motivo"), listaPedidos] };
    case "equipe":
      return { ...base, titulo: "Relatório por equipe N2", resumo: resumoKpis(k), secoes: [secPerf("Desempenho por equipe", performance(lista, tarefas, "equipe", regras)), secDim("Por equipe", lista, "equipe")] };
    case "responsavel":
      return { ...base, titulo: "Relatório por responsável N2", resumo: resumoKpis(k), secoes: [secPerf("Desempenho por responsável", performance(lista, tarefas, "responsavel", regras))], notas: ["Volume, velocidade e eficácia são dimensões separadas. Índice de ritmo compara com a mediana da mesma categoria (1,00 = típico).", ...notas] };
    case "sla": {
      const comSla = (arr) => arr.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado");
      const porPri = PRIORIDADES.map((pr) => { const a = lista.filter((p) => p.prioridade === pr.id), s = comSla(a); return [pr.rotulo, `${regras.sla.alvoHoras[pr.id]} h`, a.length, s.length, pct(rate(s.filter((p) => p.slaStatus === "cumprido").length, s.length)), h(stats(a.filter((p) => p.concluido).map((p) => p.slaMs)).median)]; });
      const viol = lista.filter((p) => p.slaStatus === "violado").sort((a, b) => b.slaPct - a.slaPct);
      return { ...base, titulo: "Relatório de SLA N2", resumo: [["Dentro do SLA", pct(k.slaDentro)], ["Fora do SLA", pct(k.slaFora)], ["Base com SLA definido", fmtNum(k.slaBase)], ["Atrasados em aberto", fmtNum(k.atrasados)], ...comparativo.slice(1, 2)],
        secoes: [{ titulo: "SLA por prioridade", colunas: ["Prioridade", "Alvo", "Pedidos", "Com SLA definido", "Dentro do SLA", "Tempo SLA mediano"], linhas: porPri }, secDim("Por equipe", lista, "equipe"),
          { titulo: "Pedidos fora do SLA", colunas: ["Pedido", "Motivo", "Prioridade", "Responsável", "Status", "Tempo SLA", "Alvo", "% consumido", "Motivo da demora"], linhas: viol.map((p) => [p.protocolo, p.titulo, label("prioridade", p.prioridade), p.responsavel, label("status", p.status), h(p.slaMs), h(p.alvoMs), pct(p.slaPct), label("motivoDemora", p.motivoDemora)]) }] };
    }
    case "gargalos": {
      const porStatus = {};
      lista.forEach((p) => Object.entries(p.porStatus).forEach(([s, ms]) => (porStatus[s] = (porStatus[s] || 0) + ms)));
      const tot = Object.values(porStatus).reduce((a, b) => a + b, 0) || 1;
      const parados = S.E.filter((p) => p.parado).sort((a, b) => b.paradoMs - a.paradoMs);
      return { ...base, titulo: "Relatório de gargalos N2", resumo: [["Parados agora", fmtNum(parados.length)], ["Atrasados agora", fmtNum(S.E.filter((p) => p.atrasado).length)], [`Pedidos acima de ${regras.limiteDemoraHoras}h`, fmtNum(md.base)]],
        secoes: [
          { titulo: "Tempo por etapa", colunas: ["Status", "Horas somadas", "% do tempo"], linhas: Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([s, ms]) => [label("status", s), (ms / 3600e3).toFixed(1).replace(".", ","), pct(ms / tot)]) },
          { titulo: `Motivos de demora acima de ${regras.limiteDemoraHoras}h`, colunas: ["Motivo da demora", "Pedidos", "% da base", "Inferidos automaticamente"], linhas: md.grupos.map((g) => [g.k === "__vazio" ? "(sem motivo)" : label("motivoDemora", g.k), g.n, pct(g.n / md.base), g.items.filter((p) => p.motivoDemoraOrigem === "inferido").length]) },
          { titulo: "Esforço por tipo de tarefa", colunas: ["Tarefa", "Execuções", "Horas", "Mediana (min)", "% do esforço"], linhas: taskStats(tarefas).map((t) => [label("tipoTarefa", t.tipo), t.n, (t.totalMin / 60).toFixed(1).replace(".", ","), Math.round(t.medianaMin), pct(t.share)]) },
          secDim("Por cliente", lista, "cliente"),
          { titulo: "Pedidos parados", colunas: ["Pedido", "Motivo", "Status", "Sem movimentação", "Responsável"], linhas: parados.map((p) => [p.protocolo, p.titulo, label("status", p.status), h(p.paradoMs), p.responsavel]) },
        ] };
    }
    case "motivos": {
      const porMot = [...groupBy(lista, (p) => p.motivo)].map(([m, v]) => { const c = v.filter((p) => p.concluido); const cat = countBy(v, "categoria")[0]; return [m, v.length, pct(v.length / lista.length), label("categoria", cat?.k === "__vazio" ? null : cat?.k), h(stats(c.map((p) => p.total)).median), pct(rate(v.filter((p) => p.retrabalho).length, v.length)), pct(rate(c.filter((p) => p.fcr).length, c.length))]; }).sort((a, b) => b[1] - a[1]);
      return { ...base, titulo: "Relatório de motivos N2", resumo: resumoKpis(k).slice(0, 4),
        secoes: [{ titulo: "Motivos de abertura", colunas: ["Motivo", "Pedidos", "%", "Categoria predominante", "Resolução mediana", "Retrabalho", "1ª intervenção"], linhas: porMot }, secDim("Por categoria", lista, "categoria", "categoria"), secDim("Por motivo da demora", lista, "motivoDemora", "motivoDemora"), secDim("Por produto", lista, "produto")] };
    }
    case "eficacia": {
      const cat = [...groupBy(lista, (p) => p.categoria)].map(([c, v]) => { const cc = v.filter((p) => p.concluido); return [label("categoria", c === "__vazio" ? null : c), v.length, pct(rate(cc.filter((p) => p.fcr).length, cc.length)), pct(rate(cc.filter((p) => p.eficaz).length, cc.length)), pct(rate(v.filter((p) => p.retrabalho).length, v.length))]; });
      return { ...base, titulo: "Relatório de eficácia N2", resumo: [["Resolução na 1ª intervenção", pct(k.fcr)], ["Resolução eficaz", pct(k.eficaz)], ["Taxa de retrabalho", pct(k.retrabalho)], ["Pedidos com tarefas registradas", pct(rate(k.comTarefas, k.total))]],
        secoes: [{ titulo: "Eficácia por tarefa", colunas: ["Tarefa", "Execuções", "Com resultado", "Identificou ou resolveu", "Resolveu", "Tempo mediano (min)"], linhas: taskStats(tarefas).map((t) => [label("tipoTarefa", t.tipo), t.n, t.nRes, pct(t.identificou), pct(t.resolveu), Math.round(t.medianaMin)]) },
          { titulo: "Eficácia por categoria", colunas: ["Categoria", "Pedidos", "1ª intervenção", "Eficaz", "Retrabalho"], linhas: cat }] };
    }
  }
}

export function render(el, ctx) {
  const ehPeriodo = ["diario", "semanal", "mensal"].includes(tipo);
  atual = gerar(ctx);
  el.innerHTML = `
  <section class="panel"><div class="panel-b" style="display:grid;gap:14px">
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px">
      ${TIPOS.map(([id, nome, d]) => `<button class="kpi" data-tipo="${id}" style="gap:2px;${tipo === id ? "border-color:var(--accent);background:var(--accent-soft)" : ""}" aria-pressed="${tipo === id}"><span style="font-weight:600;color:${tipo === id ? "var(--accent)" : "var(--ink)"}">${nome}</span><span class="small muted">${d}</span></button>`).join("")}
    </div>
    <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      ${ehPeriodo ? `<label class="field">${tipo === "mensal" ? "Mês de referência" : tipo === "semanal" ? "Semana terminando em" : "Dia"}<input type="${tipo === "mensal" ? "month" : "date"}" class="input" id="r-data" value="${tipo === "mensal" ? toDateInput(dataRef || Date.now()).slice(0, 7) : toDateInput(dataRef || Date.now())}"></label>` : `<p class="note" style="margin:0">Usa o período e os filtros selecionados no topo da página.</p>`}
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-exp="csv">${icon("download")} CSV</button>
        <button class="btn" data-exp="xlsx">${icon("download")} Excel</button>
        <button class="btn primary" data-exp="pdf">${icon("download")} PDF</button>
      </div>
    </div>
  </div></section>
  <section class="panel">
    <div class="panel-h"><div><h3 style="font:600 18px var(--cond)">${esc(atual.titulo)}</h3><div class="hint">${esc(atual.subtitulo)}</div></div></div>
    <div class="panel-b" style="display:grid;gap:18px">
      ${atual.resumo?.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 16px">${atual.resumo.map(([r, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line-2);padding:4px 0;font-size:13px"><span class="muted">${esc(r)}</span><b class="num" style="font-weight:600">${esc(v)}</b></div>`).join("")}</div>` : ""}
      ${atual.secoes.map((s) => `<div><h4 style="font:600 13px var(--sans);margin-bottom:6px">${esc(s.titulo)} <span class="muted small">(${fmtNum(s.linhas.length)} linha${s.linhas.length === 1 ? "" : "s"}${s.linhas.length > 15 ? ", prévia das 15 primeiras" : ""})</span></h4>
        <div class="table-wrap"><table class="t"><thead><tr>${s.colunas.slice(0, 12).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${s.linhas.slice(0, 15).map((l) => `<tr>${l.slice(0, 12).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${s.colunas.length}"><div class="empty">Sem dados.</div></td></tr>`}</tbody></table></div></div>`).join("")}
      <div class="note">${atual.notas.map(esc).join("<br>")}</div>
    </div>
  </section>`;

  el.querySelectorAll("[data-tipo]").forEach((b) => (b.onclick = () => { tipo = b.dataset.tipo; ctx.renderView(); }));
  el.querySelector("#r-data")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    dataRef = new Date(tipo === "mensal" ? `${v}-01T12:00:00` : `${v}T12:00:00`).getTime();
    ctx.renderView();
  });
  el.querySelectorAll("[data-exp]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      if (b.dataset.exp === "csv") exportarCSV(atual);
      else if (b.dataset.exp === "xlsx") await exportarExcel(atual);
      else await exportarPDF(atual);
      toast("Arquivo gerado. Se o download não começar, verifique se o navegador bloqueou.");
    } catch (e) {
      toast(`Falha ao exportar: ${e.message}`, "erro");
    } finally { b.disabled = false; }
  }));
}
