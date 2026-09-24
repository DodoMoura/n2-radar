// Importação do Baseline: modal de importação e painel de Configurações → Integração.
import { COLETOR_FONTE, COLETOR_BOOKMARKLET } from "../services/baseline-coletor.js";
import { icon, toast, modal, confirmar } from "../ui/components.js";
import { esc, fmtDate, fmtDateTime, fmtNum, fmtDur } from "../ui/format.js";
import { APP_CONFIG } from "../config.js";

// Favorito da sincronização automática: carrega o coletor publicado no GitHub Pages,
// então qualquer melhoria no coletor chega sem reinstalar o favorito.
const URL_COLETOR = new URL("js/coletor.js", APP_CONFIG.urlPublica || location.href).href;
export const BOOKMARKLET_AUTO = `javascript:(()=>{import('${URL_COLETOR}?t='+Date.now()).then(m=>m.iniciar()).catch(e=>alert('N2 Radar: não foi possível carregar o coletor ('+e.message+')'))})()`;
export const USERSCRIPT = `// ==UserScript==
// @name         N2 Radar · sincronização automática
// @namespace    ${APP_CONFIG.urlPublica || ""}
// @version      1.0
// @description  Sincroniza os Pedidos de Ajuda do Baseline com o N2 Radar a cada 30 s enquanto houver uma aba do Baseline aberta.
// @match        https://baseline.ixcsoft.com.br/admin/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  if (window.top !== window) return;
  const s = document.createElement("script");
  s.type = "module";
  s.textContent = "import('${URL_COLETOR}?t=" + Math.floor(Date.now() / 36e5) + "').then(m => m.iniciar({ auto: true }))";
  document.head.appendChild(s);
})();
`;

async function copiar(texto, alvoFallback) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* área de transferência bloqueada no visualizador */ }
  if (alvoFallback) {
    alvoFallback.hidden = false; alvoFallback.value = texto; alvoFallback.focus(); alvoFallback.select();
    try { if (document.execCommand("copy")) return true; } catch { /* ignora */ }
  }
  return false;
}

function resumoTexto(r) {
  return `${fmtNum(r.lidos)} lido(s): ${fmtNum(r.novos)} novo(s), ${fmtNum(r.alterados)} atualizado(s), ${fmtNum(r.inalterados)} sem mudança${r.falhas ? ` · ${r.falhas} falha(s) na coleta` : ""}.`;
}

// Modal: arquivo .json ou texto colado.
export function abrirImportacao(S, aoConcluir) {
  modal({
    titulo: "Importar do Baseline",
    corpo: `
      <div style="display:grid;gap:14px">
        <ol class="note" style="margin:0;padding-left:18px;display:grid;gap:4px">
          <li>No Baseline (já logado), clique no favorito <b>Coletar N2 Radar</b> e informe o período.</li>
          <li>Ao terminar, ele baixa um arquivo <code class="code-inline">baseline-n2_….json</code> e copia o conteúdo.</li>
          <li>Solte o arquivo abaixo ou cole o conteúdo no campo de texto.</li>
        </ol>
        <label class="drop" data-drop style="display:grid;place-items:center;gap:6px;padding:22px;border:1.5px dashed var(--line-strong, var(--line));border-radius:10px;cursor:pointer;text-align:center">
          ${icon("file")}<span><b>Escolher arquivo</b> ou arrastar para cá</span><span class="small muted">.json gerado pelo coletor</span>
          <input type="file" accept=".json,application/json" data-file hidden>
        </label>
        <label class="field">Ou cole o conteúdo copiado<textarea class="input code" rows="5" data-txt spellcheck="false" placeholder='{"fonte":"baseline-ixcsoft", …}'></textarea></label>
        <p class="note" data-erro style="color:var(--crit);margin:0" hidden></p>
      </div>`,
    rodape: `<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${icon("refresh")} Importar</button>`,
    onMount: (m, fechar) => {
      const erro = (t) => { const e = m.querySelector("[data-erro]"); e.textContent = t; e.hidden = !t; };
      const ok = m.querySelector("[data-ok]");
      const processar = async (texto) => {
        if (!texto?.trim()) { erro("Escolha um arquivo ou cole o conteúdo."); return; }
        ok.disabled = true; ok.classList.add("spin"); erro("");
        try {
          const r = await S.fonte.importar(texto, (feitos, total) => { ok.textContent = `Gravando ${feitos} de ${total}…`; });
          fechar();
          toast(`Importação concluída. ${resumoTexto(r)}`);
          aoConcluir?.(r);
        } catch (e) { erro(e.message); }
        finally { ok.disabled = false; ok.classList.remove("spin"); ok.innerHTML = `${icon("refresh")} Importar`; }
      };
      const file = m.querySelector("[data-file]");
      file.onchange = async () => { if (file.files[0]) processar(await file.files[0].text()); };
      const drop = m.querySelector("[data-drop]");
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.borderColor = "var(--accent)"; });
      drop.addEventListener("dragleave", () => (drop.style.borderColor = ""));
      drop.addEventListener("drop", async (e) => {
        e.preventDefault(); drop.style.borderColor = "";
        const f = e.dataTransfer.files[0];
        if (f) processar(await f.text());
      });
      ok.onclick = () => processar(m.querySelector("[data-txt]").value);
    },
  });
}

