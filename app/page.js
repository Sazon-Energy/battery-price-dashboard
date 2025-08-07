'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [batteryClasses, setBatteryClasses] = useState([])
  const [batteries, setBatteries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState({})
  
  // Price history modal state
  const [showPriceHistory, setShowPriceHistory] = useState(false)
  const [selectedBattery, setSelectedBattery] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

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

  async function showBatteryHistory(battery) {
    setSelectedBattery(battery)
    setShowPriceHistory(true)
    setLoadingHistory(true)
    
    try {
      const { data: history, error } = await supabase
        .from('price_history')
        .select('price, scraped_at')
        .eq('battery_id', battery.id)
        .order('scraped_at', { ascending: false })
        .limit(50) // Show last 50 price updates
      
      if (error) throw error
      setPriceHistory(history || [])
    } catch (error) {
      console.error('Error fetching price history:', error)
      setPriceHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  function closePriceHistory() {
    setShowPriceHistory(false)
    setSelectedBattery(null)
    setPriceHistory([])
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
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                    <a href={battery.target_url} target="_blank" rel="noopener noreferrer">{battery.name}</a>
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{battery.supplier}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>
                    {battery.current_price ? `$${battery.current_price}` : 'No price'}
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                    {battery.battery_classes?.short_name || 'No class'}
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'center'}}>
                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
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
                      <button
                        onClick={() => showBatteryHistory(battery)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.875rem',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        View History
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
        <p style={{margin: 0, fontSize: '0.875rem', color: '#666'}}>
          💡 Click "Update Price" to manually enter new prices or "View History" to see price trends over time.
          Each update is saved to the database and price history.
        </p>
      </div>

      {/* Price History Modal */}
      {showPriceHistory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            maxWidth: '600px',
            maxHeight: '80vh',
            width: '90%',
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              borderBottom: '1px solid #eee',
              paddingBottom: '1rem'
            }}>
              <h3 style={{margin: 0, fontSize: '1.25rem'}}>
                Price History: {selectedBattery?.name}
              </h3>
              <button
                onClick={closePriceHistory}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  borderRadius: '4px',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {loadingHistory ? (
              <div style={{textAlign: 'center', padding: '2rem'}}>Loading price history...</div>
            ) : priceHistory.length > 0 ? (
              <div>
                <p style={{marginBottom: '1rem', color: '#666', fontSize: '0.875rem'}}>
                  Showing last {priceHistory.length} price updates
                </p>
                <div style={{overflowY: 'auto', maxHeight: '400px'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd'}}>
                    <thead style={{position: 'sticky', top: 0, backgroundColor: 'white'}}>
                      <tr style={{backgroundColor: '#f5f5f5'}}>
                        <th style={{padding: '0.75rem', border: '1px solid #ddd', textAlign: 'left'}}>Date</th>
                        <th style={{padding: '0.75rem', border: '1px solid #ddd', textAlign: 'right'}}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((entry, index) => (
                        <tr key={index}>
                          <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                            {new Date(entry.scraped_at).toLocaleDateString()} {new Date(entry.scraped_at).toLocaleTimeString()}
                          </td>
                          <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold'}}>
                            ${entry.price}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{textAlign: 'center', padding: '2rem', color: '#666'}}>
                No price history available for this battery yet.
              </div>
            )}

            <div style={{marginTop: '1rem', textAlign: 'right'}}>
              <button
                onClick={closePriceHistory}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}