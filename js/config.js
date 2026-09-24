// ─────────────────────────────────────────────────────────────
// N2 Radar — configuração do frontend
// firebaseConfig do projeto "n2-radar" (Console Firebase → Configurações do
// projeto → Seus apps → Web). Essas chaves NÃO são segredos: o acesso é
// protegido pelo login Google e pelas regras do Firestore (firestore.rules).
// Com `firebase: null` o Radar roda sem login, guardando os pedidos
// importados só no navegador.
// ─────────────────────────────────────────────────────────────
export const APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAWtA5jzHdbL3WL2GfCN9EMA5bGGkXjQVc",
    authDomain: "n2-radar.firebaseapp.com",
    projectId: "n2-radar",
    storageBucket: "n2-radar.firebasestorage.app",
    messagingSenderId: "789956449675",
    appId: "1:789956449675:web:9852c595707280e6e18b8e",
  },
  // E-mails que viram administradores no primeiro login (manter igual ao firestore.rules).
  admins: ["deoliveiramouraeduardohenrique@gmail.com", "eduardo.moura@ixcsoft.com.br"],
  firebaseSdkVersion: "10.12.2",
  // Endereço público do Radar (de onde o favorito do Baseline carrega o coletor).
  urlPublica: "https://dodomoura.github.io/n2-radar/",
  // Janela de dados carregada no navegador (dias).
  janelaDias: 365,
};

// Regras e parâmetros padrão. Em produção ficam em config/regras no
// Firestore e são editáveis em Configurações → Regras e SLA.
export const DEFAULT_REGRAS = {
  sla: {
    // horas-alvo de resolução por prioridade
    alvoHoras: { urgente: 4, alta: 8, media: 24, baixa: 48 },
    alvoPrimeiraInteracaoHoras: { urgente: 0.5, alta: 1, media: 2, baixa: 4 },
    // status cujo tempo NÃO conta para o SLA (pausam o relógio)
    statusQuePausam: ["aguardando_solicitante", "aguardando_evidencias", "aguardando_externo"],
    horarioComercial: { ativo: false, inicio: 8, fim: 18, dias: [1, 2, 3, 4, 5] },
    riscoPercentual: 80, // acima de 80% do alvo consumido = "em risco"
  },
  paradoHoras: 24, // pedido aberto sem movimentação há mais de X h = parado
  janelaReaberturaDias: 7, // reaberto dentro de X dias = solução não eficaz
  amostraMinima: 5, // abaixo disso, métricas aparecem como "amostra insuficiente"
  limiteDemoraHoras: 24, // "demandas acima de X h" nas análises de demora
};

export const DEFAULT_INTEGRACAO = {
  fonteId: "baseline",
  nome: "Baseline IXCSoft",
  intervaloMin: 1440, // referência para o alerta de "dados desatualizados" (1 dia)
};
