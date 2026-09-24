// ─────────────────────────────────────────────────────────────
// Motor de métricas. Funções puras: recebem pedidos/tarefas crus
// e regras, devolvem valores calculados. Nada aqui acessa rede ou DOM.
//
// Definições de tempo (sempre separadas):
//   total        = fechamento (ou agora) − abertura
//   fila         = tempo em "novo", antes de alguém atuar
//   trabalho     = tempo em status de atendimento ativo
//   esperaInt    = aguardando outra equipe / desenvolvimento
//   esperaExt    = aguardando solicitante / evidências / terceiros
//   esforco      = soma das durações das tarefas registradas (trabalho real)
//   slaMs        = total menos status configurados para pausar o SLA
// ─────────────────────────────────────────────────────────────
import { statusInfo, TAX } from "./taxonomy.js";

export const H = 3600e3;
export const DAY = 24 * H;

export function businessMs(a, b, hc) {
  if (!(b > a)) return 0;
  let t = 0;
  const d = new Date(a);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() < b) {
    if (hc.dias.includes(d.getDay())) {
      const base = d.getTime();
      const s = base + hc.inicio * H, e = base + hc.fim * H;
      t += Math.max(0, Math.min(e, b) - Math.max(s, a));
    }
    d.setDate(d.getDate() + 1);
  }
  return t;
}

export function stats(values) {
  const v = values.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0, mean: null, median: null, p90: null, sum: 0 };
  const sum = v.reduce((a, b) => a + b, 0);
  const q = (p) => {
    const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { n, mean: sum / n, median: q(0.5), p90: q(0.9), sum };
}

export function rate(num, den) {
  return den ? num / den : null;
}

// Segmentos de status com início/fim resolvidos.
export function segmentos(p, now) {
  const etapas = (p.etapas?.length ? p.etapas : [{ status: p.status, inicio: p.abertura }])
    .slice()
    .sort((a, b) => a.inicio - b.inicio);
  const fimPedido = p.fechamento && statusInfo(p.status).tipo === "final" ? p.fechamento : now;
  return etapas.map((e, i) => {
    const prox = etapas[i + 1]?.inicio;
    let fim = e.fim ?? prox ?? (statusInfo(e.status).tipo === "final" ? e.inicio : fimPedido);
    return { ...e, fim: Math.max(fim, e.inicio), tipo: statusInfo(e.status).tipo };
  });
}

