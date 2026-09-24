import { performance, serie, autoGran, groupBy, stats, rate } from "../core/metrics.js";
import { label } from "../core/taxonomy.js";
import { dataTable, chart, legend, fmtHorasEixo, fmtDurTooltip, horas } from "../ui/components.js";
import { esc, fmtNum, fmtNum1, fmtPct, fmtDur } from "../ui/format.js";
import { rotuloBucket } from "./dashboard.js";

let dim = "responsavel";
let foco = null;

export function render(el, ctx) {
  const { lista, tarefas, regras, f, drill, setFiltro } = ctx;
  const linhas = performance(lista, tarefas, dim, regras);
  const nomes = linhas.map((l) => l.k);
  if (foco && !nomes.includes(foco)) foco = null;
  const g = autoGran(f);
  const min = regras.amostraMinima;
  const pctCell = (v, bom, n) => (v == null ? "—" : `<span class="minibar"><i style="width:${v * 100}%;background:${bom ? "var(--ok)" : "var(--s1)"}"></i></span>${fmtPct(v)}`);
  const ritmo = (v) => (v == null ? "—" : `<span title="1,00 = ritmo típico da base para o mesmo mix de categorias" style="color:${v > 1.25 ? "var(--warn)" : v < 0.8 ? "var(--ok)" : "inherit"}">${v.toFixed(2).replace(".", ",")}</span>`);

  el.innerHTML = `
  <div class="callout" style="display:grid;gap:4px">
    <b style="color:var(--ink)">Como ler esta página</b>
    <span>Volume, velocidade e eficácia aparecem em blocos separados e não são combinados em uma nota única. Quem resolve mais pedidos não necessariamente tem melhor desempenho: o <b>índice de ritmo</b> compara o tempo de cada pedido com a mediana da mesma categoria (1,00 = típico), e o <b>mix complexo</b> mostra quanto da carga é de categorias mais demoradas que a média. Linhas com menos de ${min} concluídos são marcadas como amostra pequena.</span>
  </div>
  <section class="panel">
    <div class="panel-h"><h3>Comparativo</h3>
      <div class="tools"><div class="seg" role="group" aria-label="Agrupar por">${[["responsavel", "Por responsável"], ["equipe", "Por equipe"]].map(([v, t]) => `<button data-dim="${v}" aria-pressed="${dim === v}">${t}</button>`).join("")}</div></div></div>
    <div id="tbl-perf"></div>
  </section>

  <section class="grid g2">
    <div class="panel">
      <div class="panel-h"><h3>Evolução: concluídos por período</h3>
        <div class="tools"><select class="input" id="sel-foco" style="height:28px" aria-label="Pessoa ou equipe em foco"><option value="">Selecione para comparar</option>${nomes.map((n) => `<option ${foco === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div></div>
      <div class="panel-b"><div class="chart short"><canvas id="c-ev-vol"></canvas></div>${legend(foco ? [{ cor: "var(--s1)", rotulo: foco }] : [{ cor: "var(--s1)", rotulo: "Todos" }])}</div>
    </div>
    <div class="panel">
      <div class="panel-h"><h3>Evolução: resolução mediana sem pausas</h3><span class="hint">horas, concluídos por período de fechamento</span></div>
      <div class="panel-b"><div class="chart short"><canvas id="c-ev-tempo"></canvas></div>${legend([{ cor: "var(--s2)", rotulo: foco || "Todos" }, ...(foco ? [{ cor: "var(--ink-3)", rotulo: "Base geral" }] : [])])}</div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Tempo mediano de resolução por categoria</h3><span class="hint">sem pausas de SLA · células com menos de 3 pedidos ficam em branco</span></div>
    <div class="panel-b table-wrap" id="matriz"></div>
  </section>`;

  el.querySelectorAll("[data-dim]").forEach((b) => (b.onclick = () => { dim = b.dataset.dim; foco = null; ctx.renderView(); }));
  el.querySelector("#sel-foco").onchange = (e) => { foco = e.target.value || null; ctx.renderView(); };

  dataTable(el.querySelector("#tbl-perf"), {
    linhas, busca: false, porPagina: 30, ordenacao: { k: "n", dir: -1 },
    onRow: (r) => drill(`${r.k}`, lista.filter((p) => (p[dim] ?? "__vazio") === r.k)),
    grupos: [{ span: 1 }, { span: 4, rotulo: "Volume" }, { span: 3, rotulo: "Velocidade" }, { span: 4, rotulo: "Eficácia" }, { span: 1, rotulo: "Contexto" }],
    colunas: [
      { k: "k", rotulo: dim === "responsavel" ? "Responsável" : "Equipe", render: (r) => `<b style="font-weight:500">${esc(r.k === "__vazio" ? "(não informado)" : r.k)}</b>${r.amostraOk ? "" : `<div class="warn-sample">amostra pequena</div>`}` },
      { k: "n", rotulo: "Pedidos", n: true, render: (r) => fmtNum(r.n) },
      { k: "concluidos", rotulo: "Concluídos", n: true, render: (r) => fmtNum(r.concluidos) },
      { k: "tarefas", rotulo: "Tarefas", n: true, render: (r) => fmtNum(r.tarefas) },
      { k: "esforcoH", rotulo: "Esforço", n: true, render: (r) => fmtDur(r.esforcoH * 3600e3, true), titulo: "Horas de tarefas registradas" },
      { k: "trabalhoMed", rotulo: "Atendimento", n: true, render: (r) => fmtDur(r.trabalhoMed), titulo: "Mediana do tempo em status de atendimento" },
      { k: "resolucaoMed", rotulo: "Resolução", n: true, render: (r) => fmtDur(r.resolucaoMed), titulo: "Mediana do tempo até resolução, sem pausas de SLA" },
      { k: "indiceRitmo", rotulo: "Índice de ritmo", n: true, render: (r) => ritmo(r.indiceRitmo), titulo: "Tempo ÷ mediana da mesma categoria. Abaixo de 1 = mais rápido que o típico." },
      { k: "sla", rotulo: "SLA", render: (r) => pctCell(r.sla, true) },
      { k: "fcr", rotulo: "1ª intervenção", render: (r) => pctCell(r.fcr, true) },
      { k: "retrabalho", rotulo: "Retrabalho", n: true, render: (r) => fmtPct(r.retrabalho) },
      { k: "eficaz", rotulo: "Eficaz", render: (r) => pctCell(r.eficaz, true) },
      { k: "mixComplexo", rotulo: "Mix complexo", n: true, render: (r) => fmtPct(r.mixComplexo), titulo: "Parcela dos pedidos em categorias com mediana acima da geral" },
    ],
  });

  // evolução
  const sel = foco ? lista.filter((p) => p[dim] === foco) : lista;
  const concl = (arr) => serie(arr.filter((p) => p.concluido && p.fechamento), f, g, (p) => p.fechamento, (a) => a);
  const sSel = concl(sel), sAll = concl(lista);
  const labels = sSel.map((b) => rotuloBucket(b.t, g));
  chart(el.querySelector("#c-ev-vol"), { labels, datasets: [{ rotulo: foco || "Todos", dados: sSel.map((b) => b.v.length), cor: "var(--s1)" }], onClick: (i) => drill(`Concluídos · ${labels[i]}`, sSel[i].v) });
  const med = (b) => (b.v.length >= 3 ? horas(stats(b.v.map((p) => p.slaMs)).median) : null);
  chart(el.querySelector("#c-ev-tempo"), {
    tipo: "line", labels, yFmt: fmtHorasEixo, tooltipFmt: fmtDurTooltip,
    datasets: [{ rotulo: foco || "Todos", dados: sSel.map(med), cor: "var(--s2)" }, ...(foco ? [{ rotulo: "Base geral", dados: sAll.map(med), cor: "var(--ink-3)", tracejado: true }] : [])],
  });

  // matriz pessoa × categoria
  const conclL = lista.filter((p) => p.concluido);
  const cats = [...groupBy(conclL, (p) => p.categoria)].sort((a, b) => b[1].length - a[1].length).map(([k]) => k);
  const grid = new Map([...groupBy(conclL, (p) => p[dim])].map(([k, v]) => [k, groupBy(v, (p) => p.categoria)]));
  const refCat = new Map(cats.map((c) => [c, stats(conclL.filter((p) => (p.categoria ?? "__vazio") === c).map((p) => p.slaMs)).median]));
  const cell = (arr, c) => {
    if (!arr || arr.length < 3) return `<td class="n muted">${arr?.length ? `<span title="n=${arr.length}">·</span>` : ""}</td>`;
    const m = stats(arr.map((p) => p.slaMs)).median, r = m / refCat.get(c);
    const tone = r > 1.3 ? "var(--crit-soft)" : r > 1.1 ? "var(--warn-soft)" : r < 0.8 ? "var(--ok-soft)" : "transparent";
    return `<td class="n" style="background:${tone}" title="n=${arr.length} · ${fmtNum1(r)}× a mediana da categoria">${fmtDur(m)}</td>`;
  };
  el.querySelector("#matriz").innerHTML = `<table class="t"><thead><tr><th>${dim === "responsavel" ? "Responsável" : "Equipe"}</th>${cats.map((c) => `<th class="n">${esc(c === "__vazio" ? "(não classificada)" : label("categoria", c))}</th>`).join("")}</tr></thead>
    <tbody>${[...grid].sort((a, b) => b[1].size - a[1].size).map(([k, m]) => `<tr><td>${esc(k)}</td>${cats.map((c) => cell(m.get(c), c)).join("")}</tr>`).join("")}
    <tr><td><b style="font-weight:500">Mediana geral</b></td>${cats.map((c) => `<td class="n"><b style="font-weight:500">${fmtDur(refCat.get(c))}</b></td>`).join("")}</tr></tbody></table>
    <div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--line)"></i>≥20% mais rápido que a categoria</span><span><i style="background:var(--warn-soft);border:1px solid var(--line)"></i>10–30% mais lento</span><span><i style="background:var(--crit-soft);border:1px solid var(--line)"></i>30%+ mais lento</span></div>`;
  void rate; void setFiltro;
}
