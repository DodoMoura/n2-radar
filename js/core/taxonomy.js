// Taxonomia padrão. Editável em Configurações → Classificação
// (persistida em config/taxonomia). Os ids são estáveis; os rótulos podem mudar.

export const STATUS = [
  { id: "novo", rotulo: "Novo (na fila)", tipo: "fila" },
  { id: "em_andamento", rotulo: "Em atendimento", tipo: "trabalho" },
  { id: "aguardando_solicitante", rotulo: "Aguardando solicitante", tipo: "espera_externa", motivoDemora: "aguardando_solicitante" },
  { id: "aguardando_evidencias", rotulo: "Aguardando evidências", tipo: "espera_externa", motivoDemora: "aguardando_evidencias" },
  { id: "aguardando_externo", rotulo: "Aguardando terceiro", tipo: "espera_externa", motivoDemora: "dependencia_externa" },
  { id: "aguardando_equipe", rotulo: "Aguardando outra equipe", tipo: "espera_interna", motivoDemora: "aguardando_outra_equipe" },
  { id: "aguardando_desenvolvimento", rotulo: "Aguardando desenvolvimento", tipo: "espera_interna", motivoDemora: "aguardando_desenvolvimento" },
  { id: "concluido", rotulo: "Concluído", tipo: "final" },
  { id: "cancelado", rotulo: "Cancelado", tipo: "final" },
];

export const TIPOS_TEMPO = [
  { id: "fila", rotulo: "Fila", desc: "Aberto, ainda sem ninguém atuando", cor: "var(--s7)" },
  { id: "trabalho", rotulo: "Em atendimento", desc: "Status de atendimento ativo no N2", cor: "var(--s1)" },
  { id: "espera_interna", rotulo: "Espera interna", desc: "Aguardando outra equipe ou desenvolvimento", cor: "var(--s3)" },
  { id: "espera_externa", rotulo: "Espera externa", desc: "Aguardando solicitante, evidências ou terceiros", cor: "var(--s2)" },
];

export const CATEGORIAS = [
  ["duvida", "Dúvida"], ["erro_bug", "Erro/bug"], ["configuracao", "Configuração"], ["analise_tecnica", "Análise técnica"],
  ["banco_dados", "Banco de dados"], ["integracao", "Integração"], ["performance", "Performance"],
  ["permissao", "Permissão/acesso"], ["instabilidade", "Instabilidade"], ["orientacao", "Orientação"], ["ajuste", "Ajuste de dados"], ["outros", "Outros"],
].map(([id, rotulo]) => ({ id, rotulo }));

export const MOTIVOS_DEMORA = [
  ["aguardando_solicitante", "Aguardando retorno do solicitante"], ["aguardando_evidencias", "Aguardando evidências"],
  ["aguardando_ambiente", "Aguardando ambiente"], ["aguardando_outra_equipe", "Aguardando análise de outra equipe"],
  ["aguardando_desenvolvimento", "Aguardando desenvolvimento"], ["aguardando_correcao", "Aguardando correção"],
  ["complexidade", "Complexidade técnica"], ["investigacao", "Necessidade de investigação"],
  ["falta_informacao", "Falta de informação"], ["retrabalho", "Retrabalho"], ["dependencia_externa", "Dependência externa"],
  ["priorizacao", "Priorização de outra demanda"], ["erro_encaminhamento", "Erro de encaminhamento"], ["outros", "Outros"],
].map(([id, rotulo]) => ({ id, rotulo }));

export const TIPOS_TAREFA = [
  ["analise_logs", "Análise de logs", "diagnostico"], ["consulta_banco", "Consulta ao banco", "diagnostico"],
  ["teste_ambiente", "Teste em ambiente", "diagnostico"], ["reproducao", "Reprodução do problema", "diagnostico"],
  ["validacao_config", "Validação de configuração", "diagnostico"], ["contato_cliente", "Contato com cliente", "comunicacao"],
  ["contato_n1", "Contato com suporte N1", "comunicacao"], ["contato_dev", "Contato com desenvolvimento", "comunicacao"],
  ["alteracao_config", "Alteração de configuração", "intervencao"], ["correcao", "Correção", "intervencao"],
  ["orientacao", "Orientação", "intervencao"], ["documentacao", "Documentação", "apoio"], ["testes_finais", "Testes finais", "apoio"],
].map(([id, rotulo, grupo]) => ({ id, rotulo, grupo }));

export const RESULTADOS_TAREFA = [
  { id: "resolveu", rotulo: "Resolveu o problema", identificou: true },
  { id: "identificou", rotulo: "Identificou a causa", identificou: true },
  { id: "parcial", rotulo: "Avanço parcial", identificou: false },
  { id: "sem_efeito", rotulo: "Sem efeito", identificou: false },
  { id: "encaminhou", rotulo: "Encaminhado", identificou: false },
];

export const PRIORIDADES = [
  { id: "urgente", rotulo: "Urgente", peso: 4 }, { id: "alta", rotulo: "Alta", peso: 3 },
  { id: "media", rotulo: "Média", peso: 2 }, { id: "baixa", rotulo: "Baixa", peso: 1 },
];

export function defaultTaxonomia() {
  return {
    categorias: CATEGORIAS.map((x) => ({ ...x })),
    motivosDemora: MOTIVOS_DEMORA.map((x) => ({ ...x })),
    tiposTarefa: TIPOS_TAREFA.map((x) => ({ ...x })),
    status: STATUS.map((x) => ({ ...x })),
  };
}

// Índices de rótulo, recalculados quando a taxonomia muda.
let IDX = {};
export function setTaxonomia(t) {
  const m = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  IDX = {
    categoria: m(t.categorias), motivoDemora: m(t.motivosDemora), tipoTarefa: m(t.tiposTarefa),
    status: m(t.status), prioridade: m(PRIORIDADES), resultado: m(RESULTADOS_TAREFA), tempo: m(TIPOS_TEMPO),
  };
  TAX = t;
}
export let TAX = defaultTaxonomia();
setTaxonomia(TAX);

export function label(tipo, id) {
  if (id == null || id === "") return "—";
  return IDX[tipo]?.[id]?.rotulo ?? String(id);
}
export function statusInfo(id) {
  return IDX.status?.[id] ?? { id, rotulo: id, tipo: "trabalho" };
}
export function isFinal(status) {
  return statusInfo(status).tipo === "final";
}
