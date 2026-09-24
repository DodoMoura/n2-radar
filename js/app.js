// N2 Radar — aplicação (estado, rotas, layout e filtros globais)
import { APP_CONFIG } from "./config.js";
import { setTaxonomia, label, TAX } from "./core/taxonomy.js";
import { enrich, applyFilters, periodoAnterior, groupBy, FILTER_KEYS, DAY } from "./core/metrics.js";
import { icon, LOGO, toast, modal, multiSelect, dataTable, destroyCharts, pillStatus, pillSla, pillPrioridade } from "./ui/components.js";
import { esc, fmtDateTime, fmtDur, fmtNum, toDateInput } from "./ui/format.js";
import * as vDashboard from "./views/dashboard.js";
import * as vPedidos from "./views/pedidos.js";
import * as vPedido from "./views/pedido.js";
import * as vGargalos from "./views/gargalos.js";
import * as vPerformance from "./views/performance.js";
import * as vEficacia from "./views/eficacia.js";
import * as vRelatorios from "./views/relatorios.js";
import * as vConfig from "./views/config.js";
import { abrirImportacao } from "./views/baseline-import.js";

const ROTAS = {
  dashboard: { view: vDashboard, titulo: "Visão geral", sub: "Volume, prazos, tempo e qualidade dos pedidos N2", icone: "dashboard", filtros: true },
  pedidos: { view: vPedidos, titulo: "Pedidos", sub: "Lista completa com busca, ordenação e exportação", icone: "list", filtros: true },
  gargalos: { view: vGargalos, titulo: "Gargalos", sub: "Onde o processo trava e por quê", icone: "funnel", filtros: true },
  performance: { view: vPerformance, titulo: "Performance", sub: "Volume, velocidade e eficácia avaliados separadamente", icone: "gauge", filtros: true },
  eficacia: { view: vEficacia, titulo: "Eficácia", sub: "O que resolve de fato e onde há retrabalho", icone: "target", filtros: true },
  relatorios: { view: vRelatorios, titulo: "Relatórios", sub: "Gere e exporte em CSV, Excel ou PDF", icone: "file", filtros: true },
  config: { view: vConfig, titulo: "Configurações", sub: "Integração, SLA, classificação e acesso", icone: "gear", filtros: false },
  pedido: { view: vPedido, titulo: "Pedido", sub: "", icone: "list", filtros: false, oculto: true },
};

const LSF = "n2radar.filtros";
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

export const S = {
  fonte: null, usuario: null, cfg: null,
  raw: { pedidos: [], tarefas: [] }, E: [], porId: new Map(), tarefasPorPedido: new Map(),
  sync: {}, filtros: null, rota: "dashboard", param: null, carregado: false,
};

function filtrosPadrao() {
  const fim = Date.now();
  return { preset: "30", inicio: fim - 30 * DAY, fim, ...Object.fromEntries(FILTER_KEYS.map(([k]) => [k, []])) };
}
function aplicarPreset(f) {
  if (f.preset === "custom") return f;
  const fim = Date.now();
  const dias = Number(f.preset);
  const ini = new Date(fim - dias * DAY);
  ini.setHours(0, 0, 0, 0);
  return { ...f, inicio: ini.getTime(), fim };
}

// ── Recalcular medidas derivadas ─────────────────────────────
function recalcular() {
  const now = Date.now();
  S.tarefasPorPedido = groupBy(S.raw.tarefas, (t) => t.pedidoId);
  S.E = S.raw.pedidos.map((p) => enrich(p, S.tarefasPorPedido.get(p.id) || [], S.cfg.regras, now));
  S.porId = new Map(S.E.map((p) => [p.id, p]));
}

export function contexto() {
  S.filtros = aplicarPreset(S.filtros);
  const lista = applyFilters(S.E, S.filtros);
  const prev = applyFilters(S.E, periodoAnterior(S.filtros));
  const ids = new Set(lista.map((p) => p.id));
  const tarefas = S.raw.tarefas.filter((t) => ids.has(t.pedidoId));
  return { S, lista, prev, ids, tarefas, regras: S.cfg.regras, f: S.filtros, drill, ir, setFiltro, salvarConfig, colunasPedido, renderView, podeEditar: S.usuario.papel !== "leitura" };
}

export function ir(rota) { location.hash = `#/${rota}`; }

export function setFiltro(k, valores) {
  S.filtros[k] = valores;
  lsSet(LSF, S.filtros);
  renderFiltros();
  renderView();
}

