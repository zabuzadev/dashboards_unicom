// ============================================
// Unicom Digital Dashboard - app.js
// Dashboard de Marketing Digital Médico
// ============================================

// ============================================
// CONFIGURAR: Suas credenciais do Supabase
// ============================================
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';

// ============================================
// Thresholds de alerta
// ============================================
const THRESHOLDS = {
  CPL_MAX: 80,
  CTR_MIN: 1,
  FREQUENCY_MAX: 3.5,
  ENGAGEMENT_MIN: 2,
  BUDGET_MAX_PCT: 110,
};

// ============================================
// Estado global
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
  demoMode: false,
};

let supabase = null;

// ============================================
// DADOS DE DEMONSTRAÇÃO
// ============================================
const DEMO_CLIENTS = [
  { id: 'demo-1', name: 'Dr. Ricardo Mendes', specialty: 'Cirurgia Plástica', instagram_account_id: 'demo', ads_account_id: 'demo', active: true },
  { id: 'demo-2', name: 'Dra. Ana Carvalho', specialty: 'Dermatologia', instagram_account_id: 'demo', ads_account_id: 'demo', active: true },
  { id: 'demo-3', name: 'Clínica OncoVida', specialty: 'Oncologia', instagram_account_id: 'demo', ads_account_id: 'demo', active: true },
];

