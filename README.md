# N2 Radar

Centro de inteligência operacional para os **Pedidos de Ajuda N2** do Baseline IXCSoft: volume, SLA, tempo de fila e de atendimento, gargalos, performance por analista, eficácia e relatórios (CSV, Excel, PDF).

Aplicação estática (HTML + módulos ES, sem build), hospedada no GitHub Pages, com login Google e dados no Firebase (Auth + Firestore, plano gratuito).

## Como os dados chegam

O Baseline não tem API pública. O **coletor** é um favorito (bookmarklet) que roda na aba do Baseline já logada:

1. Em **Configurações → Integração**, arraste o botão **Coletar N2 Radar** para a barra de favoritos.
2. Em `baseline.ixcsoft.com.br/admin/help-requests`, clique no favorito e informe o período.
3. O coletor percorre as abas (Não assumidos, Pendente, Histórico, Recusados), lê o JSON que cada página de pedido já traz e baixa um `baseline-n2_<período>.json`.
4. No Radar, **Importar do Baseline** grava os pedidos novos ou alterados no Firestore. As classificações e tarefas registradas no Radar são preservadas.

Somente leituras (GET) são feitas no Baseline; nenhuma senha passa pelo Radar.

## Estrutura

```
index.html                  página (carrega js/app.js)
assets/styles.css
js/config.js                firebaseConfig, admins iniciais, regras padrão
js/app.js                   estado, rotas, layout, filtros
js/core/                    motor de métricas, insights e taxonomia
js/services/baseline-coletor.js   coletor (vira o favorito)
js/services/baseline.js           Baseline → modelo de pedido
js/services/source-firebase.js    fonte Firestore (produção)
js/services/source-baseline.js    fonte local (IndexedDB), usada se firebase = null
js/services/export.js       exportação CSV/Excel/PDF
js/views/                   telas
firestore.rules             regras de segurança (colar em Firestore → Regras)
```

## Firebase

- Projeto: `n2-radar` · Firestore em `southamerica-east1` · login Google.
- **Acesso:** os e-mails em `APP_CONFIG.admins` (e na função `adminInicial()` do `firestore.rules`) viram administradores no primeiro login. Os demais aparecem em **Configurações → Usuários** como solicitação e são liberados por um admin.
- **Papéis:** admin (tudo), gestor (importa e gerencia tarefas), analista (consulta, classifica e registra as próprias tarefas).
- Ao mudar de domínio, adicione-o em Authentication → Configurações → Domínios autorizados.

## Rodar localmente

```bash
python3 -m http.server 8080
# http://localhost:8080 (localhost já é domínio autorizado no Firebase)
```
