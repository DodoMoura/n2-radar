import { label, statusInfo, TAX, RESULTADOS_TAREFA, TIPOS_TEMPO } from "../core/taxonomy.js";
import { icon, pillStatus, pillSla, pillPrioridade, modal, toast, confirmar, dataTable, stackBar } from "../ui/components.js";
import { esc, fmtDateTime, fmtDur, fmtPct, fmtNum, toLocalInput } from "../ui/format.js";

const corTipo = Object.fromEntries(TIPOS_TEMPO.map((t) => [t.id, t.cor]));

export function render(el, ctx, id) {
  const { S, ir } = ctx;
  const p = id ? S.porId.get(id) : null;
  if (!p) return renderSeletor(el, ctx, id);
  const tarefas = (S.tarefasPorPedido.get(p.id) || []).slice().sort((a, b) => a.inicio - b.inicio);
  const regras = ctx.regras;
  const pausa = new Set(regras.sla.statusQuePausam);
  const esperaTot = p.tempo.espera_interna + p.tempo.espera_externa;
  const slaTom = p.slaStatus === "violado" ? "crit" : p.slaStatus === "risco" ? "warn" : "ok";
  const cls = p.classificacao || {};

  el.innerHTML = `
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn sm" data-voltar>${icon("back")} Pedidos</button>
    <input class="input" list="dl-pedidos" id="busca-pedido" placeholder="Ir para outro pedido (protocolo)" style="height:26px;max-width:260px;font-size:12.5px" aria-label="Ir para outro pedido">
    <datalist id="dl-pedidos">${S.E.slice(-400).reverse().map((x) => `<option value="${esc(x.protocolo || x.externalId)}">${esc(x.titulo)}</option>`).join("")}</datalist>
  </div>

  <section class="panel"><div class="panel-b detail-head">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="mono muted">${esc(p.protocolo || p.externalId)}</span>${pillStatus(p.status)}${pillSla(p)}${pillPrioridade(p.prioridade)}
      ${p.retrabalho ? `<span class="pill warn">Retrabalho</span>` : ""}${p.escalonado ? `<span class="pill plain">Escalonado</span>` : ""}${p.parado ? `<span class="pill crit">Parado há ${fmtDur(p.paradoMs)}</span>` : ""}</div>
    <h2>${esc(p.titulo)}</h2>
    <div class="meta">
      <span>Cliente <b>${esc(p.cliente || "—")}</b></span><span>Produto <b>${esc(p.produto || "—")}</b></span>
      <span>Responsável <b>${esc(p.responsavel || "—")}</b></span><span>Equipe <b>${esc(p.equipe || "—")}</b></span>
      <span>Solicitante <b>${esc(p.solicitante || "—")}</b></span><span>Aberto em <b class="num">${fmtDateTime(p.abertura)}</b></span>
      <span>${p.aberto ? "Aberto há" : "Fechado em"} <b class="num">${p.aberto ? fmtDur(p.total) : fmtDateTime(p.fechamento)}</b></span>
    </div>
  </div></section>

  <section class="kpis">
    <div class="kpi" style="cursor:default"><span class="kpi-l">Tempo total</span><span class="kpi-v">${fmtDur(p.total)}</span><span class="kpi-s">abertura → ${p.aberto ? "agora" : "fechamento"}</span></div>
    <div class="kpi" style="cursor:default"><span class="kpi-l"><i style="width:9px;height:9px;border-radius:2px;background:var(--s1)"></i>Em atendimento</span><span class="kpi-v">${fmtDur(p.tempo.trabalho)}</span><span class="kpi-s">${fmtPct(p.total ? p.tempo.trabalho / p.total : null)} do total</span></div>
    <div class="kpi" style="cursor:default"><span class="kpi-l"><i style="width:9px;height:9px;border-radius:2px;background:var(--s2)"></i>Em espera</span><span class="kpi-v">${fmtDur(esperaTot)}</span><span class="kpi-s">externa ${fmtDur(p.tempo.espera_externa)} · interna ${fmtDur(p.tempo.espera_interna)}</span></div>
    <div class="kpi" style="cursor:default"><span class="kpi-l"><i style="width:9px;height:9px;border-radius:2px;background:var(--s7)"></i>Fila</span><span class="kpi-v">${fmtDur(p.tempo.fila)}</span><span class="kpi-s">1ª interação em ${fmtDur(p.primeiraMs)}</span></div>
    <div class="kpi" style="cursor:default"><span class="kpi-l">Esforço registrado</span><span class="kpi-v">${p.nTarefas ? fmtDur(p.esforcoMin * 60e3) : "—"}</span><span class="kpi-s">${fmtNum(p.nTarefas)} tarefa(s)</span></div>
    <div class="kpi" style="cursor:default"><span class="kpi-l">SLA</span><span class="kpi-v" style="color:var(--${slaTom})">${fmtPct(p.slaPct)}</span>
      <div class="sla-meter ${slaTom}"><i style="width:${Math.min(100, (p.slaPct || 0) * 100)}%"></i></div><span class="kpi-s">${fmtDur(p.slaMs)} de ${fmtDur(p.alvoMs)} (${regras.sla.horarioComercial.ativo ? "horário comercial" : "corrido"})</span></div>
  </section>

  <section class="panel">
    <div class="panel-h"><h3>Jornada do pedido</h3><span class="hint">cada faixa é um status; a trilha de baixo mostra as tarefas registradas</span></div>
    <div class="panel-b" id="gantt"></div>
  </section>

  <section class="grid g-7-5">
    <div class="panel">
      <div class="panel-h"><h3>Tarefas executadas</h3><span class="hint">${fmtNum(tarefas.length)} registrada(s)</span>
        ${ctx.podeEditar ? `<div class="tools"><button class="btn sm primary" data-nova>${icon("plus")} Registrar tarefa</button></div>` : ""}</div>
      <div id="tbl-tarefas"></div>
    </div>
    <div class="panel">
      <div class="panel-h"><h3>Tempo em cada etapa</h3></div>
      <div class="panel-b">
        ${stackBar(TIPOS_TEMPO.map((t) => ({ v: p.tempo[t.id], cor: t.cor, rotulo: t.rotulo })), "lg")}
        <div class="table-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Status</th><th class="n">Tempo</th><th class="n">%</th><th>SLA</th></tr></thead><tbody>
        ${Object.entries(p.porStatus).sort((a, b) => b[1] - a[1]).map(([s, ms]) => `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${corTipo[statusInfo(s).tipo]};margin-right:6px"></span>${esc(label("status", s))}</td><td class="n">${fmtDur(ms)}</td><td class="n">${fmtPct(p.total ? ms / p.total : null)}</td><td class="small muted">${pausa.has(s) ? "pausa" : "conta"}</td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </div>
  </section>

  <section class="grid g-7-5">
    <div class="panel">
      <div class="panel-h"><h3>Linha do tempo</h3><span class="hint">status, tarefas, interações e alterações</span></div>
      <div class="panel-b" id="timeline"><div class="empty">Carregando histórico…</div></div>
    </div>
    <div style="display:grid;gap:16px;align-content:start">
      <div class="panel">
        <div class="panel-h"><h3>Classificação e avaliação</h3></div>
        <form class="panel-b" id="form-cls" style="display:grid;gap:10px">
          <label class="field">Categoria principal<select class="input" id="c-categoria"><option value="">${p.categoria && !cls.categoria ? `Da plataforma: ${esc(label("categoria", p.categoria))}` : "Não classificada"}</option>${TAX.categorias.map((c) => `<option value="${c.id}" ${cls.categoria === c.id ? "selected" : ""}>${esc(c.rotulo)}</option>`).join("")}</select></label>
          <label class="field">Motivo da demora<select class="input" id="c-motivoDemora"><option value="">${p.motivoDemoraOrigem === "inferido" ? `Automático: ${esc(label("motivoDemora", p.motivoDemora))}` : p.motivoDemoraOrigem === "plataforma" ? `Da plataforma: ${esc(label("motivoDemora", p.motivoDemora))}` : "Não classificado"}</option>${TAX.motivosDemora.map((c) => `<option value="${c.id}" ${cls.motivoDemora === c.id ? "selected" : ""}>${esc(c.rotulo)}</option>`).join("")}</select></label>
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <label class="field">Retrabalho<select class="input" id="c-retrabalho">${triSel(cls.retrabalho, `Automático (${p.retrabalhoAuto ? "sim" : "não"})`)}</select></label>
            <label class="field">Solução eficaz<select class="input" id="c-eficaz" ${p.concluido ? "" : "disabled"}>${triSel(cls.eficaz, p.concluido ? `Automático (${p.eficazOrigem === "automatico" ? (p.eficaz ? "sim" : "não") : "—"})` : "Só após conclusão")}</select></label>
          </div>
          <label class="field">Resultado final<input class="input" id="c-resultado" value="${esc(cls.resultado ?? "")}" placeholder="${esc(p.resultado || "Ex.: configuração corrigida")}"></label>
          <div class="callout">${avaliacao(p, regras)}</div>
          ${ctx.podeEditar ? `<div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Salvar classificação</button></div>` : ""}
        </form>
      </div>
      <div class="panel">
        <div class="panel-h"><h3>Descrição</h3></div>
        <div class="panel-b" style="white-space:pre-wrap;font-size:13px">${esc(p.descricao || "Sem descrição.")}</div>
        ${p.extras ? `<div class="panel-b"><dl class="kv">${Object.entries(p.extras).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
      </div>
    </div>
  </section>`;

  el.querySelector("[data-voltar]").onclick = () => ir("pedidos");
  el.querySelector("#busca-pedido").onchange = (e) => {
    const alvo = S.E.find((x) => (x.protocolo || x.externalId) === e.target.value.trim());
    if (alvo) ir(`pedido/${alvo.id}`); else toast("Pedido não encontrado na janela carregada.");
  };

  renderGantt(el.querySelector("#gantt"), p, tarefas);

  // tabela de tarefas
  dataTable(el.querySelector("#tbl-tarefas"), {
    linhas: tarefas, busca: false, porPagina: 20, ordenacao: { k: "inicio", dir: 1 },
    vazio: "Nenhuma tarefa registrada. Registre as ações executadas para medir esforço real e eficácia.",
    colunas: [
      { k: "tipo", rotulo: "Tarefa", render: (t) => `${esc(label("tipoTarefa", t.tipo))}${t.observacoes ? `<div class="small muted">${esc(t.observacoes)}</div>` : ""}` },
      { k: "responsavel", rotulo: "Responsável" },
      { k: "inicio", rotulo: "Início", render: (t) => `<span class="num">${fmtDateTime(t.inicio)}</span>` },
      { k: "duracaoMin", rotulo: "Duração", n: true, render: (t) => (t.fim ? fmtDur(t.duracaoMin * 60e3) : `<span class="pill info">em curso</span>`) },
      { k: "resultado", rotulo: "Resultado", render: (t) => (t.resultado ? `<span class="pill ${t.resultado === "resolveu" ? "ok" : t.resultado === "identificou" ? "info" : t.resultado === "sem_efeito" ? "crit" : ""}">${esc(label("resultado", t.resultado))}</span>` : `<span class="muted">—</span>`) },
      ...(ctx.podeEditar ? [{ k: "acoes", rotulo: "", sort: false, render: (t) => `<button class="btn ghost sm" data-edit="${esc(t.id)}" aria-label="Editar tarefa">${icon("edit")}</button><button class="btn ghost sm danger" data-del="${esc(t.id)}" aria-label="Excluir tarefa">${icon("trash")}</button>` }] : []),
    ],
    onRender: (box) => {
      box.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => formTarefa(ctx, p, tarefas.find((t) => t.id === b.dataset.edit))));
      box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
        if (!(await confirmar("Excluir esta tarefa? A exclusão fica registrada no histórico.", "Excluir"))) return;
        try { await S.fonte.excluirTarefa(b.dataset.del, S.usuario); toast("Tarefa excluída."); } catch (e) { toast(`Não foi possível excluir: ${e.message}`, "erro"); }
      }));
    },
  });
  el.querySelector("[data-nova]")?.addEventListener("click", () => formTarefa(ctx, p));

  // classificação
  el.querySelector("#form-cls").onsubmit = async (e) => {
    e.preventDefault();
    const tri = (v) => (v === "" ? null : v === "sim");
    const patch = {
      categoria: el.querySelector("#c-categoria").value || null,
      motivoDemora: el.querySelector("#c-motivoDemora").value || null,
      retrabalho: tri(el.querySelector("#c-retrabalho").value),
      eficaz: p.concluido ? tri(el.querySelector("#c-eficaz").value) : cls.eficaz ?? null,
      resultado: el.querySelector("#c-resultado").value.trim() || null,
    };
    try { await S.fonte.salvarClassificacao(p.id, patch, S.usuario); toast("Classificação salva."); }
    catch (err) { toast(`Não foi possível salvar: ${err.message}`, "erro"); }
  };

  // linha do tempo (histórico assíncrono)
  S.fonte.historico(p.id).then((hist) => {
    const box = el.querySelector("#timeline");
    if (!box) return;
    const ev = [
      ...hist.map((h) => ({ em: h.em, k: h.evento, txt: textoHistorico(h), quem: h.usuario, origem: h.origem })),
      ...tarefas.map((t) => ({ em: t.inicio, k: "tarefa", txt: `Tarefa: ${label("tipoTarefa", t.tipo)}${t.fim ? ` · ${fmtDur(t.duracaoMin * 60e3)}` : " · em curso"}${t.resultado ? ` · ${label("resultado", t.resultado)}` : ""}`, quem: t.responsavel })),
      ...(p.interacoes || []).map((i) => ({ em: i.em, k: "interacao", txt: `Interação${i.tipo ? ` (${i.tipo})` : ""}: ${i.texto || ""}`, quem: i.autor })),
    ].filter((x) => x.em).sort((a, b) => a.em - b.em);
    box.innerHTML = ev.length ? `<ul class="timeline">${ev.map((x) => `<li data-k="${esc(x.k)}"><div class="tl-when">${fmtDateTime(x.em)}</div><div class="tl-what">${esc(x.txt)}</div>${x.quem ? `<div class="tl-who">${esc(x.quem)}${x.origem === "manual" ? " · registro manual" : ""}</div>` : ""}</li>`).join("")}</ul>` : `<div class="empty">Sem eventos registrados.</div>`;
  }).catch((e) => { const box = el.querySelector("#timeline"); if (box) box.innerHTML = `<div class="empty">Não foi possível carregar o histórico: ${esc(e.message)}</div>`; });
}

