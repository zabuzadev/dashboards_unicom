// ============================================
// Edge Function: meta-metrics
// Busca métricas de tráfego pago da Meta Marketing API
// e salva no Supabase
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Tratar requisições OPTIONS (CORS preflight)
        if (req.method === 'OPTIONS') {
              return new Response('ok', { headers: corsHeaders })
        }

        try {
              // Inicializar cliente Supabase com credenciais do servidor
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
              const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
              const metaToken = Deno.env.get('META_ACCESS_TOKEN')!

      const supabase = createClient(supabaseUrl, supabaseKey)

      // Extrair parâmetros do body da requisição
      const { client_id, ads_account_id, date_range } = await req.json()

      // Validar parâmetros obrigatórios
      if (!client_id || !ads_account_id) {
              return new Response(
                        JSON.stringify({ error: 'Parâmetros obrigatórios: client_id e ads_account_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                      )
      }

      // Definir período de consulta (padrão: últimos 30 dias)
      const datePreset = date_range || 'last_30d'

      // Montar URL da Meta Marketing API
      const fields = [
              'spend',
              'impressions',
              'reach',
              'clicks',
              'ctr',
              'cpm',
              'cpc',
              'actions',
              'cost_per_action_type',
              'frequency',
              'campaign_name',
              'campaign_id',
              'adset_name',
              'adset_id',
              'date_start',
              'date_stop'
            ].join(',')

      const metaUrl = `https://graph.facebook.com/v19.0/act_${ads_account_id}/insights?` +
              `fields=${fields}` +
              `&date_preset=${datePreset}` +
              `&level=adset` +
              `&time_increment=1` +
              `&access_token=${metaToken}`

      console.log(`Buscando métricas para conta: ${ads_account_id}`)

      // Chamar a Meta API
      const metaResponse = await fetch(metaUrl)

      if (!metaResponse.ok) {
              const errorData = await metaResponse.json()
              console.error('Erro na Meta API:', errorData)
              return new Response(
                        JSON.stringify({
                                    error: 'Erro ao consultar Meta API',
                                    details: errorData.error?.message || 'Erro desconhecido'
                        }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                      )
      }

      const metaData = await metaResponse.json()
              const insights = metaData.data || []

                    if (insights.length === 0) {
                            return new Response(
                                      JSON.stringify({ message: 'Nenhuma métrica encontrada para o período', data: [] }),
                              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                                    )
                    }

      // Processar e transformar os dados
      const metricsToSave = insights.map((insight: any) => {
              // Extrair ações (leads e mensagens)
                                               const actions = insight.actions || []
                                                       const costPerAction = insight.cost_per_action_type || []

                                                               // Encontrar leads
                                                               const leadAction = actions.find((a: any) => a.action_type === 'lead')
              const leads = leadAction ? parseInt(leadAction.value) : 0

                                               // Encontrar custo por lead
                                               const leadCost = costPerAction.find((a: any) => a.action_type === 'lead')
              const costPerLead = leadCost ? parseFloat(leadCost.value) : 0

                                               // Encontrar mensagens iniciadas
                                               const messageAction = actions.find(
                                                         (a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
                                                       )
              const messages = messageAction ? parseInt(messageAction.value) : 0

                                               // Encontrar custo por mensagem
                                               const messageCost = costPerAction.find(
                                                         (a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
                                                       )
              const costPerMessage = messageCost ? parseFloat(messageCost.value) : 0

                                               return {
                                                         client_id,
                                                         date: insight.date_start,
                                                         campaign_id: insight.campaign_id || null,
                                                         campaign_name: insight.campaign_name || null,
                                                         adset_id: insight.adset_id || null,
                                                         adset_name: insight.adset_name || null,
                                                         spend: parseFloat(insight.spend || '0'),
                                                         impressions: parseInt(insight.impressions || '0'),
                                                         reach: parseInt(insight.reach || '0'),
                                                         clicks: parseInt(insight.clicks || '0'),
                                                         ctr: parseFloat(insight.ctr || '0'),
                                                         cpm: parseFloat(insight.cpm || '0'),
                                                         cpc: parseFloat(insight.cpc || '0'),
                                                         leads,
                                                         cost_per_lead: costPerLead,
                                                         messages,
                                                         cost_per_message: costPerMessage,
                                                         frequency: parseFloat(insight.frequency || '0'),
                                                         budget_planned: null, // Definido manualmente no banco
                                               }
      })

      // Salvar métricas no Supabase (upsert para evitar duplicatas)
      const { data: savedData, error: saveError } = await supabase
                .from('paid_metrics')
                .upsert(metricsToSave, {
                          onConflict: 'client_id,date,adset_id',
                          ignoreDuplicates: false
                })
                .select()

      if (saveError) {
              console.error('Erro ao salvar no Supabase:', saveError)
              return new Response(
                        JSON.stringify({
                                    error: 'Erro ao salvar métricas no banco de dados',
                                    details: saveError.message
                        }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                      )
      }

      // Calcular resumo das métricas
      const summary = {
              total_records: metricsToSave.length,
              total_spend: metricsToSave.reduce((sum: number, m: any) => sum + m.spend, 0).toFixed(2),
              total_leads: metricsToSave.reduce((sum: number, m: any) => sum + m.leads, 0),
              total_messages: metricsToSave.reduce((sum: number, m: any) => sum + m.messages, 0),
              avg_ctr: (metricsToSave.reduce((sum: number, m: any) => sum + m.ctr, 0) / metricsToSave.length).toFixed(2),
      }

      console.log('Métricas salvas com sucesso:', summary)

      return new Response(
              JSON.stringify({
                        success: true,
                        summary,
                        data: savedData || metricsToSave
              }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } catch (error) {
              console.error('Erro inesperado:', error)
              return new Response(
                      JSON.stringify({
                                error: 'Erro interno no servidor',
                                details: error instanceof Error ? error.message : 'Erro desconhecido'
                      }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
        }
})
