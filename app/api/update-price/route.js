import { supabase } from '../../../lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { batteryId, newPrice } = await request.json()
    
    // Validate input
    if (!batteryId || !newPrice) {
      return NextResponse.json(
        { error: 'Battery ID and new price are required' },
        { status: 400 }
      )
    }

    // Update the battery price
    const { data: updatedBattery, error: updateError } = await supabase
      .from('batteries')
      .update({ 
        current_price: newPrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', batteryId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Add to price history
    const { error: historyError } = await supabase
      .from('price_history')
      .insert([
        {
          battery_id: batteryId,
          price: newPrice,
          scraped_at: new Date().toISOString()
        }
      ])

    if (historyError) {
      console.warn('Failed to add to price history:', historyError)
      // Don't fail the whole request if history insert fails
    }

    return NextResponse.json({ 
      success: true, 
      battery: updatedBattery 
    })

  } catch (error) {
    console.error('Price update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update price' },
      { status: 500 }
    )
  }
}
