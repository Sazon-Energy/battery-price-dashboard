import { supabase } from '../../../lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const batteryId = searchParams.get('batteryId')
    
    if (!batteryId) {
      return NextResponse.json(
        { error: 'Battery ID is required' },
        { status: 400 }
      )
    }

    // Fetch price history from server-side (secure)
    const { data: history, error } = await supabase
      .from('price_history')
      .select('price, scraped_at')
      .eq('battery_id', batteryId)
      .order('scraped_at', { ascending: false })
      .limit(50)
    
    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      history: history || []
    })

  } catch (error) {
    console.error('Price history API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch price history' },
      { status: 500 }
    )
  }
}
