import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { BuildingId, ResourceKey, Resources, UnitId } from '@/game/config/ids.ts'
import { hashSeed } from '@/game/sim/rng.ts'
import { clearGame, loadGame, saveGame } from '@/game/sim/persist.ts'
import { act, advance, callForAid, projectGameTime, sally, setBotClock, setWorldSpeed, summarizeOffline, withdrawSiege } from '@/game/sim/engine.ts'
import { cancelLastBuild, enqueueBuilding } from '@/game/sim/buildings.ts'
import { enqueueRecruit, startResearch } from '@/game/sim/recruit.ts'
import { exchangeResources, sendArmy, shipResources } from '@/game/sim/commands.ts'
import { newGame } from '@/game/sim/worldgen.ts'
import type { GameState, UnitCounts } from '@/game/sim/types.ts'

export type Screen = 'overview' | 'buildings' | 'recruit' | 'map' | 'marches' | 'reports' | 'towns'

interface BeginOptions {
  speed: number
  seed: string
  name: string
  botClock: 'real' | 'compressed'
}

interface GameApi {
  state: GameState | null
  realNow: number
  gameNow: number
  entered: boolean
  screen: Screen
  catchup: string[] | null
  setScreen: (screen: Screen) => void
  enter: () => void
  begin: (options: BeginOptions) => void
  abandon: () => void
  dismissCatchup: () => void
  selectTown: (townId: string, openOverview?: boolean) => void
  setSpeed: (speed: number) => void
  setBotClock: (mode: 'real' | 'compressed') => void
  build: (buildingId: BuildingId) => string | null
  cancelBuild: () => string | null
  recruit: (unitId: UnitId, count: number) => string | null
  research: (unitId: UnitId) => string | null
  send: (fromId: string, toId: string, mission: 'attack' | 'siege' | 'relief' | 'support' | 'scout', units: Partial<UnitCounts>, catapultTarget: BuildingId | null) => string | null
  withdrawSiege: (siegeId: string) => string | null
  sally: (townId: string) => string | null
  callAid: (townId: string) => string | null
  exchange: (give: ResourceKey, receive: ResourceKey, amount: number) => string | null
  ship: (fromId: string, toId: string, cargo: Resources) => string | null
  markRead: (id: string) => void
  markAllRead: () => void
}

