import { taskStats, groupBy, stats, rate, kpis } from "../core/metrics.js";
import { label } from "../core/taxonomy.js";
import { dataTable, kpi, deltaTag, barList } from "../ui/components.js";
import { esc, fmtNum, fmtPct, fmtDur } from "../ui/format.js";

export function render(el, ctx) {
  const { lista, prev, tarefas, regras, drill } = ctx;
  const min = regras.amostraMinima;
  const k = kpis(lista), kp = kpis(prev);
  const ts = taskStats(tarefas);
  const cobertura = rate(k.comTarefas, lista.length);
  const concl = lista.filter((p) => p.concluido);
  const reab = lista.filter((p) => p.reaberturas > 0);
  const falha = lista.filter((p) => p.retrabalhoAuto && p.reaberturas === 0);
  const manual = lista.filter((p) => p.retrabalhoOrigem === "manual" && p.retrabalho);

  const agrupar = (key, tipoLabel) => [...groupBy(lista, (p) => p[key])].map(([kk, v]) => {
    const c = v.filter((p) => p.concluido);
    return {
      k: kk, rotulo: kk === "__vazio" ? "(não informado)" : tipoLabel ? label(tipoLabel, kk) : kk, n: v.length, concluidos: c.length,
      fcr: rate(c.filter((p) => p.fcr).length, c.length), eficaz: rate(c.filter((p) => p.eficaz).length, c.length),
      retrabalho: rate(v.filter((p) => p.retrabalho).length, v.length), med: stats(c.map((p) => p.slaMs)).median,
      esforco: stats(v.filter((p) => p.nTarefas).map((p) => p.esforcoMin)).median, ok: c.length >= min,
    };
  });
  const colsGrupo = (rot) => [
    { k: "rotulo", rotulo: rot, render: (r) => `${esc(r.rotulo)}${r.ok ? "" : `<div class="warn-sample">amostra pequena</div>`}` },
    { k: "n", rotulo: "Pedidos", n: true, render: (r) => fmtNum(r.n) },
    { k: "fcr", rotulo: "1ª intervenção", n: true, render: (r) => fmtPct(r.fcr) },
    { k: "eficaz", rotulo: "Eficaz", n: true, render: (r) => fmtPct(r.eficaz) },
    { k: "retrabalho", rotulo: "Retrabalho", n: true, render: (r) => `<span style="color:${r.retrabalho > 0.15 ? "var(--warn)" : "inherit"}">${fmtPct(r.retrabalho)}</span>` },
    { k: "med", rotulo: "Resolução (med.)", n: true, render: (r) => fmtDur(r.med) },
    { k: "esforco", rotulo: "Esforço (med.)", n: true, render: (r) => (r.esforco == null ? "—" : fmtDur(r.esforco * 60e3)) },
  ];
  const destaque = ts.filter((t) => t.nRes >= min && t.identificou != null).sort((a, b) => b.identificou - a.identificou);

  el.innerHTML = `
  <section class="kpis">
    ${kpi({ id: "fcr", rotulo: "Resolução na 1ª intervenção", valor: fmtPct(k.fcr), delta: deltaTag(k.fcr, kp.fcr, { pct: true }), sub: `de ${fmtNum(k.concluidos)} concluídos`, tom: k.fcr >= 0.8 ? "ok" : "warn" })}
    ${kpi({ id: "retrabalho", rotulo: "Taxa de retrabalho", valor: fmtPct(k.retrabalho), delta: deltaTag(k.retrabalho, kp.retrabalho, { pct: true, melhorMaior: false }), sub: `${fmtNum(k.retrabalhoN)} pedido(s)`, tom: k.retrabalho > 0.15 ? "warn" : "" })}
    ${kpi({ id: "eficaz", rotulo: "Resolução eficaz", valor: fmtPct(k.eficaz), delta: deltaTag(k.eficaz, kp.eficaz, { pct: true }), sub: `sem reabertura em ${regras.janelaReaberturaDias} dias`, tom: k.eficaz >= 0.9 ? "ok" : "warn" })}
    ${kpi({ id: "reab", rotulo: "Reabertos", valor: fmtNum(reab.length), sub: fmtPct(rate(reab.length, lista.length)) + " dos pedidos" })}
    ${kpi({ id: "cob", rotulo: "Pedidos com tarefas", valor: fmtPct(cobertura), sub: "cobertura do registro de tarefas", tom: cobertura < 0.7 ? "warn" : "" })}
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Eficácia por tarefa</h3><span class="hint">quais ações levam à causa e quais resolvem · tarefas sem resultado registrado ficam fora das taxas</span></div>
    ${destaque.length ? `<div class="panel-b" style="display:grid;gap:4px;padding-bottom:0">${destaque.slice(0, 3).map((t) => `<div style="font-size:13.5px"><b style="font-weight:600">${esc(label("tipoTarefa", t.tipo))}</b> → ${fmtPct(t.identificou)} das vezes levou à identificação ou solução do problema <span class="muted small">(n=${t.nRes})</span></div>`).join("")}</div>` : ""}
    <div id="tbl-tarefas"></div>
  </section>

  <section class="grid g2">
    <div class="panel"><div class="panel-h"><h3>Eficácia por categoria</h3><span class="hint">quais tipos de problema são mais fáceis ou difíceis</span></div><div id="tbl-cat"></div></div>
    <div class="panel"><div class="panel-h"><h3>De onde vem o retrabalho</h3><span class="hint">um pedido pode ter mais de uma origem</span></div>
      <div class="panel-b" data-b="origem"></div>
      <div class="panel-h" style="padding-top:0"><h3>Retrabalho por responsável</h3><span class="hint">taxa, mínimo ${min} pedidos</span></div>
      <div class="panel-b" data-b="resp"></div></div>
  </section>

  <section class="panel"><div class="panel-h"><h3>Eficácia por motivo</h3><span class="hint">motivo informado na abertura</span></div><div id="tbl-mot"></div></section>`;

  const mapa = { fcr: ["Concluídos fora da 1ª intervenção", concl.filter((p) => !p.fcr)], retrabalho: ["Com retrabalho", lista.filter((p) => p.retrabalho)], eficaz: ["Não eficazes", concl.filter((p) => !p.eficaz)], reab: ["Reabertos", reab], cob: ["Sem tarefas registradas", lista.filter((p) => !p.nTarefas)] };
  el.querySelectorAll("[data-kpi]").forEach((b) => (b.onclick = () => drill(...mapa[b.dataset.kpi])));

  dataTable(el.querySelector("#tbl-tarefas"), {
    linhas: ts, busca: false, porPagina: 20, ordenacao: { k: "identificou", dir: -1 },
    onRow: (t) => drill(`Pedidos com “${label("tipoTarefa", t.tipo)}”`, lista.filter((p) => p.tiposTarefa.includes(t.tipo))),
    colunas: [
      { k: "tipo", rotulo: "Tarefa", render: (t) => `${esc(label("tipoTarefa", t.tipo))}${t.nRes < min ? `<div class="warn-sample">amostra pequena</div>` : ""}` },
      { k: "n", rotulo: "Execuções", n: true, render: (t) => fmtNum(t.n) },
      { k: "pedidos", rotulo: "Pedidos", n: true, render: (t) => fmtNum(t.pedidos) },
      { k: "medianaMin", rotulo: "Tempo (med.)", n: true, render: (t) => fmtDur(t.medianaMin * 60e3) },
      { k: "share", rotulo: "% do esforço", n: true, render: (t) => fmtPct(t.share) },
      { k: "identificou", rotulo: "Identificou ou resolveu", n: true, render: (t) => (t.identificou == null ? `<span class="muted">sem resultado</span>` : `<span class="minibar"><i style="width:${t.identificou * 100}%;background:var(--s1)"></i></span>${fmtPct(t.identificou)}`) },
      { k: "resolveu", rotulo: "Resolveu", n: true, render: (t) => (t.resolveu == null ? "—" : `<span class="minibar"><i style="width:${t.resolveu * 100}%;background:var(--ok)"></i></span>${fmtPct(t.resolveu)}`) },
    ],
    vazio: "Nenhuma tarefa registrada nos pedidos filtrados.",
  });
  dataTable(el.querySelector("#tbl-cat"), { linhas: agrupar("categoria", "categoria"), busca: false, porPagina: 15, ordenacao: { k: "n", dir: -1 }, colunas: colsGrupo("Categoria"), onRow: (r) => drill(r.rotulo, lista.filter((p) => (p.categoria ?? "__vazio") === r.k)) });
  dataTable(el.querySelector("#tbl-mot"), { linhas: agrupar("motivo"), busca: true, buscaFn: (r) => r.rotulo, porPagina: 15, ordenacao: { k: "n", dir: -1 }, colunas: colsGrupo("Motivo"), onRow: (r) => drill(r.rotulo, lista.filter((p) => (p.motivo ?? "__vazio") === r.k)) });

  const put = (k, html, fn) => { const b = el.querySelector(`[data-b="${k}"]`); b.innerHTML = html; if (fn) b.querySelectorAll("[data-drill]").forEach((r) => (r.onclick = () => fn(r.dataset.drill))); };
  const origens = [["reab", "Reabertura", reab], ["falha", "Intervenção sem efeito", falha], ["manual", "Marcado manualmente", manual]];
  put("origem", barList(origens.map(([kk, r, arr]) => ({ k: kk, rotulo: r, v: arr.length, cor: "var(--s4)", txt: fmtNum(arr.length) }))), (kk) => { const o = origens.find((x) => x[0] === kk); drill(o[1], o[2]); });
  const porResp = [...groupBy(lista, (p) => p.responsavel)].map(([kk, v]) => ({ k: kk, n: v.length, r: rate(v.filter((p) => p.retrabalho).length, v.length) })).filter((x) => x.n >= min).sort((a, b) => b.r - a.r);
  put("resp", barList(porResp.map((x) => ({ k: x.k, rotulo: x.k, v: x.r, cor: "var(--s4)", txt: `${fmtPct(x.r)} · n=${x.n}` })), { max: Math.max(0.01, ...porResp.map((x) => x.r)) }), (kk) => drill(`Retrabalho · ${kk}`, lista.filter((p) => p.responsavel === kk && p.retrabalho)));
}
