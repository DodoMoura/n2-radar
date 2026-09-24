// Fonte de dados Firebase (produção): login Google + Firestore em tempo real.
// Plano gratuito (Spark): sem Cloud Functions. Os pedidos chegam pelo coletor
// do Baseline e são gravados no Firestore pela importação feita aqui no
// navegador por um admin ou gestor.
import { APP_CONFIG, DEFAULT_REGRAS, DEFAULT_INTEGRACAO } from "../config.js";
import { defaultTaxonomia } from "../core/taxonomy.js";
import { normalizar, historicoDerivado, mesclarPacote, lerPacote } from "./baseline.js";

const CDN = (m) => `https://www.gstatic.com/firebasejs/${APP_CONFIG.firebaseSdkVersion}/firebase-${m}.js`;

// Firestore não aceita undefined: vira null (para limpar campos no merge).
const semUndefined = (o) => JSON.parse(JSON.stringify(o, (_, v) => (v === undefined ? null : v)));

export async function criarFonteFirebase({ onAuthUI }) {
  const [{ initializeApp }, A, F] = await Promise.all([import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))]);
  const app = initializeApp(APP_CONFIG.firebase);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }

  // ── Autenticação e perfil ──────────────────────────────────
  const usuario = await new Promise((resolve) => {
    A.onAuthStateChanged(auth, async (u) => {
      if (!u) {
        onAuthUI({ estado: "login", entrar: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch((e) => onAuthUI({ estado: "login", erro: e.message, entrar: () => location.reload() })) });
        return;
      }
      const ref = F.doc(db, "usuarios", u.uid);
      let d = (await F.getDoc(ref).catch(() => null))?.data() || null;
      // primeiro acesso de um administrador inicial (lista em config.js e nas regras)
      if (!d && (APP_CONFIG.admins || []).includes((u.email || "").toLowerCase())) {
        const novo = { nome: u.displayName || u.email, email: u.email, papel: "admin", ativo: true, criadoEm: Date.now() };
        try { await F.setDoc(ref, novo); d = novo; } catch { /* regras recusaram: segue como pendente */ }
      }
      if (!d || !d.ativo) {
        await F.setDoc(F.doc(db, "solicitacoesAcesso", u.uid), { nome: u.displayName || "", email: u.email || "", em: Date.now() }).catch(() => {});
        onAuthUI({ estado: "pendente", email: u.email, sair: () => A.signOut(auth).then(() => location.reload()) });
        return;
      }
      resolve({ uid: u.uid, nome: d.nome || u.displayName || u.email, email: u.email, papel: d.papel, foto: u.photoURL });
    });
  });

  const desde = Date.now() - APP_CONFIG.janelaDias * 864e5;
  const erroSnap = (onErro, alvo) => (e) => onErro?.(`Sem permissão ou falha ao ler ${alvo}: ${e.code || e.message}. Verifique seu perfil de acesso.`);
  const brutos = new Map(); // id Baseline → registro cru (para detectar mudanças)
  let status = {};

  return {
    modo: "firebase",
    persistente: true,
    podeImportar: ["admin", "gestor"].includes(usuario.papel),
    usuario,
    async iniciar(onData, onStatus, onErro) {
      let pedidos = null, tarefas = null;
      const emit = () => pedidos && tarefas && onData({ pedidos, tarefas });
      F.onSnapshot(F.query(F.collection(db, "pedidos"), F.where("abertura", ">=", desde)), (s) => {
        brutos.clear();
        pedidos = s.docs.map((d) => {
          const p = { id: d.id, ...d.data() };
          if (p.baseline?.id != null) brutos.set(String(p.baseline.id), p.baseline);
          return p;
        });
        emit();
      }, erroSnap(onErro, "pedidos"));
      F.onSnapshot(F.query(F.collection(db, "tarefas"), F.where("inicio", ">=", desde - 30 * 864e5)), (s) => {
        tarefas = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      }, erroSnap(onErro, "tarefas"));
      F.onSnapshot(F.doc(db, "status", "sync"), (s) => { status = s.data() || {}; onStatus(status); }, erroSnap(onErro, "status da importação"));
    },
    async carregarConfig() {
      const g = async (id) => (await F.getDoc(F.doc(db, "config", id))).data();
      const [regras, taxonomia] = await Promise.all([g("regras"), g("taxonomia")]);
      return {
        regras: { ...structuredClone(DEFAULT_REGRAS), ...(regras || {}), sla: { ...DEFAULT_REGRAS.sla, ...(regras?.sla || {}) } },
        taxonomia: taxonomia?.categorias ? taxonomia : defaultTaxonomia(),
        integracao: structuredClone(DEFAULT_INTEGRACAO),
      };
    },
    async salvarConfig(doc, valor) {
      await F.setDoc(F.doc(db, "config", doc), JSON.parse(JSON.stringify(valor)));
    },
    async historico(pedidoId) {
      const s = await F.getDocs(F.query(F.collection(db, "historico"), F.where("pedidoId", "==", pedidoId)));
      const manuais = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      const raw = brutos.get(pedidoId.replace(/^baseline_/, ""));
      const derivados = raw ? historicoDerivado(raw, status.usuarios || {}) : [];
      return [...derivados, ...manuais].sort((a, b) => a.em - b.em);
    },
    async salvarClassificacao(pedidoId, patch, u) {
      const ref = F.doc(db, "pedidos", pedidoId);
      const antes = (await F.getDoc(ref)).data()?.classificacao || {};
      const nova = { ...antes, ...patch, classificadoPor: u.nome, classificadoEm: Date.now() };
      await F.updateDoc(ref, { classificacao: semUndefined(nova) });
      const b = F.writeBatch(db);
      for (const [k, v] of Object.entries(patch)) {
        if (JSON.stringify(antes[k] ?? null) === JSON.stringify(v ?? null)) continue;
        b.set(F.doc(F.collection(db, "historico")), { pedidoId, evento: "classificacao", campo: k, de: antes[k] ?? null, para: v ?? null, em: Date.now(), usuario: u.nome, usuarioUid: u.uid, origem: "manual" });
      }
      await b.commit();
    },
    async salvarTarefa(t, u) {
      const nova = !t.id;
      const ref = nova ? F.doc(F.collection(db, "tarefas")) : F.doc(db, "tarefas", t.id);
      const { id, ...dados } = t;
      if (nova) Object.assign(dados, { criadoPor: u.uid, criadoPorNome: u.nome, criadoEm: Date.now(), origem: "manual" });
      await F.setDoc(ref, semUndefined(dados), { merge: !nova });
      await F.addDoc(F.collection(db, "historico"), { pedidoId: t.pedidoId, evento: "tarefa", campo: t.tipo, de: null, para: nova ? "registrada" : "editada", em: Date.now(), usuario: u.nome, usuarioUid: u.uid, origem: "manual" });
    },
    async excluirTarefa(id, u) {
      const ref = F.doc(db, "tarefas", id);
      const t = (await F.getDoc(ref)).data();
      await F.deleteDoc(ref);
      if (t) await F.addDoc(F.collection(db, "historico"), { pedidoId: t.pedidoId, evento: "tarefa", campo: t.tipo, de: "registrada", para: "excluída", em: Date.now(), usuario: u.nome, usuarioUid: u.uid, origem: "manual" });
    },

    // ── Importação do Baseline ───────────────────────────────
    // Grava só pedidos novos/alterados; a classificação feita no Radar é preservada.
    async importar(texto, onProgresso) {
      if (!this.podeImportar) throw new Error("Somente administradores e gestores podem importar pedidos.");
      const pacote = lerPacote(texto);
      const { gravar, resumo } = mesclarPacote(Object.fromEntries(brutos), pacote);
      const usuarios = { ...(status.usuarios || {}), ...(pacote.usuarios || {}) };
      for (let i = 0; i < gravar.length; i += 400) {
        const b = F.writeBatch(db);
        gravar.slice(i, i + 400).forEach((r) => {
          const { classificacao, id, ...p } = normalizar(r, usuarios);
          b.set(F.doc(db, "pedidos", id), semUndefined({ ...p, baseline: r, importadoEm: Date.now() }), { merge: true });
        });
        await b.commit();
        onProgresso?.(Math.min(i + 400, gravar.length), gravar.length);
      }
      const importacoes = [{ ...resumo, por: usuario.nome }, ...(status.importacoes || [])].slice(0, 50);
      await F.setDoc(F.doc(db, "status", "sync"), semUndefined({
        ultimaExecucao: resumo.em,
        ultimoResultado: { ok: true, lidos: resumo.lidos, novos: resumo.novos, alterados: resumo.alterados, inalterados: resumo.inalterados, motivo: "importacao" },
        importacoes, usuarios,
      }), { merge: true });
      return resumo;
    },
    resumoBase() {
      const vals = [...brutos.values()];
      const datas = vals.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
      return { total: vals.length, de: datas.length ? Math.min(...datas) : null, ate: datas.length ? Math.max(...datas) : null, importacoes: status.importacoes || [], usuarios: Object.keys(status.usuarios || {}).length };
    },
    async sincronizarAgora() { return { ignorado: "use_importacao" }; },

    // ── Usuários ─────────────────────────────────────────────
    async listarUsuarios() {
      const s = await F.getDocs(F.collection(db, "usuarios"));
      return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
    async listarSolicitacoes() {
      const s = await F.getDocs(F.collection(db, "solicitacoesAcesso"));
      return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
    async salvarUsuario(uid, dados) {
      await F.setDoc(F.doc(db, "usuarios", uid), dados, { merge: true });
      await F.deleteDoc(F.doc(db, "solicitacoesAcesso", uid)).catch(() => {});
      return { ok: true };
    },
    sair: () => A.signOut(auth).then(() => location.reload()),
  };
}
