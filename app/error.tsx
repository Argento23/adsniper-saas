'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Algo salió mal en el Dashboard</h2>
      <p>{error.message}</p>
      <button
        onClick={() => reset()}
        style={{ padding: '10px 20px', cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  )
}
