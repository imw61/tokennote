import { MainHeader } from './components/MainHeader'
import { MainPanels } from './components/MainPanels'
import { StationFormLayer } from './components/StationFormLayer'
import { useAppShell } from './hooks/useAppShell'

export function App() {
  const { contentKey, contentAnimationClass, headerProps, panelProps, formLayerProps } = useAppShell()

  return (
    <main className="flex flex-col min-h-screen bg-transparent">
      <div className="flex-1 flex flex-col bg-white rounded-none shadow-none overflow-hidden animate-main-entrance">
        <MainHeader {...headerProps} />

        <div key={contentKey} className={`flex-1 overflow-hidden flex flex-col ${contentAnimationClass}`}>
          <MainPanels {...panelProps} />
        </div>
      </div>

      <StationFormLayer {...formLayerProps} />
    </main>
  )
}
