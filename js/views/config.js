import { PRIORIDADES } from "../core/taxonomy.js";
import { icon, toast } from "../ui/components.js";
import { esc, fmtDateTime } from "../ui/format.js";
import { painelBaseline } from "./baseline-import.js";

let aba = "integracao";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function render(el, ctx) {
  const admin = ctx.S.usuario.papel === "admin";
  el.innerHTML = `
  ${admin ? "" : `<div class="callout">Somente administradores podem alterar configurações. Você está vendo os valores atuais.</div>`}
  <div class="tabs" role="tablist">${[["integracao", "Sincronização"], ...(ctx.S.fonte.modo === "firebase" ? [["usuarios", "Usuários"]] : [])].map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}</button>`).join("")}</div>
  <div id="aba" style="display:grid;gap:16px"></div>`;
  el.querySelectorAll("[data-aba]").forEach((b) => (b.onclick = () => { aba = b.dataset.aba; render(el, ctx); }));
  const box = el.querySelector("#aba");
  if ((aba === "usuarios" && ctx.S.fonte.modo !== "firebase") || aba === "regras" || aba === "taxonomia") aba = "integracao";
  ({ integracao: abaIntegracao, regras: abaRegras, taxonomia: abaTaxonomia, usuarios: abaUsuarios })[aba](box, ctx, admin);
}

// ── Integração (Baseline) ────────────────────────────────
function abaIntegracao(box, ctx) {
  const pb = painelBaseline(ctx.S, () => ctx.renderView());
  box.innerHTML = pb.html;
  pb.montar(box);
}

// ── SLA e regras ─────────────────────────────────────────────
function abaRegras(box, ctx, admin) {
  const r = structuredClone(ctx.S.cfg.regras);
  const hc = r.sla.horarioComercial;
  box.innerHTML = `<form id="f-regras" style="display:grid;gap:16px">
    <section class="panel"><div class="panel-h"><h3>Metas de SLA por prioridade</h3><span class="hint">horas até a resolução e até a primeira interação</span></div>
      <div class="panel-b"><div class="table-wrap"><table class="t"><thead><tr><th>Prioridade</th><th>Resolução (h)</th><th>1ª interação (h)</th></tr></thead><tbody>
      ${PRIORIDADES.map((p) => `<tr><td>${p.rotulo}</td><td><input class="input" type="number" min="0.25" step="0.25" id="r-alvo-${p.id}" value="${r.sla.alvoHoras[p.id]}" style="width:110px"></td><td><input class="input" type="number" min="0.1" step="0.1" id="r-pri-${p.id}" value="${r.sla.alvoPrimeiraInteracaoHoras?.[p.id] ?? ""}" style="width:110px"></td></tr>`).join("")}
      </tbody></table></div></div></section>
    <section class="panel"><div class="panel-h"><h3>O que conta no SLA</h3><span class="hint">marque os status em que o relógio fica pausado</span></div>
      <div class="panel-b" style="display:grid;gap:12px">
        <div class="form-grid">${ctx.S.cfg.taxonomia.status.filter((s) => s.tipo !== "final").map((s) => `<label class="check"><input type="checkbox" data-pausa="${s.id}" ${r.sla.statusQuePausam.includes(s.id) ? "checked" : ""}> ${esc(s.rotulo)}</label>`).join("")}</div>
        <p class="note" style="margin:0">Por padrão pausam apenas as esperas externas (solicitante, evidências, terceiros). Esperas internas continuam contando porque dependem da própria empresa.</p>
        <label class="check"><input type="checkbox" id="r-hc" ${hc.ativo ? "checked" : ""}> Contar apenas horário comercial</label>
        <div class="form-grid">
          <label class="field">Início (hora)<input class="input" type="number" min="0" max="23" id="r-hci" value="${hc.inicio}"></label>
          <label class="field">Fim (hora)<input class="input" type="number" min="1" max="24" id="r-hcf" value="${hc.fim}"></label>
          <div class="field">Dias<div style="display:flex;gap:8px;flex-wrap:wrap">${DIAS.map((d, i) => `<label class="check"><input type="checkbox" data-dia="${i}" ${hc.dias.includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div></div>
        </div>
        <label class="field" style="max-width:260px">Alerta “em risco” a partir de (% do SLA)<input class="input" type="number" min="10" max="99" id="r-risco" value="${r.sla.riscoPercentual}"></label>
      </div></section>
    <section class="panel"><div class="panel-h"><h3>Regras de análise</h3></div>
      <div class="panel-b form-grid">
        <label class="field">Pedido parado após (h sem movimentação)<input class="input" type="number" min="1" id="r-parado" value="${r.paradoHoras}"></label>
        <label class="field">Reabertura invalida a solução em até (dias)<input class="input" type="number" min="1" id="r-janela" value="${r.janelaReaberturaDias}"></label>
        <label class="field">Amostra mínima para conclusões<input class="input" type="number" min="2" id="r-amostra" value="${r.amostraMinima}"></label>
        <label class="field">Limite para “demora” nas análises (h)<input class="input" type="number" min="1" id="r-limite" value="${r.limiteDemoraHoras}"></label>
      </div></section>
    ${admin ? `<div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Salvar regras</button></div>` : ""}
  </form>`;
  box.querySelector("#f-regras").onsubmit = async (e) => {
    e.preventDefault();
    const $ = (s) => box.querySelector(s);
    const n = (s, d) => { const v = Number($(s).value); return isFinite(v) && v > 0 ? v : d; };
    const novo = {
      ...r,
      sla: {
        ...r.sla,
        alvoHoras: Object.fromEntries(PRIORIDADES.map((p) => [p.id, n(`#r-alvo-${p.id}`, r.sla.alvoHoras[p.id])])),
        alvoPrimeiraInteracaoHoras: Object.fromEntries(PRIORIDADES.map((p) => [p.id, n(`#r-pri-${p.id}`, r.sla.alvoPrimeiraInteracaoHoras?.[p.id] ?? 1)])),
        statusQuePausam: [...box.querySelectorAll("[data-pausa]:checked")].map((c) => c.dataset.pausa),
        horarioComercial: { ativo: $("#r-hc").checked, inicio: Number($("#r-hci").value), fim: Number($("#r-hcf").value), dias: [...box.querySelectorAll("[data-dia]:checked")].map((c) => Number(c.dataset.dia)) },
        riscoPercentual: n("#r-risco", 80),
      },
      paradoHoras: n("#r-parado", 24), janelaReaberturaDias: n("#r-janela", 7), amostraMinima: Math.round(n("#r-amostra", 5)), limiteDemoraHoras: n("#r-limite", 24),
    };
    if (novo.sla.horarioComercial.fim <= novo.sla.horarioComercial.inicio) return toast("O fim do horário comercial precisa ser depois do início.", "erro");
    if (novo.sla.horarioComercial.ativo && !novo.sla.horarioComercial.dias.length) return toast("Escolha ao menos um dia útil.", "erro");
    try { await ctx.salvarConfig("regras", novo); toast("Regras salvas. Indicadores recalculados."); } catch (er) { toast(`Não foi possível salvar: ${er.message}`, "erro"); }
  };
}

// ── Classificação ────────────────────────────────────────────
function abaTaxonomia(box, ctx, admin) {
  const t = structuredClone(ctx.S.cfg.taxonomia);
  const listas = [
    ["categorias", "Categorias principais", null],
    ["motivosDemora", "Motivos da demora", null],
    ["tiposTarefa", "Tipos de tarefa", ["grupo", { diagnostico: "Diagnóstico", comunicacao: "Comunicação", intervencao: "Intervenção (conta como tentativa de solução)", apoio: "Apoio" }]],
  ];
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const draw = () => {
    box.innerHTML = `<div class="grid g3">${listas.map(([k, titulo, extra]) => `
      <section class="panel"><div class="panel-h"><h3>${titulo}</h3><span class="hint">${t[k].length} itens</span></div>
        <div class="panel-b list-edit" data-lista="${k}">
          ${t[k].map((x, i) => `<div class="row" style="grid-template-columns:${extra ? "minmax(0,1fr) 130px auto" : "minmax(0,1fr) auto"}"><input class="input" data-i="${i}" value="${esc(x.rotulo)}" aria-label="Rótulo" title="id: ${esc(x.id)}">${extra ? `<select class="input" data-g="${i}">${Object.entries(extra[1]).map(([v, r]) => `<option value="${v}" ${x[extra[0]] === v ? "selected" : ""}>${r}</option>`).join("")}</select>` : ""}<button class="btn ghost sm" data-rm="${i}" aria-label="Remover">${icon("x")}</button></div>`).join("")}
          <div style="display:flex;gap:6px"><input class="input" data-novo placeholder="Novo item" style="flex:1"><button class="btn sm" data-add>${icon("plus")}</button></div>
        </div></section>`).join("")}</div>
      <section class="panel"><div class="panel-h"><h3>Status</h3><span class="hint">o tipo define como o tempo é contado; o motivo liga esperas ao motivo da demora inferido</span></div>
        <div class="panel-b table-wrap"><table class="t"><thead><tr><th>Id</th><th>Rótulo</th><th>Tipo de tempo</th><th>Motivo da demora associado</th></tr></thead><tbody>
        ${t.status.map((s, i) => `<tr><td class="mono">${esc(s.id)}</td><td><input class="input" data-sr="${i}" value="${esc(s.rotulo)}"></td><td><select class="input" data-st="${i}">${[["fila", "Fila"], ["trabalho", "Em atendimento"], ["espera_interna", "Espera interna"], ["espera_externa", "Espera externa"], ["final", "Final"]].map(([v, r]) => `<option value="${v}" ${s.tipo === v ? "selected" : ""}>${r}</option>`).join("")}</select></td>
          <td><select class="input" data-sm="${i}"><option value="">—</option>${t.motivosDemora.map((m) => `<option value="${m.id}" ${s.motivoDemora === m.id ? "selected" : ""}>${esc(m.rotulo)}</option>`).join("")}</select></td></tr>`).join("")}
        </tbody></table>
        <p class="note">Novos status da plataforma entram pelo mapa de status da integração. Para criar um status novo aqui, use um id em minúsculas: <input class="input mono" data-novostatus placeholder="aguardando_homologacao" style="width:220px;height:26px"> <button class="btn sm" data-addstatus>Adicionar</button></p></div></section>
      <p class="note">Os ids ficam gravados nos pedidos; ao remover um item, pedidos já classificados com ele passam a exibir o id bruto.</p>
      ${admin ? `<div style="display:flex;justify-content:flex-end"><button class="btn primary" data-salvar>Salvar classificação</button></div>` : ""}`;
    const sync = () => {
      listas.forEach(([k, , extra]) => {
        box.querySelectorAll(`[data-lista="${k}"] [data-i]`).forEach((inp) => (t[k][inp.dataset.i].rotulo = inp.value.trim()));
        if (extra) box.querySelectorAll(`[data-lista="${k}"] [data-g]`).forEach((s) => (t[k][s.dataset.g][extra[0]] = s.value));
      });
      box.querySelectorAll("[data-sr]").forEach((i) => (t.status[i.dataset.sr].rotulo = i.value.trim()));
      box.querySelectorAll("[data-st]").forEach((i) => (t.status[i.dataset.st].tipo = i.value));
      box.querySelectorAll("[data-sm]").forEach((i) => (t.status[i.dataset.sm].motivoDemora = i.value || undefined));
    };
    box.querySelectorAll("[data-lista]").forEach((l) => {
      const k = l.dataset.lista;
      l.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { sync(); t[k].splice(Number(b.dataset.rm), 1); draw(); }));
      l.querySelector("[data-add]").onclick = () => {
        sync();
        const v = l.querySelector("[data-novo]").value.trim(); if (!v) return;
        const id = slug(v);
        if (t[k].some((x) => x.id === id)) return toast("Já existe um item com esse nome.", "erro");
        t[k].push(k === "tiposTarefa" ? { id, rotulo: v, grupo: "diagnostico" } : { id, rotulo: v }); draw();
      };
    });
    box.querySelector("[data-addstatus]").onclick = () => {
      sync();
      const id = slug(box.querySelector("[data-novostatus]").value); if (!id) return;
      if (t.status.some((s) => s.id === id)) return toast("Esse status já existe.", "erro");
      t.status.splice(t.status.length - 2, 0, { id, rotulo: id.replace(/_/g, " "), tipo: "espera_interna" }); draw();
    };
    box.querySelector("[data-salvar]")?.addEventListener("click", async () => {
      sync();
      try { await ctx.salvarConfig("taxonomia", t); toast("Classificação salva."); } catch (e) { toast(`Não foi possível salvar: ${e.message}`, "erro"); }
    });
  };
  draw();
}

