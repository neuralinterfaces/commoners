const nameEl = document.getElementById('name')
const modeEl = document.getElementById('mode')

if (nameEl) nameEl.textContent = commoners.NAME
if (modeEl) modeEl.textContent = commoners.DEV ? 'development' : 'production'
