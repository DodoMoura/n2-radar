import { groupBy, stats, rate, taskStats, heatmapSemanaHora, motivoDemoraAcima, H } from "../core/metrics.js";
import { label, statusInfo, TIPOS_TEMPO } from "../core/taxonomy.js";
import { barList, dataTable, pillStatus, pillSla, kpi, toast } from "../ui/components.js";
import { esc, fmtNum, fmtPct, fmtDur } from "../ui/format.js";

const corTipo = Object.fromEntries(TIPOS_TEMPO.map((t) => [t.id, t.cor]));

export function render(el, ctx) {
  const { lista, regras, tarefas, drill, ir, setFiltro, S } = ctx;
  const min = regras.amostraMinima;
  // pedidos parados: todos os abertos, independente do período (backlog real)
  const abertos = S.E.filter((p) => p.aberto);
  const parados = abertos.filter((p) => p.parado).sort((a, b) => b.paradoMs - a.paradoMs);
  const atrasados = abertos.filter((p) => p.atrasado);
  const risco = abertos.filter((p) => p.slaStatus === "risco");
  const tempoTot = lista.reduce((a, p) => a + p.total, 0);
  const espera = lista.reduce((a, p) => a + p.tempo.espera_externa + p.tempo.espera_interna, 0);

  // etapas
  const porStatus = {};
  const cont = {};
  lista.forEach((p) => Object.entries(p.porStatus).forEach(([s, ms]) => { porStatus[s] = (porStatus[s] || 0) + ms; (cont[s] = cont[s] || []).push(ms); }));
  const etapas = Object.entries(porStatus).sort((a, b) => b[1] - a[1]);
  const somaEtapas = etapas.reduce((a, b) => a + b[1], 0);

  // motivos de atraso
  const md = motivoDemoraAcima(lista, regras.limiteDemoraHoras);
  const mdClass = md.grupos.filter((g) => g.k !== "__vazio");
  const semMotivo = md.grupos.find((g) => g.k === "__vazio")?.n || 0;
  const baseClass = md.base - semMotivo;

  // categorias lentas
  const concl = lista.filter((p) => p.concluido);
  const cats = [...groupBy(concl, (p) => p.categoria)].map(([k, v]) => ({ k, n: v.length, med: stats(v.map((p) => p.slaMs)).median, medTot: stats(v.map((p) => p.total)).median })).sort((a, b) => b.med - a.med);

  // clientes (Pareto)
  const cli = [...groupBy(lista, (p) => p.cliente)].map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n);
  let acum = 0;
  const cliTop = cli.slice(0, 10).map((c) => { acum += c.n; return { ...c, acum: acum / lista.length }; });

  // tarefas
  const ts = taskStats(tarefas);

  // retrabalho e escalonamento por motivo
  const porMotivo = [...groupBy(lista, (p) => p.motivo)].map(([k, v]) => ({ k, n: v.length, retr: rate(v.filter((p) => p.retrabalho).length, v.length), esc: rate(v.filter((p) => p.escalonado).length, v.length) }));
  const retr = porMotivo.filter((x) => x.n >= min).sort((a, b) => b.retr - a.retr).slice(0, 8);
  const esc_ = porMotivo.filter((x) => x.n >= min).sort((a, b) => b.esc - a.esc).slice(0, 8);

  const heat = heatmapSemanaHora(lista);
  const maxHeat = Math.max(1, ...heat.flat());
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const ordemDias = [1, 2, 3, 4, 5, 6, 0];
  const picoDia = ordemDias.map((d) => [d, heat[d].reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1])[0];
  const porHora = Array.from({ length: 24 }, (_, h) => heat.reduce((a, r) => a + r[h], 0));
  const picoHora = porHora.indexOf(Math.max(...porHora));
  const seq = (v) => { const r = v / maxHeat; return v === 0 ? "var(--surface-3)" : `var(--seq-${Math.min(5, 1 + Math.floor(r * 4.99))})`; };

  el.innerHTML = `
  <section class="kpis">
    ${kpi({ id: "parados", rotulo: "Parados agora", valor: fmtNum(parados.length), tom: parados.length ? "crit" : "ok", sub: `abertos sem movimentação há mais de ${regras.paradoHoras}h` })}
    ${kpi({ id: "atrasados", rotulo: "Atrasados agora", valor: fmtNum(atrasados.length), tom: atrasados.length ? "crit" : "ok", sub: "SLA estourado, ainda abertos" })}
    ${kpi({ id: "risco", rotulo: "Em risco", valor: fmtNum(risco.length), tom: risco.length ? "warn" : "", sub: `acima de ${regras.sla.riscoPercentual}% do SLA` })}
    ${kpi({ id: "espera", rotulo: "Tempo em espera", valor: fmtPct(tempoTot ? espera / tempoTot : null), sub: "do tempo total no período", tom: espera / tempoTot > 0.5 ? "warn" : "" })}
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Demandas paradas</h3><span class="hint">todos os pedidos abertos, independente do período, ordenados pelo tempo sem movimentação</span></div>
    <div id="tbl-parados"></div>
  </section>

  <section class="grid g2">
    <div class="panel"><div class="panel-h"><h3>Etapas que concentram tempo</h3><span class="hint">horas somadas por status · clique para ver os pedidos</span></div>
      <div class="panel-b" data-b="etapas"></div></div>
    <div class="panel"><div class="panel-h"><h3>Motivos que mais geram atraso</h3><span class="hint">pedidos acima de ${regras.limiteDemoraHoras}h · clique para filtrar</span></div>
      <div class="panel-b">
        ${baseClass >= min ? `<p style="margin:0 0 10px;font-size:13.5px">${fmtPct(mdClass[0].n / baseClass)} das demandas acima de ${regras.limiteDemoraHoras}h tiveram como motivo principal <b>“${esc(label("motivoDemora", mdClass[0].k))}”</b>.</p>` : `<p class="note" style="margin:0 0 10px">Poucos pedidos classificados acima de ${regras.limiteDemoraHoras}h para uma conclusão (${baseClass}).</p>`}
        <div data-b="motivos"></div>
        <p class="note" style="margin:10px 0 0">${fmtNum(md.base)} pedido(s) acima de ${regras.limiteDemoraHoras}h; ${fmtNum(semMotivo)} sem motivo identificado. Motivos inferidos vêm do status de espera mais longo e podem ser corrigidos na página do pedido.</p>
      </div></div>
  </section>

  <section class="grid g2">
    <div class="panel"><div class="panel-h"><h3>Categorias com maior tempo de resolução</h3><span class="hint">mediana sem pausas de SLA, concluídos</span></div><div class="panel-b" data-b="cats"></div></div>
    <div class="panel"><div class="panel-h"><h3>Tipos de tarefa que mais consomem tempo</h3><span class="hint">horas registradas no período</span></div><div class="panel-b" data-b="tarefas"></div></div>
  </section>

  <section class="grid g3">
    <div class="panel"><div class="panel-h"><h3>Clientes com mais pedidos</h3><span class="hint">participação acumulada</span></div><div class="panel-b" data-b="clientes"></div></div>
    <div class="panel"><div class="panel-h"><h3>Maior índice de retrabalho</h3><span class="hint">por motivo, mínimo ${min} pedidos</span></div><div class="panel-b" data-b="retr"></div></div>
    <div class="panel"><div class="panel-h"><h3>Mais escalonados</h3><span class="hint">foram para outra equipe ou desenvolvimento</span></div><div class="panel-b" data-b="esc"></div></div>
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Concentração de pedidos por dia e horário</h3><span class="hint">abertura dos pedidos no período · pico: ${dias[picoDia[0]]} às ${picoHora}h</span></div>
    <div class="panel-b heat-wrap"><div class="heat">
      <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hl">${h % 3 === 0 ? h : ""}</span>`).join("")}
      ${ordemDias.map((d) => `<span>${dias[d]}</span>${heat[d].map((v, h) => `<span class="c" style="background:${seq(v)}" title="${dias[d]} ${h}h: ${v} pedido(s)"></span>`).join("")}`).join("")}
    </div>
    <div class="legend"><span>Menos</span>${[0, 1, 2, 3, 4, 5].map((i) => `<span><i style="background:var(--seq-${i})"></i></span>`).join("")}<span>Mais (máx. ${maxHeat} por célula)</span></div></div>
  </section>`;

  el.querySelectorAll("[data-kpi]").forEach((b) => (b.onclick = () => {
    const m = { parados: ["Parados", parados], atrasados: ["Atrasados", atrasados], risco: ["Em risco", risco], espera: ["Pedidos com espera", lista.filter((p) => p.tempo.espera_externa + p.tempo.espera_interna > 0)] }[b.dataset.kpi];
    drill(m[0], m[1]);
  }));

  dataTable(el.querySelector("#tbl-parados"), {
    linhas: parados, porPagina: 10, ordenacao: { k: "paradoMs", dir: -1 }, busca: parados.length > 10,
    buscaFn: (p) => `${p.protocolo} ${p.titulo} ${p.responsavel} ${p.cliente}`,
    vazio: `Nenhum pedido aberto está parado há mais de ${regras.paradoHoras}h.`, onRow: (p) => ir(`pedido/${p.id}`),
    colunas: [
      { k: "protocolo", rotulo: "Pedido", render: (p) => `<span class="mono">${esc(p.protocolo)}</span>` },
      { k: "titulo", rotulo: "Motivo", render: (p) => `${esc(p.titulo)}<div class="small muted">${esc(p.cliente || "")}</div>` },
      { k: "status", rotulo: "Status atual", render: (p) => pillStatus(p.status) },
      { k: "paradoMs", rotulo: "Sem movimentação", n: true, render: (p) => `<b>${fmtDur(p.paradoMs)}</b>` },
      { k: "slaPct", rotulo: "SLA", render: pillSla },
      { k: "responsavel", rotulo: "Responsável" },
    ],
  });

  const put = (k, html, onClick) => {
    const b = el.querySelector(`[data-b="${k}"]`);
    b.innerHTML = html;
    if (onClick) b.querySelectorAll("[data-drill]").forEach((r) => (r.onclick = () => onClick(r.dataset.drill)));
  };
  put("etapas", barList(etapas.map(([s, ms]) => ({ k: s, rotulo: label("status", s), v: ms, cor: corTipo[statusInfo(s).tipo], txt: `${fmtPct(ms / somaEtapas)} · med. ${fmtDur(stats(cont[s]).median)}` }))),
    (s) => drill(`Passaram por “${label("status", s)}”`, lista.filter((p) => p.porStatus[s] > 0)));
  put("motivos", barList(mdClass.slice(0, 10).map((g) => ({ k: g.k, rotulo: label("motivoDemora", g.k), v: g.n, cor: "var(--s2)", txt: `${fmtNum(g.n)} · ${fmtPct(g.n / baseClass)}` }))),
    (k) => { setFiltro("motivoDemora", [k]); toast(`Filtro aplicado: ${label("motivoDemora", k)}`); });
  put("cats", barList(cats.map((c) => ({ k: c.k, rotulo: `${c.k === "__vazio" ? "(não classificada)" : label("categoria", c.k)}${c.n < min ? " *" : ""}`, v: c.med, cor: c.n < min ? "var(--ink-3)" : "var(--s1)", txt: `${fmtDur(c.med)} · n=${c.n}`, sub: `total mediano ${fmtDur(c.medTot)}` }))) + (cats.some((c) => c.n < min) ? `<p class="note" style="margin:8px 0 0">* amostra menor que ${min}; valor pouco confiável.</p>` : ""),
    (k) => drill(`Concluídos · ${label("categoria", k)}`, concl.filter((p) => (p.categoria ?? "__vazio") === k)));
  put("tarefas", barList(ts.slice(0, 10).map((t) => ({ k: t.tipo, rotulo: label("tipoTarefa", t.tipo), v: t.totalMin, cor: "var(--s3)", txt: `${fmtDur(t.totalMin * 60e3, true)} · med. ${fmtDur(t.medianaMin * 60e3)}` })), { vazio: "Nenhuma tarefa registrada no período." }),
    (k) => { setFiltro("tipoTarefa", [k]); toast(`Filtro aplicado: ${label("tipoTarefa", k)}`); });
  put("clientes", barList(cliTop.map((c) => ({ k: c.k, rotulo: c.k === "__vazio" ? "(não informado)" : c.k, v: c.n, cor: "var(--s1)", txt: `${c.n} · acum. ${fmtPct(c.acum)}` }))),
    (k) => { setFiltro("cliente", [k]); toast(`Filtro aplicado: ${k}`); });
  put("retr", barList(retr.map((x) => ({ k: x.k, rotulo: x.k, v: x.retr, cor: "var(--s4)", txt: `${fmtPct(x.retr)} · n=${x.n}` })), { max: 1, vazio: "Nenhum motivo com amostra suficiente." }),
    (k) => drill(`Retrabalho · ${k}`, lista.filter((p) => p.motivo === k && p.retrabalho)));
  put("esc", barList(esc_.map((x) => ({ k: x.k, rotulo: x.k, v: x.esc, cor: "var(--s5)", txt: `${fmtPct(x.esc)} · n=${x.n}` })), { max: 1, vazio: "Nenhum motivo com amostra suficiente." }),
    (k) => drill(`Escalonados · ${k}`, lista.filter((p) => p.motivo === k && p.escalonado)));
  void H;
}
