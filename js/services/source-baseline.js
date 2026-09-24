// ─────────────────────────────────────────────────────────────
// Fonte "Baseline (importação)": pedidos reais importados do Baseline
// IXCSoft pelo coletor, guardados no IndexedDB deste navegador.
// Usada quando o Firebase não está configurado. Mesma interface da fonte Firebase. Classificações e tarefas
// registradas no Radar ficam separadas dos registros importados, então
// uma nova importação atualiza os pedidos sem apagar o que foi anotado.
// ─────────────────────────────────────────────────────────────
import { DEFAULT_REGRAS, DEFAULT_INTEGRACAO } from "../config.js";
import { defaultTaxonomia } from "../core/taxonomy.js";
import { normalizar, historicoDerivado, mesclarPacote, lerPacote } from "./baseline.js";

const DB = "n2radar-baseline", STORE = "kv";

// ── armazenamento chave-valor (IndexedDB, com fallback em memória) ──
function abrirDB() {
  return new Promise((ok, erro) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    } catch (e) { erro(e); }
  });
}
async function criarKV() {
  const mem = new Map();
  let db = null;
  try { db = await abrirDB(); } catch { db = null; }
  const tx = (modo, fn) => new Promise((ok, erro) => {
    const t = db.transaction(STORE, modo);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
  });
  return {
    persistente: !!db,
    async get(k, padrao) {
      if (!db) return mem.has(k) ? structuredClone(mem.get(k)) : padrao;
      try { const v = await tx("readonly", (s) => s.get(k)); return v === undefined ? padrao : v; } catch { return padrao; }
    },
    async set(k, v) {
      if (!db) { mem.set(k, structuredClone(v)); return; }
      await tx("readwrite", (s) => s.put(v, k));
    },
    async limpar() {
      mem.clear();
      if (db) await tx("readwrite", (s) => s.clear());
    },
  };
}

export async function temDadosBaseline() {
  try {
    const kv = await criarKV();
    const r = await kv.get("registros", null);
    return !!(r && Object.keys(r).length);
  } catch { return false; }
}