const GameContext = createContext<GameApi | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    const loaded = loadGame()
    const now = Date.now()
    if (!loaded) return { state: null as GameState | null, lines: [] as string[], now }
    const next = advance(loaded, now)
    const lines = now - loaded.lastRealMs > 8000 ? summarizeOffline(loaded, next) : []
    return { state: next, lines, now }
  })
  const [state, setState] = useState<GameState | null>(boot.state)
  const [realNow, setRealNow] = useState(boot.now)
  const [entered, setEntered] = useState(false)
  const [screen, setScreen] = useState<Screen>('overview')
  const [catchup, setCatchup] = useState<string[] | null>(boot.lines.length ? boot.lines : null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      setRealNow(now)
      setState((current) => (current ? advance(current, now) : current))
    }, 250)
    const onFocus = () => {
      const now = Date.now()
      setRealNow(now)
      setState((current) => (current ? advance(current, now) : current))
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const id = window.setTimeout(() => saveGame(state), 400)
    const onHide = () => saveGame(state)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pagehide', onHide)
    }
  }, [state])

  const run = (fn: (draft: GameState) => string | null) => {
    let error: string | null = 'No campaign is loaded.'
    flushSync(() => {
      setState((current) => {
        if (!current) return current
        const result = act(current, Date.now(), (draft) => {
          if (draft.defeated) return 'Your last town has fallen.'
          return fn(draft)
        })
        error = result.error
        return result.state
      })
      setRealNow(Date.now())
    })
    return error
  }

  const ownTown = (draft: GameState) => draft.towns.find((town) => town.id === draft.selectedTownId && town.ownerId === draft.playerId)

  const api: GameApi = {
    state,
    realNow,
    gameNow: state ? projectGameTime(state, realNow) : 0,
    entered,
    screen,
    catchup,
    setScreen,
    enter: () => setEntered(true),
    begin: ({ speed, seed, name, botClock }) => {
      const numeric = seed.trim() ? hashSeed(seed.trim()) : hashSeed(`${Date.now()}-${Math.random()}`)
      const next = newGame({ speed, seed: numeric, realNow: Date.now(), playerName: name, botClock })
      setState(next)
      saveGame(next)
      setCatchup(null)
      setScreen('overview')
      setEntered(true)
      setRealNow(Date.now())
    },
    abandon: () => {
      clearGame()
      setState(null)
      setEntered(false)
      setCatchup(null)
      setScreen('overview')
    },
    dismissCatchup: () => setCatchup(null),
    selectTown: (townId, openOverview = false) => {
      setState((current) => {
        if (!current) return current
        const town = current.towns.find((entry) => entry.id === townId && entry.ownerId === current.playerId)
        if (!town) return current
        return { ...current, selectedTownId: townId }
      })
      if (openOverview) setScreen('overview')
    },
    setSpeed: (speed) => {
      setState((current) => (current ? setWorldSpeed(current, speed, Date.now()) : current))
      setRealNow(Date.now())
    },
    setBotClock: (mode) => {
      setState((current) => (current ? setBotClock(current, mode, Date.now()) : current))
      setRealNow(Date.now())
    },
    build: (buildingId) => run((draft) => {
      const town = ownTown(draft)
      if (!town) return 'Choose one of your towns first.'
      return enqueueBuilding(draft, town.id, buildingId)
    }),
    cancelBuild: () => run((draft) => {
      const town = ownTown(draft)
      if (!town) return 'Choose one of your towns first.'
      return cancelLastBuild(draft, town.id)
    }),
    recruit: (unitId, count) => run((draft) => {
      const town = ownTown(draft)
      if (!town) return 'Choose one of your towns first.'
      return enqueueRecruit(draft, town.id, unitId, count)
    }),
    research: (unitId) => run((draft) => {
      const town = ownTown(draft)
      if (!town) return 'Choose one of your towns first.'
      return startResearch(draft, town.id, unitId)
    }),
    send: (fromId, toId, mission, units, catapultTarget) => run((draft) => {
      const from = draft.towns.find((town) => town.id === fromId)
      if (!from || from.ownerId !== draft.playerId) return 'You can only march from your own town.'
      return sendArmy(draft, fromId, toId, mission, units, catapultTarget)
    }),
    withdrawSiege: (siegeId) => run((draft) => {
      const siege = draft.sieges.find((entry) => entry.id === siegeId)
      if (!siege || siege.attackerOwnerId !== draft.playerId) return 'That camp is not yours.'
      return withdrawSiege(draft, siegeId)
    }),
    sally: (townId) => run((draft) => {
      const town = draft.towns.find((entry) => entry.id === townId)
      if (!town || town.ownerId !== draft.playerId) return 'That is not your town.'
      return sally(draft, townId)
    }),
    callAid: (townId) => run((draft) => {
      const town = draft.towns.find((entry) => entry.id === townId)
      if (!town || town.ownerId !== draft.playerId) return 'That is not your town.'
      return callForAid(draft, townId)
    }),
    exchange: (give, receive, amount) => run((draft) => {
      const town = ownTown(draft)
      if (!town) return 'Choose one of your towns first.'
      return exchangeResources(draft, town.id, give, receive, amount)
    }),
    ship: (fromId, toId, cargo) => run((draft) => {
      const from = draft.towns.find((town) => town.id === fromId)
      if (!from || from.ownerId !== draft.playerId) return 'Those are not your merchants.'
      return shipResources(draft, fromId, toId, cargo)
    }),
    markRead: (id) => {
      setState((current) => {
        if (!current) return current
        return {
          ...current,
          reports: current.reports.map((report) => (report.id === id ? { ...report, unread: false } : report)),
        }
      })
    },
    markAllRead: () => {
      setState((current) => {
        if (!current) return current
        return {
          ...current,
          reports: current.reports.map((report) =>
            report.ownerId === current.playerId ? { ...report, unread: false } : report,
          ),
        }
      })
    },
  }

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}

export function useGame(): GameApi {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}
