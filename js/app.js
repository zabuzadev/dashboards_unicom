// ============================================
// Unicom Digital Dashboard - app.js
// Dashboard de Marketing Digital Médico
// ============================================

// ============================================
// CONFIGURAR: Suas credenciais do Supabase
// ============================================
// CONFIGURAR: URL do seu projeto Supabase
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';

// CONFIGURAR: Chave anon pública do Supabase (não é secreta, pode ficar aqui)
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';

// ============================================
// Thresholds de alerta
// ============================================
const THRESHOLDS = {
  CPL_MAX: 80,          // CPL acima de R$80 = crítico
  CTR_MIN: 1,           // CTR abaixo de 1% = crítico
  FREQUENCY_MAX: 3.5,   // Frequência acima de 3.5 = crítico
  ENGAGEMENT_MIN: 2,    // Engajamento orgânico abaixo de 2% = crítico
  BUDGET_MAX_PCT: 110,  // Orçamento acima de 110% do planejado = crítico
};

// ============================================
// Estado global da aplicação
// ============================================
const state = {
  clients: [],
  selectedClient: null,
  selectedPeriod: 'last_30d',
  organicMetrics: [],
  paidMetrics: [],
  funnelMetrics: [],
  aiSuggestions: [],
  charts: {},
  loading: false,
};

// ============================================
// Inicialização do Supabase
// ============================================
let supabase = null;

function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK não carregado. Verifique o index.html.');
    showToast('Erro ao inicializar Supabase SDK', 'error');
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ============================================
// Inicialização principal
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!initSupabase()) return;

  initTabs();
  initPeriodButtons();
  initUpdateButton();
  await loadClients();
});

// ============================================
// Gerenciamento de abas
// ============================================
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

// ============================================
// Filtros de período
// ============================================
function initPeriodButtons() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedPeriod = btn.dataset.period;
      updatePeriodLabel();
      if (state.selectedClient) loadClientData(state.selectedClient);
    });
  });
}

function updatePeriodLabel() {
  const labels = { last_7d: 'Últimos 7 dias', last_30d: 'Últimos 30 dias', last_90d: 'Últimos 90 dias' };
  const el = document.getElementById('period-label');
  if (el) el.textContent = labels[state.selectedPeriod] || state.selectedPeriod;
}

// ============================================
// Botão Atualizar Métricas
// ============================================
function initUpdateButton() {
  const btn = document.getElementById('btn-update');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!state.selectedClient) {
      showToast('Selecione um cliente primeiro', 'error');
      return;
    }
    await refreshMetrics();
  });
}

async function refreshMetrics() {
  const client = state.selectedClient;
  if (!client) return;

  const btn = document.getElementById('btn-update');
  if (btn) { btn.disabled = true; btn.innerHTML = '🔄 Atualizando...'; }
  showToast('Buscando métricas na Meta API...', 'info');

  try {
    const calls = [];

    // Buscar métricas pagas se houver conta de anúncios
    if (client.ads_account_id) {
      calls.push(callEdgeFunction('meta-metrics', {
        client_id: client.id,
        ads_account_id: client.ads_account_id,
        date_range: state.selectedPeriod
      }));
    }

    // Buscar métricas orgânicas se houver conta Instagram
    if (client.instagram_account_id) {
      calls.push(callEdgeFunction('organic-metrics', {
        client_id: client.id,
        instagram_account_id: client.instagram_account_id,
        date_range: state.selectedPeriod
      }));
    }

    const results = await Promise.allSettled(calls);
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);

    if (errors.length > 0) {
      showToast(`Algumas métricas falharam: ${errors[0]}`, 'error');
    } else {
      showToast('Métricas atualizadas com sucesso!', 'success');
    }

    // Recarregar dados do banco
    await loadClientData(client);

  } catch (error) {
    console.error('Erro ao atualizar métricas:', error);
    showToast(`Erro ao atualizar: ${error.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Atualizar Métricas'; }
  }
}

// ============================================
// Chamar Edge Functions do Supabase
// ============================================
async function callEdgeFunction(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(error.message || `Erro na função ${functionName}`);
  return data;
}

// ============================================
// Carregar lista de clientes
// ============================================
async function loadClients() {
  const listEl = document.getElementById('client-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;

    state.clients = clients || [];

    if (clients.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>Nenhum cliente cadastrado</p></div>';
      return;
    }

    listEl.innerHTML = clients.map(client => `
      <div class="client-item" data-id="${client.id}" onclick="selectClient('${client.id}')">
        <div class="client-avatar">${getInitials(client.name)}</div>
        <div class="client-info">
          <div class="client-name">${client.name}</div>
          <div class="client-specialty">${client.specialty || 'Médico'}</div>
        </div>
        <div class="client-status"></div>
      </div>
    `).join('');

    // Selecionar primeiro cliente automaticamente
    if (clients.length > 0) selectClient(clients[0].id);

  } catch (error) {
    console.error('Erro ao carregar clientes:', error);
    listEl.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><p class="error-message">${error.message}</p></div>`;
  }
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

async function selectClient(clientId) {
  document.querySelectorAll('.client-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === clientId);
  });

  state.selectedClient = state.clients.find(c => c.id === clientId);
  if (!state.selectedClient) return;

  // Atualizar breadcrumb
  const nameEl = document.getElementById('client-name');
  const specEl = document.getElementById('client-specialty');
  if (nameEl) nameEl.textContent = state.selectedClient.name;
  if (specEl) specEl.textContent = state.selectedClient.specialty || 'Médico';

  await loadClientData(state.selectedClient);
}

