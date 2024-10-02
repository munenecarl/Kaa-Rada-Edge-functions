import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, backoff = 300) {
  try {
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
      console.log(`Rate limited. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Error: ${error.message}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

serve(async (req) => {
  try {
    console.log('Function started')
    
    const { userId, dietaryGoal } = await req.json()
    console.log(`Received userId: ${userId}, dietaryGoal: ${dietaryGoal}`)

    if (!userId || !dietaryGoal) {
      return new Response(JSON.stringify({ error: 'User ID and dietary goal are required' }), { status: 400 })
    }

    // Fetch user data from the secondary_users table
    const { data: userData, error: userDataError } = await supabaseClient
      .from('secondary_users')
      .select('age, height, weight, gender')
      .eq('id', userId)
      .single()

    if (userDataError) {
      console.error('Error fetching user data:', userDataError)
      throw new Error(`Error fetching user data: ${userDataError.message}`)
    }

    if (!userData) {
      console.error('User data not found')
      throw new Error('User data not found')
    }

    console.log('Querying Mistral AI API')
    const prompt = `Given the dietary goal "${dietaryGoal}" and the following user information:
    Age: ${userData.age}
    Height: ${userData.height} cm
    Weight: ${userData.weight} kg
    Gender: ${userData.gender}

    Provide weekly recommended amounts for carbs, calories, fat, and proteins. Take into account the user's age, height, weight, and gender when calculating these recommendations. Respond in JSON format with keys: weekly_carbs, weekly_calories, weekly_fat, weekly_proteins. Values should be numbers only, no units.`

    const mistralResponse = await fetchWithRetry(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "mistral-tiny",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!mistralResponse.ok) {
      console.error(`Mistral AI API error: ${mistralResponse.status} ${mistralResponse.statusText}`)
      console.error(`Response body: ${await mistralResponse.text()}`)
      throw new Error(`Mistral AI API error: ${mistralResponse.status} ${mistralResponse.statusText}`)
    }

    const mistralData = await mistralResponse.json()
    console.log('Mistral AI API response received')

    if (!mistralData.choices || !mistralData.choices[0] || !mistralData.choices[0].message || !mistralData.choices[0].message.content) {
      throw new Error('Unexpected response structure from Mistral AI')
    }

    const content = mistralData.choices[0].message.content
    console.log('Raw content:', content)

    let recommendations
    try {
      recommendations = JSON.parse(content)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not find valid JSON in Mistral AI response')
      }
    }

    console.log('Parsed recommendations:', recommendations)

    // Validate the recommendations object
    const requiredKeys = ['weekly_carbs', 'weekly_calories', 'weekly_fat', 'weekly_proteins']
    for (const key of requiredKeys) {
      if (!(key in recommendations) || typeof recommendations[key] !== 'number') {
        throw new Error(`Invalid or missing ${key} in recommendations`)
      }
    }

    console.log('Updating Supabase table')
    console.log('User ID:', userId)
    console.log('Update data:', {
      dietary_goals: dietaryGoal,
      weekly_carbs: recommendations.weekly_carbs,
      weekly_calories: recommendations.weekly_calories,
      weekly_fat: recommendations.weekly_fat,
      weekly_protein: recommendations.weekly_proteins
    })

    // Update the secondary_users table
    const { data, error: updateError } = await supabaseClient
      .from('secondary_users')
      .update({
        dietary_goals: dietaryGoal,
        weekly_carbs: recommendations.weekly_carbs,
        weekly_calories: recommendations.weekly_calories,
        weekly_fat: recommendations.weekly_fat,
        weekly_protein: recommendations.weekly_proteins
      })
      .eq('id', userId)
      .select()

    if (updateError) {
      console.error('Supabase update error:', updateError)
      throw new Error(`Supabase update error: ${updateError.message}`)
    }

    if (!data || data.length === 0) {
      console.error('No data returned from Supabase update')
      throw new Error('No data returned from Supabase update')
    }

    console.log('Supabase update successful. Updated data:', JSON.stringify(data))

    const response = {
      message: 'Weekly goals calculated and updated successfully',
      data: data[0]  // Return the first (and should be only) updated record
    }
    console.log('Sending response:', JSON.stringify(response))

    return new Response(JSON.stringify(response), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Detailed error:', error)
    return new Response(JSON.stringify({ error: `An error occurred: ${error.message}`, stack: error.stack }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})