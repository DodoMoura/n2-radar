// Componentes de interface reutilizáveis (sem framework).
import { esc, fmtNum, fmtPct, fmtDur } from "./format.js";
import { label, statusInfo } from "../core/taxonomy.js";

// ── Ícones (traço 1.6, 24×24) ────────────────────────────────
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  funnel: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
};
export const icon = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

export const LOGO = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><circle cx="16" cy="17" r="9" fill="none" stroke="var(--accent-ink)" stroke-opacity=".35" stroke-width="1.5"/><circle cx="16" cy="17" r="4.5" fill="none" stroke="var(--accent-ink)" stroke-opacity=".6" stroke-width="1.5"/><path d="M16 17L23.5 9.5" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="17" r="1.8" fill="var(--accent-ink)"/></svg>`;

// ── Pílulas de estado ────────────────────────────────────────
export function pillStatus(s) {
  const t = statusInfo(s).tipo;
  const cls = s === "concluido" ? "ok" : s === "cancelado" ? "" : t === "fila" ? "info" : t.startsWith("espera") ? "warn" : "info";
  return `<span class="pill ${cls}">${esc(label("status", s))}</span>`;
}
export function pillSla(p) {
  const m = { cumprido: ["ok", "Dentro do SLA"], violado: ["crit", p.aberto ? "Atrasado" : "Fora do SLA"], risco: ["warn", "Em risco"], no_prazo: ["info", "No prazo"], na: ["", "Não se aplica"] }[p.slaStatus] || ["", "—"];
  return `<span class="pill ${m[0]}" title="SLA consumido: ${fmtPct(p.slaPct)}">${m[1]}</span>`;
}
export function pillPrioridade(pr) {
  const cls = { urgente: "crit", alta: "warn", media: "", baixa: "" }[pr] ?? "";
  return `<span class="pill plain ${cls}">${esc(label("prioridade", pr))}</span>`;
}

// ── Toast e modal ────────────────────────────────────────────
export function toast(msg, tipo = "") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), tipo === "erro" ? 7000 : 3500);
}

export function modal({ titulo, corpo, rodape = "", tamanho = "", onMount, onClose }) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal ${tamanho}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="modal-h"><h3>${esc(titulo)}</h3><button class="btn ghost sm" data-close aria-label="Fechar">${icon("x")}</button></div>
    <div class="modal-b">${corpo}</div>${rodape ? `<div class="modal-f">${rodape}</div>` : ""}</div>`;
  const fechar = () => { if (!bg.isConnected) return; bg.remove(); document.removeEventListener("keydown", esc_); onClose?.(); };
  const esc_ = (e) => e.key === "Escape" && fechar();
  bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) fechar(); });
  document.addEventListener("keydown", esc_);
  document.body.appendChild(bg);
  onMount?.(bg.querySelector(".modal"), fechar);
  return fechar;
}

