'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [batteryClasses, setBatteryClasses] = useState([])
  const [batteries, setBatteries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      // Fetch battery classes
      const { data: classes, error: classError } = await supabase
        .from('battery_classes')
        .select('*')
        .order('short_name')
      
      if (classError) throw classError

      // Fetch batteries with their classes
      const { data: batteries, error: batteryError } = await supabase
        .from('batteries')
        .select(`
          *,
          battery_classes (
            short_name,
            capacity_kwh,
            cpower_w,
            ppower_w
          )
        `)
        .order('name')
      
      if (batteryError) throw batteryError

      setBatteryClasses(classes)
      setBatteries(batteries)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function updatePrice(batteryId, currentPrice) {
    const newPrice = prompt(`Enter new price for this battery:`, currentPrice || '')
    
    if (!newPrice || newPrice === currentPrice?.toString()) {
      return // User cancelled or entered same price
    }

    const priceFloat = parseFloat(newPrice)
    if (isNaN(priceFloat) || priceFloat < 0) {
      alert('Please enter a valid positive number')
      return
    }

    setUpdating(prev => ({ ...prev, [batteryId]: true }))

    try {
      const response = await fetch('/api/update-price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batteryId,
          newPrice: priceFloat
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update price')
      }

      // Refresh data to show updated price
      await fetchData()
      
      alert(`Price updated successfully to $${priceFloat}`)

    } catch (error) {
      alert(`Failed to update price: ${error.message}`)
    } finally {
      setUpdating(prev => ({ ...prev, [batteryId]: false }))
    }
  }

  if (loading) return <div style={{padding: '2rem'}}>Loading...</div>
  if (error) return <div style={{padding: '2rem', color: 'red'}}>Error: {error}</div>

  return (
    <div style={{padding: '2rem'}}>
      <h1 style={{fontSize: '2rem', marginBottom: '2rem'}}>Battery Price Dashboard</h1>
      
      {/* Battery Classes Section */}
      <div style={{marginBottom: '3rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '1rem'}}>Battery Classes</h2>
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd'}}>
            <thead>
              <tr style={{backgroundColor: '#f5f5f5'}}>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left'}}>Name</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>Capacity (kWh)</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>Continuous Power (W)</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>Peak Power (W)</th>
              </tr>
            </thead>
            <tbody>
              {batteryClasses.map((cls) => (
                <tr key={cls.id}>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{cls.short_name}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>{cls.capacity_kwh}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>{cls.cpower_w.toLocaleString()}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>{cls.ppower_w.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batteries Section */}
      <div>
        <h2 style={{fontSize: '1.5rem', marginBottom: '1rem'}}>Batteries</h2>
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd'}}>
            <thead>
              <tr style={{backgroundColor: '#f5f5f5'}}>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left'}}>Name</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left'}}>Supplier</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>Current Price</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left'}}>Class</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'center'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batteries.map((battery) => (
                <tr key={battery.id}>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}><a href={battery.target_url} target="_blank">{battery.name}</a></td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{battery.supplier}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>
                    {battery.current_price ? `$${battery.current_price}` : 'No price'}
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                    {battery.battery_classes?.short_name || 'No class'}
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'center'}}>
                    <button
                      onClick={() => updatePrice(battery.id, battery.current_price)}
                      disabled={updating[battery.id]}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.875rem',
                        backgroundColor: updating[battery.id] ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: updating[battery.id] ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {updating[battery.id] ? 'Updating...' : 'Update Price'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
        <p style={{margin: 0, fontSize: '0.875rem', color: '#666'}}>
          💡 Click "Update Price" to manually enter new prices. 
          Each update is saved to the database and price history.
        </p>
      </div>
    </div>
  )
}
