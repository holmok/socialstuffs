// live preview for file inputs: <input type="file" data-preview="<img id>">
// delegated so it keeps working after HTMX swaps re-render the form
document.addEventListener('change', (event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.dataset.preview) return
  const img = document.getElementById(input.dataset.preview)
  if (!img) return
  const file = input.files?.[0]
  // <input data-filename="<el id>"> mirrors the selected file's name into that element
  if (input.dataset.filename) {
    const nameEl = document.getElementById(input.dataset.filename)
    if (nameEl) nameEl.textContent = file ? file.name : 'No file selected'
  }
  if (!file?.type.startsWith('image/')) return
  if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl)
  const url = URL.createObjectURL(file)
  img.dataset.objectUrl = url
  img.src = url
  img.hidden = false
})
