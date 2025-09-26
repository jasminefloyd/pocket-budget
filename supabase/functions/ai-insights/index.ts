import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type InsightMetrics = {
  totalIncome: number
  totalExpenses: number
  balance: number
  savingsRate: number
  expensesByCategory: Record<string, number>
  last7Days: number
  previous7Days: number
  transactionCount: number
  avgTransactionAmount: number
  [key: string]: unknown
}

type InsightRequestBody = {
  budgetId: string
  userId: string
  tier?: "free" | "paid"
  metrics: InsightMetrics
}

function buildPrompt(metrics: InsightMetrics) {
  const categories = Object.entries(metrics.expensesByCategory || {})
    .map(([name, amount]) => `${name}: $${Number(amount).toFixed(2)}`)
    .join("\n")
  const categorySection = categories.length ? categories : "No categorized expenses recorded."

  return `You are a financial planning assistant for a budgeting application. You must analyze the provided budget metrics and respond with a JSON object that contains:
  {
    "healthScore": number (1-10),
    "summary": string,
    "strengths": string[],
    "improvements": [{"area": string, "action": string, "suggestion": string }],
    "spendingAnalysis": {
      "trend": string,
      "topCategory": string,
      "avgTransaction": string,
      "frequency": string
    },
    "savingsTips": string[],
    "budgetSuggestions": [{
      "rule"?: string,
      "category"?: string,
      "current"?: string,
      "suggestion"?: string,
      "needs"?: string,
      "wants"?: string,
      "savings"?: string
    }],
    "goals": {
      "shortTerm": string[],
      "longTerm": string[]
    }
  }

Numbers should be rounded to two decimal places where appropriate and monetary values should be formatted with a dollar sign. Use the metrics to tailor the advice. Budget metrics:
- Total income: $${Number(metrics.totalIncome || 0).toFixed(2)}
- Total expenses: $${Number(metrics.totalExpenses || 0).toFixed(2)}
- Balance: $${Number(metrics.balance || 0).toFixed(2)}
- Savings rate: ${(Number(metrics.savingsRate || 0)).toFixed(2)}%
- Transactions recorded: ${metrics.transactionCount || 0}
- Average transaction: $${Number(metrics.avgTransactionAmount || 0).toFixed(2)}
- Expenses in last 7 days: $${Number(metrics.last7Days || 0).toFixed(2)}
- Expenses previous 7 days: $${Number(metrics.previous7Days || 0).toFixed(2)}
- Category breakdown:\n${categorySection}`
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { budgetId, userId, tier = "free", metrics }: InsightRequestBody = await req.json()

    if (!budgetId || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: budgetId and userId are required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    if (!metrics || typeof metrics !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing metrics for AI analysis." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const openaiKey = Deno.env.get("OPENAI_API_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase credentials are not configured.")
      return new Response(
        JSON.stringify({ error: "Supabase environment variables are not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    if (!openaiKey) {
      console.error("OpenAI API key is missing.")
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    const model = tier === "paid" ? "gpt-4o" : "gpt-4o-mini"
    const prompt = buildPrompt(metrics)

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an empathetic but direct financial coach that gives personalized, actionable insights and never returns markdown or prose outside of JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: tier === "paid" ? 0.7 : 0.5,
        max_tokens: tier === "paid" ? 800 : 500,
      }),
    })

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text()
      console.error("OpenAI request failed", errorText)
      return new Response(
        JSON.stringify({ error: "Failed to generate AI insights." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      )
    }

    const openAiPayload = await openAiResponse.json()
    const content: string = openAiPayload?.choices?.[0]?.message?.content || "{}"

    let insights
    try {
      insights = JSON.parse(content)
    } catch (parseError) {
      console.warn("Failed to parse AI response as JSON, falling back to raw text.", parseError)
      insights = { summary: content }
    }

    const insertPayload = {
      user_id: userId,
      budget_id: budgetId,
      tier,
      model,
      prompt: { tier, metrics },
      insights,
      raw_response: content,
      usage: openAiPayload?.usage ?? null,
    }

    const { data, error } = await supabaseClient.from("ai_insights").insert(insertPayload).select().single()

    if (error) {
      console.error("Failed to persist AI insights", error)
      return new Response(
        JSON.stringify({ error: "Failed to store AI insights." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({ insight: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    console.error("Unexpected error generating AI insights", error)
    return new Response(
      JSON.stringify({ error: "Unexpected error generating AI insights." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
