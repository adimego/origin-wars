import {
  Castle,
  Flag,
  Hammer,
  Map as MapIcon,
  ScrollText,
  Swords,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { SPEED_PRESETS } from '@/game/config/world.ts'
import { townProduction } from '@/game/sim/formulas.ts'
import { populationCapacity } from '@/game/sim/formulas.ts'
import { townPopulationUsed } from '@/game/sim/population.ts'
import { Button } from '@/components/ui/button.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx'
import { useState } from 'react'
import { BuildingsScreen } from './BuildingsScreen.tsx'
import { clockNow, coords, formatCount, formatRate, formatReal, realLeft } from './format.ts'
import { useGame, type Screen } from './game-context.tsx'
import { MapScreen } from './MapScreen.tsx'
import { MarchesScreen } from './MarchesScreen.tsx'
import { Overview } from './Overview.tsx'
import { RecruitScreen } from './RecruitScreen.tsx'
import { ReportsScreen } from './ReportsScreen.tsx'
import { ResourceIcon } from './bits.tsx'
import { TownsScreen } from './TownsScreen.tsx'

const NAV: { id: Screen; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Town', icon: Castle },
  { id: 'buildings', label: 'Build', icon: Hammer },
  { id: 'recruit', label: 'Recruit', icon: Swords },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'marches', label: 'Marches', icon: Flag },
  { id: 'reports', label: 'Reports', icon: ScrollText },
  { id: 'towns', label: 'Towns', icon: Users },
]