// Painel dentro de Configurações → Integração.
export function painelBaseline(S, rerender) {
  const firebase = S.fonte.modo === "firebase";
  const pode = S.fonte.podeImportar;
  const r = S.fonte.resumoBase();
  const ult = r.importacoes?.[0];
  const co = S.sync?.coletor;
  const autoAtivo = !!(co?.ultimaVerificacao && Date.now() - co.ultimaVerificacao < 3 * 60e3);
  const html = `
  <section class="panel" id="p-baseline">
    <div class="panel-h"><h3>Baseline IXCSoft · Pedidos de Ajuda</h3><span class="hint">coleta pela sua sessão do Baseline; nenhuma senha passa pelo N2 Radar</span></div>
    <div class="panel-b" style="display:grid;gap:14px">
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div class="small muted">Pedidos na base</div><div style="font:600 20px var(--cond)">${fmtNum(r.total)}</div></div>
        <div><div class="small muted">Abertura entre</div><div>${r.de ? `${fmtDate(r.de)} e ${fmtDate(r.ate)}` : "—"}</div></div>
        <div><div class="small muted">Última importação</div><div>${ult ? `${fmtDateTime(ult.em)}${ult.por ? ` · ${esc(ult.por)}` : ""}` : "nenhuma"}</div></div>
        <div><div class="small muted">Armazenamento</div><div>${firebase ? "Firestore (compartilhado com a equipe)" : S.fonte.persistente ? "só neste navegador (sem Firebase)" : `<span style="color:var(--warn)">só nesta sessão</span>`}</div></div>
      </div>
      ${pode ? "" : `<div class="callout">Seu perfil pode consultar e classificar os pedidos. A importação do Baseline é feita por administradores e gestores.</div>`}

      ${firebase ? `
      <div class="callout" style="display:grid;gap:4px">
        <b>Sincronização automática ${autoAtivo ? `<span style="color:var(--ok)">ativa</span>` : "desligada"}</b>
        <span>${autoAtivo ? `Verificando o Baseline a cada ${co.intervaloSeg || 30}s pela aba de ${esc(co.por || "—")} · última verificação há ${fmtDur(Date.now() - co.ultimaVerificacao)}.` : co?.ultimaVerificacao ? `Última verificação há ${fmtDur(Date.now() - co.ultimaVerificacao)}, por ${esc(co.por || "—")}. Nenhuma aba do Baseline está sincronizando agora.` : "Ainda não foi ligada. Siga os passos abaixo (uma vez só)."}</span>
      </div>
      <div style="display:grid;gap:8px">
        <b>1. Instale o favorito (uma vez)</b>
        <p class="note" style="margin:0">Arraste o botão para a barra de favoritos do Chrome (Ctrl+Shift+B mostra a barra).</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <a class="btn primary" data-bm-auto href="#" draggable="true" title="Arraste para a barra de favoritos" style="cursor:grab">${icon("refresh")} N2 Radar · Sincronizar</a>
          <button class="btn ghost sm" data-copiar-auto>Copiar endereço do favorito</button>
        </div>
      </div>
      <div style="display:grid;gap:6px">
        <b>2. Ligue no Baseline</b>
        <p class="note" style="margin:0">Abra qualquer página do Baseline (já logado) e clique no favorito. Na primeira vez, clique em <b>Entrar com Google</b> no painel que aparece no canto da tela (mesma conta do Radar, perfil admin ou gestor). A partir daí ele confere o Baseline <b>a cada 30 segundos</b>, grava só o que mudou e o Radar atualiza sozinho. A primeira rodada lê os últimos 30 dias e leva uns 2 minutos.</p>
        <p class="note" style="margin:0"><b>Deixe essa aba do Baseline aberta</b> (pode fixar a guia). Se ela fechar ou recarregar, é só clicar no favorito de novo.</p>
      </div>
      <details><summary style="cursor:pointer;font-weight:600">Opcional: ligar sozinho ao abrir o Baseline (Tampermonkey)</summary>
        <div class="note" style="display:grid;gap:8px;margin-top:8px">
          <span>Com a extensão <b>Tampermonkey</b>, a sincronização liga sozinha sempre que qualquer aba do Baseline abrir, sem precisar clicar no favorito. Instale a extensão, crie um novo script e cole o conteúdo abaixo.</span>
          <div><button class="btn sm" data-copiar-us>Copiar script do Tampermonkey</button></div>
        </div>
      </details>
      <textarea class="input code" rows="3" data-fallback hidden readonly></textarea>
      <details><summary style="cursor:pointer;font-weight:600">Alternativa: importação manual por arquivo</summary><div style="display:grid;gap:12px;margin-top:10px">` : ""}
      <div style="display:grid;gap:8px">
        <b>1. Instale o coletor (uma vez)</b>
        <p class="note" style="margin:0">Arraste o botão abaixo para a barra de favoritos do Chrome. Se preferir, copie o script e cole no Console (F12) da página do Baseline.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <a class="btn" data-bm href="#" draggable="true" title="Arraste para a barra de favoritos" style="cursor:grab">${icon("target")} Coletar N2 Radar</a>
          <button class="btn ghost sm" data-copiar-bm>Copiar como favorito</button>
          <button class="btn ghost sm" data-copiar-js>Copiar script de console</button>
        </div>
        <textarea class="input code" rows="3" data-fallback hidden readonly></textarea>
      </div>
      <div style="display:grid;gap:6px">
        <b>2. Colete no Baseline</b>
        <p class="note" style="margin:0">Abra <span class="code-inline">baseline.ixcsoft.com.br/admin/help-requests</span>, clique no favorito e informe o período. O coletor percorre as abas Não assumidos, Pendente, Histórico e Recusados, lê cada pedido e baixa um .json. Pedidos já finalizados ficam em cache no Baseline, então as próximas coletas são mais rápidas.</p>
      </div>
      <div style="display:grid;gap:8px">
        <b>3. Importe aqui</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${pode ? `<button class="btn primary" data-importar>${icon("refresh")} Importar arquivo do Baseline</button>` : ""}
          ${!firebase ? `<button class="btn danger" data-apagar style="margin-left:auto">Apagar dados deste navegador</button>` : ""}
        </div>
      </div>

      ${firebase ? `</div></details>` : ""}
      <details><summary style="cursor:pointer;font-weight:600">Como os dados do Baseline viram métricas</summary>
        <div class="note" style="display:grid;gap:6px;margin-top:8px">
          <span><b>Linha do tempo:</b> criado → <i>Novo (fila)</i>; assumido → <i>Em atendimento</i>; resolvido → <i>Concluído</i>; recusado → <i>Cancelado</i>. Fila = até alguém assumir; atendimento = de assumir até resolver.</span>
          <span><b>Sem pausas:</b> o Baseline não registra “aguardando N1/cliente”, então todo o tempo após assumir conta como atendimento e para o SLA. Use a página do pedido para marcar o motivo da demora quando houver espera.</span>
          <span><b>Categoria:</b> vem do 1º nível do motivo (Dúvida → Dúvida, Falha → Erro/bug, Ajuste → Ajuste de dados; “Instabilidade” no texto → Instabilidade). O 2º nível vira Produto/módulo.</span>
          <span><b>Urgência:</b> critical → Urgente, high → Alta, medium → Média, low → Baixa. <b>Responsável:</b> quem resolveu; se aberto, quem assumiu.</span>
          <span><b>Solicitante</b> é o analista N1 que abriu o pedido; <b>Cliente</b> é a razão social com o ID.</span>
        </div>
      </details>
      ${r.importacoes.length ? `<details><summary style="cursor:pointer;font-weight:600">Histórico de importações (${r.importacoes.length})</summary>
        <div class="table-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Importado em</th><th>Por</th><th>Período coletado</th><th class="num">Lidos</th><th class="num">Novos</th><th class="num">Atualizados</th><th class="num">Falhas</th></tr></thead><tbody>
        ${r.importacoes.slice(0, 20).map((i) => `<tr><td>${fmtDateTime(i.em)}</td><td>${esc(i.por || "—")}</td><td>${esc(i.periodo ? `${i.periodo.de} a ${i.periodo.ate}` : "—")}</td><td class="num">${fmtNum(i.lidos)}</td><td class="num">${fmtNum(i.novos)}</td><td class="num">${fmtNum(i.alterados)}</td><td class="num">${fmtNum(i.falhas)}</td></tr>`).join("")}
        </tbody></table></div></details>` : ""}
    </div>
  </section>`;

  const montar = (el) => {
    const bmA = el.querySelector("[data-bm-auto]");
    if (bmA) {
      bmA.setAttribute("href", BOOKMARKLET_AUTO);
      bmA.addEventListener("click", (e) => { e.preventDefault(); toast("Arraste este botão para a barra de favoritos e clique nele numa página do Baseline."); });
      el.querySelector("[data-copiar-auto]").onclick = async () => toast(await copiar(BOOKMARKLET_AUTO, el.querySelector("[data-fallback]")) ? "Copiado. Crie um favorito e cole como endereço (URL)." : "Selecione o texto abaixo e copie (Ctrl+C).");
      el.querySelector("[data-copiar-us]").onclick = async () => toast(await copiar(USERSCRIPT, el.querySelector("[data-fallback]")) ? "Script copiado. Cole num novo script do Tampermonkey e salve." : "Selecione o texto abaixo e copie (Ctrl+C).");
    }
    const bm = el.querySelector("[data-bm]");
    // o href javascript: é aplicado via DOM para não ser executado pelo clique aqui dentro
    bm.setAttribute("href", COLETOR_BOOKMARKLET);
    bm.addEventListener("click", (e) => { e.preventDefault(); toast("Arraste este botão para a barra de favoritos e use-o na página do Baseline."); });
    const fb = el.querySelector("[data-fallback]");
    el.querySelector("[data-copiar-bm]").onclick = async () => toast(await copiar(COLETOR_BOOKMARKLET, fb) ? "Copiado. Crie um favorito e cole como URL." : "Selecione o texto abaixo e copie (Ctrl+C).");
    el.querySelector("[data-copiar-js]").onclick = async () => toast(await copiar(COLETOR_FONTE, fb) ? "Script copiado. Cole no Console da página do Baseline." : "Selecione o texto abaixo e copie (Ctrl+C).");
    el.querySelector("[data-importar]")?.addEventListener("click", () => abrirImportacao(S, rerender));
    el.querySelector("[data-apagar]")?.addEventListener("click", async () => {
      if (!(await confirmar("Apagar todos os pedidos importados, classificações e tarefas registradas neste navegador? Isso não afeta o Baseline.", "Apagar"))) return;
      await S.fonte.apagarTudo();
      toast("Dados locais apagados.");
      rerender();
    });
  };
  return { html, montar };
}