// Enriquecimento de um pedido com todas as medidas derivadas.
export function enrich(p, tarefas, regras, now) {
  const segs = segmentos(p, now);
  const cls = p.classificacao || {};
  const aberto = statusInfo(p.status).tipo !== "final";
  const concluido = p.status === "concluido";
  const fim = aberto ? now : p.fechamento ?? segs.at(-1)?.inicio ?? now;
  const tempo = { fila: 0, trabalho: 0, espera_interna: 0, espera_externa: 0 };
  const porStatus = {};
  const hc = regras.sla.horarioComercial;
  const pausa = new Set(regras.sla.statusQuePausam);
  let slaMs = 0, esperaMaior = null;
  const reaberturas = [];
  segs.forEach((s, i) => {
    if (s.tipo === "final") {
      const prox = segs[i + 1];
      if (prox && prox.tipo !== "final") reaberturas.push({ fechadoEm: s.inicio, reabertoEm: prox.inicio });
      return;
    }
    const d = s.fim - s.inicio;
    tempo[s.tipo] = (tempo[s.tipo] || 0) + d;
    porStatus[s.status] = (porStatus[s.status] || 0) + d;
    if (!pausa.has(s.status)) slaMs += hc.ativo ? businessMs(s.inicio, s.fim, hc) : d;
    if (s.tipo.startsWith("espera") && (!esperaMaior || d > esperaMaior.d)) esperaMaior = { d, status: s.status };
  });
  const total = Math.max(0, fim - p.abertura);
  const alvoH = regras.sla.alvoHoras[p.prioridade] ?? regras.sla.alvoHoras.media;
  const alvoMs = alvoH * H;
  const slaPct = alvoMs ? slaMs / alvoMs : null;
  let slaStatus;
  if (!aberto) slaStatus = p.status === "cancelado" ? "na" : slaMs <= alvoMs ? "cumprido" : "violado";
  else slaStatus = slaMs > alvoMs ? "violado" : slaPct * 100 >= regras.sla.riscoPercentual ? "risco" : "no_prazo";

  const primeira = p.primeiraInteracao ?? segs.find((s) => s.status !== "novo")?.inicio ?? null;
  const primeiraMs = primeira != null ? Math.max(0, primeira - p.abertura) : null;

  const tipoGrupo = Object.fromEntries(TAX.tiposTarefa.map((t) => [t.id, t.grupo]));
  const intervencoes = tarefas.filter((t) => tipoGrupo[t.tipo] === "intervencao");
  const falhas = intervencoes.filter((t) => t.resultado === "sem_efeito" || t.resultado === "parcial");
  const esforcoMin = tarefas.reduce((a, t) => a + (t.duracaoMin || 0), 0);

  const janela = regras.janelaReaberturaDias * DAY;
  const reabertoNaJanela = reaberturas.some((r) => r.reabertoEm - r.fechadoEm <= janela);
  const retrabalhoAuto = reaberturas.length > 0 || falhas.length > 0;
  const retrabalho = cls.retrabalho ?? retrabalhoAuto;
  const fcr = concluido ? reaberturas.length === 0 && falhas.length === 0 && intervencoes.length <= 1 : null;
  const eficaz = concluido ? cls.eficaz ?? !reabertoNaJanela : null;

  let motivoDemora = cls.motivoDemora ?? p.motivoDemora ?? null;
  let motivoDemoraOrigem = cls.motivoDemora ? "manual" : p.motivoDemora ? "plataforma" : null;
  if (!motivoDemora) {
    if (esperaMaior && esperaMaior.d >= 0.25 * total) {
      motivoDemora = statusInfo(esperaMaior.status).motivoDemora ?? null;
    } else if (retrabalhoAuto) motivoDemora = "retrabalho";
    if (motivoDemora) motivoDemoraOrigem = "inferido";
  }
  const ultimoMov = Math.max(p.atualizadoEm || 0, segs.at(-1)?.inicio || 0, ...tarefas.map((t) => t.fim || t.inicio || 0));
  const escalonado = !!(p.escalonado || segs.some((s) => s.tipo === "espera_interna"));

  return {
    ...p,
    categoria: cls.categoria ?? p.categoria ?? null,
    resultadoFinal: cls.resultado ?? p.resultado ?? null,
    segs, tempo, porStatus, total, aberto, concluido,
    slaMs, alvoMs, slaPct, slaStatus,
    primeiraMs, esforcoMin, nTarefas: tarefas.length, tiposTarefa: [...new Set(tarefas.map((t) => t.tipo))],
    reaberturas: reaberturas.length, reaberturasDet: reaberturas,
    retrabalho, retrabalhoAuto, retrabalhoOrigem: cls.retrabalho != null ? "manual" : "automatico",
    fcr, eficaz, eficazOrigem: cls.eficaz != null ? "manual" : "automatico",
    motivoDemora, motivoDemoraOrigem, escalonado,
    ultimoMov, paradoMs: aberto ? now - ultimoMov : 0,
    parado: aberto && now - ultimoMov > regras.paradoHoras * H,
    atrasado: aberto && slaStatus === "violado",
  };
}

// ── Filtros ──────────────────────────────────────────────────
export const FILTER_KEYS = [
  ["responsavel", "Responsável"], ["equipe", "Equipe"], ["status", "Status"], ["prioridade", "Prioridade"],
  ["motivo", "Motivo"], ["categoria", "Categoria"], ["motivoDemora", "Motivo da demora"], ["cliente", "Cliente"],
  ["produto", "Produto/módulo"], ["sla", "SLA"], ["tipoTarefa", "Tipo de tarefa"],
];

