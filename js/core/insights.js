// ─────────────────────────────────────────────────────────────
// Inteligência analítica: frases geradas a partir dos dados, cada
// uma com sua base (n). Quando a amostra não sustenta a conclusão,
// a frase diz isso em vez de afirmar.
// ─────────────────────────────────────────────────────────────
import { stats, countBy, groupBy, somaTempo, taskStats, rate, H } from "./metrics.js";
import { label } from "./taxonomy.js";
import { fmtPct, fmtDur } from "../ui/format.js";

export function gerarInsights(cur, prev, tarefas, regras) {
  const out = [];
  const min = regras.amostraMinima;
  const add = (tema, nivel, texto, base) => out.push({ tema, nivel, texto, base });

  if (cur.length < min) {
    add("dados", "dados", `O filtro atual tem ${cur.length} pedido(s). Com menos de ${min}, as análises automáticas ficam desativadas para evitar conclusões sem base.`, cur.length);
    return out;
  }

  // 1. Volume vs período anterior
  if (prev.length >= min) {
    const d = (cur.length - prev.length) / prev.length;
    const dir = Math.abs(d) < 0.03 ? "ficou estável" : d > 0 ? `aumentou ${fmtPct(d)}` : `caiu ${fmtPct(-d)}`;
    add("volume", Math.abs(d) >= 0.15 && d > 0 ? "alerta" : "info", `O volume de pedidos ${dir} em relação ao período anterior de mesma duração (${prev.length} → ${cur.length}).`, cur.length + prev.length);
  } else {
    add("volume", "dados", `O período anterior tem só ${prev.length} pedido(s); não há base para comparar o volume.`, prev.length);
  }

  // 2. Principal motivo de atraso
  const lim = regras.limiteDemoraHoras;
  const acima = cur.filter((p) => p.total > lim * H);
  const classificados = acima.filter((p) => p.motivoDemora);
  if (classificados.length >= min) {
    const g = countBy(classificados, "motivoDemora")[0];
    const inferidos = g.items.filter((p) => p.motivoDemoraOrigem === "inferido").length;
    const nota = inferidos ? ` ${fmtPct(inferidos / g.n)} desses foram classificados automaticamente pelo status de espera.` : "";
    add("demora", "alerta", `${fmtPct(g.n / classificados.length)} das demandas acima de ${lim}h tiveram como motivo principal “${label("motivoDemora", g.k)}” (${g.n} de ${classificados.length} com motivo identificado).${nota}`, classificados.length);
  } else if (acima.length) {
    add("demora", "dados", `${acima.length} pedido(s) passaram de ${lim}h, mas só ${classificados.length} têm motivo da demora identificado. Classifique os demais na página do pedido.`, acima.length);
  }
  const semMotivo = acima.length - classificados.length;
  if (acima.length >= min && semMotivo / acima.length > 0.3) {
    add("dados", "dados", `${fmtPct(semMotivo / acima.length)} dos pedidos acima de ${lim}h estão sem motivo da demora. A distribuição de motivos pode não representar o todo.`, acima.length);
  }

  // 3. Categoria mais lenta
  const concl = cur.filter((p) => p.concluido);
  const cats = [...groupBy(concl, (p) => p.categoria)]
    .map(([k, v]) => ({ k, n: v.length, med: stats(v.map((p) => p.slaMs)).median }))
    .filter((x) => x.n >= min && x.k !== "__vazio")
    .sort((a, b) => b.med - a.med);
  if (cats.length >= 2) {
    const geral = stats(concl.map((p) => p.slaMs)).median;
    add("categoria", "info", `A categoria com maior tempo mediano até a resolução (tempo de SLA, sem pausas) foi “${label("categoria", cats[0].k)}”: ${fmtDur(cats[0].med)}, contra ${fmtDur(geral)} no geral (n=${cats[0].n}).`, cats[0].n);
  }

  // 4. Trabalho × espera
  const comp = somaTempo(cur);
  const tot = Object.values(comp).reduce((a, b) => a + b, 0);
  if (tot > 0) {
    const maior = Object.entries(comp).sort((a, b) => b[1] - a[1])[0];
    const rot = { fila: "fila", trabalho: "atendimento ativo", espera_interna: "espera interna", espera_externa: "espera externa" }[maior[0]];
    const esp = (comp.espera_externa + comp.espera_interna) / tot;
    add("tempo", esp > 0.5 ? "alerta" : "info", `A maior parte do tempo dos pedidos está em ${rot} (${fmtPct(maior[1] / tot)}). Somando espera interna e externa, ${fmtPct(esp)} do tempo total é espera, não trabalho.`, cur.length);
  }

  // 5. Etapa que concentra tempo
  const porStatus = {};
  cur.forEach((p) => Object.entries(p.porStatus).forEach(([s, ms]) => (porStatus[s] = (porStatus[s] || 0) + ms)));
  const topStatus = Object.entries(porStatus).sort((a, b) => b[1] - a[1])[0];
  if (topStatus && tot) add("etapa", "info", `A etapa que mais concentra tempo é “${label("status", topStatus[0])}”, com ${fmtPct(topStatus[1] / tot)} das horas somadas de todos os pedidos.`, cur.length);

  // 6. Retrabalho por motivo
  const taxaGeral = rate(cur.filter((p) => p.retrabalho).length, cur.length);
  const mot = [...groupBy(cur, (p) => p.motivo)]
    .map(([k, v]) => ({ k, n: v.length, r: rate(v.filter((p) => p.retrabalho).length, v.length) }))
    .filter((x) => x.n >= min)
    .sort((a, b) => b.r - a.r);
  if (mot.length && taxaGeral != null && mot[0].r >= Math.max(taxaGeral * 1.5, 0.1)) {
    add("retrabalho", "alerta", `Pedidos com motivo “${mot[0].k}” têm taxa de retrabalho de ${fmtPct(mot[0].r)}, contra ${fmtPct(taxaGeral)} no geral (n=${mot[0].n}).`, mot[0].n);
  }

  // 7. SLA vs anterior
  const sla = (arr) => {
    const b = arr.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado");
    return { n: b.length, r: rate(b.filter((p) => p.slaStatus === "cumprido").length, b.length) };
  };
  const sc = sla(cur), sp = sla(prev);
  if (sc.n >= min && sp.n >= min) {
    const d = sc.r - sp.r;
    if (Math.abs(d) >= 0.03) add("sla", d < 0 ? "alerta" : "positivo", `O cumprimento de SLA ${d < 0 ? "caiu" : "subiu"} de ${fmtPct(sp.r)} para ${fmtPct(sc.r)} em relação ao período anterior.`, sc.n);
  }

  // 8. Eficácia de tarefas
  const ids = new Set(cur.map((p) => p.id));
  const ts = taskStats(tarefas, ids).filter((t) => t.nRes >= min);
  if (ts.length >= 2) {
    const best = [...ts].sort((a, b) => b.identificou - a.identificou)[0];
    add("tarefas", "positivo", `“${label("tipoTarefa", best.tipo)}” levou à identificação ou solução do problema em ${fmtPct(best.identificou)} das vezes em que foi executada (n=${best.nRes}).`, best.nRes);
    const custo = ts[0];
    add("tarefas", "info", `“${label("tipoTarefa", custo.tipo)}” é o tipo de tarefa que mais consome esforço registrado: ${fmtPct(custo.share)} das horas de trabalho, mediana de ${Math.round(custo.medianaMin)} min por execução.`, custo.n);
  }

  // 9. Demandas evitáveis no N2
  const evitaveis = cur.filter((p) => ["duvida", "orientacao", "permissao"].includes(p.categoria));
  if (evitaveis.length >= min) {
    const fcrE = rate(evitaveis.filter((p) => p.fcr).length, evitaveis.filter((p) => p.concluido).length);
    add("recorrencia", "alerta", `${fmtPct(evitaveis.length / cur.length)} dos pedidos são dúvida, orientação ou permissão (${evitaveis.length}). ${fcrE != null && fcrE > 0.6 ? `Como ${fmtPct(fcrE)} deles se resolvem na primeira intervenção, são candidatos a base de conhecimento ou tratamento no N1.` : "Vale revisar se poderiam ser tratados no N1."}`, evitaveis.length);
  }
  const top = countBy(cur, "motivo").slice(0, 3);
  if (top.length === 3) {
    const s = top.reduce((a, b) => a + b.n, 0);
    add("recorrencia", "info", `Os 3 motivos mais frequentes (${top.map((t) => `“${t.k}”`).join(", ")}) somam ${fmtPct(s / cur.length)} dos pedidos.`, cur.length);
  }
  const enc = cur.filter((p) => p.motivoDemora === "erro_encaminhamento").length;
  if (enc >= min) add("processo", "alerta", `${enc} pedido(s) (${fmtPct(enc / cur.length)}) tiveram erro de encaminhamento como motivo da demora.`, enc);

  // 10. Cobertura de dados
  const cob = rate(cur.filter((p) => p.nTarefas > 0).length, cur.length);
  if (cob < 0.7) add("dados", "dados", `Só ${fmtPct(cob)} dos pedidos têm tarefas registradas. Esforço real e eficácia por tarefa refletem apenas essa parcela.`, cur.length);

  return out;
}
