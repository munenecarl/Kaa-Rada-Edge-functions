import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cohereApiKey = Deno.env.get('COHERE_API_KEY')
const cohereApiUrl = 'https://api.cohere.ai/v1/generate'

serve(async (req) => {
  // Create a Supabase client with the Auth context of the logged in user
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )

  // Get the user's daily nutrient goals from the request body
  const { dailyCalories, dailyProtein, dailyFat, dailyCarbs } = await req.json()

  // Construct the prompt for Cohere AI
  const prompt = `Given the following daily nutrient goals:
  Calories: ${dailyCalories}
  Protein: ${dailyProtein}g
  Fat: ${dailyFat}g
  Carbs: ${dailyCarbs}g

  Please recommend a breakfast, lunch, and dinner meal that will help meet these goals. The meals should be common, easily sourceable, and use ingredients that are widely available in most grocery stores. For each meal, provide the name of the dish, a brief description of what the meal is and its main ingredients, and a summary of its nutritional content.

  Format your response as follows:

  Breakfast:
  Name: [Common, easily prepared breakfast meal name]
  Description: [Brief description of the meal and its main, easily sourceable ingredients]
  Nutrition: [Summary of nutritional content]

  Lunch:
  Name: [Common, easily prepared lunch meal name]
  Description: [Brief description of the meal and its main, easily sourceable ingredients]
  Nutrition: [Summary of nutritional content]

  Dinner:
  Name: [Common, easily prepared dinner meal name]
  Description: [Brief description of the meal and its main, easily sourceable ingredients]
  Nutrition: [Summary of nutritional content]

  Remember to focus on meals that are familiar, easy to prepare, and use ingredients that most people can find in their local grocery store.`

  try {
    const response = await fetch(cohereApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'command-xlarge-nightly',
        prompt: prompt,
        max_tokens: 800,
        temperature: 0.7,
        k: 0,
        stop_sequences: [],
        return_likelihoods: 'NONE'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const mealRecommendations = data.generations[0].text.trim();

    // Parse the text response into a structured format
    const meals = mealRecommendations.split('\n\n');
    const parsedRecommendations: any = {};

    for (const meal of meals) {
      const [mealType, ...mealDetails] = meal.split('\n');
      const mealObject: any = {};
      
      for (const detail of mealDetails) {
        const [key, value] = detail.split(': ');
        mealObject[key.toLowerCase()] = value;
      }

      parsedRecommendations[mealType.toLowerCase().replace(':', '')] = mealObject;
    }

    return new Response(
      JSON.stringify(parsedRecommendations),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error calling Cohere AI:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate meal recommendations' }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
})