function triSel(v, auto) {
  return `<option value="">${esc(auto)}</option><option value="sim" ${v === true ? "selected" : ""}>Sim</option><option value="nao" ${v === false ? "selected" : ""}>Não</option>`;
}

function avaliacao(p, regras) {
  const itens = [];
  if (p.concluido) {
    itens.push(p.fcr ? "Resolvido na primeira intervenção." : "Precisou de mais de uma intervenção para resolver.");
    itens.push(p.eficaz ? `Solução eficaz: sem reabertura em ${regras.janelaReaberturaDias} dias.` : "Solução não eficaz: houve reabertura dentro da janela ou marcação manual.");
  } else itens.push("Pedido em aberto: primeira intervenção e eficácia são avaliadas após a conclusão.");
  if (p.reaberturas) itens.push(`${p.reaberturas} reabertura(s).`);
  if (p.retrabalho) itens.push(`Retrabalho ${p.retrabalhoOrigem === "manual" ? "marcado manualmente" : "detectado automaticamente (reabertura ou intervenção sem efeito)"}.`);
  if (p.motivoDemora) itens.push(`Motivo da demora: ${label("motivoDemora", p.motivoDemora)} (${p.motivoDemoraOrigem === "inferido" ? "inferido pelo maior período de espera" : p.motivoDemoraOrigem}).`);
  return itens.map((x) => esc(x)).join("<br>");
}

