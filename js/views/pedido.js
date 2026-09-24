// Detalhe do pedido — versão básica: dados, tempos, descrição e linha do tempo.
import { label } from "../core/taxonomy.js";
import { icon, pillStatus, pillPrioridade } from "../ui/components.js";
import { esc, fmtDateTime, fmtDur } from "../ui/format.js";

const EVENTO = { novo: "Pedido aberto", em_andamento: "Assumido", concluido: "Resolvido", cancelado: "Recusado" };

export function render(el, ctx, id) {
  const { S, ir } = ctx;
  const p = id ? S.porId.get(id) : null;
  if (!p) {
    el.innerHTML = `<div class="panel"><div class="empty">Pedido não encontrado no período carregado. <a href="#/pedidos">Voltar para a lista</a></div></div>`;
    return;
  }
  const link = p.extras?.["Link no Baseline"];
  const extras = Object.entries(p.extras || {}).filter(([k]) => k !== "Link no Baseline");
  const kv = (rot, val) => `<div class="kpi" style="cursor:default"><span class="kpi-l">${rot}</span><span class="kpi-v" style="font-size:20px">${val}</span></div>`;

  el.innerHTML = `
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn sm" data-voltar>${icon("back")} Voltar</button>
    ${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Abrir no Baseline</a>` : ""}
  </div>

  <section class="panel"><div class="panel-b detail-head">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="mono muted">${esc(p.protocolo || p.externalId)}</span>${pillStatus(p.status)}${pillPrioridade(p.prioridade)}</div>
    <h2>${esc(p.titulo)}</h2>
    <div class="meta">
      <span>Cliente <b>${esc(p.cliente || "—")}</b></span>
      <span>Analista <b>${esc(p.responsavel || "—")}</b></span>
      <span>Solicitante (N1) <b>${esc(p.solicitante || "—")}</b></span>
    </div>
  </div></section>

  <section class="kpis">
    ${kv("Aberto em", `<span class="num">${fmtDateTime(p.abertura)}</span>`)}
    ${kv("Tempo para assumir", p.primeiraMs != null ? fmtDur(p.primeiraMs) : p.status === "novo" ? `na fila há ${fmtDur(Date.now() - p.abertura)}` : "—")}
    ${kv(p.aberto ? "Aberto há" : "Tempo total", fmtDur(p.total))}
    ${kv(p.status === "cancelado" ? "Recusado em" : "Resolvido em", p.aberto ? "—" : `<span class="num">${fmtDateTime(p.fechamento)}</span>`)}
  </section>

  <section class="grid g-7-5">
    <div style="display:grid;gap:16px;align-content:start">
      <div class="panel"><div class="panel-h"><h3>Descrição</h3></div>
        <div class="panel-b" style="white-space:pre-wrap;font-size:13.5px">${esc(p.descricao || "Sem descrição.")}</div></div>
      ${p.resultado ? `<div class="panel"><div class="panel-h"><h3>Resolução</h3></div><div class="panel-b" style="white-space:pre-wrap;font-size:13.5px">${esc(p.resultado)}</div></div>` : ""}
    </div>
    <div style="display:grid;gap:16px;align-content:start">
      <div class="panel"><div class="panel-h"><h3>Linha do tempo</h3></div><div class="panel-b" id="timeline"><div class="empty">Carregando…</div></div></div>
      ${extras.length ? `<div class="panel"><div class="panel-h"><h3>Detalhes</h3></div><div class="panel-b"><dl class="kv">${extras.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div></div>` : ""}
    </div>
  </section>`;

  el.querySelector("[data-voltar]").onclick = () => (history.length > 1 ? history.back() : ir("pedidos"));

  S.fonte.historico(p.id).then((hist) => {
    const box = el.querySelector("#timeline");
    if (!box) return;
    const itens = hist.map((h) => {
      if (h.campo === "status") return { k: h.para === "novo" ? "criado" : "status", em: h.em, txt: EVENTO[h.para] || `Status: ${label("status", h.para)}`, quem: h.usuario };
      if (h.evento === "classificacao") return { k: "classificacao", em: h.em, txt: `Classificação alterada: ${h.campo}`, quem: h.usuario };
      if (h.evento === "tarefa") return { k: "tarefa", em: h.em, txt: `Tarefa ${h.para}: ${label("tipoTarefa", h.campo)}`, quem: h.usuario };
      return { k: "", em: h.em, txt: h.evento, quem: h.usuario };
    });
    box.innerHTML = itens.length
      ? `<ul class="timeline">${itens.map((i) => `<li data-k="${i.k}"><div class="tl-when">${fmtDateTime(i.em)}</div><div class="tl-what">${esc(i.txt)}</div>${i.quem ? `<div class="tl-who">${esc(i.quem)}</div>` : ""}</li>`).join("")}</ul>`
      : `<div class="empty">Sem eventos registrados.</div>`;
  }).catch((e) => { const box = el.querySelector("#timeline"); if (box) box.innerHTML = `<div class="empty">Não foi possível carregar: ${esc(e.message)}</div>`; });
}