// ============================================
// Carregar dados do cliente selecionado
// ============================================
async function loadClientData(client) {
  state.loading = true;
  showLoadingState();

  try {
    const daysMap = { last_7d: 7, last_30d: 30, last_90d: 90 };
    const days = daysMap[state.selectedPeriod] || 30;
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);
    const dateStr = dateThreshold.toISOString().split('T')[0];

    // Buscar todas as métricas em paralelo
    const [organic, paid, funnel, suggestions] = await Promise.all([
      supabase.from('organic_metrics').select('*').eq('client_id', client.id).gte('date', dateStr).order('date', { ascending: true }),
      supabase.from('paid_metrics').select('*').eq('client_id', client.id).gte('date', dateStr).order('date', { ascending: true }),
      supabase.from('funnel_metrics').select('*').eq('client_id', client.id).gte('date', dateStr).order('date', { ascending: false }),
      supabase.from('ai_suggestions').select('*').eq('client_id', client.id).order('generated_at', { ascending: false }).limit(15),
    ]);

    state.organicMetrics = organic.data || [];
    state.paidMetrics = paid.data || [];
    state.funnelMetrics = funnel.data || [];
    state.aiSuggestions = suggestions.data || [];

    renderOrganicTab();
    renderPaidTab();
    renderFunnelTab();
    renderSuggestions();
    updatePeriodLabel();

  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    showToast(`Erro ao carregar dados: ${error.message}`, 'error');
  } finally {
    state.loading = false;
  }
}

function showLoadingState() {
  ['organic-tab', 'paid-tab', 'funnel-tab'].forEach(tabId => {
    const el = document.getElementById(tabId);
    if (el) el.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><p>Carregando dados...</p></div>';
  });
}

