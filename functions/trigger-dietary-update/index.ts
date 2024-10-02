import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { userId, dietaryGoal } = await req.json()

  if (!userId || !dietaryGoal) {
    return new Response(JSON.stringify({ error: 'User ID and dietary goal are required' }), { status: 400 })
  }

  try {
    // Call the weekly_goal_calculator function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/weekly_goal_calculator?userId=${userId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dietaryGoal })
      }
    )

    if (!response.ok) {
      throw new Error(`Error calling weekly_goal_calculator: ${response.statusText}`)
    }

    const result = await response.json()
    return new Response(JSON.stringify(result), { status: 200 })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'An error occurred' }), { status: 500 })
  }
})