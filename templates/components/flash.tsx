import type { Flashes } from '@middleware/flash-middleware'

interface FlashProps {
  flashes: Flashes
}

const Flash = (props: FlashProps) => {
  const { success, error, info } = props.flashes
  const items = [
    ...error.map((message) => ({ type: 'error', message })),
    ...success.map((message) => ({ type: 'success', message })),
    ...info.map((message) => ({ type: 'info', message }))
  ]
  if (items.length === 0) return null
  return (
    <div className="flash">
      {items.map(({ type, message }, index) => (
        <div key={`flash-${type}-${index}`} className={`flash-item flash-${type}`} role={type === 'error' ? 'alert' : 'status'}>
          <p>{message}</p>
          <button type="button" className="flash-close" aria-label="Dismiss message">
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}

export default Flash