// Confirmação dentro da página (o visualizador bloqueia confirm()).
export function confirmar(texto, rotuloOk = "Confirmar") {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      titulo: "Confirmar", tamanho: "sm", corpo: `<p style="margin:0">${esc(texto)}</p>`,
      rodape: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${esc(rotuloOk)}</button>`,
      onMount: (m, f) => m.querySelector("[data-ok]").addEventListener("click", () => { ok = true; f(); }),
      onClose: () => resolve(ok),
    });
  });
}

// ── KPI ──────────────────────────────────────────────────────
export function kpi({ id, rotulo, valor, sufixo = "", sub = "", tom = "", delta = null, flag = "", titulo = "" }) {
  return `<button class="kpi" data-kpi="${id}" data-tone="${tom}" title="${esc(titulo)}">
    <span class="kpi-l">${esc(rotulo)}</span>
    <span class="kpi-v">${valor}${sufixo ? `<small>${sufixo}</small>` : ""}</span>
    <span class="kpi-s">${delta ?? ""}${sub}</span>${flag ? `<span class="flag">${flag}</span>` : ""}
  </button>`;
}

export function deltaTag(atual, anterior, { melhorMaior = true, pct = false } = {}) {
  if (atual == null || anterior == null || !isFinite(atual) || !isFinite(anterior) || anterior === 0 && !pct) return "";
  const d = pct ? atual - anterior : (atual - anterior) / anterior;
  if (Math.abs(d) < 0.005) return `<span class="delta">=</span>`;
  const bom = melhorMaior ? d > 0 : d < 0;
  const txt = pct ? `${d > 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")} p.p.` : `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`;
  return `<span class="delta ${bom ? "bom" : "ruim"}" title="vs. período anterior">${txt}</span>`;
}

// ── Barras horizontais (HTML) ────────────────────────────────
// itens: [{ k, rotulo, v, txt, cor?, sub? }]
export function barList(itens, { max, cor = "var(--s1)", vazio = "Sem dados para o filtro atual.", drill = true } = {}) {
  if (!itens.length) return `<div class="empty">${vazio}</div>`;
  const m = max ?? Math.max(...itens.map((i) => i.v), 1);
  return `<div class="bars">${itens.map((i) => `
    <div class="bar-row" ${drill ? `data-drill="${esc(i.k)}"` : ""} title="${esc(i.rotulo)}: ${esc(i.txt)}${i.sub ? " · " + esc(i.sub) : ""}">
      <span class="lbl">${esc(i.rotulo)}</span>
      <span class="track">${i.segs ? i.segs.map((s) => `<span class="fill" style="width:${(s.v / m) * 100}%;background:${s.cor};border-radius:0"></span>`).join("") : `<span class="fill" style="width:${Math.max(0.5, (i.v / m) * 100)}%;background:${i.cor || cor}"></span>`}</span>
      <span class="val">${esc(i.txt)}</span>
    </div>`).join("")}</div>`;
}

export function stackBar(partes, cls = "") {
  const tot = partes.reduce((a, b) => a + b.v, 0) || 1;
  return `<div class="stackbar ${cls}">${partes.filter((p) => p.v > 0).map((p) => `<div style="flex:${p.v / tot};background:${p.cor}" title="${esc(p.rotulo)}: ${fmtPct(p.v / tot)}"></div>`).join("")}</div>`;
}

export function legend(itens) {
  return `<div class="legend">${itens.map((i) => `<span><i style="background:${i.cor}"></i>${esc(i.rotulo)}</span>`).join("")}</div>`;
}

// ── Multi-seleção ────────────────────────────────────────────
export function multiSelect(el, { rotulo, opcoes, selecionados = [], onChange }) {
  let sel = new Set(selecionados);
  let aberto = false;
  const render = () => {
    el.innerHTML = `<div class="ms">
      <button type="button" class="btn ms-btn" aria-expanded="${aberto}">${esc(rotulo)} ${sel.size ? `<b>${sel.size}</b>` : `<span class="muted">todos</span>`}</button>
      ${aberto ? `<div class="ms-list"><input type="search" class="input" placeholder="Buscar" aria-label="Buscar ${esc(rotulo)}">
      <div class="ms-opts">${opcoes.map((o) => `<label class="ms-opt"><input type="checkbox" value="${esc(o.v)}" ${sel.has(o.v) ? "checked" : ""}>${esc(o.rotulo)}<span class="n">${o.n ?? ""}</span></label>`).join("")}</div></div>` : ""}
    </div>`;
    el.querySelector(".ms-btn").onclick = (e) => { e.stopPropagation(); aberto = !aberto; render(); if (aberto) el.querySelector("input[type=search]").focus(); };
    if (aberto) {
      const list = el.querySelector(".ms-list");
      list.onclick = (e) => e.stopPropagation();
      list.querySelector("input[type=search]").oninput = (e) => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll(".ms-opt").forEach((o) => (o.hidden = !o.textContent.toLowerCase().includes(q)));
      };
      list.querySelectorAll("input[type=checkbox]").forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.value) : sel.delete(c.value); onChange([...sel]); el.querySelector(".ms-btn").innerHTML = `${esc(rotulo)} ${sel.size ? `<b>${sel.size}</b>` : `<span class="muted">todos</span>`}`; }));
      const fora = () => { aberto = false; render(); document.removeEventListener("click", fora); };
      setTimeout(() => document.addEventListener("click", fora), 0);
    }
  };
  render();
}