// ── Drill-down: lista de pedidos por trás de um número ───────
export function drill(titulo, pedidos, nota = "") {
  modal({
    titulo: `${titulo} · ${fmtNum(pedidos.length)} pedido(s)`,
    corpo: `${nota ? `<p class="note" style="margin:0 0 8px">${esc(nota)}</p>` : ""}<div data-t></div>`,
    onMount: (m, fechar) => dataTable(m.querySelector("[data-t]"), {
      linhas: pedidos, porPagina: 12, ordenacao: { k: "abertura", dir: -1 },
      buscaFn: (p) => `${p.protocolo} ${p.titulo} ${p.cliente} ${p.responsavel}`,
      onRow: (p) => { fechar(); ir(`pedido/${p.id}`); },
      colunas: colunasPedido(true),
    }),
  });
}

export function colunasPedido(compacto = false) {
  const c = [
    { k: "protocolo", rotulo: "Pedido", render: (p) => `<span class="mono">${esc(p.protocolo || p.externalId)}</span>` },
    { k: "titulo", rotulo: "Motivo", render: (p) => `<div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.titulo)}">${esc(p.titulo)}</div><div class="small muted">${esc(p.cliente || "")}</div>` },
    { k: "status", rotulo: "Status", render: (p) => pillStatus(p.status) },
    { k: "slaPct", rotulo: "SLA", render: pillSla, sort: (p) => p.slaPct },
    { k: "responsavel", rotulo: "Responsável" },
    { k: "abertura", rotulo: "Abertura", render: (p) => `<span class="num">${fmtDateTime(p.abertura)}</span>` },
    { k: "total", rotulo: "Tempo total", n: true, render: (p) => fmtDur(p.total) },
  ];
  if (!compacto) {
    c.splice(4, 0, { k: "prioridade", rotulo: "Prioridade", render: (p) => pillPrioridade(p.prioridade), sort: (p) => ({ urgente: 4, alta: 3, media: 2, baixa: 1 }[p.prioridade]) });
    c.splice(6, 0, { k: "equipe", rotulo: "Equipe" });
    c.push({ k: "trabalho", rotulo: "Em atendimento", n: true, render: (p) => fmtDur(p.tempo.trabalho), sort: (p) => p.tempo.trabalho, titulo: "Tempo em status de atendimento ativo" });
    c.push({ k: "espera", rotulo: "Em espera", n: true, render: (p) => fmtDur(p.tempo.espera_externa + p.tempo.espera_interna), sort: (p) => p.tempo.espera_externa + p.tempo.espera_interna });
    c.push({ k: "esforcoMin", rotulo: "Esforço registrado", n: true, render: (p) => (p.nTarefas ? fmtDur(p.esforcoMin * 60e3) : `<span class="muted">sem tarefas</span>`), titulo: "Soma das tarefas registradas" });
  }
  return c;
}

// ── Layout ───────────────────────────────────────────────────
function shell() {
  document.getElementById("app").innerHTML = `
  <div class="app">
    <aside class="side" id="side">
      <div class="brand">${LOGO}<div><div class="brand-name">N2 Radar</div><div class="brand-sub">Inteligência operacional</div></div></div>
      <nav class="nav" id="nav" aria-label="Principal">
        ${Object.entries(ROTAS).filter(([, r]) => !r.oculto).map(([k, r]) => `<a href="#/${k}" data-r="${k}">${icon(r.icone)}<span>${r.titulo}</span>${k === "gargalos" ? `<span class="count" id="cnt-gargalos" hidden></span>` : ""}</a>`).join("")}
      </nav>
      <div class="side-foot">
        <div class="sync-box" id="sync-box"></div>
        <button class="btn primary" id="btn-sync" ${S.fonte.podeImportar ? "" : "hidden"}>${icon("refresh")} ${S.fonte.modo === "firebase" ? "Sincronização" : "Importar do Baseline"}</button>
        <div style="display:flex;gap:6px">
          <button class="btn ghost sm" id="btn-tema" title="Alternar tema claro/escuro">${icon("moon")} Tema</button>
          ${S.fonte.modo === "firebase" ? `<button class="btn ghost sm" id="btn-sair">${icon("logout")} Sair</button>` : ""}
        </div>
        <div class="user-line"><span class="avatar">${esc((S.usuario.nome || "?").split(" ").map((x) => x[0]).slice(0, 2).join(""))}</span><span><b style="font-weight:500">${esc(S.usuario.nome)}</b><br><span class="muted">${esc(S.usuario.papel)}</span></span></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-row">
          <button class="btn ghost menu-btn" id="btn-menu" aria-label="Abrir menu">${icon("menu")}</button>
          <div><h1 class="page-title" id="page-title"></h1><div class="page-sub" id="page-sub"></div></div>
        </div>
        <div class="filters" id="filtros"></div>
      </header>
      <main class="content" id="content">
        <div class="demo-banner" id="banner-vazio" hidden>${icon("info", "")}<span><b>Ainda não há pedidos.</b> Siga os 3 passos em <a href="#/config">Configurações → Integração</a> para coletar e importar os Pedidos de Ajuda do Baseline.</span></div>
        ${S.fonte.modo === "local" ? `<div class="demo-banner">${icon("info", "")}<span><b>Sem Firebase:</b> os pedidos ficam só neste navegador. Configure o Firebase em <span class="code-inline">js/config.js</span> para compartilhar com a equipe.</span></div>` : ""}
        <div id="view" style="display:flex;flex-direction:column;gap:20px"></div>
      </main>
    </div>
  </div>`;
  document.getElementById("btn-sync").onclick = sincronizar;
  document.getElementById("btn-tema").onclick = alternarTema;
  document.getElementById("btn-sair")?.addEventListener("click", () => S.fonte.sair());
  document.getElementById("btn-menu").onclick = () => document.getElementById("side").classList.toggle("open");
  document.getElementById("nav").onclick = () => document.getElementById("side").classList.remove("open");
}

