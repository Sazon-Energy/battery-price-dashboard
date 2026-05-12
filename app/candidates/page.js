'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function CandidateReview() {
  const [candidates, setCandidates] = useState([])
  const [lastDiscoveryRun, setLastDiscoveryRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adminToken, setAdminToken] = useState('')
  const [pendingActionId, setPendingActionId] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('adminToken')
    if (stored) setAdminToken(stored)
    fetchData()
  }, [])

  function persistToken(token) {
    setAdminToken(token)
    if (token) {
      sessionStorage.setItem('adminToken', token)
    } else {
      sessionStorage.removeItem('adminToken')
    }
  }

  async function fetchData() {
    try {
      setLoading(true)

      const [candidatesResult, manufacturersResult] = await Promise.all([
        supabase
          .from('battery_candidates')
          .select(`
            id,
            name,
            normalized_url,
            discovered_at,
            discovered_price,
            extracted_specs,
            manufacturers ( name )
          `)
          .eq('status', 'pending')
          .order('discovered_at', { ascending: true }),
        supabase
          .from('manufacturers')
          .select('last_searched_at')
          .order('last_searched_at', { ascending: false, nullsFirst: false })
          .limit(1)
      ])

      if (candidatesResult.error) throw candidatesResult.error
      if (manufacturersResult.error) throw manufacturersResult.error

      setCandidates(candidatesResult.data || [])
      setLastDiscoveryRun(manufacturersResult.data?.[0]?.last_searched_at || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function callAdminApi(path, body) {
    if (!adminToken) {
      const entered = window.prompt('Enter admin token:')
      if (!entered) return null
      persistToken(entered)
      return callAdminApi(path, body)
    }

    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken
      },
      body: JSON.stringify(body)
    })

    if (response.status === 401) {
      persistToken('')
      throw new Error('Unauthorized - token cleared, please try again')
    }

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Request failed')
    }
    return data
  }

  async function handleApprove(candidateId, name) {
    if (!window.confirm(`Approve "${name}" and add to tracked batteries?`)) return
    setPendingActionId(candidateId)
    setActionMessage(null)
    try {
      await callAdminApi('/api/candidates/approve', { candidateId })
      setCandidates(prev => prev.filter(c => c.id !== candidateId))
      setActionMessage({ type: 'success', text: `Approved: ${name}` })
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message })
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleReject(candidateId, name) {
    setPendingActionId(candidateId)
    setActionMessage(null)
    try {
      await callAdminApi('/api/candidates/reject', { candidateId })
      setCandidates(prev => prev.filter(c => c.id !== candidateId))
      setActionMessage({ type: 'success', text: `Rejected: ${name}` })
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message })
    } finally {
      setPendingActionId(null)
    }
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  function formatPrice(price) {
    if (price == null) return '—'
    return `$${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function formatCapacity(specs) {
    const kwh = specs?.capacity_kwh
    if (kwh == null) return '—'
    return `${kwh} kWh`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto text-center">Loading candidates...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Candidate Review</h1>
            <p className="mt-2 text-gray-600">
              {candidates.length} pending {candidates.length === 1 ? 'candidate' : 'candidates'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Last discovery run: {formatDateTime(lastDiscoveryRun)}
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            {adminToken ? (
              <button
                onClick={() => persistToken('')}
                className="underline hover:text-gray-700"
              >
                Clear admin token
              </button>
            ) : (
              <span>No admin token set</span>
            )}
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mb-4 px-4 py-3 rounded border ${
              actionMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            No pending candidates to review
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manufacturer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Battery Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discovered</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {candidates.map((candidate) => {
                  const isPending = pendingActionId === candidate.id
                  return (
                    <tr key={candidate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {candidate.manufacturers?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <a
                          href={candidate.normalized_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {candidate.name}
                        </a>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 text-right">
                        {formatCapacity(candidate.extracted_specs)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                        {formatPrice(candidate.discovered_price)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(candidate.discovered_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-right space-x-2">
                        <button
                          disabled={isPending}
                          onClick={() => handleApprove(candidate.id, candidate.name)}
                          className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => handleReject(candidate.id, candidate.name)}
                          className="px-3 py-1 rounded bg-gray-200 text-gray-800 text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500">
          Capacity is auto-extracted from the product page and may need verification. Battery class is left unset and can be assigned later.
        </div>
      </div>
    </div>
  )
}
