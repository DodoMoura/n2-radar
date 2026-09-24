// ─────────────────────────────────────────────────────────────
// Baseline IXCSoft → modelo de pedido do N2 Radar.
// Recebe o pacote gerado pelo coletor (baseline-coletor.js) e devolve
// pedidos no formato usado pelo motor de métricas.
//
// Linha do tempo reconstruída a partir dos carimbos do Baseline:
//   created_at  → "novo" (na fila, ninguém assumiu)
//   assigned_at → "em_andamento" (assumido)
//   resolved_at → "concluido"
//   declined_at → "cancelado" (recusado)
// O Baseline não registra pausas (aguardando cliente/N1), então o tempo
// entre assumir e resolver conta inteiro como atendimento.
// ─────────────────────────────────────────────────────────────

export const FONTE_BASELINE = "baseline";

const URGENCIA = { critical: "urgente", urgent: "urgente", high: "alta", medium: "media", normal: "media", low: "baixa" };
const TIPO_CATEGORIA = { "dúvida": "duvida", "duvida": "duvida", "falha": "erro_bug", "ajuste": "ajuste", "erro": "erro_bug", "orientação": "orientacao" };

const ts = (v) => {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
};

export function categoriaDoMotivo(motivo) {
  if (!motivo) return null;
  if (/instabilidade/i.test(motivo)) return "instabilidade";
  if (/transfer[eê]ncia entre departamentos/i.test(motivo)) return "outros";
  const tipo = motivo.split(">")[0].trim().toLowerCase();
  return TIPO_CATEGORIA[tipo] ?? "outros";
}

export function validarPacote(p) {
  if (!p || typeof p !== "object") throw new Error("Conteúdo vazio ou inválido.");
  if (p.fonte !== "baseline-ixcsoft" || !Array.isArray(p.registros)) throw new Error("Este arquivo não foi gerado pelo coletor do Baseline.");
  if (p.versao > 1) throw new Error("Arquivo gerado por uma versão mais nova do coletor. Recarregue o N2 Radar.");
  return p;
}

const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));

export function nomeUsuario(usuarios, id) {
  if (id == null) return null;
  return usuarios?.[String(id)] ?? `Usuário #${id}`;
}

export function normalizar(r, usuarios) {
  const abertura = ts(r.created_at);
  const assumido = ts(r.assigned_at);
  const resolvido = ts(r.resolved_at);
  const recusado = ts(r.declined_at);
  const etapas = [{ status: "novo", inicio: abertura }];
  if (assumido) etapas.push({ status: "em_andamento", inicio: Math.max(assumido, abertura) });
  if (recusado && !resolvido) etapas.push({ status: "cancelado", inicio: Math.max(recusado, abertura) });
  else if (resolvido) etapas.push({ status: "concluido", inicio: Math.max(resolvido, assumido || abertura) });
  const status = etapas.at(-1).status;
  const motivo = (r.attendance_reason || "").trim();
  const partes = motivo.split(">").map((x) => x.trim()).filter(Boolean);
  return {
    id: `${FONTE_BASELINE}_${r.id}`,
    externalId: String(r.id),
    source: FONTE_BASELINE,
    protocolo: r.protocol || `#${r.id}`,
    titulo: motivo || "(motivo não informado)",
    motivo: motivo || null,
    categoria: categoriaDoMotivo(motivo),
    produto: partes[1] || null,
    descricao: r.description || "",
    cliente: r.client_name ? `${r.client_name}${r.client_id ? ` (${r.client_id})` : ""}` : null,
    equipe: r.department || null,
    responsavel: nomeUsuario(usuarios, r.resolved_by ?? r.assigned_to ?? r.current_responsible_id ?? r.declined_by),
    solicitante: r.name || null,
    prioridade: URGENCIA[String(r.urgency || "").toLowerCase()] ?? "media",
    status,
    abertura,
    primeiraInteracao: assumido,
    fechamento: resolvido ?? recusado,
    atualizadoEm: ts(r.updated_at) ?? resolvido ?? assumido ?? abertura,
    resultado: r.solution || null,
    etapas,
    interacoes: [],
    escalonado: false,
    classificacao: {},
    extras: limpar({
      "E-mail do solicitante": r.email,
      "Origem do pedido": r.is_automatic ? "Automático" : "Manual",
      "Urgência no Baseline": r.urgency,
      "Bem documentado": r.well_documented == null ? null : r.well_documented ? "Sim" : "Não",
      "Qualidade da documentação": r.documentation_quality_label,
      "Recusado por": nomeUsuario(usuarios, r.declined_by),
      "Link no Baseline": `https://baseline.ixcsoft.com.br/admin/help-requests/${r.id}`,
    }),
  };
}

// Eventos de histórico derivados dos carimbos (somente leitura).
export function historicoDerivado(r, usuarios) {
  const id = `${FONTE_BASELINE}_${r.id}`;
  const ev = [];
  let atual = null;
  const push = (em, evento, para, usuario) => {
    if (!em) return;
    ev.push({ id: `${id}_${para}`, pedidoId: id, evento, campo: "status", de: atual, para, em, usuario, origem: "baseline" });
    atual = para;
  };
  push(ts(r.created_at), "criado", "novo", r.name || "Solicitante");
  push(ts(r.assigned_at), "status", "em_andamento", nomeUsuario(usuarios, r.assigned_to));
  if (r.declined_at && !r.resolved_at) push(ts(r.declined_at), "status", "cancelado", nomeUsuario(usuarios, r.declined_by));
  else push(ts(r.resolved_at), "status", "concluido", nomeUsuario(usuarios, r.resolved_by));
  return ev;
}

// Compara um pacote do coletor com os registros atuais (id Baseline → registro cru).
// Devolve só o que precisa ser gravado: novos e alterados (updated_at mais recente).
export function mesclarPacote(atuais, pacote) {
  validarPacote(pacote);
  const gravar = [];
  let novos = 0, alterados = 0, inalterados = 0;
  for (const r of pacote.registros) {
    if (r?.id == null || !r.created_at) continue;
    const atual = atuais[String(r.id)];
    if (!atual) { gravar.push(r); novos++; }
    else if (JSON.stringify(atual) !== JSON.stringify(r) && Date.parse(r.updated_at || 0) >= Date.parse(atual.updated_at || 0)) { gravar.push(r); alterados++; }
    else inalterados++;
  }
  const resumo = { em: Date.now(), periodo: pacote.periodo || null, geradoEm: Date.parse(pacote.geradoEm) || null, lidos: pacote.registros.length, novos, alterados, inalterados, falhas: pacote.falhas?.length || 0 };
  return { gravar, resumo };
}

export function lerPacote(texto) {
  if (typeof texto !== "string") return validarPacote(texto);
  try { return validarPacote(JSON.parse(texto.trim().replace(/^\uFEFF/, ""))); }
  catch (e) {
    if (e instanceof SyntaxError) throw new Error("O conteúdo não é um JSON válido. Cole o texto completo copiado pelo coletor ou envie o arquivo .json.");
    throw e;
  }
}