function generateDemoData(clientId, period) {
  const days = period === 'last_7d' ? 7 : period === 'last_90d' ? 90 : 30;
  const today = new Date();

  // --- ORGÂNICO ---
  const organic = [];
  let followers = clientId === 'demo-1' ? 18400 : clientId === 'demo-2' ? 32700 : 9800;
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const variation = (Math.random() - 0.45) * 80;
    followers = Math.max(followers + Math.round(variation), 5000);
    const reach = Math.round((followers * (0.08 + Math.random() * 0.06)) + (Math.random() * 200));
    const impressions = Math.round(reach * (1.3 + Math.random() * 0.4));
    const likes = Math.round(reach * (0.04 + Math.random() * 0.02));
    const comments = Math.round(likes * (0.08 + Math.random() * 0.05));
    const saves = Math.round(likes * (0.12 + Math.random() * 0.06));
    const shares = Math.round(likes * (0.03 + Math.random() * 0.02));
    const engagementRate = parseFloat(((likes + comments + saves + shares) / followers * 100).toFixed(2));
    organic.push({ id: 'org-' + i, client_id: clientId, date: dateStr, platform: 'instagram', followers, reach, impressions, profile_views: Math.round(reach * 0.15), engagement_rate: engagementRate, likes, comments, shares, saves, stories_reach: Math.round(reach * 0.6), stories_replies: Math.round(comments * 0.3), top_post_id: 'post_demo', top_post_engagement: likes * 3 });
  }

  // --- PAGO ---
  const paid = [];
  const campaigns = clientId === 'demo-1'
    ? [{ name: 'Rinoplastia SP', adset: 'Interesse Beleza 25-40', budget: 3500 }, { name: 'Lipoaspiração Premium', adset: 'Lookalike Clientes', budget: 4200 }, { name: 'Blefaroplastia', adset: 'Retargeting Site', budget: 1800 }]
    : clientId === 'demo-2'
    ? [{ name: 'Botox & Harmonização', adset: 'Mulheres 28-45 SP', budget: 2800 }, { name: 'Tratamento Melasma', adset: 'Interesse Skincare', budget: 2000 }, { name: 'Consulta Dermatologista', adset: 'Lookalike Premium', budget: 1500 }]
    : [{ name: 'Diagnóstico Precoce', adset: 'Público 40-65 anos', budget: 5000 }, { name: 'Segunda Opinião', adset: 'Retargeting Blog', budget: 2500 }];

  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    campaigns.forEach((camp, ci) => {
      const dailyBudget = camp.budget / days;
      const spend = parseFloat((dailyBudget * (0.85 + Math.random() * 0.3)).toFixed(2));
      const impressions = Math.round(spend * (180 + Math.random() * 60));
      const clicks = Math.round(impressions * ((1.2 + Math.random() * 0.8) / 100));
      const ctr = parseFloat((clicks / impressions * 100).toFixed(2));
      const leads = Math.round(clicks * (0.06 + Math.random() * 0.04));
      const cpl = leads > 0 ? parseFloat((spend / leads).toFixed(2)) : 0;
      const messages = Math.round(clicks * (0.04 + Math.random() * 0.03));
      const frequency = parseFloat((1.2 + (days - i) / days * 2.8 + Math.random() * 0.3).toFixed(2));
      paid.push({ id: `paid-${i}-${ci}`, client_id: clientId, date: dateStr, campaign_name: camp.name, campaign_id: `camp_${ci}`, adset_name: camp.adset, adset_id: `adset_${ci}`, spend, impressions, reach: Math.round(impressions * 0.75), clicks, ctr, cpm: parseFloat((spend / impressions * 1000).toFixed(2)), cpc: clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0, leads, cost_per_lead: cpl, messages, cost_per_message: messages > 0 ? parseFloat((spend / messages).toFixed(2)) : 0, frequency, budget_planned: parseFloat(dailyBudget.toFixed(2)) });
    });
  }

  // --- FUNIL ---
  const totalImpressions = paid.reduce((s, m) => s + m.impressions, 0);
  const totalClicks = paid.reduce((s, m) => s + m.clicks, 0);
  const totalMessages = paid.reduce((s, m) => s + m.messages, 0);
  const totalLeads = paid.reduce((s, m) => s + m.leads, 0);
  const appointments = Math.round(totalMessages * (0.28 + Math.random() * 0.1));
  const patients = Math.round(appointments * (0.62 + Math.random() * 0.1));
  const funnel = [{
    id: 'funnel-1', client_id: clientId,
    date: today.toISOString().split('T')[0],
    impressions: totalImpressions, clicks: totalClicks,
    messages: totalMessages, appointments, patients,
    impression_to_click: parseFloat((totalClicks / totalImpressions * 100).toFixed(2)),
    click_to_message: parseFloat((totalMessages / totalClicks * 100).toFixed(2)),
    message_to_appointment: parseFloat((appointments / totalMessages * 100).toFixed(2)),
    appointment_to_patient: parseFloat((patients / appointments * 100).toFixed(2)),
  }];

  // --- SUGESTÕES IA ---
  const clientName = DEMO_CLIENTS.find(c => c.id === clientId)?.name || 'Cliente';
  const avgCPL = paid.reduce((s, m) => s + m.cost_per_lead, 0) / paid.filter(m => m.cost_per_lead > 0).length;
  const avgFreq = paid.reduce((s, m) => s + m.frequency, 0) / paid.length;
  const avgEngagement = organic.reduce((s, m) => s + parseFloat(m.engagement_rate), 0) / organic.length;

  const suggestions = [
    {
      id: 'sug-1', client_id: clientId,
      generated_at: new Date().toISOString(),
      type: 'paid', priority: avgFreq > 2.8 ? 'high' : 'medium',
      suggestion: avgFreq > 2.8
        ? `A frequência média de ${avgFreq.toFixed(1)}x está elevada, indicando saturação de audiência. Recomenda-se expandir o público-alvo com novos interesses relacionados a procedimentos estéticos ou criar um Lookalike 3% para renovar o alcance e reduzir o custo por lead.`
        : `A frequência de ${avgFreq.toFixed(1)}x está dentro do ideal. Aproveite para testar novos criativos com depoimentos reais de pacientes (com autorização), o que tende a aumentar a taxa de conversão em clínicas e consultórios médicos.`,
      metric_trigger: 'Frequência média', metric_value: avgFreq.toFixed(1) + 'x', status: 'pending'
    },
    {
      id: 'sug-2', client_id: clientId,
      generated_at: new Date().toISOString(),
      type: 'paid', priority: avgCPL > 70 ? 'high' : 'medium',
      suggestion: avgCPL > 70
        ? `O CPL médio de R$ ${avgCPL.toFixed(0)} está próximo do limite crítico. Teste reduzir o orçamento dos conjuntos com CPL mais alto em 20% e redistribuir para o conjunto de melhor performance. Também considere otimizar o formulário de captura para reduzir fricção.`
        : `O CPL de R$ ${avgCPL.toFixed(0)} está saudável. Para escalar os resultados, aumente o orçamento do melhor conjunto de anúncios em 15-20% e monitore a frequência para não ultrapassar 3,0x nos próximos 7 dias.`,
      metric_trigger: 'CPL médio', metric_value: 'R$ ' + avgCPL.toFixed(2), status: 'pending'
    },
    {
      id: 'sug-3', client_id: clientId,
      generated_at: new Date().toISOString(),
      type: 'organic', priority: avgEngagement < 2.5 ? 'high' : 'low',
      suggestion: avgEngagement < 2.5
        ? `A taxa de engajamento de ${avgEngagement.toFixed(2)}% está abaixo do benchmark para contas médicas (2,5-4%). Priorize conteúdos educativos em carrossel explicando procedimentos de forma acessível, pois esse formato gera 3x mais salvamentos e melhora o alcance orgânico.`
        : `O engajamento de ${avgEngagement.toFixed(2)}% está acima da média do setor médico. Continue com a frequência de posts atual e implemente Reels mostrando bastidores do consultório (com devida ética e privacidade), formato com maior alcance no Instagram em 2024.`,
      metric_trigger: 'Taxa de engajamento', metric_value: avgEngagement.toFixed(2) + '%', status: 'pending'
    },
    {
      id: 'sug-4', client_id: clientId,
      generated_at: new Date().toISOString(),
      type: 'funnel', priority: 'medium',
      suggestion: `A etapa de Cliques → Mensagens apresenta a maior perda do funil (${funnel[0].click_to_message}%). Otimize a landing page ou WhatsApp link adicionando prova social (número de pacientes atendidos, avaliações) e um CTA mais direto como "Verificar disponibilidade de agenda" em vez de "Entre em contato".`,
      metric_trigger: 'Clique → Mensagem', metric_value: funnel[0].click_to_message + '%', status: 'pending'
    },
  ];

  return { organic, paid, funnel, suggestions };
}

