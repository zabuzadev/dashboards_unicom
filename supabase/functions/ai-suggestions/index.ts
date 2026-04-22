// ============================================
// Edge Function: ai-suggestions
// Analisa métricas e gera sugestões de otimização
// usando a Claude API (Anthropic)
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { client_id } = await req.json()

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Parametro obrigatorio: client_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Buscar informações do cliente
    const { data: client } = await supabase.from('clients').select('*').eq('id', client_id).single()

    // Buscar últimos 30 dias de métricas pagas
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const dateThreshold = thirtyDaysAgo.toISOString().split('T')[0]

    const { data: paidMetrics } = await supabase
      .from('paid_metrics')
      .select('*')
      .eq('client_id', client_id)
      .gte('date', dateThreshold)
      .order('date', { ascending: false })
      .limit(100)

    const { data: organicMetrics } = await supabase
      .from('organic_metrics')
      .select('*')
      .eq('client_id', client_id)
      .gte('date', dateThreshold)
      .order('date', { ascending: false })
      .limit(60)

    const { data: funnelMetrics } = await supabase
      .from('funnel_metrics')
      .select('*')
      .eq('client_id', client_id)
      .gte('date', dateThreshold)
      .order('date', { ascending: false })
      .limit(30)

    // Calcular médias e variações
    const calcAvg = (arr, field) => {
      const vals = arr?.filter(r => r[field] != null).map(r => parseFloat(r[field])) || []
      return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '0'
    }

    const calcSum = (arr, field) => {
      const vals = arr?.filter(r => r[field] != null).map(r => parseFloat(r[field])) || []
      return vals.reduce((a, b) => a + b, 0).toFixed(2)
    }

    // Separar em semana atual vs semana anterior para calcular variação
    const now = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const sevenDaysStr = sevenDaysAgo.toISOString().split('T')[0]
    const fourteenDaysStr = fourteenDaysAgo.toISOString().split('T')[0]

    const currentWeekPaid = paidMetrics?.filter(m => m.date >= sevenDaysStr) || []
    const prevWeekPaid = paidMetrics?.filter(m => m.date >= fourteenDaysStr && m.date < sevenDaysStr) || []

    const currentWeekOrganic = organicMetrics?.filter(m => m.date >= sevenDaysStr) || []
    const prevWeekOrganic = organicMetrics?.filter(m => m.date >= fourteenDaysStr && m.date < sevenDaysStr) || []

    const calcVariation = (current, previous) => {
      const curr = parseFloat(current)
      const prev = parseFloat(previous)
      if (prev === 0) return 'N/A'
      return (((curr - prev) / prev) * 100).toFixed(1) + '%'
    }

    // Resumo métricas pagas - semana atual
    const cpl_atual = calcAvg(currentWeekPaid, 'cost_per_lead')
    const cpl_anterior = calcAvg(prevWeekPaid, 'cost_per_lead')
    const ctr_atual = calcAvg(currentWeekPaid, 'ctr')
    const ctr_anterior = calcAvg(prevWeekPaid, 'ctr')
    const freq_atual = calcAvg(currentWeekPaid, 'frequency')
    const freq_anterior = calcAvg(prevWeekPaid, 'frequency')
    const spend_atual = calcSum(currentWeekPaid, 'spend')
    const leads_atual = currentWeekPaid.reduce((s, m) => s + (m.leads || 0), 0)
    const leads_anterior = prevWeekPaid.reduce((s, m) => s + (m.leads || 0), 0)

    // Resumo métricas orgânicas
    const eng_atual = calcAvg(currentWeekOrganic, 'engagement_rate')
    const eng_anterior = calcAvg(prevWeekOrganic, 'engagement_rate')
    const reach_atual = calcAvg(currentWeekOrganic, 'reach')
    const reach_anterior = calcAvg(prevWeekOrganic, 'reach')
    const followers = calcAvg(currentWeekOrganic, 'followers')

    // Resumo funil
    const funnelRecent = funnelMetrics?.[0]

    // Construir prompt para Claude
    const prompt = `Você é um especialista em marketing digital médico analisando métricas de uma clínica/médico chamado(a) "${client?.name || 'Cliente'}" (especialidade: ${client?.specialty || 'medicina'}).

CONTEXTO:
- Agência: Unicom Digital (especializada em marketing para saúde)
- Nicho: Médicos e clínicas
- Objetivo principal: Gerar leads qualificados (consultas agendadas)

MÉTRICAS DA SEMANA ATUAL vs SEMANA ANTERIOR:

=== TRÁFEGO PAGO (Meta Ads) ===
- Investimento: R$ ${spend_atual}
- Leads gerados: ${leads_atual} (anterior: ${leads_anterior}, variação: ${calcVariation(leads_atual, leads_anterior)})
- CPL (Custo por Lead): R$ ${cpl_atual} (anterior: R$ ${cpl_anterior}, variação: ${calcVariation(cpl_atual, cpl_anterior)})
- CTR: ${ctr_atual}% (anterior: ${ctr_anterior}%, variação: ${calcVariation(ctr_atual, ctr_anterior)})
- Frequência: ${freq_atual} (anterior: ${freq_anterior}, variação: ${calcVariation(freq_atual, freq_anterior)})

=== ENGAJAMENTO ORGÂNICO (Instagram) ===
- Seguidores: ${followers}
- Taxa de Engajamento: ${eng_atual}% (anterior: ${eng_anterior}%, variação: ${calcVariation(eng_atual, eng_anterior)})
- Alcance médio: ${reach_atual} (anterior: ${reach_anterior}, variação: ${calcVariation(reach_atual, reach_anterior)})

${funnelRecent ? `=== FUNIL DE CONVERSÃO (último registro) ===
- Impressões → Cliques: ${funnelRecent.impression_to_click}%
- Cliques → Mensagens: ${funnelRecent.click_to_message}%
- Mensagens → Consultas: ${funnelRecent.message_to_appointment}%
- Consultas → Pacientes: ${funnelRecent.appointment_to_patient}%` : ''}

LIMITES DE ALERTA:
- CPL crítico: acima de R$ 80
- CTR crítico: abaixo de 1%
- Frequência crítica: acima de 3,5
- Engajamento orgânico crítico: abaixo de 2%

TAREFA:
Identifique os 3 principais problemas e gere sugestões práticas e específicas em português brasileiro.
Para cada sugestão, forneça no formato JSON exato abaixo:

[
  {
    "type": "paid" | "organic" | "funnel",
    "priority": "high" | "medium" | "low",
    "suggestion": "Texto da sugestão específica e acionável (2-3 frases)",
    "metric_trigger": "nome da métrica que disparou",
    "metric_value": "valor atual da métrica"
  }
]

REGRAS OBRIGATÓRIAS:
- Não sugira conteúdo sensacionalista ou que prometa curas
- Respeite as normas do CFM e CRM para publicidade médica
- Foque em resultados mensuráveis e ações concretas
- Linguagem profissional e técnica
- Retorne APENAS o array JSON, sem texto adicional`

    // Chamar Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json()
      return new Response(JSON.stringify({ error: 'Erro ao chamar Claude API', details: errorData.error?.message || 'Erro desconhecido' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || '[]'

    // Parsear as sugestões
    let suggestions = []
    try {
      suggestions = JSON.parse(responseText)
    } catch (e) {
      // Tentar extrair JSON do texto
      const jsonMatch = responseText.match(/\[.*\]/s)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      }
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return new Response(JSON.stringify({ error: 'Claude nao retornou sugestoes validas', raw: responseText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Salvar sugestões no banco
    const suggestionsToSave = suggestions.map(s => ({
      client_id,
      type: s.type || 'paid',
      priority: s.priority || 'medium',
      suggestion: s.suggestion,
      metric_trigger: s.metric_trigger || null,
      metric_value: s.metric_value || null,
      status: 'pending'
    }))

    const { data: savedSuggestions, error: saveError } = await supabase
      .from('ai_suggestions')
      .insert(suggestionsToSave)
      .select()

    if (saveError) {
      return new Response(JSON.stringify({ error: 'Erro ao salvar sugestoes', details: saveError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, suggestions_count: savedSuggestions.length, data: savedSuggestions }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erro interno no servidor', details: error instanceof Error ? error.message : 'Erro desconhecido' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
