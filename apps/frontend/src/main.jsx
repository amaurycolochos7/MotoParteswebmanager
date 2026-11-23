import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './i18n' // inicializa i18next antes de montar la app
import './styles/theme.css' // tema "taller": tokens y carcasa (va después de index.css)
import './styles/primitives.css' // piezas nuevas del sistema de diseño
import './styles/legacy.css' // ajustes V3 de pantallas heredadas
import { startUpdateCheck } from './lib/updateCheck'
import { installDomGuard } from './lib/domGuard'

installDomGuard() // que un traductor/extensión no tumbe la app (ver lib/domGuard.js)
startUpdateCheck() // se recarga sola cuando sale una versión nueva

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
