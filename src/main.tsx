import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { FamilyProvider } from './contexts/FamilyContext'
import { App } from './App'
import './styles/theme.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <FamilyProvider>
        <App />
        <Toaster position="top-right" />
      </FamilyProvider>
    </AuthProvider>
  </React.StrictMode>
)
