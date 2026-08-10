// live character counters: <textarea data-charcount="<counter el id>" data-charmax="500">
// the counter goes yellow within 50 characters of the limit, red over it, and the
// textarea text also turns red when over. delegated so it keeps working after HTMX swaps
const WARN_MARGIN = 50

function updateCount(area) {
  const counter = document.getElementById(area.dataset.charcount)
  const max = Number.parseInt(area.dataset.charmax || '', 10)
  if (!counter || !max) return
  const length = area.value.length
  counter.textContent = `${length}/${max} characters`
  counter.classList.toggle('warn', length >= max - WARN_MARGIN && length <= max)
  counter.classList.toggle('over', length > max)
  area.classList.toggle('over-limit', length > max)
}

function initCounts() {
  for (const area of document.querySelectorAll('textarea[data-charcount]')) updateCount(area)
}

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLTextAreaElement && event.target.dataset.charcount) updateCount(event.target)
})
document.addEventListener('DOMContentLoaded', initCounts)
// forms re-rendered by HTMX (validation errors) come back pre-filled and need their counters refreshed
document.addEventListener('htmx:afterSwap', initCounts)
