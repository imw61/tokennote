import { createRoot } from 'react-dom/client'
import { App } from './main/App'
import { applyPlatformMotionPreference } from './lib/platform-motion'
import { getRuntimePlatform } from './lib/platform'
import './styles.css'

applyPlatformMotionPreference()
// 触发一次平台探测，副作用是把 `platform-{name}` 类挂到 <html> 上，供 CSS 做 safe-area / 字号适配。
getRuntimePlatform()
createRoot(document.getElementById('root')!).render(<App />)
