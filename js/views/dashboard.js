import { kpis, serie, autoGran, bucketStart, countBy, stats, rate, H } from "../core/metrics.js";
import { gerarInsights } from "../core/insights.js";
import { label, TIPOS_TEMPO, PRIORIDADES, TAX } from "../core/taxonomy.js";
import { icon, kpi, deltaTag, barList, stackBar, legend, chart, doughnut, horas, fmtHorasEixo, fmtDurTooltip, toast } from "../ui/components.js";
import { esc, fmtNum, fmtPct, fmtDur, fmtDayShort, fmtMonth } from "../ui/format.js";

let gran = null;
let todasInsights = false;

export function insightsHTML(ins, limite = 4) {
  const icones = { alerta: "alert", positivo: "check", info: "info", dados: "database" };
  const vis = todasInsights ? ins : ins.slice(0, limite);
  return `<div class="insights">${vis.map((i) => `<div class="insight" data-nivel="${i.nivel}">${icon(icones[i.nivel])}<span>${esc(i.texto)}</span><span class="base" title="Pedidos considerados">n=${fmtNum(i.base)}</span></div>`).join("")}</div>`;
}

export function rotuloBucket(t, g) {
  return g === "mes" ? fmtMonth(t) : g === "semana" ? `sem. ${fmtDayShort(t)}` : fmtDayShort(t);
}