function temaAtual() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function alternarTema() {
  const novo = temaAtual() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = novo;
  lsSet("n2radar.tema", novo);
  renderView();
}

function sincronizar() {
  if (S.fonte.modo === "firebase") { ir("config"); return; }
  abrirImportacao(S, () => renderView());
}

function renderSync() {
  const el = document.getElementById("sync-box");
  if (!el) return;
  const s = S.sync || {};
  const r = s.ultimoResultado;
  const idade = s.ultimaExecucao ? Date.now() - s.ultimaExecucao : null;
  const intervalo = (S.cfg.integracao.intervaloMin || 1440) * 60e3;
  const bv = document.getElementById("banner-vazio");
  if (bv) bv.hidden = S.raw.pedidos.length > 0;
  const co = s.coletor;
  const auto = co?.ultimaVerificacao && Date.now() - co.ultimaVerificacao < 3 * 60e3;
  if (auto) {
    el.innerHTML = `
    <div class="sync-line"><span class="dot"></span><span>Sincronização automática</span></div>
    <div class="muted">verificado há ${fmtDur(Date.now() - co.ultimaVerificacao)} · a cada ${co.intervaloSeg || 30}s</div>
    ${s.ultimaExecucao ? `<div class="muted">última mudança há ${fmtDur(idade)}</div>` : ""}`;
  } else {
    const tom = !s.ultimaExecucao ? "idle" : idade > intervalo ? "warn" : "";
    el.innerHTML = `
    <div class="sync-line"><span class="dot ${tom}"></span><span>${co?.ultimaVerificacao ? "Sincronização automática parada" : s.ultimaExecucao ? "Baseline importado" : "Nenhuma importação ainda"}</span></div>
    ${co?.ultimaVerificacao ? `<div class="muted">última verificação há ${fmtDur(Date.now() - co.ultimaVerificacao)}</div>` : ""}
    ${s.ultimaExecucao ? `<div class="muted">há ${fmtDur(idade)} · ${fmtNum(S.raw.pedidos.length)} pedido(s)</div>` : ""}`;
  }
  const cnt = document.getElementById("cnt-gargalos");
  if (cnt) {
    const n = S.E.filter((p) => p.parado || p.atrasado).length;
    cnt.hidden = !n; cnt.textContent = n; cnt.title = `${n} pedido(s) parados ou atrasados`;
  }
}

// ── Barra de filtros ─────────────────────────────────────────
function opcoesFiltro(k) {
  const tipoLabel = { status: "status", prioridade: "prioridade", categoria: "categoria", motivoDemora: "motivoDemora", tipoTarefa: "tipoTarefa" }[k];
  if (k === "sla") return [["cumprido", "Dentro do SLA"], ["violado", "Fora do SLA / atrasado"], ["risco", "Em risco"], ["no_prazo", "No prazo (aberto)"]].map(([v, rotulo]) => ({ v, rotulo, n: S.E.filter((p) => p.slaStatus === v).length }));
  if (k === "tipoTarefa") return TAX.tiposTarefa.map((t) => ({ v: t.id, rotulo: t.rotulo }));
  const cont = new Map();
  S.E.forEach((p) => { const v = p[k] ?? "__vazio"; cont.set(v, (cont.get(v) || 0) + 1); });
  return [...cont].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n, rotulo: v === "__vazio" ? "(não informado)" : tipoLabel ? label(tipoLabel, v) : v }));
}

