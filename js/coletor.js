// ─────────────────────────────────────────────────────────────
// N2 Radar · sincronização automática com o Baseline IXCSoft.
//
// Roda NA ABA DO BASELINE (favorito ou Tampermonkey), com a sessão já logada
// do analista. A cada 30 s lê as listas de Pedidos de Ajuda, detecta o que
// mudou, abre só esses pedidos e grava direto no Firestore do N2 Radar.
// A cada 30 min faz uma varredura completa dos últimos 30 dias.
//
// Só faz leituras (GET) no Baseline. Grava no Firebase com o login Google de
// quem está rodando (precisa ser admin ou gestor no Radar).
// ─────────────────────────────────────────────────────────────
import { APP_CONFIG } from "./config.js";
import { normalizar } from "./services/baseline.js";

const INTERVALO_MS = 30e3;
const COMPLETO_MS = 30 * 60e3;
const DIAS_COMPLETO = 30;
const HEARTBEAT_MS = 2 * 60e3;
const LS_CACHE = "n2radar.coletor.v2";
const LS_LIDER = "n2radar.coletor.lider";
const ABAS_ABERTAS = ["unclaimed", "pending"];
const ABAS_FECHADAS = ["history", "declined"];
const CAMPOS = ["id", "name", "email", "protocol", "client_id", "client_name", "description", "attendance_reason", "is_automatic",
  "department", "origin_department_id", "urgency", "created_at", "updated_at", "assigned_to", "assigned_at", "solution", "resolved_by",
  "resolved_at", "declined_by", "declined_at", "well_documented", "service_assumed", "current_responsible_id", "request_origin_status",
  "documentation_quality_label"];
const CDN = (m) => `https://www.gstatic.com/firebasejs/${APP_CONFIG.firebaseSdkVersion}/firebase-${m}.js`;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hora = (t) => new Date(t).toLocaleTimeString("pt-BR");
const semUndefined = (o) => JSON.parse(JSON.stringify(o, (_, v) => (v === undefined ? null : v)));
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ } };

// ── Painel flutuante (shadow DOM para não herdar o CSS do Baseline) ──
function criarPainel() {
  const host = document.createElement("div");
  host.id = "n2radar-coletor";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000";
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `<style>
    .box{width:320px;background:#0f1d24;color:#e8eef0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px/1.45 system-ui,-apple-system,sans-serif;overflow:hidden}
    .h{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer}
    .dot{width:9px;height:9px;border-radius:50%;background:#7a8a90;flex:none}
    .dot.ok{background:#2bb3a0}.dot.run{background:#e0b341}.dot.err{background:#d0584f}
    .t{font-weight:600;flex:1}.s{color:#9fb2b8;font-size:12px}
    .b{padding:0 12px 12px;display:grid;gap:8px}
    .row{display:flex;gap:6px;flex-wrap:wrap}
    button{font:inherit;font-size:12px;border-radius:7px;padding:5px 10px;cursor:pointer;border:1px solid #3d5860;background:transparent;color:#d6e4e8}
    button.p{background:#2bb3a0;border-color:#2bb3a0;color:#062a26;font-weight:600}
    .bar{height:4px;background:#26383f;border-radius:2px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#2bb3a0;transition:width .2s}
    .min .b{display:none}
    a{color:#7fd6c8}
  </style>
  <div class="box"><div class="h"><span class="dot"></span><span class="t">N2 Radar</span><span class="s" data-s></span></div>
  <div class="b"><div data-m>Iniciando…</div><div class="bar" data-bar hidden><i></i></div><div class="row" data-acoes></div></div></div>`;
  document.body.appendChild(host);
  const $ = (s) => sh.querySelector(s);
  $(".h").onclick = () => $(".box").classList.toggle("min");
  return {
    host,
    set({ tom, curto, msg, prog, acoes }) {
      if (tom !== undefined) $(".dot").className = `dot ${tom}`;
      if (curto !== undefined) $("[data-s]").textContent = curto;
      if (msg !== undefined) $("[data-m]").innerHTML = msg;
      if (prog !== undefined) { $("[data-bar]").hidden = prog == null; if (prog != null) $("[data-bar] i").style.width = `${Math.round(prog * 100)}%`; }
      if (acoes) {
        const box = $("[data-acoes]"); box.innerHTML = "";
        acoes.forEach(([rot, fn, prim]) => { const b = document.createElement("button"); b.textContent = rot; if (prim) b.className = "p"; b.onclick = fn; box.appendChild(b); });
      }
    },
    minimizar(v = true) { $(".box").classList.toggle("min", v); },
  };
}

