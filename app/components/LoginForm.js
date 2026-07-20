'use client'
import { useState } from 'react'

export default function LoginForm({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        setError(result.error || 'Invalid password')
        return
      }

      setPassword('')
      onSuccess()
    } catch {
      setError('Login request failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
      <label style={{fontSize: '0.875rem', color: '#333'}}>
        Admin password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
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
      {error && <div style={{color: 'red', fontSize: '0.875rem'}}>{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#0d6efd',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: submitting ? 'default' : 'pointer',
          opacity: submitting ? 0.7 : 1
        }}
      >
        {submitting ? 'Logging in...' : 'Log in'}
      </button>
    </form>
  )
}