// ============================================
// Aba 1: Engajamento Orgânico
// ============================================
function renderOrganicTab() {
  const tab = document.getElementById('organic-tab');
  if (!tab) return;

  const metrics = state.organicMetrics;

  if (metrics.length === 0) {
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Nenhuma métrica orgânica no período</p><p style="font-size:12px;color:var(--text-muted);margin-top:8px">Clique em "Atualizar Métricas" para buscar dados</p></div>';
    return;
  }

  // Calcular métricas de resumo
  const latest = metrics[metrics.length - 1];
  const oldest = metrics[0];
  const avgReach = Math.round(metrics.reduce((s, m) => s + (m.reach || 0), 0) / metrics.length);
  const avgEngagement = (metrics.reduce((s, m) => s + parseFloat(m.engagement_rate || 0), 0) / metrics.length).toFixed(2);
  const followerGrowth = latest.followers - oldest.followers;

  // Calcular variação de engajamento (semana atual vs anterior)
  const midPoint = Math.floor(metrics.length / 2);
  const recentMetrics = metrics.slice(midPoint);
  const olderMetrics = metrics.slice(0, midPoint);
  const recentEngAvg = recentMetrics.reduce((s, m) => s + parseFloat(m.engagement_rate || 0), 0) / (recentMetrics.length || 1);
  const olderEngAvg = olderMetrics.reduce((s, m) => s + parseFloat(m.engagement_rate || 0), 0) / (olderMetrics.length || 1);
  const engChange = olderEngAvg > 0 ? (((recentEngAvg - olderEngAvg) / olderEngAvg) * 100).toFixed(1) : '0';

  const recentReachAvg = recentMetrics.reduce((s, m) => s + (m.reach || 0), 0) / (recentMetrics.length || 1);
  const olderReachAvg = olderMetrics.reduce((s, m) => s + (m.reach || 0), 0) / (olderMetrics.length || 1);
  const reachChange = olderReachAvg > 0 ? (((recentReachAvg - olderReachAvg) / olderReachAvg) * 100).toFixed(1) : '0';

  const engAlert = parseFloat(avgEngagement) < THRESHOLDS.ENGAGEMENT_MIN;

  tab.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Seguidores</span>
          <div class="summary-card-icon icon-primary">👥</div>
        </div>
        <div class="summary-card-value">${formatNumber(latest.followers || 0)}</div>
        <div class="summary-card-change ${followerGrowth >= 0 ? 'change-positive' : 'change-negative'}">
          ${followerGrowth >= 0 ? '▲' : '▼'} ${Math.abs(followerGrowth)} no período
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Alcance Médio</span>
          <div class="summary-card-icon icon-success">📡</div>
        </div>
        <div class="summary-card-value">${formatNumber(avgReach)}</div>
        <div class="summary-card-change ${parseFloat(reachChange) >= 0 ? 'change-positive' : 'change-negative'}">
          ${parseFloat(reachChange) >= 0 ? '▲' : '▼'} ${Math.abs(reachChange)}% vs período anterior
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Taxa de Engajamento</span>
          <div class="summary-card-icon ${engAlert ? 'icon-danger' : 'icon-warning'}">💬</div>
        </div>
        <div class="summary-card-value ${engAlert ? 'alert-value' : ''}">${avgEngagement}%</div>
        <div class="summary-card-change ${parseFloat(engChange) >= 0 ? 'change-positive' : 'change-negative'}">
          ${parseFloat(engChange) >= 0 ? '▲' : '▼'} ${Math.abs(engChange)}% vs período anterior
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Crescimento</span>
          <div class="summary-card-icon icon-success">📈</div>
        </div>
        <div class="summary-card-value ${followerGrowth >= 0 ? '' : 'alert-value'}">${followerGrowth >= 0 ? '+' : ''}${formatNumber(followerGrowth)}</div>
        <div class="summary-card-change change-neutral">seguidores no período</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card chart-card-full">
        <div class="chart-header">
          <div>
            <div class="chart-title">Evolução do Alcance</div>
            <div class="chart-subtitle">Alcance orgânico diário no período</div>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="chart-reach"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Evolução do Engajamento</div>
            <div class="chart-subtitle">Taxa de engajamento %</div>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="chart-engagement"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Interações por Tipo</div>
            <div class="chart-subtitle">Curtidas, comentários, salvos</div>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="chart-interactions"></canvas>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <span class="table-title">Métricas Detalhadas por Dia</span>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Plataforma</th>
              <th>Seguidores</th>
              <th>Alcance</th>
              <th>Impressões</th>
              <th>Engajamento</th>
              <th>Curtidas</th>
              <th>Comentários</th>
              <th>Salvos</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.slice().reverse().map(m => `
              <tr>
                <td class="td-bold">${formatDate(m.date)}</td>
                <td><span class="status-badge status-ok">${m.platform === 'instagram' ? '📷 Instagram' : '📘 Facebook'}</span></td>
                <td>${formatNumber(m.followers || 0)}</td>
                <td>${formatNumber(m.reach || 0)}</td>
                <td>${formatNumber(m.impressions || 0)}</td>
                <td class="${parseFloat(m.engagement_rate || 0) < THRESHOLDS.ENGAGEMENT_MIN ? 'alert-value' : ''}">${m.engagement_rate || 0}%</td>
                <td>${formatNumber(m.likes || 0)}</td>
                <td>${formatNumber(m.comments || 0)}</td>
                <td>${formatNumber(m.saves || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Renderizar gráficos
  setTimeout(() => {
    renderReachChart(metrics);
    renderEngagementChart(metrics);
    renderInteractionsChart(metrics);
  }, 100);
}

// ============================================
// Aba 2: Tráfego Pago
// ============================================
function renderPaidTab() {
  const tab = document.getElementById('paid-tab');
  if (!tab) return;

  const metrics = state.paidMetrics;

  if (metrics.length === 0) {
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>Nenhuma métrica de tráfego pago no período</p><p style="font-size:12px;color:var(--text-muted);margin-top:8px">Clique em "Atualizar Métricas" para buscar dados</p></div>';
    return;
  }

  // Calcular resumos
  const totalSpend = metrics.reduce((s, m) => s + parseFloat(m.spend || 0), 0);
  const totalLeads = metrics.reduce((s, m) => s + (m.leads || 0), 0);
  const totalMessages = metrics.reduce((s, m) => s + (m.messages || 0), 0);
  const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCTR = metrics.filter(m => m.ctr).reduce((s, m) => s + parseFloat(m.ctr), 0) / metrics.filter(m => m.ctr).length;
  const avgFreq = metrics.filter(m => m.frequency).reduce((s, m) => s + parseFloat(m.frequency), 0) / metrics.filter(m => m.frequency).length;

  const cplAlert = avgCPL > THRESHOLDS.CPL_MAX;
  const ctrAlert = (avgCTR || 0) < THRESHOLDS.CTR_MIN;

  // Agrupar por campanha
  const byCampaign = {};
  metrics.forEach(m => {
    const key = m.campaign_name || 'Sem campanha';
    if (!byCampaign[key]) byCampaign[key] = { name: key, spend: 0, leads: 0, messages: 0, impressions: 0, clicks: 0, budget_planned: m.budget_planned || 0 };
    byCampaign[key].spend += parseFloat(m.spend || 0);
    byCampaign[key].leads += m.leads || 0;
    byCampaign[key].messages += m.messages || 0;
    byCampaign[key].impressions += m.impressions || 0;
    byCampaign[key].clicks += m.clicks || 0;
  });
  const campaigns = Object.values(byCampaign);

  // Agrupar por conjunto de anúncio
  const byAdset = {};
  metrics.forEach(m => {
    const key = m.adset_name || 'Sem conjunto';
    if (!byAdset[key]) byAdset[key] = { name: key, spend: 0, leads: 0, messages: 0, impressions: 0, clicks: 0, ctr_sum: 0, freq_sum: 0, count: 0, budget_planned: m.budget_planned || 0 };
    byAdset[key].spend += parseFloat(m.spend || 0);
    byAdset[key].leads += m.leads || 0;
    byAdset[key].messages += m.messages || 0;
    byAdset[key].impressions += m.impressions || 0;
    byAdset[key].clicks += m.clicks || 0;
    byAdset[key].ctr_sum += parseFloat(m.ctr || 0);
    byAdset[key].freq_sum += parseFloat(m.frequency || 0);
    byAdset[key].count++;
  });
  const adsets = Object.values(byAdset).map(a => ({
    ...a,
    ctr: a.count > 0 ? (a.ctr_sum / a.count).toFixed(2) : 0,
    frequency: a.count > 0 ? (a.freq_sum / a.count).toFixed(2) : 0,
    cpl: a.leads > 0 ? (a.spend / a.leads).toFixed(2) : 0,
  }));

  function getAdsetStatus(adset) {
    const cpl = parseFloat(adset.cpl);
    const ctr = parseFloat(adset.ctr);
    const freq = parseFloat(adset.frequency);
    if (cpl > THRESHOLDS.CPL_MAX || ctr < THRESHOLDS.CTR_MIN || freq > THRESHOLDS.FREQUENCY_MAX) return 'critical';
    if (cpl > THRESHOLDS.CPL_MAX * 0.8 || ctr < THRESHOLDS.CTR_MIN * 1.2 || freq > THRESHOLDS.FREQUENCY_MAX * 0.85) return 'warning';
    return 'ok';
  }

  const statusLabels = { ok: 'OK', warning: 'Atenção', critical: 'Crítico' };
  const statusClasses = { ok: 'status-ok', warning: 'status-warning', critical: 'status-critical' };

  tab.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Total Investido</span>
          <div class="summary-card-icon icon-primary">💵</div>
        </div>
        <div class="summary-card-value">R$ ${formatCurrency(totalSpend)}</div>
        <div class="summary-card-change change-neutral">${metrics.length} registros no período</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Leads Gerados</span>
          <div class="summary-card-icon icon-success">🎯</div>
        </div>
        <div class="summary-card-value">${formatNumber(totalLeads)}</div>
        <div class="summary-card-change change-neutral">CPM médio: R$ ${formatCurrency(metrics.reduce((s,m)=>s+parseFloat(m.cpm||0),0)/metrics.length)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">CPL Médio</span>
          <div class="summary-card-icon ${cplAlert ? 'icon-danger' : 'icon-warning'}">📉</div>
        </div>
        <div class="summary-card-value ${cplAlert ? 'alert-value' : ''}">R$ ${formatCurrency(avgCPL)}</div>
        <div class="summary-card-change ${cplAlert ? 'change-negative' : 'change-neutral'}">${cplAlert ? '⚠️ Acima do limite (R$ 80)' : 'Dentro do limite'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header">
          <span class="summary-card-label">Mensagens</span>
          <div class="summary-card-icon icon-primary">💬</div>
        </div>
        <div class="summary-card-value">${formatNumber(totalMessages)}</div>
        <div class="summary-card-change change-neutral">CTR médio: ${(avgCTR || 0).toFixed(2)}%</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Evolução do CPL</div>
            <div class="chart-subtitle">Custo por lead ao longo do tempo</div>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="chart-cpl"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <div class="chart-title">Performance por Campanha</div>
            <div class="chart-subtitle">Investimento vs Leads</div>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="chart-campaigns"></canvas>
        </div>
      </div>
    </div>

    <div class="budget-section">
      <div class="budget-title">📊 Orçamento: Gasto vs Planejado</div>
      ${campaigns.filter(c => c.budget_planned > 0).map(c => {
        const pct = c.budget_planned > 0 ? (c.spend / c.budget_planned * 100) : 0;
        const cls = pct > THRESHOLDS.BUDGET_MAX_PCT ? 'budget-critical' : pct > 90 ? 'budget-warning' : 'budget-ok';
        return `
          <div class="budget-item ${cls}">
            <div class="budget-item-header">
              <span class="budget-campaign">${c.name}</span>
              <span class="budget-values">R$ ${formatCurrency(c.spend)} / R$ ${formatCurrency(c.budget_planned)}</span>
              <span class="budget-pct ${pct > THRESHOLDS.BUDGET_MAX_PCT ? 'alert-value' : ''}">${pct.toFixed(0)}%</span>
            </div>
            <div class="budget-bar-track">
              <div class="budget-bar-fill" style="width: ${Math.min(pct, 100)}%"></div>
            </div>
          </div>
        `;
      }).join('') || '<p style="color:var(--text-muted);font-size:13px">Nenhum orçamento planejado cadastrado</p>'}
    </div>

    <div class="table-card">
      <div class="table-header">
        <span class="table-title">Detalhamento por Conjunto de Anúncio</span>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Conjunto</th>
              <th>Investimento</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>Leads</th>
              <th>CPL</th>
              <th>Frequência</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${adsets.map(a => {
              const status = getAdsetStatus(a);
              return `
                <tr>
                  <td class="td-bold">${a.name}</td>
                  <td>R$ ${formatCurrency(a.spend)}</td>
                  <td>${formatNumber(a.impressions)}</td>
                  <td>${formatNumber(a.clicks)}</td>
                  <td class="${parseFloat(a.ctr) < THRESHOLDS.CTR_MIN ? 'alert-value' : ''}">${a.ctr}%</td>
                  <td>${formatNumber(a.leads)}</td>
                  <td class="${parseFloat(a.cpl) > THRESHOLDS.CPL_MAX ? 'alert-value' : ''}">R$ ${formatCurrency(parseFloat(a.cpl))}</td>
                  <td class="${parseFloat(a.frequency) > THRESHOLDS.FREQUENCY_MAX ? 'alert-value' : ''}">${a.frequency}x</td>
                  <td><span class="status-badge ${statusClasses[status]}">${statusLabels[status]}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(() => {
    renderCPLChart(metrics);
    renderCampaignsChart(campaigns);
  }, 100);
}

// ============================================
// Aba 3: Funil de Conversão
// ============================================
function renderFunnelTab() {
  const tab = document.getElementById('funnel-tab');
  if (!tab) return;

  const funnelData = state.funnelMetrics;
  const paid = state.paidMetrics;

  // Calcular totais do funil com base nas métricas disponíveis
  const totalImpressions = paid.reduce((s, m) => s + (m.impressions || 0), 0);
  const totalClicks = paid.reduce((s, m) => s + (m.clicks || 0), 0);
  const totalMessages = paid.reduce((s, m) => s + (m.messages || 0), 0);

  const latest = funnelData[0] || null;
  const appointments = latest ? latest.appointments : Math.round(totalMessages * 0.3);
  const patients = latest ? latest.patients : Math.round(appointments * 0.7);

  const stages = [
    { label: 'Impressões', value: totalImpressions, class: 'stage-1', icon: '👁️' },
    { label: 'Cliques', value: totalClicks, class: 'stage-2', icon: '🖱️' },
    { label: 'Mensagens', value: totalMessages, class: 'stage-3', icon: '💬' },
    { label: 'Consultas Agendadas', value: appointments, class: 'stage-4', icon: '📅' },
    { label: 'Pacientes', value: patients, class: 'stage-5', icon: '🏥' },
  ];

  const conversions = [];
  for (let i = 1; i < stages.length; i++) {
    const rate = stages[i-1].value > 0 ? ((stages[i].value / stages[i-1].value) * 100).toFixed(2) : '0';
    conversions.push(parseFloat(rate));
  }

  // Identificar gargalo (menor taxa de conversão)
  const bottleneckIdx = conversions.indexOf(Math.min(...conversions));

  if (totalImpressions === 0 && !latest) {
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">🔽</div><p>Nenhum dado de funil disponível</p><p style="font-size:12px;color:var(--text-muted);margin-top:8px">Atualize as métricas para visualizar o funil</p></div>';
    return;
  }

  const maxWidth = 500;
  const minWidth = 200;

  tab.innerHTML = `
    <div class="funnel-container">
      <div class="funnel-title">🔽 Funil de Conversão — ${state.selectedPeriod === 'last_7d' ? 'Últimos 7 dias' : state.selectedPeriod === 'last_30d' ? 'Últimos 30 dias' : 'Últimos 90 dias'}</div>

      ${stages.map((stage, idx) => {
        const width = maxWidth - (idx * ((maxWidth - minWidth) / (stages.length - 1)));
        const isBottleneck = idx > 0 && (idx - 1) === bottleneckIdx;
        const conversion = idx > 0 ? conversions[idx - 1] : null;
        const rateClass = conversion !== null ? (conversion < 5 ? 'rate-bad' : 'rate-good') : '';
        
        return `
          ${idx > 0 ? `
            <div class="funnel-arrow" style="max-width:${width + 80}px; margin:0 auto">
              <span class="arrow-rate ${rateClass}">${conversion}% →</span>
            </div>
          ` : ''}
          <div class="funnel-stage">
            <div class="funnel-bar-wrapper">
              <div class="funnel-bar ${stage.class} ${isBottleneck ? 'bottleneck' : ''}" style="max-width:${width}px; margin:0 auto">
                <span class="funnel-stage-label">${stage.icon} ${stage.label}</span>
                <span class="funnel-stage-value">${formatNumber(stage.value)}</span>
              </div>
            </div>
            ${isBottleneck ? '<div style="text-align:center;font-size:11px;color:var(--color-danger);margin-top:3px">⚠️ Gargalo identificado — maior perda nesta etapa</div>' : ''}
          </div>
        `;
      }).join('')}

      <div style="margin-top:24px; display:grid; grid-template-columns:repeat(4,1fr); gap:12px;">
        ${conversions.map((rate, i) => `
          <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${stages[i].label} → ${stages[i+1].label}</div>
            <div style="font-size:20px;font-weight:700;color:${rate < 5 ? 'var(--color-danger)' : rate < 15 ? 'var(--color-warning)' : 'var(--color-success)'}">${rate}%</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${latest ? `
      <div class="table-card">
        <div class="table-header"><span class="table-title">Histórico do Funil</span></div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Impressões</th>
                <th>Cliques</th>
                <th>Mensagens</th>
                <th>Consultas</th>
                <th>Pacientes</th>
                <th>Imp→Clk</th>
                <th>Clk→Msg</th>
                <th>Msg→Con</th>
                <th>Con→Pac</th>
              </tr>
            </thead>
            <tbody>
              ${funnelData.map(f => `
                <tr>
                  <td class="td-bold">${formatDate(f.date)}</td>
                  <td>${formatNumber(f.impressions || 0)}</td>
                  <td>${formatNumber(f.clicks || 0)}</td>
                  <td>${formatNumber(f.messages || 0)}</td>
                  <td>${formatNumber(f.appointments || 0)}</td>
                  <td>${formatNumber(f.patients || 0)}</td>
                  <td>${f.impression_to_click || '-'}%</td>
                  <td>${f.click_to_message || '-'}%</td>
                  <td>${f.message_to_appointment || '-'}%</td>
                  <td>${f.appointment_to_patient || '-'}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
  `;
}

// ============================================
// Painel de Sugestões IA
// ============================================
function renderSuggestions() {
  const list = document.getElementById('suggestions-list');
  if (!list) return;

  const suggestions = state.aiSuggestions.filter(s => s.status !== 'dismissed');

  if (suggestions.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div><p style="font-size:13px">Nenhuma sugestão gerada ainda</p><p style="font-size:11px;color:var(--text-muted);margin-top:6px">Clique em "Gerar Sugestões" para analisar as métricas com IA</p></div>';
    return;
  }

  const typeLabels = { paid: 'Pago', organic: 'Orgânico', funnel: 'Funil' };

  list.innerHTML = suggestions.map(s => `
    <div class="suggestion-card priority-${s.priority} status-${s.status}" id="suggestion-${s.id}">
      <div class="suggestion-header">
        <span class="priority-badge priority-${s.priority}">${s.priority === 'high' ? '🔴 Alta' : s.priority === 'medium' ? '🟡 Média' : '🟢 Baixa'}</span>
        <span class="type-badge">${typeLabels[s.type] || s.type}</span>
      </div>
      <div class="suggestion-text">${s.suggestion}</div>
      ${s.metric_trigger ? `<div class="suggestion-metric">📊 ${s.metric_trigger}: ${s.metric_value || '-'}</div>` : ''}
      <div class="suggestion-actions">
        <button class="btn-suggestion btn-applied" onclick="updateSuggestion('${s.id}', 'applied')" ${s.status === 'applied' ? 'disabled' : ''}>
          ✅ ${s.status === 'applied' ? 'Aplicada' : 'Aplicar'}
        </button>
        <button class="btn-suggestion btn-dismiss" onclick="updateSuggestion('${s.id}', 'dismissed')">
          ✕ Ignorar
        </button>
      </div>
    </div>
  `).join('');
}

async function updateSuggestion(id, status) {
  try {
    const { error } = await supabase.from('ai_suggestions').update({ status }).eq('id', id);
    if (error) throw error;

    const idx = state.aiSuggestions.findIndex(s => s.id === id);
    if (idx >= 0) state.aiSuggestions[idx].status = status;

    renderSuggestions();
    showToast(status === 'applied' ? 'Sugestão marcada como aplicada!' : 'Sugestão ignorada', 'success');
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
  }
}

async function generateSuggestions() {
  if (!state.selectedClient) {
    showToast('Selecione um cliente primeiro', 'error');
    return;
  }

  const btn = document.getElementById('btn-generate');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Gerando...'; }
  showToast('Analisando métricas com IA...', 'info');

  try {
    await callEdgeFunction('ai-suggestions', { client_id: state.selectedClient.id });
    
    // Recarregar sugestões
    const { data } = await supabase.from('ai_suggestions').select('*').eq('client_id', state.selectedClient.id).order('generated_at', { ascending: false }).limit(15);
    state.aiSuggestions = data || [];
    renderSuggestions();
    showToast('Sugestões geradas com sucesso!', 'success');
  } catch (error) {
    showToast(`Erro ao gerar sugestões: ${error.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ Gerar Sugestões'; }
  }
}

// ============================================
// Gráficos com Chart.js
// ============================================
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#9099C0', font: { size: 11 } } },
    tooltip: { backgroundColor: '#1A1D2E', titleColor: '#E8EAFF', bodyColor: '#9099C0', borderColor: '#2E3250', borderWidth: 1 }
  },
  scales: {
    x: { ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.5)' } },
    y: { ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.5)' } }
  }
};

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function renderReachChart(metrics) {
  destroyChart('reach');
  const ctx = document.getElementById('chart-reach');
  if (!ctx) return;
  state.charts['reach'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: metrics.map(m => formatDateShort(m.date)),
      datasets: [{
        label: 'Alcance',
        data: metrics.map(m => m.reach || 0),
        borderColor: '#6C63FF',
        backgroundColor: 'rgba(108,99,255,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#6C63FF'
      }, {
        label: 'Impressões',
        data: metrics.map(m => m.impressions || 0),
        borderColor: '#00D4A1',
        backgroundColor: 'rgba(0,212,161,0.05)',
        tension: 0.4,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#00D4A1',
        borderDash: [4, 2]
      }]
    },
    options: { ...chartDefaults }
  });
}

