import { createRoot } from 'react-dom/client'
import { App } from './main/App'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import './styles.css'

applyPlatformMotionPreference()
createRoot(document.getElementById('root')!).render(<App />)
