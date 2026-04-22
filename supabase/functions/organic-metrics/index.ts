// ============================================
// Edge Function: organic-metrics
// Busca métricas orgânicas da Instagram Graph API
// e salva no Supabase
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
    const metaToken = Deno.env.get('META_ACCESS_TOKEN')!

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { client_id, instagram_account_id, date_range } = await req.json()

    if (!client_id || !instagram_account_id) {
      return new Response(
        JSON.stringify({ error: 'Parametros obrigatorios: client_id e instagram_account_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const days = date_range === 'last_7d' ? 7 : date_range === 'last_90d' ? 90 : 30
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const since = Math.floor(startDate.getTime() / 1000)
    const until = Math.floor(endDate.getTime() / 1000)

    const insightsUrl = `https://graph.facebook.com/v19.0/${instagram_account_id}/insights?metric=reach,impressions,profile_views,follower_count&period=day&since=${since}&until=${until}&access_token=${metaToken}`
    const insightsResponse = await fetch(insightsUrl)
    if (!insightsResponse.ok) {
      const errorData = await insightsResponse.json()
      return new Response(JSON.stringify({ error: 'Erro ao buscar insights do Instagram', details: errorData.error?.message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const insightsData = await insightsResponse.json()

    const accountUrl = `https://graph.facebook.com/v19.0/${instagram_account_id}?fields=followers_count,media_count,name&access_token=${metaToken}`
    const accountResponse = await fetch(accountUrl)
    const accountData = await accountResponse.json()
    const currentFollowers = accountData.followers_count || 0

    const mediaUrl = `https://graph.facebook.com/v19.0/${instagram_account_id}/media?fields=id,timestamp,like_count,comments_count,shares_count,saved,reach,impressions&since=${since}&until=${until}&limit=50&access_token=${metaToken}`
    const mediaResponse = await fetch(mediaUrl)
    const mediaData = await mediaResponse.json()
    const posts = mediaData.data || []

    const metricsByDate = {}
    if (insightsData.data) {
      for (const metric of insightsData.data) {
        if (metric.values) {
          for (const value of metric.values) {
            const date = value.end_time ? value.end_time.split('T')[0] : null
            if (!date) continue
            if (!metricsByDate[date]) metricsByDate[date] = { date }
            metricsByDate[date][metric.name] = value.value
          }
        }
      }
    }

    let topPostId = null
    let topPostEngagement = 0
    const totalLikes = posts.reduce((sum, p) => sum + (p.like_count || 0), 0)
    const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0)
    const totalShares = posts.reduce((sum, p) => sum + (p.shares_count || 0), 0)
    const totalSaves = posts.reduce((sum, p) => sum + (p.saved || 0), 0)

    for (const post of posts) {
      const eng = (post.like_count || 0) + (post.comments_count || 0) + (post.shares_count || 0) + (post.saved || 0)
      if (eng > topPostEngagement) { topPostEngagement = eng; topPostId = post.id }
    }

    const totalEngagement = totalLikes + totalComments + totalShares + totalSaves
    const engagementRate = currentFollowers > 0 ? parseFloat(((totalEngagement / currentFollowers) * 100).toFixed(2)) : 0

    const dates = Object.keys(metricsByDate).sort()
    const metricsToSave = dates.length > 0
      ? dates.map(date => ({
          client_id, date, platform: 'instagram',
          followers: metricsByDate[date].follower_count || currentFollowers,
          reach: metricsByDate[date].reach || 0,
          impressions: metricsByDate[date].impressions || 0,
          profile_views: metricsByDate[date].profile_views || 0,
          engagement_rate: engagementRate,
          likes: Math.round(totalLikes / (dates.length || 1)),
          comments: Math.round(totalComments / (dates.length || 1)),
          shares: Math.round(totalShares / (dates.length || 1)),
          saves: Math.round(totalSaves / (dates.length || 1)),
          stories_reach: null, stories_replies: null,
          top_post_id: topPostId, top_post_engagement: topPostEngagement
        }))
      : [{ client_id, date: new Date().toISOString().split('T')[0], platform: 'instagram', followers: currentFollowers, reach: 0, impressions: 0, profile_views: 0, engagement_rate: engagementRate, likes: totalLikes, comments: totalComments, shares: totalShares, saves: totalSaves, stories_reach: null, stories_replies: null, top_post_id: topPostId, top_post_engagement: topPostEngagement }]

    const { data: savedData, error: saveError } = await supabase.from('organic_metrics').upsert(metricsToSave, { onConflict: 'client_id,date,platform', ignoreDuplicates: false }).select()

    if (saveError) {
      return new Response(JSON.stringify({ error: 'Erro ao salvar metricas no banco de dados', details: saveError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, summary: { total_records: metricsToSave.length, current_followers: currentFollowers, total_posts_analyzed: posts.length, engagement_rate: engagementRate, top_post_id: topPostId }, data: savedData || metricsToSave }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erro interno no servidor', details: error instanceof Error ? error.message : 'Erro desconhecido' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