function renderEngagementChart(metrics) {
  destroyChart('engagement');
  const ctx = document.getElementById('chart-engagement');
  if (!ctx) return;
  state.charts['engagement'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: metrics.map(m => formatDateShort(m.date)),
      datasets: [{
        label: 'Engajamento %',
        data: metrics.map(m => parseFloat(m.engagement_rate || 0)),
        borderColor: '#FF8C42',
        backgroundColor: 'rgba(255,140,66,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#FF8C42'
      }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        annotation: {
          annotations: {
            threshold: {
              type: 'line',
              yMin: THRESHOLDS.ENGAGEMENT_MIN,
              yMax: THRESHOLDS.ENGAGEMENT_MIN,
              borderColor: 'rgba(255,77,109,0.5)',
              borderWidth: 1,
              borderDash: [4, 2],
            }
          }
        }
      }
    }
  });
}

function renderInteractionsChart(metrics) {
  destroyChart('interactions');
  const ctx = document.getElementById('chart-interactions');
  if (!ctx) return;
  const totals = metrics.reduce((acc, m) => ({
    likes: acc.likes + (m.likes || 0),
    comments: acc.comments + (m.comments || 0),
    shares: acc.shares + (m.shares || 0),
    saves: acc.saves + (m.saves || 0),
  }), { likes: 0, comments: 0, shares: 0, saves: 0 });

  state.charts['interactions'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Curtidas', 'Comentários', 'Compartilhamentos', 'Salvos'],
      datasets: [{
        data: [totals.likes, totals.comments, totals.shares, totals.saves],
        backgroundColor: ['#6C63FF', '#00D4A1', '#FF8C42', '#3B9EFF'],
        borderColor: '#1A1D2E',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#9099C0', font: { size: 11 }, boxWidth: 12 } }, tooltip: chartDefaults.plugins.tooltip }
    }
  });
}

