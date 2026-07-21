import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import { applyTheme, readStoredTheme } from './utils/theme'

// React 렌더링 전에 테마를 먼저 적용해 FOUC(테마 깜빡임)를 방지한다.
applyTheme(readStoredTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