function textoHistorico(h) {
  const v = (campo, x) => (x == null ? "vazio" : campo === "status" ? label("status", x) : campo === "motivoDemora" ? label("motivoDemora", x) : campo === "categoria" ? label("categoria", x) : typeof x === "boolean" ? (x ? "sim" : "não") : String(x));
  switch (h.evento) {
    case "criado": return "Pedido aberto";
    case "status": return `Status: ${v("status", h.de)} → ${v("status", h.para)}`;
    case "reabertura": return `Reaberto: ${v("status", h.de)} → ${v("status", h.para)}`;
    case "escalonamento": return `Escalonado: ${h.de} → ${h.para}`;
    case "classificacao": return `Classificação (${h.campo}): ${v(h.campo, h.de)} → ${v(h.campo, h.para)}`;
    case "tarefa": return `Tarefa ${label("tipoTarefa", h.campo)} ${h.para}`;
    default: return `${h.campo}: ${v(h.campo, h.de)} → ${v(h.campo, h.para)}`;
  }
}

function renderGantt(box, p, tarefas) {
  const ini = p.abertura, fim = Math.max(p.aberto ? Date.now() : p.fechamento || Date.now(), ...tarefas.map((t) => t.fim || 0));
  const span = Math.max(fim - ini, 60e3);
  const pos = (t) => ((t - ini) / span) * 100;
  const segs = p.segs.filter((s) => s.tipo !== "final");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ini + span * f);
  box.innerHTML = `<div class="gantt">
    <div class="gantt-track" role="img" aria-label="Linha do tempo de status">${segs.map((s) => `<div class="gantt-seg" style="left:${pos(s.inicio)}%;width:${Math.max(0.3, pos(s.fim) - pos(s.inicio))}%;background:${corTipo[s.tipo]}" title="${esc(label("status", s.status))}: ${fmtDateTime(s.inicio)} → ${fmtDateTime(s.fim)} (${fmtDur(s.fim - s.inicio)})"></div>`).join("")}
      ${p.segs.filter((s) => s.tipo === "final").map((s) => `<div class="gantt-seg" style="left:calc(${pos(s.inicio)}% - 1px);width:3px;background:var(--ink)" title="${esc(label("status", s.status))} em ${fmtDateTime(s.inicio)}"></div>`).join("")}</div>
    <div class="gantt-track" style="height:22px" role="img" aria-label="Tarefas registradas">${tarefas.map((t) => `<div class="gantt-seg" style="top:5px;bottom:5px;left:${pos(t.inicio)}%;width:${Math.max(0.4, pos(t.fim || Date.now()) - pos(t.inicio))}%;background:${t.resultado === "resolveu" ? "var(--ok)" : t.resultado === "sem_efeito" ? "var(--crit)" : "var(--s3)"}" title="${esc(label("tipoTarefa", t.tipo))}: ${fmtDur(t.duracaoMin * 60e3)}${t.resultado ? " · " + esc(label("resultado", t.resultado)) : ""}"></div>`).join("")}</div>
    <div class="gantt-axis">${ticks.map((t) => `<span>${fmtDateTime(t)}</span>`).join("")}</div>
    <div class="legend">${TIPOS_TEMPO.map((t) => `<span><i style="background:${t.cor}"></i>${t.rotulo}</span>`).join("")}<span><i style="background:var(--ink)"></i>Conclusão</span><span><i style="background:var(--ok)"></i>Tarefa que resolveu</span><span><i style="background:var(--crit)"></i>Tarefa sem efeito</span></div>
  </div>`;
}

