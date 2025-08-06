'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [batteryClasses, setBatteryClasses] = useState([])
  const [batteries, setBatteries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Name</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Capacity (kWh)</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Continuous Power (W)</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Peak Power (W)</th>
              </tr>
            </thead>
            <tbody>
              {batteryClasses.map((cls) => (
                <tr key={cls.id}>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{cls.short_name}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{cls.capacity_kwh}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{cls.cpower_w}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{cls.ppower_w}</td>
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
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Name</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Supplier</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Current Price</th>
                <th style={{padding: '0.5rem', border: '1px solid #ddd'}}>Class</th>
              </tr>
            </thead>
            <tbody>
              {batteries.map((battery) => (
                <tr key={battery.id}>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{battery.name}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>{battery.supplier}</td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                    {battery.current_price ? `$${battery.current_price}` : 'No price'}
                  </td>
                  <td style={{padding: '0.5rem', border: '1px solid #ddd'}}>
                    {battery.battery_classes?.short_name || 'No class'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}