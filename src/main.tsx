import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const ownerName = import.meta.env.VITE_OWNER_NAME as string | undefined
if (ownerName) document.title = `${ownerName}'s Sheets`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