// ── Tabela com busca, ordenação e paginação ──────────────────
// colunas: [{ k, rotulo, render(row), sort(row), n: bool, cls }]
export function dataTable(el, { linhas, colunas, porPagina = 25, busca = true, buscaFn, onRow, ordenacao, vazio = "Nenhum registro.", grupos, extraTools = "", onRender }) {
  const st = { q: "", pag: 0, sort: ordenacao?.k ?? null, dir: ordenacao?.dir ?? -1 };
  const render = () => {
    let rows = linhas;
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((r) => (buscaFn ? buscaFn(r) : JSON.stringify(r)).toLowerCase().includes(q));
    }
    if (st.sort) {
      const c = colunas.find((x) => x.k === st.sort);
      const f = c.sort || ((r) => r[c.k]);
      rows = rows.slice().sort((a, b) => {
        const x = f(a), y = f(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * st.dir;
      });
    }
    const paginas = Math.max(1, Math.ceil(rows.length / porPagina));
    st.pag = Math.min(st.pag, paginas - 1);
    const vis = rows.slice(st.pag * porPagina, (st.pag + 1) * porPagina);
    el.innerHTML = `
      ${busca || extraTools ? `<div class="table-tools">${busca ? `<input type="search" class="input" placeholder="Buscar" value="${esc(st.q)}" aria-label="Buscar na tabela">` : ""}${extraTools}</div>` : ""}
      <div class="table-wrap"><table class="t">
        <thead>${grupos ? `<tr class="grp">${grupos.map((g) => `<th colspan="${g.span}" class="${g.rotulo ? "g" : ""}">${esc(g.rotulo || "")}</th>`).join("")}</tr>` : ""}
        <tr>${colunas.map((c) => `<th class="${c.n ? "n" : ""} ${c.sort !== false ? "sortable" : ""}" data-k="${c.k}" ${st.sort === c.k ? `aria-sort="${st.dir > 0 ? "ascending" : "descending"}"` : ""} title="${esc(c.titulo || "")}">${esc(c.rotulo)}${st.sort === c.k ? (st.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
        <tbody>${vis.length ? vis.map((r, i) => `<tr class="${onRow ? "click" : ""}" data-i="${st.pag * porPagina + i}">${colunas.map((c) => `<td class="${c.n ? "n" : ""} ${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${colunas.length}"><div class="empty">${vazio}</div></td></tr>`}</tbody>
      </table></div>
      ${rows.length > porPagina ? `<div class="pager"><span>${fmtNum(st.pag * porPagina + 1)}–${fmtNum(Math.min(rows.length, (st.pag + 1) * porPagina))} de ${fmtNum(rows.length)}</span>
        <span style="display:flex;gap:6px"><button class="btn sm" data-p="-1" ${st.pag === 0 ? "disabled" : ""}>Anterior</button><span style="align-self:center">Página ${st.pag + 1} de ${paginas}</span><button class="btn sm" data-p="1" ${st.pag >= paginas - 1 ? "disabled" : ""}>Próxima</button></span></div>` : `<div class="pager"><span>${fmtNum(rows.length)} registro(s)</span></div>`}`;
    const inp = el.querySelector(".table-tools input[type=search]");
    if (inp) inp.oninput = (e) => { st.q = e.target.value; st.pag = 0; const pos = e.target.selectionStart; render(); const n = el.querySelector(".table-tools input[type=search]"); n.focus(); n.setSelectionRange(pos, pos); };
    el.querySelectorAll("th.sortable").forEach((th) => (th.onclick = () => { const k = th.dataset.k; st.dir = st.sort === k ? -st.dir : -1; st.sort = k; render(); }));
    el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { st.pag += Number(b.dataset.p); render(); }));
    if (onRow) el.querySelectorAll("tbody tr[data-i]").forEach((tr) => (tr.onclick = () => onRow(rows[Number(tr.dataset.i)])));
    el._rows = rows;
    onRender?.(el, rows);
  };
  render();
  return { atualizar: (novas) => { linhas = novas; render(); }, linhasVisiveis: () => el._rows };
}

// ── Gráficos (Chart.js) ──────────────────────────────────────
const charts = new Set();
export function destroyCharts() { charts.forEach((c) => c.destroy()); charts.clear(); }
export function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function baseOpts({ onClick, yFmt = (v) => fmtNum(v), stacked = false, horizontal = false, legenda = false, tooltipFmt }) {
  const ink2 = cssVar("--ink-2"), ink3 = cssVar("--ink-3"), grid = cssVar("--line-2");
  const valueAxis = { beginAtZero: true, stacked, grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: ink3, padding: 6, font: { family: "IBM Plex Mono", size: 10.5 }, callback: (v) => yFmt(v), maxTicksLimit: 6 } };
  const catAxis = { stacked, grid: { display: false }, border: { color: cssVar("--line") }, ticks: { color: ink2, font: { family: "IBM Plex Sans", size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 } };
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    indexAxis: horizontal ? "y" : "x",
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legenda, position: "bottom", align: "start", labels: { color: ink2, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, font: { family: "IBM Plex Sans", size: 12 } } },
      tooltip: {
        backgroundColor: cssVar("--surface"), titleColor: cssVar("--ink"), bodyColor: ink2, borderColor: cssVar("--line"), borderWidth: 1,
        padding: 10, boxPadding: 4, usePointStyle: true, titleFont: { family: "IBM Plex Sans", weight: "600" }, bodyFont: { family: "IBM Plex Sans" },
        callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : ""}${(tooltipFmt || yFmt)(c.parsed[horizontal ? "x" : "y"], c)}` },
      },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    onClick: onClick ? (e, els) => { if (els[0]) onClick(els[0].index, els[0].datasetIndex); } : undefined,
    onHover: onClick ? (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; } : undefined,
  };
}

export function chart(canvas, { tipo = "bar", labels, datasets, ...opts }) {
  if (!window.Chart) { canvas.parentElement.innerHTML = `<div class="empty">Biblioteca de gráficos indisponível.</div>`; return null; }
  const ds = datasets.map((d) => {
    const cor = d.cor ? (d.cor.startsWith("var(") ? cssVar(d.cor.slice(4, -1)) : d.cor) : cssVar("--s1");
    const base = { label: d.rotulo, data: d.dados, backgroundColor: cor, borderColor: cor, hidden: d.oculto };
    if (tipo === "line" || d.tipo === "line") {
      return { ...base, type: "line", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12, tension: 0.25, fill: d.area ? { target: "origin" } : false, backgroundColor: d.area ? cor + "22" : cor, borderDash: d.tracejado ? [5, 4] : undefined, spanGaps: true, order: 0 };
    }
    return { ...base, type: "bar", borderRadius: opts.stacked ? 0 : 4, borderSkipped: "start", maxBarThickness: 36, categoryPercentage: 0.78, barPercentage: 0.9, borderWidth: opts.stacked ? { top: 0, right: 0, bottom: 0, left: 0 } : 0, borderColor: cssVar("--surface"), order: 1 };
  });
  if (opts.stacked) ds.forEach((d) => { if (d.type === "bar") { d.borderWidth = opts.horizontal ? { right: 2 } : { top: 2 }; d.borderColor = cssVar("--surface"); } });
  const c = new window.Chart(canvas, { type: tipo === "doughnut" ? "doughnut" : "bar", data: { labels, datasets: ds }, options: baseOpts(opts) });
  charts.add(c);
  return c;
}

export function doughnut(canvas, { labels, valores, cores, onClick, fmt = fmtNum }) {
  if (!window.Chart) return null;
  const c = new window.Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data: valores, backgroundColor: cores.map((x) => (x.startsWith("var(") ? cssVar(x.slice(4, -1)) : x)), borderColor: cssVar("--surface"), borderWidth: 2, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%", animation: { duration: 250 },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: cssVar("--surface"), titleColor: cssVar("--ink"), bodyColor: cssVar("--ink-2"), borderColor: cssVar("--line"), borderWidth: 1, padding: 10, callbacks: { label: (x) => ` ${fmt(x.parsed)} (${fmtPct(x.parsed / x.dataset.data.reduce((a, b) => a + b, 0))})` } } },
      onClick: onClick ? (e, els) => els[0] && onClick(els[0].index) : undefined,
      onHover: onClick ? (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; } : undefined,
    },
  });
  charts.add(c);
  return c;
}

export const horas = (ms) => (ms == null ? null : +(ms / 3600e3).toFixed(1));
export const fmtHorasEixo = (v) => `${fmtNum(Math.round(v * 10) / 10)}h`;
export const fmtDurTooltip = (v) => fmtDur(v * 3600e3);
