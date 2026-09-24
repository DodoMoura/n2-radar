// Visão geral — o básico: quantos pedidos, em que estado, quanto tempo
// levam para ser assumidos e resolvidos, quem atende e por quais motivos.
import { serie, autoGran, bucketStart, countBy, stats, groupBy } from "../core/metrics.js";
import { label } from "../core/taxonomy.js";
import { kpi, barList, chart, legend, dataTable, toast } from "../ui/components.js";
import { esc, fmtNum, fmtPct, fmtDur, fmtDayShort, fmtMonth } from "../ui/format.js";

export function rotuloBucket(t, g) {
  return g === "mes" ? fmtMonth(t) : g === "semana" ? `sem. ${fmtDayShort(t)}` : fmtDayShort(t);
}
export function insightsHTML() { return ""; }

const media = (arr) => stats(arr).mean;

export function render(el, ctx) {
  const { lista, f, drill, setFiltro } = ctx;
  const g = autoGran(f);
  const naFila = lista.filter((p) => p.status === "novo");
  const emAtend = lista.filter((p) => p.aberto && p.status !== "novo");
  const concl = lista.filter((p) => p.concluido);
  const recus = lista.filter((p) => p.status === "cancelado");
  const assumidos = lista.filter((p) => p.primeiraMs != null && p.status !== "cancelado");
  const tAssumir = media(assumidos.map((p) => p.primeiraMs));
  const tResolver = media(concl.map((p) => p.total));
  const filaMaisAntiga = naFila.length ? Math.max(...naFila.map((p) => Date.now() - p.abertura)) : null;

  el.innerHTML = `
  <section class="kpis" aria-label="Indicadores">
    ${kpi({ id: "total", rotulo: "Pedidos", valor: fmtNum(lista.length), sub: "abertos no período" })}
    ${kpi({ id: "fila", rotulo: "Na fila", valor: fmtNum(naFila.length), tom: naFila.length ? "warn" : "ok", sub: filaMaisAntiga ? `mais antigo há ${fmtDur(filaMaisAntiga)}` : "ninguém esperando" })}
    ${kpi({ id: "atend", rotulo: "Em atendimento", valor: fmtNum(emAtend.length), sub: "assumidos, ainda sem solução" })}
    ${kpi({ id: "concl", rotulo: "Concluídos", valor: fmtNum(concl.length), sub: lista.length ? `${fmtPct(concl.length / lista.length)} do total` : "" })}
    ${kpi({ id: "assumir", rotulo: "Tempo médio para assumir", valor: fmtDur(tAssumir), sub: `da abertura até alguém assumir · ${fmtNum(assumidos.length)} pedido(s)` })}
    ${kpi({ id: "resolver", rotulo: "Tempo médio para resolver", valor: fmtDur(tResolver), sub: `da abertura até concluir · ${fmtNum(concl.length)} pedido(s)` })}
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Pedidos por ${g === "dia" ? "dia" : g === "semana" ? "semana" : "mês"}</h3><span class="hint">clique numa barra para ver os pedidos</span></div>
    <div class="panel-b"><div class="chart"><canvas id="c-volume" aria-label="Pedidos por período"></canvas></div>
    ${legend([{ cor: "var(--s1)", rotulo: "Abertos" }, { cor: "var(--s3)", rotulo: "Concluídos" }])}</div>
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Por analista</h3><span class="hint">clique para filtrar pelo analista</span></div>
    <div data-analistas></div>
  </section>

  <section class="grid g2">
    <div class="panel"><div class="panel-h"><h3>Motivos mais frequentes</h3><span class="hint">clique para filtrar</span></div><div class="panel-b" data-bl="motivo"></div></div>
    <div class="panel"><div class="panel-h"><h3>Clientes com mais pedidos</h3><span class="hint">clique para filtrar</span></div><div class="panel-b" data-bl="cliente"></div></div>
  </section>`;

  // KPIs → lista de pedidos
  const conj = {
    total: ["Pedidos", lista], fila: ["Na fila", naFila], atend: ["Em atendimento", emAtend],
    concl: ["Concluídos", concl], assumir: ["Pedidos assumidos", assumidos], resolver: ["Concluídos", concl],
  };
  el.querySelectorAll("[data-kpi]").forEach((b) => (b.onclick = () => { const [t, arr] = conj[b.dataset.kpi]; drill(t, arr); }));
  void recus;

  // Volume
  const vol = serie(lista, f, g, (p) => p.abertura);
  const vc = serie(lista.filter((p) => p.concluido && p.fechamento), f, g, (p) => p.fechamento);
  const labels = vol.map((b) => rotuloBucket(b.t, g));
  chart(el.querySelector("#c-volume"), {
    labels,
    datasets: [{ rotulo: "Abertos", dados: vol.map((b) => b.v), cor: "var(--s1)" }, { rotulo: "Concluídos", dados: vc.map((b) => b.v), cor: "var(--s3)", tipo: "line" }],
    onClick: (i) => drill(`Abertos em ${labels[i]}`, lista.filter((p) => bucketStart(p.abertura, g) === vol[i].t)),
  });

  // Por analista
  const porAnalista = [...groupBy(lista.filter((p) => p.responsavel), (p) => p.responsavel)].map(([nome, arr]) => {
    const c = arr.filter((p) => p.concluido);
    return {
      nome, arr, n: arr.length, concluidos: c.length, abertos: arr.filter((p) => p.aberto).length,
      assumir: media(arr.map((p) => p.primeiraMs).filter((x) => x != null)),
      resolver: media(c.map((p) => p.total)),
    };
  });
  dataTable(el.querySelector("[data-analistas]"), {
    linhas: porAnalista, busca: false, porPagina: 30, ordenacao: { k: "n", dir: -1 },
    vazio: "Nenhum pedido com analista no filtro atual.",
    onRow: (a) => { setFiltro("responsavel", [a.nome]); toast(`Filtrando por ${a.nome}`); },
    colunas: [
      { k: "nome", rotulo: "Analista", render: (a) => `<b style="font-weight:500">${esc(a.nome)}</b>` },
      { k: "n", rotulo: "Pedidos", n: true, render: (a) => fmtNum(a.n) },
      { k: "abertos", rotulo: "Em aberto", n: true, render: (a) => (a.abertos ? `<span class="pill info plain">${fmtNum(a.abertos)}</span>` : "0") },
      { k: "concluidos", rotulo: "Concluídos", n: true, render: (a) => fmtNum(a.concluidos) },
      { k: "assumir", rotulo: "Tempo médio p/ assumir", n: true, render: (a) => fmtDur(a.assumir) },
      { k: "resolver", rotulo: "Tempo médio p/ resolver", n: true, render: (a) => fmtDur(a.resolver) },
    ],
  });

  // Listas de barras → filtros
  const bl = (dim, top = 10) => {
    const gr = countBy(lista.filter((p) => p[dim]), dim).slice(0, top);
    const itens = gr.map((x) => ({ k: x.k, rotulo: x.k, v: x.n, txt: `${fmtNum(x.n)} · ${fmtPct(x.n / lista.length)}` }));
    const box = el.querySelector(`[data-bl="${dim}"]`);
    box.innerHTML = barList(itens, { cor: dim === "cliente" ? "var(--s2)" : "var(--s1)" });
    box.querySelectorAll("[data-drill]").forEach((r) => (r.onclick = () => { setFiltro(dim, [r.dataset.drill]); toast(`Filtro aplicado: ${r.dataset.drill}`); }));
  };
  bl("motivo"); bl("cliente");
  void label;
}
