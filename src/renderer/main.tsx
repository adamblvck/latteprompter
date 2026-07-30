import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './components/App'
import { initPersistence } from './store/persist'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/global.css'
import './styles/components.css'

initPersistence()

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
