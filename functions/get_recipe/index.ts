import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const EDAMAM_APP_ID = Deno.env.get('EDAMAM_APP_ID')
const EDAMAM_APP_KEY = Deno.env.get('EDAMAM_APP_KEY')
const EDAMAM_API_URL = "https://api.edamam.com/api/recipes/v2"

serve(async (req) => {
  try {
    const { mealName } = await req.json()
    
    if (!mealName) {
      return new Response(
        JSON.stringify({ error: "Meal name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const url = `${EDAMAM_API_URL}?type=public&q=${encodeURIComponent(mealName)}&app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_APP_KEY}`
    const response = await fetch(url)
    const data = await response.json()

    if (!data.hits || data.hits.length === 0) {
      return new Response(
        JSON.stringify({ error: "Recipe not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const recipe = data.hits[0].recipe
    
    // Extract relevant information
    const recipeInfo = {
      name: recipe.label,
      image: recipe.image,
      source: recipe.source,
      url: recipe.url,
      dietLabels: recipe.dietLabels,
      healthLabels: recipe.healthLabels,
      cautions: recipe.cautions,
      ingredientLines: recipe.ingredientLines,
      calories: Math.round(recipe.calories),
      totalTime: recipe.totalTime,
      cuisineType: recipe.cuisineType,
      mealType: recipe.mealType,
      dishType: recipe.dishType,
    }

    return new Response(
      JSON.stringify(recipeInfo),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})