// ── Usuários ────────────────────────────────────────────────
async function abaUsuarios(box, ctx, admin) {
  const { S } = ctx;
  box.innerHTML = `<div class="panel"><div class="empty">Carregando…</div></div>`;
  let usuarios = [], pedidos = [];
  try { [usuarios, pedidos] = await Promise.all([S.fonte.listarUsuarios(), admin ? S.fonte.listarSolicitacoes() : []]); }
  catch (e) { box.innerHTML = `<div class="panel"><div class="empty">Não foi possível carregar usuários: ${esc(e.message)}</div></div>`; return; }
  const papeis = { admin: "Administrador", gestor: "Gestor", analista: "Analista" };
  box.innerHTML = `
    ${pedidos.length ? `<section class="panel"><div class="panel-h"><h3>Solicitações de acesso</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Pedido em</th><th></th></tr></thead><tbody>
      ${pedidos.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${fmtDateTime(u.em)}</td><td style="text-align:right">${admin ? `<select class="input" data-papel-novo="${esc(u.uid)}" style="height:26px">${Object.entries(papeis).map(([k, r]) => `<option value="${k}" ${k === "analista" ? "selected" : ""}>${r}</option>`).join("")}</select> <button class="btn sm primary" data-aprovar="${esc(u.uid)}">Liberar</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>` : ""}
    <section class="panel"><div class="panel-h"><h3>Usuários</h3><span class="hint">Administrador: tudo · Gestor: indicadores, tarefas de todos e sincronização · Analista: indicadores, classificação e as próprias tarefas</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${admin && u.uid !== S.usuario.uid ? `<select class="input" data-papel="${esc(u.uid)}" style="height:26px">${Object.entries(papeis).map(([k, r]) => `<option value="${k}" ${u.papel === k ? "selected" : ""}>${r}</option>`).join("")}</select>` : papeis[u.papel] || u.papel}</td>
        <td>${admin && u.uid !== S.usuario.uid ? `<input type="checkbox" data-ativo="${esc(u.uid)}" ${u.ativo ? "checked" : ""} aria-label="Ativo">` : u.ativo ? "sim" : "não"}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  const salvar = async (uid, dados) => { try { const r = await S.fonte.salvarUsuario(uid, dados); if (r?.ok === false) throw new Error(r.erro); toast("Usuário atualizado."); } catch (e) { toast(`Não foi possível salvar: ${e.message}`, "erro"); } };
  box.querySelectorAll("[data-aprovar]").forEach((b) => (b.onclick = async () => {
    const u = pedidos.find((x) => x.uid === b.dataset.aprovar);
    await salvar(u.uid, { nome: u.nome, email: u.email, papel: box.querySelector(`[data-papel-novo="${u.uid}"]`).value, ativo: true });
    abaUsuarios(box, ctx, admin);
  }));
  box.querySelectorAll("[data-papel]").forEach((s) => (s.onchange = () => salvar(s.dataset.papel, { papel: s.value })));
  box.querySelectorAll("[data-ativo]").forEach((c) => (c.onchange = () => salvar(c.dataset.ativo, { ativo: c.checked })));
}
