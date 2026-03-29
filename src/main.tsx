import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from 'sonner'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Suspense>
            <App />
            <Toaster />
        </Suspense>
    </StrictMode>,
)