// ============================================
// Inicialização principal
// ============================================
function initSupabase() {
  if (typeof window.supabase === 'undefined') return false;
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  initDemoMode();
  initTabs();
  initPeriodButtons();
  initUpdateButton();
  await loadClients();
});

// ============================================
// MODO DEMO
// ============================================
function initDemoMode() {
  // Detectar se Supabase está configurado; se não, ativar demo automaticamente
  const isConfigured = SUPABASE_URL !== 'https://SEU-PROJETO.supabase.co';
  if (!isConfigured) {
    state.demoMode = true;
  }
  updateDemoBadge();
}

function toggleDemoMode() {
  state.demoMode = !state.demoMode;
  updateDemoBadge();
  if (state.demoMode) {
    showToast('🎭 Modo Demo ativado — dados fictícios para apresentação', 'info');
    loadDemoClients();
  } else {
    showToast('🔌 Modo Real ativado — conectando ao Supabase', 'info');
    loadClients();
  }
}

function updateDemoBadge() {
  const badge = document.getElementById('demo-badge');
  const toggle = document.getElementById('demo-toggle');
  if (badge) {
    badge.style.display = state.demoMode ? 'flex' : 'none';
  }
  if (toggle) {
    toggle.textContent = state.demoMode ? '🔌 Modo Real' : '🎭 Modo Demo';
    toggle.classList.toggle('demo-active', state.demoMode);
  }
}

function loadDemoClients() {
  state.clients = DEMO_CLIENTS;
  const listEl = document.getElementById('client-list');
  if (!listEl) return;
  listEl.innerHTML = DEMO_CLIENTS.map(client => `
    <div class="client-item" data-id="${client.id}" onclick="selectClient('${client.id}')">
      <div class="client-avatar">${getInitials(client.name)}</div>
      <div class="client-info">
        <div class="client-name">${client.name}</div>
        <div class="client-specialty">${client.specialty}</div>
      </div>
      <div class="client-status"></div>
    </div>
  `).join('');
  if (DEMO_CLIENTS.length > 0) selectClient(DEMO_CLIENTS[0].id);
}

// ============================================
// Abas
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

function initUpdateButton() {
  const btn = document.getElementById('btn-update');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (state.demoMode) {
      showToast('🎭 Modo Demo: dados atualizados com novos valores aleatórios!', 'info');
      if (state.selectedClient) await loadClientData(state.selectedClient);
      return;
    }
    if (!state.selectedClient) { showToast('Selecione um cliente primeiro', 'error'); return; }
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
    if (client.ads_account_id) calls.push(callEdgeFunction('meta-metrics', { client_id: client.id, ads_account_id: client.ads_account_id, date_range: state.selectedPeriod }));
    if (client.instagram_account_id) calls.push(callEdgeFunction('organic-metrics', { client_id: client.id, instagram_account_id: client.instagram_account_id, date_range: state.selectedPeriod }));
    const results = await Promise.allSettled(calls);
    const errors = results.filter(r => r.status === 'rejected');
    if (errors.length > 0) showToast('Algumas métricas falharam: ' + errors[0].reason, 'error');
    else showToast('Métricas atualizadas com sucesso!', 'success');
    await loadClientData(client);
  } catch (error) {
    showToast('Erro ao atualizar: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Atualizar Métricas'; }
  }
}

