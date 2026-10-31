import { TooltipProvider } from '@/components/ui/tooltip.tsx'
import { GameProvider, useGame } from '@/ui/game-context.tsx'
import { Shell } from '@/ui/Shell.tsx'
import { TitleScreen } from '@/ui/TitleScreen.tsx'

function Frame() {
  const { state, entered } = useGame()
  if (!state || !entered) return <TitleScreen />
  return <Shell />
}

export default function App() {
  return (
    <TooltipProvider>
      <GameProvider>
        <Frame />
      </GameProvider>
    </TooltipProvider>
  )
}
