'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ padding: '40px', fontFamily: 'sans-serif' }}>
        <h1>Error Crítico de Sistema</h1>
        <p>{error.message}</p>
        <button onClick={() => reset()}>Reiniciar Aplicación</button>
      </body>
    </html>
  )
}