export function applyFilters(list, f, { ignorePeriod = false } = {}) {
  return list.filter((p) => {
    if (!ignorePeriod && (p.abertura < f.inicio || p.abertura > f.fim)) return false;
    for (const [k] of FILTER_KEYS) {
      const sel = f[k];
      if (!sel || !sel.length) continue;
      if (k === "sla") { if (!sel.includes(p.slaStatus)) return false; }
      else if (k === "tipoTarefa") { if (!p.tiposTarefa.some((t) => sel.includes(t))) return false; }
      else if (!sel.includes(p[k] ?? "__vazio")) return false;
    }
    return true;
  });
}

export function periodoAnterior(f) {
  const len = f.fim - f.inicio;
  return { ...f, inicio: f.inicio - len - 1, fim: f.inicio - 1 };
}

// ── KPIs ─────────────────────────────────────────────────────
export function kpis(list, f) {
  const concl = list.filter((p) => p.concluido);
  const comSla = list.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado");
  const dentro = comSla.filter((p) => p.slaStatus === "cumprido").length;
  return {
    total: list.length,
    novos: list.filter((p) => p.status === "novo").length,
    andamento: list.filter((p) => p.aberto && p.status !== "novo").length,
    concluidos: concl.length,
    atrasados: list.filter((p) => p.atrasado).length,
    parados: list.filter((p) => p.parado).length,
    trabalho: stats(list.filter((p) => p.tempo.trabalho > 0).map((p) => p.tempo.trabalho)),
    primeira: stats(list.map((p) => p.primeiraMs)),
    resolucao: stats(concl.map((p) => p.total)),
    resolucaoSla: stats(concl.map((p) => p.slaMs)),
    esforco: stats(list.filter((p) => p.nTarefas).map((p) => p.esforcoMin)),
    slaBase: comSla.length,
    slaDentro: rate(dentro, comSla.length),
    slaFora: rate(comSla.length - dentro, comSla.length),
    retrabalho: rate(list.filter((p) => p.retrabalho).length, list.length),
    retrabalhoN: list.filter((p) => p.retrabalho).length,
    eficaz: rate(concl.filter((p) => p.eficaz).length, concl.length),
    fcr: rate(concl.filter((p) => p.fcr).length, concl.length),
    comTarefas: list.filter((p) => p.nTarefas > 0).length,
    composicao: somaTempo(list),
  };
}

export function somaTempo(list) {
  const t = { fila: 0, trabalho: 0, espera_interna: 0, espera_externa: 0 };
  list.forEach((p) => Object.keys(t).forEach((k) => (t[k] += p.tempo[k] || 0)));
  return t;
}

// ── Agrupamentos e séries ────────────────────────────────────
export function groupBy(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const ks = keyFn(x);
    for (const k of Array.isArray(ks) ? ks : [ks]) {
      const key = k ?? "__vazio";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(x);
    }
  }
  return m;
}

export function countBy(list, key) {
  return [...groupBy(list, (p) => p[key])].map(([k, v]) => ({ k, n: v.length, items: v })).sort((a, b) => b.n - a.n);
}

export function bucketStart(ts, gran) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (gran === "semana") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (gran === "mes") d.setDate(1);
  return d.getTime();
}

export function buckets(inicio, fim, gran) {
  const out = [];
  let t = bucketStart(inicio, gran);
  while (t <= fim) {
    out.push(t);
    const d = new Date(t);
    if (gran === "dia") d.setDate(d.getDate() + 1);
    else if (gran === "semana") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    t = d.getTime();
  }
  return out;
}

export function autoGran(f) {
  const dias = (f.fim - f.inicio) / DAY;
  return dias <= 31 ? "dia" : dias <= 180 ? "semana" : "mes";
}

export function serie(list, f, gran, dateFn, valueFn = (arr) => arr.length) {
  const bs = buckets(f.inicio, f.fim, gran);
  const g = groupBy(list.filter((p) => dateFn(p) != null), (p) => bucketStart(dateFn(p), gran));
  return bs.map((b) => ({ t: b, v: valueFn(g.get(b) || []), n: (g.get(b) || []).length }));
}