function renderCPLChart(metrics) {
  destroyChart('cpl');
  const ctx = document.getElementById('chart-cpl');
  if (!ctx) return;
  // Agrupar por data
  const byDate = {};
  metrics.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = { spend: 0, leads: 0 };
    byDate[m.date].spend += parseFloat(m.spend || 0);
    byDate[m.date].leads += m.leads || 0;
  });
  const dates = Object.keys(byDate).sort();
  const cpls = dates.map(d => byDate[d].leads > 0 ? parseFloat((byDate[d].spend / byDate[d].leads).toFixed(2)) : null);

  state.charts['cpl'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDateShort(d)),
      datasets: [{
        label: 'CPL (R$)',
        data: cpls,
        borderColor: '#FF4D6D',
        backgroundColor: 'rgba(255,77,109,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#FF4D6D',
        spanGaps: true
      }]
    },
    options: { ...chartDefaults }
  });
}

function renderCampaignsChart(campaigns) {
  destroyChart('campaigns');
  const ctx = document.getElementById('chart-campaigns');
  if (!ctx) return;
  state.charts['campaigns'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: campaigns.map(c => c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name),
      datasets: [{
        label: 'Investimento (R$)',
        data: campaigns.map(c => parseFloat(c.spend.toFixed(2))),
        backgroundColor: 'rgba(108,99,255,0.6)',
        borderColor: '#6C63FF',
        borderWidth: 1,
        yAxisID: 'y'
      }, {
        label: 'Leads',
        data: campaigns.map(c => c.leads),
        backgroundColor: 'rgba(0,212,161,0.6)',
        borderColor: '#00D4A1',
        borderWidth: 1,
        type: 'line',
        yAxisID: 'y1'
      }]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: { ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.3)' } },
        y: { type: 'linear', position: 'left', ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.3)' } },
        y1: { type: 'linear', position: 'right', ticks: { color: '#00D4A1', font: { size: 10 } }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

// ============================================
// Utilitários de formatação
// ============================================
function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('pt-BR').format(Math.round(n));
}

function formatCurrency(n) {
  if (n === null || n === undefined) return '0,00';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ============================================
// Sistema de Toast/Notificações
// ============================================
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