export function Shell() {
  const { state, realNow, screen, setScreen, catchup, dismissCatchup, selectTown, setSpeed, setBotClock, abandon, withdrawSiege, sally, callAid } = useGame()
  const [leaving, setLeaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId) ?? state.towns.find((entry) => entry.ownerId === state.playerId)
  const owned = state.towns.filter((entry) => entry.ownerId === state.playerId)
  const rates = town ? townProduction(town) : { wood: 0, clay: 0, iron: 0 }
  const unread = state.reports.filter((report) => report.ownerId === state.playerId && report.unread).length
  const incoming = state.movements.filter((movement) => {
    const target = state.towns.find((entry) => entry.id === movement.targetTownId)
    return target?.ownerId === state.playerId && (movement.mission === 'attack' || movement.mission === 'scout')
  }).length
  const pop = town ? townPopulationUsed(town, state) : 0
  const cap = town ? populationCapacity(town.buildings.farm) : 0

  const badgeFor = (id: Screen) => {
    if (id === 'reports' && unread > 0) return unread
    if (id === 'marches' && incoming > 0) return incoming
    return 0
  }

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <header className="border-b border-line bg-ink/80">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 md:px-4">
          <div className="mr-auto flex items-center gap-3">
            <p className="font-display text-sm tracking-[0.18em] text-brass">Origin Wars</p>
            {town ? (
              <label className="text-sm">
                <span className="sr-only">Operating town</span>
                <select
                  className="rounded-md border border-line bg-panel px-2 py-1 text-parchment"
                  value={town.id}
                  onChange={(event) => selectTown(event.target.value)}
                >
                  {owned.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ({coords(entry.x, entry.y)})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-sm text-blood">No town</span>
            )}
          </div>
          {town
            ? (['wood', 'clay', 'iron'] as const).map((key) => (
                <div key={key} className="num flex items-center gap-1.5 text-sm">
                  <ResourceIcon kind={key} />
                  <span>{formatCount(town.resources[key])}</span>
                  <span className="text-xs text-faint">+{formatRate(rates[key])}/h</span>
                </div>
              ))
            : null}
          <div className="num text-xs text-muted">
            Pop {formatCount(pop)}/{formatCount(cap)}
          </div>
          <div className="num text-xs text-brass-2">{clockNow(state, realNow)}</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="text-xs text-muted">
                <span className="sr-only">World speed</span>
                <select
                  className="rounded-md border border-line bg-panel px-2 py-1 text-parchment"
                  value={state.speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                >
                  {SPEED_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.speed}>
                      {preset.label} {preset.speed}×
                    </option>
                  ))}
                  {SPEED_PRESETS.some((preset) => preset.speed === state.speed) ? null : (
                    <option value={state.speed}>{state.speed}×</option>
                  )}
                </select>
              </label>
            </TooltipTrigger>
            <TooltipContent>World speed compresses the clock for everyone. It is not a purchase.</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-parchment"
                onClick={() => setBotClock(state.botClock === 'compressed' ? 'real' : 'compressed')}
              >
                Bots: {state.botClock === 'compressed' ? 'Fast hours' : 'Real hours'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Real hours keep each lord on a wall clock in their time zone. Fast hours compress sleep and reaction delay with the game clock, for testing.
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>
            Leave
          </Button>
        </div>
      </header>

      {catchup ? (
        <div className="border-b border-brass-dim bg-brass/10 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-brass-2">While you were away</p>
              <ul className="mt-1 text-muted">
                {catchup.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <Button size="sm" variant="secondary" onClick={dismissCatchup}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {state.sieges
        .filter((siege) => state.towns.some((town) => town.id === siege.townId && (town.ownerId === state.playerId || siege.attackerOwnerId === state.playerId)))
        .map((siege) => {
          const town = state.towns.find((entry) => entry.id === siege.townId)
          const mine = siege.attackerOwnerId === state.playerId
          return (
            <div key={siege.id} className={`border-b px-4 py-3 text-sm ${mine ? 'border-brass-dim bg-brass/10' : 'border-blood/40 bg-blood/15'}`}>
              <p className="font-medium">
                {mine ? `You are besieging ${town?.name ?? 'a town'}` : `${town?.name ?? 'A town'} is under siege`}
                <span className="num"> · {formatReal(realLeft(state, realNow, siege.endsAt))} left</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {town && !mine ? (
                  <Button size="sm" onClick={() => selectTown(town.id, true)}>
                    Open town
                  </Button>
                ) : null}
                {town && !mine ? (
                  <Button size="sm" variant="secondary" onClick={() => setNotice(sally(town.id))}>
                    Sally
                  </Button>
                ) : null}
                {town && !mine ? (
                  <Button size="sm" variant="secondary" onClick={() => setNotice(callAid(town.id))}>
                    Call for aid
                  </Button>
                ) : null}
                {mine ? (
                  <Button size="sm" variant="secondary" onClick={() => setNotice(withdrawSiege(siege.id))}>
                    Lift siege
                  </Button>
                ) : null}
                {notice ? <p className="w-full text-xs text-blood">{notice}</p> : null}
              </div>
            </div>
          )
        })}

      {state.defeated ? (
        <div className="border-b border-blood/40 bg-blood/15 px-4 py-3 text-sm">
          Your last town has fallen. The map is still there to read. Found another realm when you are ready.
        </div>
      ) : null}

      <div className="md:grid md:grid-cols-[92px_1fr]">
        <nav className="hidden border-r border-line md:flex md:flex-col md:gap-1 md:p-2">
          {NAV.map((item) => (
            <NavButton key={item.id} item={item} active={screen === item.id} badge={badgeFor(item.id)} onClick={() => setScreen(item.id)} />
          ))}
        </nav>
        <main className="min-w-0 px-3 py-4 md:px-6">
          {screen === 'overview' ? <Overview /> : null}
          {screen === 'buildings' ? <BuildingsScreen /> : null}
          {screen === 'recruit' ? <RecruitScreen /> : null}
          {screen === 'map' ? <MapScreen /> : null}
          {screen === 'marches' ? <MarchesScreen /> : null}
          {screen === 'reports' ? <ReportsScreen /> : null}
          {screen === 'towns' ? <TownsScreen /> : null}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-ink/95 md:hidden">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${screen === item.id ? 'text-brass' : 'text-faint'}`}
            onClick={() => setScreen(item.id)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {badgeFor(item.id) > 0 ? <Badge className="absolute right-1 top-1">{badgeFor(item.id)}</Badge> : null}
          </button>
        ))}
      </nav>

      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent>
          <DialogTitle className="font-display text-xl text-brass-2">Leave this realm?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted">
            The campaign saved in this browser will be deleted.
          </DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                setLeaving(false)
                abandon()
              }}
            >
              Delete campaign
            </Button>
            <Button variant="secondary" onClick={() => setLeaving(false)}>
              Stay
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: (typeof NAV)[number]
  active: boolean
  badge: number
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] ${active ? 'bg-brass/15 text-brass-2' : 'text-muted hover:bg-white/5'}`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
      {badge > 0 ? <Badge className="absolute right-1 top-1">{badge}</Badge> : null}
    </button>
  )
}