// ── Tarefas ─────────────────────────────────────────────────
export function taskStats(tarefas, idsPedidos) {
  const ts = idsPedidos ? tarefas.filter((t) => idsPedidos.has(t.pedidoId)) : tarefas;
  const totalMin = ts.reduce((a, t) => a + (t.duracaoMin || 0), 0);
  return [...groupBy(ts, (t) => t.tipo)].map(([tipo, arr]) => {
    const st = stats(arr.map((t) => t.duracaoMin));
    const comRes = arr.filter((t) => t.resultado);
    return {
      tipo, n: arr.length, pedidos: new Set(arr.map((t) => t.pedidoId)).size,
      totalMin: st.sum, mediaMin: st.mean, medianaMin: st.median, share: totalMin ? st.sum / totalMin : 0,
      nRes: comRes.length,
      resolveu: rate(comRes.filter((t) => t.resultado === "resolveu").length, comRes.length),
      identificou: rate(comRes.filter((t) => t.resultado === "resolveu" || t.resultado === "identificou").length, comRes.length),
    };
  }).sort((a, b) => b.totalMin - a.totalMin);
}

// ── Performance (volume × velocidade × eficácia) ────────────
// A velocidade é normalizada pelo mix de categorias: para cada pedido,
// compara o tempo de SLA com a mediana da mesma categoria na base.
// Índice 1,00 = ritmo típico para o tipo de demanda que a pessoa recebeu.
export function performance(list, tarefas, key, regras) {
  const concl = list.filter((p) => p.concluido);
  const medCat = new Map([...groupBy(concl, (p) => p.categoria)].map(([k, v]) => [k, stats(v.map((p) => p.slaMs)).median]));
  const medGeral = stats(concl.map((p) => p.slaMs)).median;
  const tarefasPorPessoa = groupBy(tarefas, (t) => t.responsavel);
  const ids = new Set(list.map((p) => p.id));
  return [...groupBy(list, (p) => p[key])].map(([k, arr]) => {
    const c = arr.filter((p) => p.concluido);
    const ratios = c.map((p) => {
      const ref = medCat.get(p.categoria) ?? medGeral;
      return ref ? p.slaMs / ref : null;
    });
    const comSla = arr.filter((p) => p.slaStatus === "cumprido" || p.slaStatus === "violado");
    const tar = key === "responsavel" ? (tarefasPorPessoa.get(k) || []).filter((t) => ids.has(t.pedidoId)) : tarefas.filter((t) => arr.some((p) => p.id === t.pedidoId));
    return {
      k, n: arr.length, concluidos: c.length, abertos: arr.filter((p) => p.aberto).length,
      tarefas: tar.length, esforcoH: tar.reduce((a, t) => a + (t.duracaoMin || 0), 0) / 60,
      trabalhoMed: stats(arr.map((p) => p.tempo.trabalho).filter((x) => x > 0)).median,
      resolucaoMed: stats(c.map((p) => p.slaMs)).median,
      indiceRitmo: stats(ratios).median,
      sla: rate(comSla.filter((p) => p.slaStatus === "cumprido").length, comSla.length),
      fcr: rate(c.filter((p) => p.fcr).length, c.length),
      retrabalho: rate(arr.filter((p) => p.retrabalho).length, arr.length),
      eficaz: rate(c.filter((p) => p.eficaz).length, c.length),
      mixComplexo: rate(arr.filter((p) => (medCat.get(p.categoria) ?? 0) > medGeral).length, arr.length),
      amostraOk: c.length >= regras.amostraMinima,
    };
  }).sort((a, b) => b.n - a.n);
}

// ── Gargalos ────────────────────────────────────────────────
export function heatmapSemanaHora(list) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  list.forEach((p) => {
    const d = new Date(p.abertura);
    m[d.getDay()][d.getHours()]++;
  });
  return m;
}

export function motivoDemoraAcima(list, limiteH) {
  const acima = list.filter((p) => p.total > limiteH * H);
  return { base: acima.length, grupos: countBy(acima, "motivoDemora") };
}