async function callEdgeFunction(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(error.message || 'Erro na função ' + functionName);
  return data;
}

// ============================================
// Carregar Clientes
// ============================================
async function loadClients() {
  if (state.demoMode) { loadDemoClients(); return; }
  if (!initSupabase()) { state.demoMode = true; updateDemoBadge(); loadDemoClients(); return; }
  const listEl = document.getElementById('client-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const { data: clients, error } = await supabase.from('clients').select('*').eq('active', true).order('name');
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
    if (clients.length > 0) selectClient(clients[0].id);
  } catch (error) {
    listEl.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><p class="error-message">Erro: ${error.message}</p></div>`;
  }
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

async function selectClient(clientId) {
  document.querySelectorAll('.client-item').forEach(el => el.classList.toggle('active', el.dataset.id === clientId));
  state.selectedClient = state.clients.find(c => c.id === clientId);
  if (!state.selectedClient) return;
  const nameEl = document.getElementById('client-name');
  const specEl = document.getElementById('client-specialty');
  if (nameEl) nameEl.textContent = state.selectedClient.name;
  if (specEl) { specEl.textContent = state.selectedClient.specialty || 'Médico'; specEl.style.display = 'inline'; }
  await loadClientData(state.selectedClient);
}

// ============================================
// Carregar dados do cliente
// ============================================
async function loadClientData(client) {
  state.loading = true;
  showLoadingState();

  if (state.demoMode) {
    // Usar dados de demonstração
    await new Promise(r => setTimeout(r, 600)); // Simular delay de rede
    const demo = generateDemoData(client.id, state.selectedPeriod);
    state.organicMetrics = demo.organic;
    state.paidMetrics = demo.paid;
    state.funnelMetrics = demo.funnel;
    state.aiSuggestions = demo.suggestions;
  } else {
    // Buscar dados reais do Supabase
    try {
      const daysMap = { last_7d: 7, last_30d: 30, last_90d: 90 };
      const days = daysMap[state.selectedPeriod] || 30;
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);
      const dateStr = dateThreshold.toISOString().split('T')[0];
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
    } catch (error) {
      showToast('Erro ao carregar dados: ' + error.message, 'error');
    }
  }

  renderOrganicTab();
  renderPaidTab();
  renderFunnelTab();
  renderSuggestions();
  updatePeriodLabel();
  state.loading = false;
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
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Nenhuma métrica orgânica no período</p></div>';
    return;
  }
  const latest = metrics[metrics.length - 1];
  const oldest = metrics[0];
  const avgReach = Math.round(metrics.reduce((s, m) => s + (m.reach || 0), 0) / metrics.length);
  const avgEngagement = (metrics.reduce((s, m) => s + parseFloat(m.engagement_rate || 0), 0) / metrics.length).toFixed(2);
  const followerGrowth = latest.followers - oldest.followers;
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
        <div class="summary-card-header"><span class="summary-card-label">Seguidores</span><div class="summary-card-icon icon-primary">👥</div></div>
        <div class="summary-card-value">${formatNumber(latest.followers || 0)}</div>
        <div class="summary-card-change ${followerGrowth >= 0 ? 'change-positive' : 'change-negative'}">${followerGrowth >= 0 ? '▲' : '▼'} ${Math.abs(followerGrowth)} no período</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Alcance Médio</span><div class="summary-card-icon icon-success">📡</div></div>
        <div class="summary-card-value">${formatNumber(avgReach)}</div>
        <div class="summary-card-change ${parseFloat(reachChange) >= 0 ? 'change-positive' : 'change-negative'}">${parseFloat(reachChange) >= 0 ? '▲' : '▼'} ${Math.abs(reachChange)}% vs período anterior</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Taxa de Engajamento</span><div class="summary-card-icon ${engAlert ? 'icon-danger' : 'icon-warning'}">💬</div></div>
        <div class="summary-card-value ${engAlert ? 'alert-value' : ''}">${avgEngagement}%</div>
        <div class="summary-card-change ${parseFloat(engChange) >= 0 ? 'change-positive' : 'change-negative'}">${parseFloat(engChange) >= 0 ? '▲' : '▼'} ${Math.abs(engChange)}% vs período anterior</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Crescimento</span><div class="summary-card-icon icon-success">📈</div></div>
        <div class="summary-card-value ${followerGrowth >= 0 ? '' : 'alert-value'}">${followerGrowth >= 0 ? '+' : ''}${formatNumber(followerGrowth)}</div>
        <div class="summary-card-change change-neutral">seguidores no período</div>
      </div>
    </div>
    <div class="charts-grid">
      <div class="chart-card chart-card-full">
        <div class="chart-header"><div><div class="chart-title">Evolução do Alcance</div><div class="chart-subtitle">Alcance orgânico diário no período</div></div></div>
        <div class="chart-container"><canvas id="chart-reach"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><div><div class="chart-title">Taxa de Engajamento</div><div class="chart-subtitle">Evolução diária %</div></div></div>
        <div class="chart-container-sm"><canvas id="chart-engagement"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><div><div class="chart-title">Interações por Tipo</div><div class="chart-subtitle">Curtidas, comentários, salvos, compartilhamentos</div></div></div>
        <div class="chart-container-sm"><canvas id="chart-interactions"></canvas></div>
      </div>
    </div>
    <div class="table-card">
      <div class="table-header"><span class="table-title">Métricas Detalhadas por Dia</span></div>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Data</th><th>Plataforma</th><th>Seguidores</th><th>Alcance</th><th>Impressões</th><th>Engajamento</th><th>Curtidas</th><th>Comentários</th><th>Salvos</th></tr></thead>
          <tbody>
            ${metrics.slice().reverse().slice(0, 15).map(m => `
              <tr>
                <td class="td-bold">${formatDate(m.date)}</td>
                <td><span class="status-badge status-ok">📷 Instagram</span></td>
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
  setTimeout(() => { renderReachChart(metrics); renderEngagementChart(metrics); renderInteractionsChart(metrics); }, 100);
}

// ============================================
// Aba 2: Tráfego Pago
// ============================================
function renderPaidTab() {
  const tab = document.getElementById('paid-tab');
  if (!tab) return;
  const metrics = state.paidMetrics;
  if (metrics.length === 0) {
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>Nenhuma métrica de tráfego pago no período</p></div>';
    return;
  }
  const totalSpend = metrics.reduce((s, m) => s + parseFloat(m.spend || 0), 0);
  const totalLeads = metrics.reduce((s, m) => s + (m.leads || 0), 0);
  const totalMessages = metrics.reduce((s, m) => s + (m.messages || 0), 0);
  const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCTR = metrics.filter(m => m.ctr).reduce((s, m) => s + parseFloat(m.ctr), 0) / (metrics.filter(m => m.ctr).length || 1);
  const cplAlert = avgCPL > THRESHOLDS.CPL_MAX;
  const ctrAlert = (avgCTR || 0) < THRESHOLDS.CTR_MIN;

  const byCampaign = {};
  metrics.forEach(m => {
    const key = m.campaign_name || 'Sem campanha';
    if (!byCampaign[key]) byCampaign[key] = { name: key, spend: 0, leads: 0, messages: 0, impressions: 0, clicks: 0, budget_planned: 0 };
    byCampaign[key].spend += parseFloat(m.spend || 0);
    byCampaign[key].leads += m.leads || 0;
    byCampaign[key].messages += m.messages || 0;
    byCampaign[key].impressions += m.impressions || 0;
    byCampaign[key].clicks += m.clicks || 0;
    byCampaign[key].budget_planned += parseFloat(m.budget_planned || 0);
  });
  const campaigns = Object.values(byCampaign);

  const byAdset = {};
  metrics.forEach(m => {
    const key = m.adset_name || 'Sem conjunto';
    if (!byAdset[key]) byAdset[key] = { name: key, spend: 0, leads: 0, messages: 0, impressions: 0, clicks: 0, ctr_sum: 0, freq_sum: 0, count: 0 };
    byAdset[key].spend += parseFloat(m.spend || 0);
    byAdset[key].leads += m.leads || 0;
    byAdset[key].messages += m.messages || 0;
    byAdset[key].impressions += m.impressions || 0;
    byAdset[key].clicks += m.clicks || 0;
    byAdset[key].ctr_sum += parseFloat(m.ctr || 0);
    byAdset[key].freq_sum += parseFloat(m.frequency || 0);
    byAdset[key].count++;
  });
  const adsets = Object.values(byAdset).map(a => ({ ...a, ctr: a.count > 0 ? (a.ctr_sum / a.count).toFixed(2) : 0, frequency: a.count > 0 ? (a.freq_sum / a.count).toFixed(2) : 0, cpl: a.leads > 0 ? (a.spend / a.leads).toFixed(2) : 0 }));

  function getAdsetStatus(a) {
    if (parseFloat(a.cpl) > THRESHOLDS.CPL_MAX || parseFloat(a.ctr) < THRESHOLDS.CTR_MIN || parseFloat(a.frequency) > THRESHOLDS.FREQUENCY_MAX) return 'critical';
    if (parseFloat(a.cpl) > THRESHOLDS.CPL_MAX * 0.8 || parseFloat(a.ctr) < THRESHOLDS.CTR_MIN * 1.2 || parseFloat(a.frequency) > THRESHOLDS.FREQUENCY_MAX * 0.85) return 'warning';
    return 'ok';
  }

  tab.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Total Investido</span><div class="summary-card-icon icon-primary">💵</div></div>
        <div class="summary-card-value">R$ ${formatCurrency(totalSpend)}</div>
        <div class="summary-card-change change-neutral">${campaigns.length} campanhas ativas</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Leads Gerados</span><div class="summary-card-icon icon-success">🎯</div></div>
        <div class="summary-card-value">${formatNumber(totalLeads)}</div>
        <div class="summary-card-change change-neutral">CPM médio: R$ ${formatCurrency(metrics.reduce((s,m)=>s+parseFloat(m.cpm||0),0)/metrics.length)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">CPL Médio</span><div class="summary-card-icon ${cplAlert ? 'icon-danger' : 'icon-warning'}">📉</div></div>
        <div class="summary-card-value ${cplAlert ? 'alert-value' : ''}">R$ ${formatCurrency(avgCPL)}</div>
        <div class="summary-card-change ${cplAlert ? 'change-negative' : 'change-positive'}">${cplAlert ? '⚠️ Acima do limite R$ 80' : '✅ Dentro do limite'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-header"><span class="summary-card-label">Mensagens</span><div class="summary-card-icon icon-primary">💬</div></div>
        <div class="summary-card-value">${formatNumber(totalMessages)}</div>
        <div class="summary-card-change ${ctrAlert ? 'change-negative' : 'change-neutral'}">CTR médio: ${(avgCTR || 0).toFixed(2)}%${ctrAlert ? ' ⚠️' : ''}</div>
      </div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-header"><div><div class="chart-title">Evolução do CPL</div><div class="chart-subtitle">Custo por lead ao longo do tempo</div></div></div>
        <div class="chart-container-sm"><canvas id="chart-cpl"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><div><div class="chart-title">Investimento por Campanha</div><div class="chart-subtitle">Gasto vs Leads gerados</div></div></div>
        <div class="chart-container-sm"><canvas id="chart-campaigns"></canvas></div>
      </div>
    </div>
    <div class="budget-section">
      <div class="budget-title">📊 Orçamento: Gasto vs Planejado</div>
      ${campaigns.map(c => {
        const pct = c.budget_planned > 0 ? (c.spend / c.budget_planned * 100) : 0;
        const cls = pct > THRESHOLDS.BUDGET_MAX_PCT ? 'budget-critical' : pct > 90 ? 'budget-warning' : 'budget-ok';
        return `<div class="budget-item ${cls}">
          <div class="budget-item-header">
            <span class="budget-campaign">${c.name}</span>
            <span class="budget-values">R$ ${formatCurrency(c.spend)} / R$ ${formatCurrency(c.budget_planned)}</span>
            <span class="budget-pct ${pct > THRESHOLDS.BUDGET_MAX_PCT ? 'alert-value' : ''}">${pct.toFixed(0)}%</span>
          </div>
          <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
        </div>`;
      }).join('')}
    </div>
    <div class="table-card">
      <div class="table-header"><span class="table-title">Detalhamento por Conjunto de Anúncio</span></div>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Conjunto</th><th>Investimento</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>CPL</th><th>Frequência</th><th>Status</th></tr></thead>
          <tbody>
            ${adsets.map(a => {
              const status = getAdsetStatus(a);
              const statusLabel = { ok: '✅ OK', warning: '⚠️ Atenção', critical: '🔴 Crítico' };
              const statusClass = { ok: 'status-ok', warning: 'status-warning', critical: 'status-critical' };
              return `<tr>
                <td class="td-bold">${a.name}</td>
                <td>R$ ${formatCurrency(a.spend)}</td>
                <td>${formatNumber(a.impressions)}</td>
                <td>${formatNumber(a.clicks)}</td>
                <td class="${parseFloat(a.ctr) < THRESHOLDS.CTR_MIN ? 'alert-value' : ''}">${a.ctr}%</td>
                <td>${formatNumber(a.leads)}</td>
                <td class="${parseFloat(a.cpl) > THRESHOLDS.CPL_MAX ? 'alert-value' : ''}">R$ ${formatCurrency(parseFloat(a.cpl))}</td>
                <td class="${parseFloat(a.frequency) > THRESHOLDS.FREQUENCY_MAX ? 'alert-value' : ''}">${a.frequency}x</td>
                <td><span class="status-badge ${statusClass[status]}">${statusLabel[status]}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  setTimeout(() => { renderCPLChart(metrics); renderCampaignsChart(campaigns); }, 100);
}

// ============================================
// Aba 3: Funil de Conversão
// ============================================
function renderFunnelTab() {
  const tab = document.getElementById('funnel-tab');
  if (!tab) return;
  const paid = state.paidMetrics;
  const funnelData = state.funnelMetrics;
  const totalImpressions = paid.reduce((s, m) => s + (m.impressions || 0), 0);
  const totalClicks = paid.reduce((s, m) => s + (m.clicks || 0), 0);
  const totalMessages = paid.reduce((s, m) => s + (m.messages || 0), 0);
  const latest = funnelData[0] || null;
  const appointments = latest ? latest.appointments : Math.round(totalMessages * 0.3);
  const patients = latest ? latest.patients : Math.round(appointments * 0.7);
  if (totalImpressions === 0 && !latest) {
    tab.innerHTML = '<div class="empty-state"><div class="empty-icon">🔽</div><p>Nenhum dado de funil disponível</p></div>';
    return;
  }
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
  const bottleneckIdx = conversions.indexOf(Math.min(...conversions));
  const maxW = 500, minW = 200;

  tab.innerHTML = `
    <div class="funnel-container">
      <div class="funnel-title">🔽 Funil de Conversão — ${state.selectedPeriod === 'last_7d' ? 'Últimos 7 dias' : state.selectedPeriod === 'last_30d' ? 'Últimos 30 dias' : 'Últimos 90 dias'}</div>
      ${stages.map((stage, idx) => {
        const width = maxW - (idx * ((maxW - minW) / (stages.length - 1)));
        const isBottleneck = idx > 0 && (idx - 1) === bottleneckIdx;
        const conversion = idx > 0 ? conversions[idx - 1] : null;
        const rateClass = conversion !== null ? (conversion < 5 ? 'rate-bad' : 'rate-good') : '';
        return `
          ${idx > 0 ? `<div class="funnel-arrow" style="max-width:${width + 80}px;margin:0 auto"><span class="arrow-rate ${rateClass}">${conversion}% →</span></div>` : ''}
          <div class="funnel-stage">
            <div class="funnel-bar-wrapper">
              <div class="funnel-bar ${stage.class} ${isBottleneck ? 'bottleneck' : ''}" style="max-width:${width}px;margin:0 auto">
                <span class="funnel-stage-label">${stage.icon} ${stage.label}</span>
                <span class="funnel-stage-value">${formatNumber(stage.value)}</span>
              </div>
            </div>
            ${isBottleneck ? '<div style="text-align:center;font-size:11px;color:var(--color-danger);margin-top:3px">⚠️ Gargalo identificado</div>' : ''}
          </div>
        `;
      }).join('')}
      <div style="margin-top:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${conversions.map((rate, i) => `
          <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${stages[i].label} → ${stages[i+1].label}</div>
            <div style="font-size:20px;font-weight:700;color:${rate < 5 ? 'var(--color-danger)' : rate < 15 ? 'var(--color-warning)' : 'var(--color-success)'}">${rate}%</div>
          </div>
        `).join('')}
      </div>
    </div>
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
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div><p style="font-size:13px">Clique em "Gerar" para analisar as métricas com IA</p></div>';
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
        <button class="btn-suggestion btn-applied" onclick="updateSuggestion('${s.id}', 'applied')" ${s.status === 'applied' ? 'disabled' : ''}>✅ ${s.status === 'applied' ? 'Aplicada' : 'Aplicar'}</button>
        <button class="btn-suggestion btn-dismiss" onclick="updateSuggestion('${s.id}', 'dismissed')">✕ Ignorar</button>
      </div>
    </div>
  `).join('');
}

async function updateSuggestion(id, status) {
  const idx = state.aiSuggestions.findIndex(s => s.id === id);
  if (idx >= 0) state.aiSuggestions[idx].status = status;
  if (!state.demoMode && supabase) {
    try { await supabase.from('ai_suggestions').update({ status }).eq('id', id); } catch (e) {}
  }
  renderSuggestions();
  showToast(status === 'applied' ? 'Sugestão marcada como aplicada!' : 'Sugestão ignorada', 'success');
}

async function generateSuggestions() {
  if (!state.selectedClient) { showToast('Selecione um cliente primeiro', 'error'); return; }
  const btn = document.getElementById('btn-generate');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Gerando...'; }
  if (state.demoMode) {
    showToast('🎭 Modo Demo: gerando sugestões simuladas...', 'info');
    await new Promise(r => setTimeout(r, 1500));
    const demo = generateDemoData(state.selectedClient.id, state.selectedPeriod);
    state.aiSuggestions = demo.suggestions;
    renderSuggestions();
    showToast('✨ Sugestões geradas com sucesso!', 'success');
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ Gerar'; }
    return;
  }
  showToast('Analisando métricas com Claude IA...', 'info');
  try {
    await callEdgeFunction('ai-suggestions', { client_id: state.selectedClient.id });
    const { data } = await supabase.from('ai_suggestions').select('*').eq('client_id', state.selectedClient.id).order('generated_at', { ascending: false }).limit(15);
    state.aiSuggestions = data || [];
    renderSuggestions();
    showToast('Sugestões geradas com sucesso!', 'success');
  } catch (error) {
    showToast('Erro ao gerar sugestões: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✨ Gerar'; }
  }
}

// ============================================
// Gráficos Chart.js
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
      datasets: [
        { label: 'Alcance', data: metrics.map(m => m.reach || 0), borderColor: '#6C63FF', backgroundColor: 'rgba(108,99,255,0.08)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#6C63FF' },
        { label: 'Impressões', data: metrics.map(m => m.impressions || 0), borderColor: '#00D4A1', backgroundColor: 'rgba(0,212,161,0.05)', tension: 0.4, fill: false, pointRadius: 3, pointBackgroundColor: '#00D4A1', borderDash: [4, 2] }
      ]
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
      datasets: [{ label: 'Engajamento %', data: metrics.map(m => parseFloat(m.engagement_rate || 0)), borderColor: '#FF8C42', backgroundColor: 'rgba(255,140,66,0.08)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#FF8C42' }]
    },
    options: { ...chartDefaults }
  });
}

function renderInteractionsChart(metrics) {
  destroyChart('interactions');
  const ctx = document.getElementById('chart-interactions');
  if (!ctx) return;
  const totals = metrics.reduce((acc, m) => ({ likes: acc.likes + (m.likes || 0), comments: acc.comments + (m.comments || 0), shares: acc.shares + (m.shares || 0), saves: acc.saves + (m.saves || 0) }), { likes: 0, comments: 0, shares: 0, saves: 0 });
  state.charts['interactions'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Curtidas', 'Comentários', 'Compartilhamentos', 'Salvos'],
      datasets: [{ data: [totals.likes, totals.comments, totals.shares, totals.saves], backgroundColor: ['#6C63FF', '#00D4A1', '#FF8C42', '#3B9EFF'], borderColor: '#1A1D2E', borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9099C0', font: { size: 11 }, boxWidth: 12 } }, tooltip: chartDefaults.plugins.tooltip } }
  });
}

function renderCPLChart(metrics) {
  destroyChart('cpl');
  const ctx = document.getElementById('chart-cpl');
  if (!ctx) return;
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
      datasets: [{ label: 'CPL (R$)', data: cpls, borderColor: '#FF4D6D', backgroundColor: 'rgba(255,77,109,0.08)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#FF4D6D', spanGaps: true }]
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
      labels: campaigns.map(c => c.name.length > 18 ? c.name.substring(0, 18) + '...' : c.name),
      datasets: [
        { label: 'Investimento (R$)', data: campaigns.map(c => parseFloat(c.spend.toFixed(2))), backgroundColor: 'rgba(108,99,255,0.6)', borderColor: '#6C63FF', borderWidth: 1, yAxisID: 'y' },
        { label: 'Leads', data: campaigns.map(c => c.leads), backgroundColor: 'rgba(0,212,161,0.6)', borderColor: '#00D4A1', borderWidth: 1, type: 'line', yAxisID: 'y1' }
      ]
    },
    options: { ...chartDefaults, scales: { x: { ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.3)' } }, y: { type: 'linear', position: 'left', ticks: { color: '#6B7098', font: { size: 10 } }, grid: { color: 'rgba(46,50,80,0.3)' } }, y1: { type: 'linear', position: 'right', ticks: { color: '#00D4A1', font: { size: 10 } }, grid: { drawOnChartArea: false } } } }
  });
}

// ============================================
// Utilitários
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

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'toast-container'; document.body.appendChild(container); }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 4500);
}
