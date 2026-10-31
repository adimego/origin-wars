import { useState } from 'react'
import { SPEED_PRESETS } from '@/game/config/world.ts'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useGame } from './game-context.tsx'
import { clockNow, coords } from './format.ts'

export function TitleScreen() {
  const { state, realNow, begin, enter } = useGame()
  const [drafting, setDrafting] = useState(!state)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState('Warden')
  const [seed, setSeed] = useState('')
  const [speed, setSpeed] = useState(20)
  const home = state?.towns.find((town) => town.id === state.selectedTownId)

  const start = () => {
    begin({ speed, seed, name })
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(226,180,90,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(226,180,90,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
        <p className="text-xs tracking-[0.35em] text-brass">A BROWSER REALM</p>
        <h1 className="mt-3 font-display text-5xl text-brass-2 sm:text-7xl">Origin Wars</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Hold a town on a shared map. Timber, clay, and iron arrive on their own clock. Rival lords sleep, get pulled
          away, and do not answer the horn the moment you blow it.
        </p>

        {state && !drafting ? (
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={enter}>
              Continue campaign
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setDrafting(true)}>
              Start a different realm
            </Button>
          </div>
        ) : null}

        {state && !drafting && home ? (
          <p className="mt-4 text-sm text-faint">
            {home.name} ({coords(home.x, home.y)}) · {clockNow(state, realNow)} · {state.speed}×
          </p>
        ) : null}

        {drafting ? (
          <form
            className="mt-10 space-y-6 rounded-lg border border-line bg-panel/90 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (state) setConfirming(true)
              else start()
            }}
          >
            <div>
              <label className="text-xs tracking-wide text-muted" htmlFor="lord-name">
                Your name
              </label>
              <Input id="lord-name" className="mt-1.5" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
            </div>
            <fieldset>
              <legend className="text-xs tracking-wide text-muted">World speed</legend>
              <p className="mt-1 text-sm text-faint">
                One clock for the whole realm. It is a setting, not a purchase. Timers and farms still matter.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSpeed(preset.speed)}
                    className={`rounded-md border px-3 py-3 text-left ${speed === preset.speed ? 'border-brass bg-brass/10' : 'border-line bg-ink/40'}`}
                  >
                    <span className="block font-medium text-parchment">
                      {preset.label} <span className="num text-brass">{preset.speed}×</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted">{preset.detail}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="text-xs tracking-wide text-muted" htmlFor="seed">
                Map seed <span className="text-faint">(optional)</span>
              </label>
              <Input
                id="seed"
                className="mt-1.5"
                value={seed}
                placeholder="Leave blank for a fresh map"
                onChange={(event) => setSeed(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="lg">
                Found a town
              </Button>
              {state ? (
                <Button type="button" variant="ghost" onClick={() => setDrafting(false)}>
                  Back
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle className="font-display text-xl text-brass-2">Replace this campaign?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted">
            The saved realm on this browser will be overwritten. There is no second copy.
          </DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button
              onClick={() => {
                setConfirming(false)
                start()
              }}
            >
              Replace it
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