function renderFiltros() {
  const el = document.getElementById("filtros");
  const r = ROTAS[S.rota];
  if (!r?.filtros) { el.hidden = true; return; }
  el.hidden = false;
  const f = S.filtros;
  const ativos = FILTER_KEYS.filter(([k]) => f[k]?.length);
  const presets = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["180", "6 meses"], ["365", "12 meses"], ["custom", "Personalizado"]];
  el.innerHTML = `
    <div class="seg" role="group" aria-label="Período">${presets.map(([v, t]) => `<button type="button" data-preset="${v}" aria-pressed="${f.preset === v}">${t}</button>`).join("")}</div>
    ${f.preset === "custom" ? `<span class="date-range"><input type="date" class="input" id="f-ini" value="${toDateInput(f.inicio)}" aria-label="Data inicial"><span class="muted">a</span><input type="date" class="input" id="f-fim" value="${toDateInput(f.fim)}" aria-label="Data final"></span>` : ""}
    <span style="position:relative"><button class="btn sm" id="btn-filtros" style="height:28px">${icon("filter")} Filtros${ativos.length ? ` (${ativos.length})` : ""}</button></span>
    ${ativos.map(([k, rot]) => `<span class="chip">${esc(rot)}: ${esc(f[k].slice(0, 2).map((v) => opcoesFiltro(k).find((o) => o.v === v)?.rotulo ?? v).join(", "))}${f[k].length > 2 ? ` +${f[k].length - 2}` : ""}<button data-limpar="${k}" aria-label="Remover filtro ${esc(rot)}">${icon("x")}</button></span>`).join("")}
    ${ativos.length ? `<button class="btn ghost sm" id="btn-limpar">Limpar filtros</button>` : ""}
    <span class="muted small" style="margin-left:auto">Período pela data de abertura</span>`;
  el.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
    S.filtros.preset = b.dataset.preset;
    lsSet(LSF, S.filtros); renderFiltros(); renderView();
  }));
  const di = el.querySelector("#f-ini"), dfim = el.querySelector("#f-fim");
  if (di) {
    const upd = () => {
      if (!di.value || !dfim.value) return;
      S.filtros.inicio = new Date(di.value + "T00:00:00").getTime();
      S.filtros.fim = new Date(dfim.value + "T23:59:59").getTime();
      lsSet(LSF, S.filtros); renderView();
    };
    di.onchange = upd; dfim.onchange = upd;
  }
  el.querySelectorAll("[data-limpar]").forEach((b) => (b.onclick = () => setFiltro(b.dataset.limpar, [])));
  el.querySelector("#btn-limpar")?.addEventListener("click", () => {
    FILTER_KEYS.forEach(([k]) => (S.filtros[k] = []));
    lsSet(LSF, S.filtros); renderFiltros(); renderView();
  });
  el.querySelector("#btn-filtros").onclick = (e) => {
    e.stopPropagation();
    const ex = document.getElementById("pop-filtros");
    if (ex) { ex.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "pop"; pop.id = "pop-filtros";
    pop.style.top = "34px"; pop.style.left = "0";
    pop.innerHTML = `<div class="filter-grid">${FILTER_KEYS.map(([k]) => `<div data-ms="${k}"></div>`).join("")}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn sm" data-fechar>Fechar</button></div>`;
    e.currentTarget.parentElement.appendChild(pop);
    const r = pop.getBoundingClientRect();
    if (r.right > innerWidth - 16) pop.style.left = `${innerWidth - 16 - r.right}px`;
    FILTER_KEYS.forEach(([k, rot]) => multiSelect(pop.querySelector(`[data-ms="${k}"]`), {
      rotulo: rot, opcoes: opcoesFiltro(k), selecionados: S.filtros[k],
      onChange: (v) => { S.filtros[k] = v; lsSet(LSF, S.filtros); renderView(); atualizarChipsSemFechar(); },
    }));
    pop.onclick = (ev) => ev.stopPropagation();
    pop.querySelector("[data-fechar]").onclick = () => { pop.remove(); renderFiltros(); };
    const fora = () => { if (pop.isConnected) { pop.remove(); renderFiltros(); } document.removeEventListener("click", fora); };
    setTimeout(() => document.addEventListener("click", fora), 0);
  };
}
function atualizarChipsSemFechar() {
  const b = document.getElementById("btn-filtros");
  const n = FILTER_KEYS.filter(([k]) => S.filtros[k]?.length).length;
  if (b) b.innerHTML = `${icon("filter")} Filtros${n ? ` (${n})` : ""}`;
}