function formTarefa(ctx, p, t = null) {
  const { S } = ctx;
  const agora = Date.now();
  const v = t || { tipo: "", responsavel: p.responsavel || S.usuario.nome, inicio: agora - 30 * 60e3, fim: agora, resultado: "", observacoes: "" };
  modal({
    titulo: t ? "Editar tarefa" : "Registrar tarefa", tamanho: "sm",
    corpo: `<form id="f-tarefa" style="display:grid;gap:10px">
      <label class="field">Tipo da tarefa<select class="input" id="t-tipo" required><option value="">Selecione</option>${TAX.tiposTarefa.map((x) => `<option value="${x.id}" ${v.tipo === x.id ? "selected" : ""}>${esc(x.rotulo)}</option>`).join("")}</select></label>
      <label class="field">Responsável<input class="input" id="t-resp" value="${esc(v.responsavel)}" required></label>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <label class="field">Início<input class="input" type="datetime-local" id="t-ini" value="${toLocalInput(v.inicio)}" required></label>
        <label class="field">Conclusão<input class="input" type="datetime-local" id="t-fim" value="${toLocalInput(v.fim)}"></label>
      </div>
      <label class="field">Tempo gasto (minutos)<input class="input" type="number" min="0" step="1" id="t-dur" value="${v.duracaoMin ?? Math.round(((v.fim || agora) - v.inicio) / 60000)}"><span class="note">Preenchido pela diferença entre início e conclusão; ajuste se houve pausas.</span></label>
      <label class="field">Resultado<select class="input" id="t-res"><option value="">Ainda sem resultado / não se aplica</option>${RESULTADOS_TAREFA.map((x) => `<option value="${x.id}" ${v.resultado === x.id ? "selected" : ""}>${esc(x.rotulo)}</option>`).join("")}</select></label>
      <label class="field">Observações<textarea class="input" id="t-obs" rows="3">${esc(v.observacoes || "")}</textarea></label>
      <p class="note" id="t-erro" style="color:var(--crit);margin:0" hidden></p>
    </form>`,
    rodape: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-salvar>Salvar tarefa</button>`,
    onMount: (m, fechar) => {
      const $ = (s) => m.querySelector(s);
      const recalc = () => {
        const a = new Date($("#t-ini").value).getTime(), b = new Date($("#t-fim").value).getTime();
        if (a && b && b >= a) $("#t-dur").value = Math.round((b - a) / 60000);
      };
      $("#t-ini").onchange = recalc; $("#t-fim").onchange = recalc;
      $("[data-salvar]").onclick = async () => {
        const erro = (msg) => { $("#t-erro").textContent = msg; $("#t-erro").hidden = false; };
        const ini = new Date($("#t-ini").value).getTime();
        const fim = $("#t-fim").value ? new Date($("#t-fim").value).getTime() : null;
        if (!$("#t-tipo").value) return erro("Escolha o tipo da tarefa.");
        if (!ini) return erro("Informe o início.");
        if (fim && fim < ini) return erro("A conclusão precisa ser depois do início.");
        const res = $("#t-res").value || null;
        const dados = {
          ...(t ? { id: t.id } : {}), pedidoId: p.id, tipo: $("#t-tipo").value, responsavel: $("#t-resp").value.trim(),
          inicio: ini, fim, duracaoMin: Math.max(0, Number($("#t-dur").value) || 0), resultado: res, resolveu: res === "resolveu",
          observacoes: $("#t-obs").value.trim(),
        };
        try { await S.fonte.salvarTarefa(dados, S.usuario); fechar(); toast("Tarefa salva."); }
        catch (e) { erro(`Não foi possível salvar: ${e.message}`); }
      };
    },
  });
}

function renderSeletor(el, ctx, id) {
  const { S, ir, lista } = ctx;
  const atencao = lista.filter((p) => p.atrasado || p.parado || p.slaStatus === "risco");
  el.innerHTML = `<section class="panel"><div class="panel-b" style="display:grid;gap:10px">
    ${id ? `<p style="margin:0;color:var(--crit)">Pedido “${esc(id)}” não encontrado na janela de dados carregada.</p>` : ""}
    <label class="field">Buscar pedido por protocolo, motivo ou cliente<input class="input" id="sel-busca" placeholder="Ex.: N2-48310" autofocus></label>
  </div></section>
  <section class="panel"><div class="panel-h"><h3>Pedidos que precisam de atenção</h3><span class="hint">atrasados, em risco ou parados</span></div><div id="sel-tbl"></div></section>`;
  const t = dataTable(el.querySelector("#sel-tbl"), { linhas: atencao, busca: false, colunas: ctx.colunasPedido(true), onRow: (p) => ir(`pedido/${p.id}`), porPagina: 15, ordenacao: { k: "slaPct", dir: -1 }, vazio: "Nenhum pedido precisa de atenção agora." });
  el.querySelector("#sel-busca").oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    t.atualizar(q ? S.E.filter((p) => `${p.protocolo} ${p.externalId} ${p.titulo} ${p.cliente}`.toLowerCase().includes(q)).slice(0, 200) : atencao);
  };
}