export async function criarFonteBaseline() {
  const kv = await criarKV();
  let registros = await kv.get("registros", {}); // id Baseline → registro cru
  let usuarios = await kv.get("usuarios", {});
  let classificacoes = await kv.get("classificacoes", {}); // pedidoId → patch
  let tarefas = await kv.get("tarefas", []);
  let eventos = await kv.get("eventos", []); // histórico de ações manuais
  let importacoes = await kv.get("importacoes", []);
  const cfgSalva = await kv.get("config", {});
  const config = {
    regras: { ...structuredClone(DEFAULT_REGRAS), ...(cfgSalva.regras || {}) },
    taxonomia: cfgSalva.taxonomia || defaultTaxonomia(),
    integracao: { ...structuredClone(DEFAULT_INTEGRACAO), nome: "Baseline IXCSoft", fonteId: "baseline", ...(cfgSalva.integracao || {}) },
  };
  let cb = () => {}, cbStatus = () => {};

  const pedidos = () => Object.values(registros).map((r) => {
    const p = normalizar(r, usuarios);
    const c = classificacoes[p.id];
    if (c) p.classificacao = { ...c };
    return p;
  }).filter((p) => p.abertura);
  const status = () => {
    const u = importacoes.at(-1);
    return u ? { ultimaExecucao: u.em, ultimoResultado: { ok: true, lidos: u.lidos, novos: u.novos, alterados: u.alterados, inalterados: u.inalterados, motivo: "importacao" }, importacoes: importacoes.slice(-20) } : {};
  };
  const emit = () => { cb({ pedidos: pedidos(), tarefas: tarefas.slice() }); cbStatus(status()); };
  const evento = (e) => { eventos.push({ id: `m${Date.now()}_${eventos.length}`, em: Date.now(), origem: "manual", ...e }); return kv.set("eventos", eventos); };

  return {
    modo: "local",
    podeImportar: true,
    persistente: kv.persistente,
    usuario: { nome: "Você (dados locais)", email: "", papel: "admin", uid: "local" },
    async iniciar(onData, onStatus) { cb = onData; cbStatus = onStatus; emit(); },
    async carregarConfig() { return structuredClone(config); },
    async salvarConfig(doc, valor) {
      config[doc] = structuredClone(valor);
      await kv.set("config", config);
    },
    async historico(pedidoId) {
      const ext = pedidoId.replace(/^baseline_/, "");
      const base = registros[ext] ? historicoDerivado(registros[ext], usuarios) : [];
      return [...base, ...eventos.filter((e) => e.pedidoId === pedidoId)].sort((a, b) => a.em - b.em);
    },
    async salvarClassificacao(pedidoId, patch, usuario) {
      const antes = { ...(classificacoes[pedidoId] || {}) };
      classificacoes[pedidoId] = { ...antes, ...patch };
      await kv.set("classificacoes", classificacoes);
      for (const [k, v] of Object.entries(patch))
        if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(v ?? null))
          await evento({ pedidoId, evento: "classificacao", campo: k, de: antes[k] ?? null, para: v ?? null, usuario: usuario.nome });
      emit();
    },
    async salvarTarefa(t, usuario) {
      const nova = !t.id;
      if (nova) { t = { ...t, id: `t${Date.now().toString(36)}`, criadoPor: usuario.uid, origem: "manual" }; tarefas.push(t); }
      else { const i = tarefas.findIndex((x) => x.id === t.id); tarefas[i] = { ...tarefas[i], ...t }; }
      await kv.set("tarefas", tarefas);
      await evento({ pedidoId: t.pedidoId, evento: "tarefa", campo: t.tipo, de: null, para: nova ? "registrada" : "editada", usuario: usuario.nome });
      emit();
    },
    async excluirTarefa(id, usuario) {
      const i = tarefas.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [t] = tarefas.splice(i, 1);
      await kv.set("tarefas", tarefas);
      await evento({ pedidoId: t.pedidoId, evento: "tarefa", campo: t.tipo, de: "registrada", para: "excluída", usuario: usuario.nome });
      emit();
    },
    // Importa um pacote do coletor. Mescla por id: registros com updated_at
    // mais novo substituem os antigos; nada é apagado.
    async importar(texto) {
      const pacote = lerPacote(texto);
      const { gravar, resumo } = mesclarPacote(registros, pacote);
      gravar.forEach((r) => (registros[String(r.id)] = r));
      usuarios = { ...usuarios, ...(pacote.usuarios || {}) };
      importacoes.push(resumo);
      await kv.set("registros", registros);
      await kv.set("usuarios", usuarios);
      await kv.set("importacoes", importacoes.slice(-100));
      emit();
      return resumo;
    },
    resumoBase() {
      const vals = Object.values(registros);
      const datas = vals.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
      return { total: vals.length, de: datas.length ? Math.min(...datas) : null, ate: datas.length ? Math.max(...datas) : null, importacoes: importacoes.slice().reverse(), usuarios: Object.keys(usuarios).length };
    },
    async apagarTudo() {
      await kv.limpar();
      registros = {}; usuarios = {}; classificacoes = {}; tarefas = []; eventos = []; importacoes = [];
      emit();
    },
    async sincronizarAgora() { return { ignorado: "use_importacao" }; },
    async testarIntegracao() { return { ok: false, erro: "Na fonte Baseline os dados chegam pelo coletor (favorito no navegador), não por conexão direta." }; },
    async salvarCredenciais() { return { ok: false, erro: "A fonte Baseline usa a sua sessão já logada no Baseline; não há credenciais para gravar." }; },
    async statusCredenciais() { return { ok: true, preenchidos: [] }; },
    async listarUsuarios() {
      return Object.entries(usuarios).map(([uid, nome]) => ({ uid, nome, email: "", papel: "analista", ativo: true }));
    },
    async listarSolicitacoes() { return []; },
    async salvarUsuario() { return { ok: false, erro: "Gestão de acesso disponível apenas com Firebase configurado." }; },
    async sair() {},
  };
}