// ── Render da rota atual ─────────────────────────────────────
let renderPendente = false;
export function renderView() {
  if (renderPendente) return;
  renderPendente = true;
  requestAnimationFrame(() => {
    renderPendente = false;
    const r = ROTAS[S.rota] || ROTAS.dashboard;
    document.querySelectorAll("#nav a").forEach((a) => (a.dataset.r === (S.rota === "pedido" ? "pedidos" : S.rota) ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.getElementById("page-title").textContent = r.titulo;
    document.getElementById("page-sub").textContent = r.sub;
    destroyCharts();
    const el = document.getElementById("view");
    try {
      r.view.render(el, contexto(), S.param);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="panel"><div class="empty">Erro ao montar esta página: ${esc(e.message)}</div></div>`;
    }
    renderSync();
  });
}

function rotear() {
  const [, rota = "dashboard", param = null] = location.hash.match(/^#\/?([\w-]+)?\/?(.+)?$/) || [];
  S.rota = ROTAS[rota] ? rota : "dashboard";
  S.param = param ? decodeURIComponent(param) : null;
  renderFiltros();
  renderView();
  document.getElementById("content")?.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

export async function salvarConfig(doc, valor) {
  await S.fonte.salvarConfig(doc, valor);
  S.cfg[doc] = valor;
  if (doc === "taxonomia") setTaxonomia(valor);
  recalcular();
}

// ── Inicialização ────────────────────────────────────────────
function gate(html) {
  document.getElementById("app").innerHTML = `<div class="gate"><div class="panel">${LOGO.replace('class="brand-mark"', 'class="brand-mark" style="width:44px;height:44px;margin:0 auto"')}${html}</div></div>`;
}

async function iniciar() {
  const tema = lsGet("n2radar.tema", null);
  if (tema) document.documentElement.dataset.theme = tema;
  try {
    if (APP_CONFIG.firebase) {
      gate(`<p class="muted">Conectando…</p>`);
      const { criarFonteFirebase } = await import("./services/source-firebase.js");
      S.fonte = await criarFonteFirebase({
        onAuthUI: (st) => {
          if (st.estado === "login") {
            gate(`<h2 style="font:600 20px var(--cond)">N2 Radar</h2><p class="muted" style="margin:0">Entre com sua conta Google corporativa para acessar os indicadores N2.</p>${st.erro ? `<p style="color:var(--crit);margin:0">${esc(st.erro)}</p>` : ""}<button class="btn primary" id="btn-login">Entrar com Google</button>`);
            document.getElementById("btn-login").onclick = st.entrar;
          } else if (st.estado === "pendente") {
            gate(`<h2 style="font:600 20px var(--cond)">Acesso pendente</h2><p class="muted" style="margin:0">Sua solicitação foi registrada para <b>${esc(st.email)}</b>. Um administrador precisa liberar seu acesso em Configurações → Usuários.</p><button class="btn" id="btn-sair">Sair</button>`);
            document.getElementById("btn-sair").onclick = st.sair;
          }
        },
      });
    } else {
      // Sem Firebase: pedidos importados guardados só neste navegador.
      const { criarFonteBaseline } = await import("./services/source-baseline.js");
      S.fonte = await criarFonteBaseline();
    }
  } catch (e) {
    gate(`<h2 style="font:600 20px var(--cond)">Não foi possível iniciar</h2><p style="color:var(--crit);margin:0">${esc(e.message)}</p><p class="note">Confira o firebaseConfig em js/config.js e a conexão com a internet.</p>`);
    return;
  }
  S.usuario = S.fonte.usuario;
  S.cfg = await S.fonte.carregarConfig();
  setTaxonomia(S.cfg.taxonomia);
  const salvo = lsGet(LSF, null);
  S.filtros = salvo && salvo.preset ? { ...filtrosPadrao(), ...salvo } : filtrosPadrao();
  shell();
  document.getElementById("view").innerHTML = `<div class="panel"><div class="empty">Carregando pedidos…</div></div>`;
  await S.fonte.iniciar(
    (dados) => {
      S.raw = dados;
      recalcular();
      if (!S.carregado) { S.carregado = true; rotear(); }
      else if (S.rota !== "config") renderView();
      else renderSync();
    },
    (st) => { S.sync = st; renderSync(); },
    (msg) => toast(msg, "erro"),
  );
  addEventListener("hashchange", rotear);
  // tempos de pedidos abertos crescem com o relógio: recalcula a cada 5 min
  setInterval(() => { if (S.carregado) { recalcular(); if (!["config", "pedido"].includes(S.rota)) renderView(); else renderSync(); } }, 5 * 60e3);
  setInterval(renderSync, 30e3);
}

iniciar();