export function render(el, ctx) {
  const { lista, prev, f, regras, tarefas, drill, setFiltro } = ctx;
  const k = kpis(lista), kp = kpis(prev);
  const g = gran || autoGran(f);
  const ins = gerarInsights(lista, prev, ctx.S.raw.tarefas, regras);
  const min = regras.amostraMinima;
  const pouco = (n) => (n < min ? `<span class="warn-sample" title="Menos de ${min} pedidos na base">amostra pequena</span>` : "");
  const comp = k.composicao;
  const compTot = Object.values(comp).reduce((a, b) => a + b, 0);

  el.innerHTML = `
  <section class="panel">
    <div class="panel-h"><h3>Leitura do período</h3><span class="hint">Gerada a partir dos dados filtrados, com a base (n) de cada afirmação</span>
      ${ins.length > 4 ? `<div class="tools"><button class="btn ghost sm" data-mais>${todasInsights ? "Mostrar menos" : `Ver todas (${ins.length})`}</button></div>` : ""}</div>
    <div class="panel-b">${insightsHTML(ins)}</div>
  </section>

  <section class="kpis" aria-label="Indicadores">
    ${kpi({ id: "total", rotulo: "Total de pedidos", valor: fmtNum(k.total), delta: deltaTag(k.total, kp.total, { melhorMaior: false }), sub: "abertos no período" })}
    ${kpi({ id: "novos", rotulo: "Novos (na fila)", valor: fmtNum(k.novos), sub: "sem atendimento iniciado", tom: k.novos > 0 ? "" : "" })}
    ${kpi({ id: "andamento", rotulo: "Em andamento", valor: fmtNum(k.andamento), sub: "inclui aguardando" })}
    ${kpi({ id: "concluidos", rotulo: "Concluídos", valor: fmtNum(k.concluidos), delta: deltaTag(k.concluidos, kp.concluidos), sub: fmtPct(rate(k.concluidos, k.total)) + " do total" })}
    ${kpi({ id: "atrasados", rotulo: "Atrasados", valor: fmtNum(k.atrasados), tom: k.atrasados ? "crit" : "ok", sub: `abertos com SLA estourado · ${k.parados} parado(s)` })}
    ${kpi({ id: "trabalho", rotulo: "Tempo médio de atendimento", valor: fmtDur(k.trabalho.mean), delta: deltaTag(k.trabalho.mean, kp.trabalho.mean, { melhorMaior: false }), sub: `mediana ${fmtDur(k.trabalho.median)}`, titulo: "Tempo em status de atendimento ativo (exclui fila e esperas)" })}
    ${kpi({ id: "primeira", rotulo: "Até 1ª interação", valor: fmtDur(k.primeira.mean), delta: deltaTag(k.primeira.mean, kp.primeira.mean, { melhorMaior: false }), sub: `mediana ${fmtDur(k.primeira.median)}` })}
    ${kpi({ id: "resolucao", rotulo: "Até resolução", valor: fmtDur(k.resolucao.mean), delta: deltaTag(k.resolucao.mean, kp.resolucao.mean, { melhorMaior: false }), sub: `mediana ${fmtDur(k.resolucao.median)} · sem pausas ${fmtDur(k.resolucaoSla.median)}`, titulo: "Tempo total da abertura ao fechamento. 'Sem pausas' desconta os status que pausam o SLA." })}
    ${kpi({ id: "sla_ok", rotulo: "Dentro do SLA", valor: fmtPct(k.slaDentro), tom: k.slaDentro >= 0.9 ? "ok" : k.slaDentro >= 0.75 ? "warn" : "crit", delta: deltaTag(k.slaDentro, kp.slaDentro, { pct: true }), sub: `base ${fmtNum(k.slaBase)}`, flag: pouco(k.slaBase) })}
    ${kpi({ id: "sla_fora", rotulo: "Fora do SLA", valor: fmtPct(k.slaFora), tom: k.slaFora > 0.1 ? "crit" : "", delta: deltaTag(k.slaFora, kp.slaFora, { pct: true, melhorMaior: false }), sub: "concluídos fora + abertos atrasados" })}
    ${kpi({ id: "retrabalho", rotulo: "Taxa de retrabalho", valor: fmtPct(k.retrabalho), tom: k.retrabalho > 0.15 ? "warn" : "", delta: deltaTag(k.retrabalho, kp.retrabalho, { pct: true, melhorMaior: false }), sub: `${k.retrabalhoN} pedido(s)`, titulo: "Reabertura, intervenção sem efeito ou marcação manual" })}
    ${kpi({ id: "eficaz", rotulo: "Resolução eficaz", valor: fmtPct(k.eficaz), tom: k.eficaz >= 0.9 ? "ok" : "warn", delta: deltaTag(k.eficaz, kp.eficaz, { pct: true }), sub: `sem reabertura em ${regras.janelaReaberturaDias} dias`, flag: pouco(k.concluidos) })}
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Para onde vai o tempo</h3><span class="hint">Soma do tempo de todos os pedidos filtrados. Trabalho e espera nunca são misturados.</span></div>
    <div class="panel-b" style="display:grid;gap:12px">
      ${stackBar(TIPOS_TEMPO.map((t) => ({ v: comp[t.id], cor: t.cor, rotulo: t.rotulo })), "lg")}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
        ${TIPOS_TEMPO.map((t) => `<div><div class="kpi-l"><i style="width:10px;height:10px;border-radius:2px;background:${t.cor};display:inline-block"></i>${t.rotulo}</div><div style="font:600 20px var(--cond)" class="num">${fmtPct(compTot ? comp[t.id] / compTot : null)}</div><div class="small muted">${esc(t.desc)} · mediana por pedido ${fmtDur(stats(lista.map((p) => p.tempo[t.id]).filter((x) => x > 0)).median)}</div></div>`).join("")}
        <div><div class="kpi-l">Esforço registrado</div><div style="font:600 20px var(--cond)" class="num">${fmtDur(k.esforco.sum * 60e3)}</div><div class="small muted">soma das tarefas em ${fmtNum(k.comTarefas)} pedido(s) · mediana ${fmtDur(k.esforco.median * 60e3)} por pedido</div></div>
      </div>
      <p class="note" style="margin:0">“Em atendimento” é o tempo em que o pedido esteve em status ativo; o esforço registrado é a soma das tarefas lançadas, que mede o trabalho técnico real. Um pedido de 48 h com 36 h aguardando o solicitante aparece aqui como 12 h ativas e 36 h de espera externa.</p>
    </div>
  </section>

  <section class="grid g-7-5">
    <div class="panel">
      <div class="panel-h"><h3>Volume de pedidos</h3><span class="hint">abertos e concluídos por período</span>
        <div class="tools"><div class="seg" role="group" aria-label="Agrupar por">${[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(([v, t]) => `<button data-gran="${v}" aria-pressed="${g === v}">${t}</button>`).join("")}</div></div></div>
      <div class="panel-b"><div class="chart"><canvas id="c-volume" aria-label="Volume de pedidos por período"></canvas></div>
      ${legend([{ cor: "var(--s1)", rotulo: "Abertos" }, { cor: "var(--s3)", rotulo: "Concluídos" }])}</div>
    </div>
    <div class="panel">
      <div class="panel-h"><h3>Pedidos por status</h3><span class="hint">clique para filtrar</span></div>
      <div class="panel-b" style="display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr);gap:16px;align-items:center">
        <div class="chart short" style="height:150px"><canvas id="c-status" aria-label="Pedidos por status"></canvas></div>
        <div data-bl="status"></div>
      </div>
    </div>
  </section>

  <section class="grid g2">
    <div class="panel">
      <div class="panel-h"><h3>SLA cumprido × violado</h3><span class="hint">pedidos com prazo definido, por período de abertura</span></div>
      <div class="panel-b"><div class="chart"><canvas id="c-sla"></canvas></div>${legend([{ cor: "var(--ok)", rotulo: "Cumprido" }, { cor: "var(--crit)", rotulo: "Violado / atrasado" }])}</div>
    </div>
    <div class="panel">
      <div class="panel-h"><h3>Tempo de resolução ao longo do tempo</h3><span class="hint">concluídos, por período de fechamento</span></div>
      <div class="panel-b"><div class="chart"><canvas id="c-tempo"></canvas></div>${legend([{ cor: "var(--s1)", rotulo: "Mediana total" }, { cor: "var(--s2)", rotulo: "Mediana sem pausas (SLA)" }, { cor: "var(--s7)", rotulo: "Média total" }])}</div>
    </div>
  </section>

  <section class="grid g3">
    <div class="panel"><div class="panel-h"><h3>Por responsável</h3><span class="hint">volume, clique para filtrar</span></div><div class="panel-b" data-bl="responsavel"></div></div>
    <div class="panel"><div class="panel-h"><h3>Por equipe</h3></div><div class="panel-b" data-bl="equipe"></div>
      <div class="panel-h" style="padding-top:4px"><h3>Por prioridade</h3></div><div class="panel-b" data-bl="prioridade"></div></div>
    <div class="panel"><div class="panel-h"><h3>Por categoria</h3></div><div class="panel-b" data-bl="categoria"></div></div>
  </section>

  <section class="grid g2">
    <div class="panel"><div class="panel-h"><h3>Por motivo</h3><span class="hint">10 mais frequentes</span></div><div class="panel-b" data-bl="motivo"></div></div>
    <div class="panel"><div class="panel-h"><h3>Evolução da produtividade</h3><span class="hint">concluídos e esforço registrado por pedido concluído</span></div>
      <div class="panel-b"><div class="chart short"><canvas id="c-prod"></canvas></div>
      <div class="chart short" style="margin-top:8px"><canvas id="c-esf"></canvas></div>
      ${legend([{ cor: "var(--s3)", rotulo: "Concluídos" }, { cor: "var(--s7)", rotulo: "Esforço mediano por concluído (h)" }])}</div></div>
  </section>`;

  el.querySelector("[data-mais]")?.addEventListener("click", () => { todasInsights = !todasInsights; ctx.renderView(); });
  el.querySelectorAll("[data-gran]").forEach((b) => (b.onclick = () => { gran = b.dataset.gran; ctx.renderView(); }));

  // KPIs → drill-down
  const conj = {
    total: ["Todos os pedidos", lista], novos: ["Novos na fila", lista.filter((p) => p.status === "novo")],
    andamento: ["Em andamento", lista.filter((p) => p.aberto && p.status !== "novo")], concluidos: ["Concluídos", lista.filter((p) => p.concluido)],
    atrasados: ["Atrasados", lista.filter((p) => p.atrasado)], trabalho: ["Com tempo de atendimento", lista.filter((p) => p.tempo.trabalho > 0)],
    primeira: ["Pedidos no período", lista], resolucao: ["Concluídos", lista.filter((p) => p.concluido)],
    sla_ok: ["Dentro do SLA", lista.filter((p) => p.slaStatus === "cumprido")], sla_fora: ["Fora do SLA", lista.filter((p) => p.slaStatus === "violado")],
    retrabalho: ["Com retrabalho", lista.filter((p) => p.retrabalho)], eficaz: ["Concluídos sem solução eficaz", lista.filter((p) => p.concluido && !p.eficaz)],
  };
  el.querySelectorAll("[data-kpi]").forEach((b) => (b.onclick = () => { const [t, arr] = conj[b.dataset.kpi]; drill(t, arr); }));

  // Listas de barras → filtros
  const cores = { status: null };
  const bl = (dim, tipoLabel, top = 12, ordem) => {
    let g = countBy(lista, dim);
    if (ordem) g = ordem.map((o) => g.find((x) => x.k === o)).filter(Boolean);
    const itens = g.slice(0, top).map((x) => ({ k: x.k, rotulo: x.k === "__vazio" ? "(não informado)" : tipoLabel ? label(tipoLabel, x.k) : x.k, v: x.n, txt: `${fmtNum(x.n)} · ${fmtPct(x.n / lista.length)}` }));
    const box = el.querySelector(`[data-bl="${dim}"]`);
    box.innerHTML = barList(itens, { cor: cores[dim] || "var(--s1)" });
    box.querySelectorAll("[data-drill]").forEach((r) => (r.onclick = () => { setFiltro(dim, [r.dataset.drill]); toast(`Filtro aplicado: ${r.querySelector(".lbl").textContent}`); }));
  };
  bl("status", "status", 12, TAX.status.map((s) => s.id));
  bl("responsavel"); bl("equipe"); bl("prioridade", "prioridade", 4, PRIORIDADES.map((p) => p.id)); bl("categoria", "categoria"); bl("motivo", null, 10);

  // Volume
  const vol = serie(lista, f, g, (p) => p.abertura);
  const concl = serie(lista.filter((p) => p.fechamento && p.concluido), f, g, (p) => p.fechamento);
  const labels = vol.map((b) => rotuloBucket(b.t, g));
  chart(el.querySelector("#c-volume"), {
    labels, datasets: [{ rotulo: "Abertos", dados: vol.map((b) => b.v), cor: "var(--s1)" }, { rotulo: "Concluídos", dados: concl.map((b) => b.v), cor: "var(--s3)", tipo: "line" }],
    onClick: (i) => drill(`Abertos em ${labels[i]}`, lista.filter((p) => bucketStart(p.abertura, g) === vol[i].t)),
  });

  // Status
  const st = countBy(lista, "status");
  const corStatus = (s) => ({ novo: "var(--s7)", em_andamento: "var(--s1)", concluido: "var(--s3)", cancelado: "var(--ink-3)" }[s] || (s.includes("equipe") || s.includes("desenv") ? "var(--s5)" : "var(--s2)"));
  doughnut(el.querySelector("#c-status"), { labels: st.map((x) => label("status", x.k)), valores: st.map((x) => x.n), cores: st.map((x) => corStatus(x.k)), onClick: (i) => setFiltro("status", [st[i].k]) });

  // SLA por período
  const slaS = serie(lista.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado"), f, g, (p) => p.abertura, (arr) => arr);
  chart(el.querySelector("#c-sla"), {
    labels, stacked: true,
    datasets: [{ rotulo: "Cumprido", dados: slaS.map((b) => b.v.filter((p) => p.slaStatus === "cumprido").length), cor: "var(--ok)" }, { rotulo: "Violado", dados: slaS.map((b) => b.v.filter((p) => p.slaStatus === "violado").length), cor: "var(--crit)" }],
    onClick: (i, ds) => drill(`${ds ? "SLA violado" : "SLA cumprido"} · ${labels[i]}`, slaS[i].v.filter((p) => p.slaStatus === (ds ? "violado" : "cumprido"))),
  });

  // Tempo de resolução
  const tr = serie(lista.filter((p) => p.concluido && p.fechamento), f, g, (p) => p.fechamento, (arr) => arr);
  const med = (arr, fn) => (arr.length >= 3 ? horas(stats(arr.map(fn)).median) : null);
  chart(el.querySelector("#c-tempo"), {
    tipo: "line", labels, yFmt: fmtHorasEixo, tooltipFmt: fmtDurTooltip,
    datasets: [
      { rotulo: "Mediana total", dados: tr.map((b) => med(b.v, (p) => p.total)), cor: "var(--s1)" },
      { rotulo: "Mediana sem pausas", dados: tr.map((b) => med(b.v, (p) => p.slaMs)), cor: "var(--s2)" },
      { rotulo: "Média total", dados: tr.map((b) => (b.v.length >= 3 ? horas(stats(b.v.map((p) => p.total)).mean) : null)), cor: "var(--s7)", tracejado: true },
    ],
    onClick: (i) => drill(`Concluídos em ${labels[i]}`, tr[i].v),
  });

  // Produtividade
  const tpp = ctx.S.tarefasPorPedido;
  chart(el.querySelector("#c-prod"), { labels, datasets: [{ rotulo: "Concluídos", dados: tr.map((b) => b.v.length), cor: "var(--s3)" }], onClick: (i) => drill(`Concluídos em ${labels[i]}`, tr[i].v) });
  chart(el.querySelector("#c-esf"), {
    tipo: "line", labels, yFmt: fmtHorasEixo, tooltipFmt: fmtDurTooltip,
    datasets: [{ rotulo: "Esforço mediano", dados: tr.map((b) => { const c = b.v.filter((p) => tpp.has(p.id)); return c.length >= 3 ? +(stats(c.map((p) => p.esforcoMin)).median / 60).toFixed(2) : null; }), cor: "var(--s7)", area: true }],
  });
  void tarefas; void H;
}
