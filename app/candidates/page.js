'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { checkSession, logout } from '../../lib/session-client'
import LoginForm from '../components/LoginForm'

const DEFAULT_SORT_COLUMNS = ['manufacturer', 'name', 'discovered_at']
const SORT_OPTIONS = [
  { column: 'manufacturer', label: 'Manufacturer' },
  { column: 'name', label: 'Battery Name' },
  { column: 'discovered_at', label: 'Discovered' }
]
export default function CandidateReview() {
  const [candidates, setCandidates] = useState([])
  const [lastDiscoveryRun, setLastDiscoveryRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authenticated, setAuthenticated] = useState(null)
  const [pendingActionId, setPendingActionId] = useState(null)
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [previewedCandidateId, setPreviewedCandidateId] = useState(null)
  const [resolvedCandidates, setResolvedCandidates] = useState({})

  useEffect(() => {
    checkSession().then(result => setAuthenticated(result.authenticated))
    fetchData()
  }, [])

  async function handleLogout() {
    await logout()
    setAuthenticated(false)
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
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (response.status === 401) {
      setAuthenticated(false)
      throw new Error('Session expired - please log in again.')
    }

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Request failed')
    }
    return data
  }

  function markCandidateResolved(candidateId, status) {
    setResolvedCandidates(prev => ({ ...prev, [candidateId]: status }))
  }

  function handlePreview(candidateId) {
    setPreviewedCandidateId(candidateId)
  }

  async function handleApprove(candidateId, name) {
    if (!window.confirm(`Approve "${name}" and add to tracked batteries?`)) return
    setPendingActionId(candidateId)
    try {
      await callAdminApi('/api/candidates/approve', { candidateId })
      markCandidateResolved(candidateId, 'approved')
    } catch (err) {
      window.alert(err.message)
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleReject(candidateId) {
    setPendingActionId(candidateId)
    try {
      await callAdminApi('/api/candidates/reject', { candidateId })
      markCandidateResolved(candidateId, 'rejected')
    } catch (err) {
      window.alert(err.message)
    } finally {
      setPendingActionId(null)
    }
  }

  function getSortValue(candidate, column) {
    switch (column) {
      case 'manufacturer':
        return candidate.manufacturers?.name || ''
      case 'name':
        return candidate.name || ''
      case 'discovered_at':
        return candidate.discovered_at || ''
      default:
        return ''
    }
  }

  function compareCandidates(candidateA, candidateB, column, direction) {
    const valueA = getSortValue(candidateA, column)
    const valueB = getSortValue(candidateB, column)
    const comparison = typeof valueA === 'string'
      ? valueA.localeCompare(valueB)
      : (valueA < valueB ? -1 : valueA > valueB ? 1 : 0)
    return direction === 'asc' ? comparison : -comparison
  }

  function getSortedCandidates() {
    const sorted = [...candidates]
    if (sortColumn) {
      sorted.sort((candidateA, candidateB) => compareCandidates(candidateA, candidateB, sortColumn, sortDirection))
    } else {
      sorted.sort((candidateA, candidateB) => {
        for (const column of DEFAULT_SORT_COLUMNS) {
          const comparison = compareCandidates(candidateA, candidateB, column, 'asc')
          if (comparison !== 0) return comparison
        }
        return 0
      })
    }
    return sorted
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  function sortIndicator(column) {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
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

  const pendingCount = candidates.filter(candidate => !resolvedCandidates[candidate.id]).length

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Candidate Review</h1>
            <p className="mt-2 text-gray-600">
              {pendingCount} pending {pendingCount === 1 ? 'candidate' : 'candidates'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Last discovery run: {formatDateTime(lastDiscoveryRun)}
            </p>
          </div>
          <div className="text-right text-sm">
            {authenticated === true && (
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">✓ Logged in</span>
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Log out
                </button>
              </div>
            )}
            {authenticated === false && (
              <div className="w-64">
                <LoginForm onSuccess={() => setAuthenticated(true)} />
              </div>
            )}
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            No pending candidates to review
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500 font-medium">Sort by:</span>
              {SORT_OPTIONS.map(option => (
                <button
                  key={option.column}
                  onClick={() => handleSort(option.column)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                    sortColumn === option.column
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {option.label}{sortIndicator(option.column)}
                </button>
              ))}
              {sortColumn && (
                <button
                  onClick={() => { setSortColumn(null); setSortDirection('asc') }}
                  className="text-xs text-gray-400 underline hover:text-gray-600"
                >
                  Reset to default
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {getSortedCandidates().map((candidate) => {
                const isPending = pendingActionId === candidate.id
                const isPreviewed = previewedCandidateId === candidate.id
                const resolvedStatus = resolvedCandidates[candidate.id] || null

                const cardStateClasses = resolvedStatus === 'approved'
                  ? 'border-green-200 bg-green-50/50 opacity-60 grayscale-[0.3]'
                  : resolvedStatus === 'rejected'
                  ? 'border-gray-200 bg-gray-50 opacity-50 grayscale-[0.5]'
                  : isPreviewed
                  ? 'border-blue-400 ring-2 ring-blue-300 shadow-md'
                  : 'border-gray-200 hover:shadow-md'

                return (
                  <div
                    key={candidate.id}
                    className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all duration-500 ease-out ${cardStateClasses}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {candidate.manufacturers?.name || 'Unknown'}
                      </span>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatDateTime(candidate.discovered_at)}
                      </span>
                    </div>

                    <a
                      href={candidate.normalized_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handlePreview(candidate.id)}
                      title={candidate.name}
                      className="text-[15px] font-semibold leading-snug text-gray-900 line-clamp-2 hover:text-blue-600 transition-colors"
                    >
                      {candidate.name}
                    </a>

                    <div className="flex gap-2">
                      <button
                        disabled={isPending || !!resolvedStatus}
                        onClick={() => handleApprove(candidate.id, candidate.name)}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-500 disabled:cursor-default ${
                          resolvedStatus === 'approved'
                            ? 'bg-green-600 text-white'
                            : resolvedStatus === 'rejected'
                            ? 'bg-gray-100 text-gray-300'
                            : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
                        }`}
                      >
                        {resolvedStatus === 'approved' ? '✓ Approved' : 'Approve'}
                      </button>
                      <button
                        disabled={isPending || !!resolvedStatus}
                        onClick={() => handleReject(candidate.id)}
                        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-500 disabled:cursor-default ${
                          resolvedStatus === 'rejected'
                            ? 'bg-gray-600 text-white'
                            : resolvedStatus === 'approved'
                            ? 'bg-gray-100 text-gray-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                        }`}
                      >
                        {resolvedStatus === 'rejected' ? '✕ Rejected' : 'Reject'}
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-2xl font-bold tracking-tight text-gray-900">
                        {formatPrice(candidate.discovered_price)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {formatCapacity(candidate.extracted_specs)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-6 text-xs text-gray-500">
          Capacity is auto-extracted from the product page and may need verification. Battery class is left unset and can be assigned later.
        </div>
      </div>
    </div>
  )
}
