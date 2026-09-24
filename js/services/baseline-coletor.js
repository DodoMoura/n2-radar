// ─────────────────────────────────────────────────────────────
// Coletor do Baseline IXCSoft. Este código NÃO roda no N2 Radar:
// vira um favorito (bookmarklet) / script de console que roda na aba
// do Baseline, com a sessão já logada do analista. Ele só faz leituras
// (GET) das páginas de Pedidos de Ajuda, lê o JSON que o Livewire já
// embute em cada página de visualização e gera um arquivo para importar
// no N2 Radar. Nenhuma credencial sai do navegador.
// ─────────────────────────────────────────────────────────────

// Função autocontida (sem imports/closures) para poder ser serializada.
function coletorBaseline() {
  const VERSAO = 1;
  const ABAS = ["unclaimed", "pending", "history", "declined"];
  const CAMPOS = ["id", "name", "email", "protocol", "client_id", "client_name", "description", "attendance_reason", "is_automatic",
    "department", "origin_department_id", "urgency", "created_at", "updated_at", "assigned_to", "assigned_at", "solution", "resolved_by",
    "resolved_at", "declined_by", "declined_at", "well_documented", "service_assumed", "current_responsible_id", "request_origin_status",
    "documentation_quality_label"];
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (!/baseline\.ixcsoft\.com\.br$/.test(location.hostname)) {
    alert("N2 Radar: abra o Baseline (baseline.ixcsoft.com.br) já logado e clique no favorito de novo.");
    return;
  }
  if (window.__n2radarColetando) return;
  const hoje = new Date();
  const resp = prompt("N2 Radar — período de abertura dos pedidos (AAAA-MM-DD a AAAA-MM-DD):", `${iso(new Date(hoje - 30 * 864e5))} a ${iso(hoje)}`);
  if (!resp) return;
  const [de, ate] = resp.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (!de || !ate) { alert("Período inválido. Use o formato 2026-09-01 a 2026-09-30."); return; }
  window.__n2radarColetando = true;

  // painel de progresso
  const ui = document.createElement("div");
  ui.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:340px;padding:14px 16px;border-radius:10px;background:#0f1d24;color:#e8eef0;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)";
  ui.innerHTML = `<b style="font-size:14px">N2 Radar · coletando</b><div data-m style="margin:6px 0">Preparando…</div><div style="height:6px;background:#26383f;border-radius:3px;overflow:hidden"><div data-b style="height:100%;width:0;background:#2bb3a0;transition:width .2s"></div></div><button data-x style="margin-top:10px;background:none;border:1px solid #466;color:#cde;border-radius:6px;padding:4px 10px;cursor:pointer">Cancelar</button>`;
  document.body.appendChild(ui);
  let cancelado = false;
  ui.querySelector("[data-x]").onclick = () => { cancelado = true; };
  const msg = (t, frac) => { ui.querySelector("[data-m]").textContent = t; if (frac != null) ui.querySelector("[data-b]").style.width = `${Math.round(frac * 100)}%`; };
  const fim = (t, ok) => {
    window.__n2radarColetando = false;
    ui.querySelector("[data-m]").innerHTML = t;
    ui.querySelector("[data-b]").style.background = ok ? "#2bb3a0" : "#d0584f";
    ui.querySelector("[data-b]").style.width = "100%";
    const x = ui.querySelector("[data-x]"); x.textContent = "Fechar"; x.onclick = () => ui.remove();
  };

  const html = async (url) => {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 * (t + 1))); continue; }
      if (r.redirected && /login/.test(r.url)) throw new Error("Sessão expirada no Baseline. Faça login e tente de novo.");
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      return new DOMParser().parseFromString(await r.text(), "text/html");
    }
    throw new Error("O Baseline limitou as requisições (429). Tente de novo em alguns minutos.");
  };
  const filtro = `tableFilters[created_at][from]=${de}&tableFilters[created_at][until]=${ate}`;

  (async () => {
    try {
      const ids = new Set();
      const usuarios = {};
      for (const aba of ABAS) {
        const vistosAba = new Set();
        for (let page = 1; page <= 1000 && !cancelado; page++) {
          const d = await html(`/admin/help-requests?activeTab=${aba}&${filtro}&page=${page}`);
          if (page === 1 && aba === ABAS[0]) {
            d.querySelectorAll("[wire\\:click*='collaborator_']").forEach((b) => {
              const m = b.getAttribute("wire:click").match(/collaborator_(\d+)/);
              if (m) usuarios[m[1]] = b.textContent.trim().replace(/\s+/g, " ");
            });
          }
          const pag = [...d.querySelectorAll("a[href*='/admin/help-requests/']")]
            .map((a) => (a.getAttribute("href").match(/\/admin\/help-requests\/(\d+)(?:$|[?#])/) || [])[1]).filter(Boolean);
          const novos = pag.filter((id) => !vistosAba.has(id));
          if (!novos.length) break;
          novos.forEach((id) => { vistosAba.add(id); ids.add(id); });
          const total = Number((d.body.textContent.match(/de\s+([\d.]+)\s+resultados/) || [])[1]?.replace(/\./g, "")) || 0;
          msg(`Listando “${aba}”: ${vistosAba.size}${total ? ` de ${total}` : ""} · ${ids.size} no total`, 0.05);
          if (total && vistosAba.size >= total) break;
        }
      }
      if (cancelado) return fim("Coleta cancelada.", false);
      // cache local (no navegador, origem do Baseline): pedidos já finalizados
      // (resolvidos ou recusados) não são baixados de novo nas próximas coletas.
      const CK = "n2radar.coletor.cache.v1";
      let cache = {};
      try { cache = JSON.parse(localStorage.getItem(CK) || "{}"); } catch { cache = {}; }
      const lista = [...ids];
      const registros = [], falhas = [];
      let i = 0, feitos = 0, doCache = 0;
      const worker = async () => {
        while (i < lista.length && !cancelado) {
          const id = lista[i++];
          const c = cache[id];
          if (c && (c.resolved_at || c.declined_at)) { registros.push(c); doCache++; feitos++; continue; }
          try {
            const d = await html(`/admin/help-requests/${id}`);
            let rec = null;
            for (const el of d.querySelectorAll("[wire\\:snapshot]")) {
              const s = JSON.parse(el.getAttribute("wire:snapshot"));
              if (/help-request/.test(s.memo?.name || "") && s.data?.data) { rec = Array.isArray(s.data.data) ? s.data.data[0] : s.data.data; break; }
            }
            if (!rec || rec.id == null) throw new Error("registro não encontrado na página");
            const o = {};
            CAMPOS.forEach((k) => { if (k in rec) o[k] = rec[k]; });
            registros.push(o);
            cache[id] = o;
          } catch (e) { falhas.push({ id, erro: e.message }); }
          feitos++;
          msg(`Lendo pedidos: ${feitos} de ${lista.length}${doCache ? ` (${doCache} do cache)` : ""}${falhas.length ? ` · ${falhas.length} falha(s)` : ""}`, 0.05 + 0.95 * (feitos / lista.length));
        }
      };
      await Promise.all(Array.from({ length: 5 }, worker));
      try { localStorage.setItem(CK, JSON.stringify(cache)); } catch { /* cota cheia: segue sem cache */ }
      if (cancelado) return fim("Coleta cancelada.", false);
      const pacote = { fonte: "baseline-ixcsoft", versao: VERSAO, geradoEm: new Date().toISOString(), periodo: { de, ate }, usuarios, registros, falhas };
      const texto = JSON.stringify(pacote);
      const nome = `baseline-n2_${de}_a_${ate}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      let copiou = false;
      try { await navigator.clipboard.writeText(texto); copiou = true; } catch { /* sem permissão de área de transferência */ }
      fim(`<b>${registros.length} pedido(s) coletados.</b><br>Arquivo <code>${nome}</code> baixado${copiou ? " e copiado para a área de transferência" : ""}.<br>No N2 Radar: Configurações → Integração → Importar do Baseline.${falhas.length ? `<br><span style="color:#f0a39c">${falhas.length} pedido(s) não puderam ser lidos.</span>` : ""}`, true);
    } catch (e) {
      fim(`Falha: ${e.message}`, false);
    }
  })();
}

export const COLETOR_FONTE = `(${coletorBaseline.toString()})();`;
export const COLETOR_BOOKMARKLET = `javascript:${encodeURIComponent(COLETOR_FONTE)}`;