// ── Leitura do Baseline ──────────────────────────────────────
async function html(url) {
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 3000 * (t + 1))); continue; }
    if ((r.redirected && /login/.test(r.url)) || r.status === 401 || r.status === 419) throw new Error("SESSAO");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new DOMParser().parseFromString(await r.text(), "text/html");
  }
  throw new Error("O Baseline limitou as requisições (429).");
}

// Lista uma aba e devolve { id → assinatura da linha } (a linha muda quando o pedido muda).
async function listarAba(aba, { filtro = "", maxPaginas = 1000 } = {}, usuarios) {
  const linhas = new Map();
  for (let page = 1; page <= maxPaginas; page++) {
    const d = await html(`/admin/help-requests?activeTab=${aba}${filtro}&page=${page}`);
    if (usuarios && page === 1) d.querySelectorAll("[wire\\:click*='collaborator_']").forEach((b) => {
      const m = b.getAttribute("wire:click").match(/collaborator_(\d+)/);
      if (m) usuarios[m[1]] = b.textContent.trim().replace(/\s+/g, " ");
    });
    let novos = 0;
    d.querySelectorAll("a[href*='/admin/help-requests/']").forEach((a) => {
      const id = (a.getAttribute("href").match(/\/admin\/help-requests\/(\d+)(?:$|[?#])/) || [])[1];
      if (!id || linhas.has(id)) return;
      const tr = a.closest("tr");
      linhas.set(id, hash((tr?.textContent || id).replace(/\s+/g, " ").trim()));
      novos++;
    });
    if (!novos) break;
    const total = Number((d.body.textContent.match(/de\s+([\d.]+)\s+resultados/) || [])[1]?.replace(/\./g, "")) || 0;
    if (!total || linhas.size >= total) break;
  }
  return linhas;
}

async function lerPedido(id) {
  const d = await html(`/admin/help-requests/${id}`);
  for (const el of d.querySelectorAll("[wire\\:snapshot]")) {
    const s = JSON.parse(el.getAttribute("wire:snapshot"));
    if (/help-request/.test(s.memo?.name || "") && s.data?.data) {
      const rec = Array.isArray(s.data.data) ? s.data.data[0] : s.data.data;
      if (rec?.id == null) break;
      const o = {};
      CAMPOS.forEach((k) => { if (k in rec) o[k] = rec[k]; });
      return o;
    }
  }
  throw new Error(`pedido ${id} sem dados`);
}

// ── Ponto de entrada ─────────────────────────────────────────
export async function iniciar({ auto = false } = {}) {
  if (!/(^|\.)baseline\.ixcsoft\.com\.br$/.test(location.hostname)) {
    alert("N2 Radar: abra o Baseline (baseline.ixcsoft.com.br) já logado e clique no favorito de novo.");
    return;
  }
  if (window.__n2radarColetor) { window.__n2radarColetor.mostrar(); return; }
  const painel = criarPainel();
  const meuId = Math.random().toString(36).slice(2);
  const estado = { rodando: true, timer: null, ultimoCompleto: 0, ultimoHeartbeat: 0, ultimaMudanca: null, contagem: { novos: 0, alterados: 0 } };
  window.__n2radarColetor = { mostrar: () => painel.minimizar(false), estado };
  if (auto) painel.minimizar(true);

  // Firebase (app separado, login persistido no navegador para este site)
  let A, F, auth, db;
  try {
    const [{ initializeApp }, a, f] = await Promise.all([import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))]);
    A = a; F = f;
    const app = initializeApp(APP_CONFIG.firebase, "n2radar-coletor");
    auth = A.getAuth(app);
    db = F.getFirestore(app);
  } catch (e) {
    painel.set({ tom: "err", curto: "erro", msg: `Não foi possível carregar o Firebase: ${e.message}` });
    return;
  }

  const usuario = await new Promise((resolve) => {
    A.onAuthStateChanged(auth, async (u) => {
      if (!u) {
        painel.minimizar(false);
        painel.set({ tom: "", curto: "desconectado", msg: "Entre com a mesma conta Google do N2 Radar para sincronizar automaticamente.", acoes: [["Entrar com Google", () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch((e) => painel.set({ msg: `Login não concluído: ${e.code || e.message}` })), true], ["Fechar", fechar]] });
        return;
      }
      const perfil = (await F.getDoc(F.doc(db, "usuarios", u.uid)).catch(() => null))?.data();
      if (!perfil?.ativo || !["admin", "gestor"].includes(perfil.papel)) {
        painel.minimizar(false);
        painel.set({ tom: "err", curto: "sem permissão", msg: `${u.email} não é admin/gestor ativo no N2 Radar. Peça acesso a um administrador.`, acoes: [["Trocar conta", () => A.signOut(auth)], ["Fechar", fechar]] });
        return;
      }
      resolve({ uid: u.uid, nome: perfil.nome || u.displayName || u.email, email: u.email });
    });
  });

  function fechar() {
    estado.rodando = false;
    clearTimeout(estado.timer);
    const l = lsGet(LS_LIDER, null);
    if (l?.id === meuId) localStorage.removeItem(LS_LIDER);
    painel.host.remove();
    delete window.__n2radarColetor;
  }
  function pausar() {
    estado.rodando = !estado.rodando;
    if (estado.rodando) agendar(0); else { clearTimeout(estado.timer); painel.set({ tom: "", curto: "pausado", msg: "Sincronização pausada.", acoes: acoesPadrao() }); }
  }
  const acoesPadrao = () => [[estado.rodando ? "Pausar" : "Retomar", pausar, !estado.rodando], ["Varredura completa", () => { estado.ultimoCompleto = 0; agendar(0); }], ["Abrir Radar", () => window.open(APP_CONFIG.urlPublica || "https://dodomoura.github.io/n2-radar/", "_blank")], ["Fechar", fechar]];
  const agendar = (ms) => { clearTimeout(estado.timer); estado.timer = setTimeout(ciclo, ms); };

  // Só uma aba sincroniza por vez (as outras ficam de reserva).
  function souLider() {
    const l = lsGet(LS_LIDER, null);
    if (l && l.id !== meuId && Date.now() - l.ts < INTERVALO_MS * 3) return false;
    lsSet(LS_LIDER, { id: meuId, ts: Date.now() });
    return true;
  }

  async function gravar(registros, usuarios, cache) {
    let novos = 0, alterados = 0;
    const mudados = [];
    for (const r of registros) {
      const h = hash(JSON.stringify(r));
      if (cache.hash[r.id] === h) continue;
      if (cache.hash[r.id]) alterados++; else novos++;
      mudados.push([r, h]);
    }
    for (let i = 0; i < mudados.length; i += 400) {
      const b = F.writeBatch(db);
      mudados.slice(i, i + 400).forEach(([r]) => {
        const { classificacao, id, ...p } = normalizar(r, usuarios);
        b.set(F.doc(db, "pedidos", id), semUndefined({ ...p, baseline: r, importadoEm: Date.now() }), { merge: true });
      });
      await b.commit();
    }
    mudados.forEach(([r, h]) => (cache.hash[r.id] = h));
    return { novos, alterados };
  }

  async function ciclo() {
    if (!estado.rodando) return;
    if (!souLider()) {
      painel.set({ tom: "", curto: "reserva", msg: "Outra aba do Baseline já está sincronizando. Esta assume se aquela fechar.", prog: null, acoes: [["Fechar", fechar]] });
      return agendar(INTERVALO_MS);
    }
    const cache = lsGet(LS_CACHE, { sig: {}, hash: {}, abertos: [], usuarios: {} });
    const completo = Date.now() - estado.ultimoCompleto > COMPLETO_MS;
    const inicio = Date.now();
    painel.set({ tom: "run", curto: completo ? "varredura…" : "verificando…", acoes: acoesPadrao() });
    try {
      // 1. listas
      const usuarios = { ...cache.usuarios };
      const linhas = new Map();
      const abertos = new Set();
      const filtro = completo ? `&tableFilters[created_at][from]=${iso(new Date(Date.now() - DIAS_COMPLETO * 864e5))}&tableFilters[created_at][until]=${iso(new Date())}` : "";
      for (const aba of ABAS_ABERTAS) {
        const l = await listarAba(aba, {}, aba === ABAS_ABERTAS[0] ? usuarios : null);
        l.forEach((s, id) => { linhas.set(id, s); abertos.add(id); });
      }
      for (const aba of ABAS_FECHADAS) {
        const l = await listarAba(aba, completo ? { filtro } : { maxPaginas: 1 });
        l.forEach((s, id) => linhas.set(id, s));
      }
      // 2. o que mudou: linha nova/alterada, ou pedido que saiu da fila de abertos
      const candidatos = new Set();
      linhas.forEach((s, id) => { if (cache.sig[id] !== s || !cache.hash[id]) candidatos.add(id); });
      cache.abertos.filter((id) => !abertos.has(id)).forEach((id) => candidatos.add(id));
      // 3. detalhes só dos candidatos
      const lista = [...candidatos];
      const registros = [];
      let i = 0, feitos = 0, falhas = 0;
      const worker = async () => {
        while (i < lista.length && estado.rodando) {
          const id = lista[i++];
          try { registros.push(await lerPedido(id)); } catch (e) { if (e.message === "SESSAO") throw e; falhas++; }
          feitos++;
          if (lista.length > 8) painel.set({ msg: `Lendo pedidos alterados: ${feitos} de ${lista.length}…`, prog: feitos / lista.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, lista.length || 1) }, worker));
      // 4. grava no Firestore
      const r = await gravar(registros, usuarios, cache);
      registros.forEach((x) => { const s = linhas.get(String(x.id)); if (s) cache.sig[x.id] = s; });
      linhas.forEach((s, id) => { if (cache.hash[id] && !candidatos.has(id)) cache.sig[id] = s; });
      cache.abertos = [...abertos];
      const usuariosMudaram = JSON.stringify(usuarios) !== JSON.stringify(cache.usuarios);
      cache.usuarios = usuarios;
      lsSet(LS_CACHE, cache);
      if (completo) estado.ultimoCompleto = Date.now();
      estado.contagem.novos += r.novos; estado.contagem.alterados += r.alterados;
      if (r.novos || r.alterados) estado.ultimaMudanca = Date.now();

      // 5. status para o Radar (em mudança ou a cada 2 min)
      const agora = Date.now();
      if (r.novos || r.alterados || usuariosMudaram || agora - estado.ultimoHeartbeat > HEARTBEAT_MS) {
        const st = { coletor: { ativo: true, por: usuario.nome, ultimaVerificacao: agora, intervaloSeg: INTERVALO_MS / 1000 }, usuarios };
        if (r.novos || r.alterados) Object.assign(st, { ultimaExecucao: agora, ultimoResultado: { ok: true, lidos: linhas.size, novos: r.novos, alterados: r.alterados, inalterados: linhas.size - r.novos - r.alterados, motivo: "automatico" } });
        await F.setDoc(F.doc(db, "status", "sync"), semUndefined(st), { merge: true });
        estado.ultimoHeartbeat = agora;
      }
      painel.set({
        tom: "ok", curto: `ok · ${hora(agora)}`, prog: null,
        msg: `Sincronizando a cada ${INTERVALO_MS / 1000}s.<br>Última verificação: ${hora(agora)} (${((agora - inicio) / 1000).toFixed(1)}s${completo ? ", varredura completa" : ""}).<br>${r.novos || r.alterados ? `<b>${r.novos} novo(s), ${r.alterados} atualizado(s) agora.</b>` : "Nada mudou."}${falhas ? ` ${falhas} pedido(s) não puderam ser lidos.` : ""}<br><span style="color:#9fb2b8">Nesta sessão: ${estado.contagem.novos} novo(s), ${estado.contagem.alterados} atualizado(s). Deixe esta aba aberta.</span>`,
        acoes: acoesPadrao(),
      });
      agendar(INTERVALO_MS);
    } catch (e) {
      if (e.message === "SESSAO") {
        painel.minimizar(false);
        painel.set({ tom: "err", curto: "sessão expirada", prog: null, msg: "Sua sessão no Baseline expirou. Faça login no Baseline de novo; a sincronização volta sozinha.", acoes: acoesPadrao() });
        return agendar(60e3);
      }
      painel.set({ tom: "err", curto: "erro", prog: null, msg: `Falha: ${e.code || e.message}. Tentando de novo em 1 min.`, acoes: acoesPadrao() });
      agendar(60e3);
    }
  }

  painel.set({ tom: "run", curto: "conectado", msg: `Conectado como ${usuario.email}. Iniciando…`, acoes: acoesPadrao() });
  addEventListener("beforeunload", () => { const l = lsGet(LS_LIDER, null); if (l?.id === meuId) localStorage.removeItem(LS_LIDER); });
  ciclo();
}
