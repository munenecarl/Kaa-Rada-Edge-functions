import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENFOOD_API_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

interface NutritionInfo {
  calories: number;
  fat: number;
  carbs: number;
  proteins: number;
}

serve(async (req) => {
  try {
    const { foodName } = await req.json()
    
    if (!foodName) {
      return new Response(JSON.stringify({ error: 'Food name is required' }), { status: 400 })
    }

    console.log(`Querying nutrition info for: ${foodName}`)

    const searchParams = new URLSearchParams({
      search_terms: foodName,
      json: '1',
      page_size: '1',
    })

    const response = await fetch(`${OPENFOOD_API_URL}?${searchParams.toString()}`)

    if (!response.ok) {
      throw new Error(`OpenFood API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.products || data.products.length === 0) {
      return new Response(JSON.stringify({ error: 'No product found' }), { status: 404 })
    }

    const product = data.products[0]
    const nutritionInfo: NutritionInfo = {
      calories: product.nutriments['energy-kcal_100g'] || 0,
      fat: product.nutriments.fat_100g || 0,
      carbs: product.nutriments.carbohydrates_100g || 0,
      proteins: product.nutriments.proteins_100g || 0,
    }

    console.log('Nutrition info retrieved:', nutritionInfo)

    return new Response(JSON.stringify({
      message: 'Nutrition info retrieved successfully',
      data: nutritionInfo
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Detailed error:', error)
    return new Response(JSON.stringify({ error: `An error occurred: ${error.message}` }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})