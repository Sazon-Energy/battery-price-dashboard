'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkSession } from '../lib/session-client'
import LoginForm from './components/LoginForm'

export default function Home() {
  const [batteryClasses, setBatteryClasses] = useState([])
  const [batteries, setBatteries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Price history modal state
  const [showPriceHistory, setShowPriceHistory] = useState(false)
  const [selectedBattery, setSelectedBattery] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Actions menu state
  const [openMenuBatteryId, setOpenMenuBatteryId] = useState(null)

  // Edit overlay state
  const [showEditOverlay, setShowEditOverlay] = useState(false)
  const [editingBattery, setEditingBattery] = useState(null)
  const [editName, setEditName] = useState('')
  const [editClassId, setEditClassId] = useState('')
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editAuthenticated, setEditAuthenticated] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (openMenuBatteryId === null) return

    function handleClickOutside(event) {
      if (!event.target.closest('[data-menu-root]')) {
        setOpenMenuBatteryId(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuBatteryId])

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

  function toggleMenu(batteryId) {
    setOpenMenuBatteryId(prev => (prev === batteryId ? null : batteryId))
  }

  async function showBatteryHistory(battery) {
    setShowEditOverlay(false)
    setSelectedBattery(battery)
    setShowPriceHistory(true)
    setLoadingHistory(true)

    try {
      // Use secure API route instead of direct Supabase call
      const response = await fetch(`/api/price-history?batteryId=${battery.id}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch price history')
      }

      setPriceHistory(result.history || [])
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

  function openEditOverlay(battery) {
    setShowPriceHistory(false)
    setEditingBattery(battery)
    setEditName(battery.name || '')
    setEditClassId(battery.battery_class_id || '')
    setEditError(null)
    setEditSaving(false)
    setShowEditOverlay(true)
    setEditAuthenticated(null)
    checkSession().then(result => setEditAuthenticated(result.authenticated))
  }

  function closeEditOverlay() {
    setShowEditOverlay(false)
    setEditingBattery(null)
    setEditName('')
    setEditClassId('')
    setEditError(null)
    setEditSaving(false)
  }

  async function handleSaveEdit() {
    if (editName.trim().length === 0) {
      setEditError('Name is required')
      return
    }

    setEditSaving(true)
    setEditError(null)

    try {
      const response = await fetch(`/api/batteries/${editingBattery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          battery_class_id: editClassId || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          setEditAuthenticated(false)
          return
        }
        setEditError(result.error || 'Failed to save changes')
        return
      }

      setBatteries(prev => prev.map(battery =>
        battery.id === editingBattery.id
          ? { ...battery, name: result.battery.name, battery_class_id: result.battery.battery_class_id, battery_classes: result.battery.battery_classes }
          : battery
      ))
      closeEditOverlay()
    } catch (error) {
      setEditError(error.message || 'Failed to save changes')
    } finally {
      setEditSaving(false)
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
                    <div style={{position: 'relative', display: 'inline-block'}} data-menu-root>
                      <button
                        onClick={() => toggleMenu(battery.id)}
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
                        Actions ▾
                      </button>
                      {openMenuBatteryId === battery.id && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                          zIndex: 10,
                          minWidth: '140px',
                          marginTop: '0.25rem'
                        }}>
                          <button
                            onClick={() => { setOpenMenuBatteryId(null); showBatteryHistory(battery) }}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              textAlign: 'left',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            View History
                          </button>
                          <button
                            onClick={() => { setOpenMenuBatteryId(null); openEditOverlay(battery) }}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              textAlign: 'left',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      {/* Edit Overlay */}
      {showEditOverlay && (
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
          zIndex: 1001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '95vw',
            height: '90vh',
            display: 'flex',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Left panel: summary + edit form */}
            <div style={{
              width: '38%',
              minWidth: '320px',
              padding: '1.5rem',
              overflowY: 'auto',
              borderRight: '1px solid #eee',
              display: 'flex',
              flexDirection: 'column'
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
                  Edit: {editingBattery?.name}
                </h3>
                <button
                  onClick={closeEditOverlay}
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

              <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd', marginBottom: '1.5rem'}}>
                <tbody>
                  <tr>
                    <td style={{padding: '0.5rem', border: '1px solid #ddd', fontWeight: 'bold', backgroundColor: '#f5f5f5'}}>Current Price</td>
                    <td style={{padding: '0.5rem', border: '1px solid #ddd', textAlign: 'right'}}>
                      {editingBattery?.current_price ? `$${editingBattery.current_price}` : 'No price'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {editAuthenticated === null && (
                <div style={{color: '#666', fontSize: '0.875rem'}}>Checking session...</div>
              )}

              {editAuthenticated === false && (
                <LoginForm onSuccess={() => setEditAuthenticated(true)} />
              )}

              {editAuthenticated === true && (
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  <label style={{fontSize: '0.875rem', color: '#333'}}>
                    Name
                    <input
                      type="text"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.25rem',
                        padding: '0.5rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    />
                  </label>

                  <label style={{fontSize: '0.875rem', color: '#333'}}>
                    Class
                    <select
                      value={editClassId}
                      onChange={(event) => setEditClassId(event.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.25rem',
                        padding: '0.5rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="">No class</option>
                      {batteryClasses.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.short_name}</option>
                      ))}
                    </select>
                  </label>

                  {editError && (
                    <div style={{color: 'red', fontSize: '0.875rem'}}>{editError}</div>
                  )}

                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: editSaving ? 'default' : 'pointer',
                        opacity: editSaving ? 0.7 : 1
                      }}
                    >
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={closeEditOverlay}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel: product page reference */}
            <div style={{
              flex: 1,
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <a
                href={editingBattery?.target_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{marginBottom: '0.75rem', fontSize: '0.875rem'}}
              >
                Open product page in new tab ↗
              </a>
              <iframe
                src={editingBattery?.target_url}
                title="Product page preview"
                sandbox="allow-same-origin allow-scripts"
                style={{flex: 1, width: '100%', border: '1px solid #ddd', borderRadius: '4px'}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
