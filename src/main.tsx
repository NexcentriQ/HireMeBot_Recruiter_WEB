import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { configureAmplify } from './features/auth/amplifyConfig'
import './styles/globals.css'

// Before the first render: on /auth/callback Amplify finishes the OAuth code
// exchange as soon as it is configured, and AuthProvider waits for that.
configureAmplify()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
