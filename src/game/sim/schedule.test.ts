import { describe, expect, it } from 'vitest'
import { advance, callForAid } from './engine.ts'
import { newGame } from './worldgen.ts'
import { AI_CONFIG } from '../config/ai.ts'
import { chooseBuild } from './ai.ts'
import { rollWakeOnAlert } from './bots.ts'
import { sendArmy } from './commands.ts'
import { makeRng } from './rng.ts'
import { zeroUnit } from './defaults.ts'
import {
  alarmBlurb,
  considerAlertWake,
  currentScheduleNow,
  evaluateIncomingReaction,
  gameInstantToSchedule,
  isInWindow,
  nextLoginAt,
  phaseAt,
  presetSleep,
  rollBotSchedule,
  rollSession,
  sleepLengthHours,
} from './schedule.ts'
import { hours, minutes } from './time.ts'
import { atGame, flatSchedule, focusedTraits, makeOwner, makeState, makeTown, starterBuildings } from './testkit.ts'
import type { BotSchedule } from './types.ts'

function daySchedule(patch: Partial<BotSchedule> = {}): BotSchedule {
  return flatSchedule({
    sleepStartHour: 23,
    sleepEndHour: 7,
    busyWindows: [{ startHour: 9, endHour: 17 }],
    activeCheckMeanMs: 100_000,
    busyCheckMeanMs: 400_000,
    minCheckGapMs: 20_000,
    checkJitter: 0.5,
    sleepCheckProbability: 0,
    wakeDelayMinMs: 8 * 60_000,
    wakeDelayMaxMs: 8 * 60_000,
    ...patch,
  })
}

describe('bot schedules', () => {
  it('reads sleep, work, and free hours, including a shifted clock and a rest day', () => {
    const schedule = daySchedule()
    expect(phaseAt(schedule, hours(3))).toBe('sleep')
    expect(phaseAt(schedule, hours(10))).toBe('busy')
    expect(phaseAt(schedule, hours(20))).toBe('active')

    const ahead = daySchedule({ timezoneOffsetHours: -10 })
    expect(phaseAt(schedule, hours(3))).toBe('sleep')
    expect(phaseAt(ahead, hours(3))).toBe('active')

    const early = presetSleep('early_bird')
    const owl = presetSleep('night_owl')
    expect(isInWindow(6, owl.start, owl.end)).toBe(true)
    expect(isInWindow(6, early.start, early.end)).toBe(false)

    const working = daySchedule({ restWeekday: null })
    const off = daySchedule({ restWeekday: 0 })
    expect(phaseAt(working, hours(10))).toBe('busy')
    expect(phaseAt(off, hours(10))).toBe('active')
  })

  it('spaces logins irregularly and refuses to act in the middle of sleep', () => {
    const schedule = daySchedule()
    const activeA = nextLoginAt(schedule, hours(20), () => 0) - hours(20)
    const activeB = nextLoginAt(schedule, hours(20), () => 0.999) - hours(20)
    expect(activeA).not.toBe(activeB)
    expect(activeA).toBeGreaterThanOrEqual(schedule.minCheckGapMs)
    expect(activeB).toBeGreaterThan(activeA)

    const busy = nextLoginAt(schedule, hours(10), () => 0.5) - hours(10)
    const active = nextLoginAt(schedule, hours(20), () => 0.5) - hours(20)
    expect(busy).toBeGreaterThan(active)

    const wake = nextLoginAt(schedule, hours(2), () => 0)
    expect(phaseAt(schedule, hours(2))).toBe('sleep')
    expect(wake).toBeGreaterThanOrEqual(hours(7))
    expect(wake - hours(2)).toBeGreaterThan(hours(4))
  })

  it('never reacts at the instant an attack is spotted, and can miss one entirely', () => {
    const schedule = daySchedule({
      noticeChance: { sleep: 0.15, busy: 0.45, active: 0.84 },
      reactionMinMs: minutes(5),
      reactionMaxMs: minutes(5),
    })
    const missed = evaluateIncomingReaction({
      schedule,
      logins: [],
      arrivesAt: hours(3),
      noticeRolls: [],
      attention: 0,
    })
    expect(missed.notices).toBe(false)
    expect(missed.reactsAt).toBeNull()

    const loginAt = hours(20)
    const seen = evaluateIncomingReaction({
      schedule,
      logins: [{ at: loginAt, sessionLengthMs: minutes(30), reactionDelayMs: minutes(5) }],
      arrivesAt: hours(22),
      noticeRolls: [0.1],
      attention: 0,
    })
    expect(seen.notices).toBe(true)
    expect(seen.reactsAt).toBe(loginAt + minutes(5))
    expect(seen.reactsAt! - loginAt).toBeGreaterThan(0)

    const tooLate = evaluateIncomingReaction({
      schedule,
      logins: [{ at: hours(20), sessionLengthMs: minutes(30), reactionDelayMs: hours(3) }],
      arrivesAt: hours(21),
      noticeRolls: [0.1],
      attention: 0,
    })
    expect(tooLate.notices).toBe(false)

    const distracted = evaluateIncomingReaction({
      schedule,
      logins: [{ at: hours(20), sessionLengthMs: minutes(10), reactionDelayMs: minutes(40) }],
      arrivesAt: hours(22),
      noticeRolls: [0.1],
      attention: 0,
    })
    expect(distracted.notices).toBe(false)

    const session = rollSession(flatSchedule({ reactionMinMs: minutes(4), reactionMaxMs: minutes(4) }), 'active', () => 0.2)
    expect(session.reactionDelayMs).toBeGreaterThan(0)
  })

  it('varies chronotype, activity, and reaction by personality and difficulty', () => {
    const rng = makeRng({ rngState: 99 })
    let earlyFarmers = 0
    let owlFarmers = 0
    let earlyRaiders = 0
    let owlRaiders = 0
    for (let i = 0; i < 240; i++) {
      const farmer = rollBotSchedule('farmer', 'normal', rng)
      const raider = rollBotSchedule('raider', 'normal', rng)
      if (farmer.chronotype === 'early_bird') earlyFarmers += 1
      if (farmer.chronotype === 'night_owl') owlFarmers += 1
      if (raider.chronotype === 'early_bird') earlyRaiders += 1
      if (raider.chronotype === 'night_owl') owlRaiders += 1
      expect(sleepLengthHours(farmer)).toBeGreaterThanOrEqual(AI_CONFIG.sleepDuration.min - 0.05)
      expect(sleepLengthHours(farmer)).toBeLessThanOrEqual(AI_CONFIG.sleepDuration.max + 0.05)
      expect(farmer.reactionMinMs).toBeGreaterThan(0)
      expect(farmer.timezoneOffsetHours).toBeGreaterThanOrEqual(AI_CONFIG.timezone.min)
      expect(farmer.timezoneOffsetHours).toBeLessThanOrEqual(AI_CONFIG.timezone.max)
      expect(farmer.restWeekday).toBeGreaterThanOrEqual(0)
      expect(farmer.restWeekday).toBeLessThanOrEqual(6)
      expect(farmer.busyCheckMeanMs).toBeGreaterThan(farmer.activeCheckMeanMs)
    }
    expect(earlyFarmers).toBeGreaterThan(owlFarmers * 2)
    expect(owlRaiders).toBeGreaterThan(earlyRaiders * 2)

    const easy = rollBotSchedule('defender', 'easy', () => 0.3)
    const hard = rollBotSchedule('defender', 'hard', () => 0.3)
    expect(easy.reactionMaxMs).toBeGreaterThan(hard.reactionMaxMs)
    expect(easy.activeCheckMeanMs).toBeGreaterThan(hard.activeCheckMeanMs)
    const farmer = rollBotSchedule('farmer', 'normal', () => 0.4)
    const raider = rollBotSchedule('raider', 'normal', () => 0.4)
    expect(farmer.activeCheckMeanMs).toBeGreaterThan(raider.activeCheckMeanMs)
  })

  it('does not start a build until the login’s reaction delay, even if it is already affordable', () => {
    const state = makeState()
    const schedule = flatSchedule()
    const loginAt = hours(1)
    state.owners.push(
      makeOwner({
        id: 'bot-1',
        kind: 'bot',
        name: 'Edric Holt',
        personality: 'farmer',
        difficulty: 'normal',
        schedule,
        traits: focusedTraits(),
        nextLoginAt: loginAt,
      }),
    )
    state.towns.push(
      makeTown({
        id: 'camp',
        ownerId: 'bot-1',
        buildings: starterBuildings({ warehouse: 8 }),
        resources: { wood: 3000, clay: 3000, iron: 3000 },
      }),
    )
    let next = atGame(state, loginAt - 1)
    expect(next.towns[0]?.buildQueue).toHaveLength(0)
    next = atGame(next, loginAt)
    const owner = next.owners.find((entry) => entry.id === 'bot-1')
    expect(owner?.lastLoginAt).toBe(loginAt)
    expect(next.towns[0]?.buildQueue).toHaveLength(0)
    expect(owner?.orders.length).toBeGreaterThan(0)
    expect(owner!.orders[0]!.at).toBeGreaterThan(loginAt)
    expect(owner!.orders[0]!.at - loginAt).toBeGreaterThanOrEqual(schedule.reactionMinMs)
    next = atGame(next, owner!.orders[0]!.at - 1)
    expect(next.towns[0]?.buildQueue).toHaveLength(0)
    next = atGame(next, owner!.orders[0]!.at)
    expect(next.towns[0]?.buildQueue.length).toBeGreaterThan(0)
  })

  it('keeps sleep on the wall clock while the game clock races', () => {
    const state = makeState()
    state.botClock = 'real'
    state.speed = 100
    const realStart = 2 * 60 * 60 * 1000
    state.lastRealMs = realStart
    const schedule = daySchedule({ sleepCheckProbability: 0 })
    const login = nextLoginAt(schedule, realStart, () => 0)
    expect(phaseAt(schedule, realStart)).toBe('sleep')
    expect(login - realStart).toBeGreaterThanOrEqual(5 * 60 * 60 * 1000)
    state.owners.push(
      makeOwner({
        id: 'bot-1',
        kind: 'bot',
        name: 'Edric Holt',
        personality: 'farmer',
        difficulty: 'normal',
        schedule,
        traits: focusedTraits(),
        nextLoginAt: login,
      }),
    )
    state.towns.push(
      makeTown({
        id: 'camp',
        ownerId: 'bot-1',
        buildings: starterBuildings({ warehouse: 8 }),
        resources: { wood: 3000, clay: 3000, iron: 3000 },
      }),
    )
    const jumped = advance(state, realStart + 30 * 60 * 1000)
    expect(jumped.gameTime).toBeGreaterThan(40 * 60 * 60 * 1000)
    expect(jumped.towns[0]?.buildQueue).toHaveLength(0)
    expect(jumped.owners.find((owner) => owner.id === 'bot-1')?.orders).toHaveLength(0)
    expect(jumped.owners.find((owner) => owner.id === 'bot-1')?.nextLoginAt).toBe(login)
  })

  it('acts on a real-time login and starts the build on the matching game instant', () => {
    const state = makeState()
    state.botClock = 'real'
    state.speed = 10
    const realStart = 20 * 60 * 60 * 1000
    state.lastRealMs = realStart
    const schedule = flatSchedule()
    const login = realStart + 30 * 60 * 1000
    state.owners.push(
      makeOwner({
        id: 'bot-1',
        kind: 'bot',
        name: 'Edric Holt',
        personality: 'farmer',
        difficulty: 'normal',
        schedule,
        traits: focusedTraits(),
        nextLoginAt: login,
      }),
    )
    state.towns.push(
      makeTown({
        id: 'camp',
        ownerId: 'bot-1',
        buildings: starterBuildings({ warehouse: 8 }),
        resources: { wood: 3000, clay: 3000, iron: 3000 },
      }),
    )
    const before = advance(state, login - 1000)
    expect(before.towns[0]?.buildQueue).toHaveLength(0)
    const seated = advance(before, login)
    const owner = seated.owners.find((entry) => entry.id === 'bot-1')
    expect(owner?.lastLoginAt).toBe(login)
    expect(owner?.orders[0]?.at).toBeGreaterThan(login)
    const orderAt = owner!.orders[0]!.at
    const acted = advance(seated, orderAt)
    expect(acted.towns[0]?.buildQueue.length).toBeGreaterThan(0)
    const gameElapsed = acted.gameTime - state.gameTime
    expect(gameElapsed).toBeGreaterThanOrEqual(30 * 60 * 1000 * state.speed)
  })

  it('sleeps through an incoming attack instead of dodging it', () => {
    const state = makeState()
    state.gameTime = hours(2)
    state.owners.push(
      makeOwner({
        id: 'sleeper',
        kind: 'bot',
        name: 'Nessa Crowe',
        personality: 'raider',
        difficulty: 'hard',
        schedule: daySchedule({ sleepCheckProbability: 0 }),
        traits: focusedTraits({ dodgeChance: 1, attackChance: 0.9, attention: 0.5 }),
        nextLoginAt: hours(8),
      }),
    )
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings(),
        units: zeroUnit('axe', 100),
      }),
      makeTown({
        id: 'asleep',
        ownerId: 'sleeper',
        x: 0,
        y: 1,
        buildings: starterBuildings({ barracks: 3, wall: 0 }),
        units: zeroUnit('spear', 10),
      }),
    )
    state.movements.push({
      id: 'm-raid',
      ownerId: 'player',
      originTownId: 'home',
      targetTownId: 'asleep',
      mission: 'attack',
      units: zeroUnit('axe', 100),
      resources: { wood: 0, clay: 0, iron: 0 },
      departsAt: state.gameTime,
      arrivesAt: state.gameTime + minutes(30),
      travelMs: minutes(30),
      catapultTarget: null,
      tradeDelivered: false,
      returnsAt: null,
      merchantCount: 0,
    })
    state.towns[0]!.units = zeroUnit('axe', 0)
    const after = atGame(state, state.gameTime + minutes(30))
    const town = after.towns.find((entry) => entry.id === 'asleep')
    expect(town?.units.spear).toBe(0)
    expect(after.movements.some((movement) => movement.ownerId === 'sleeper')).toBe(false)
    expect(after.owners.find((owner) => owner.id === 'sleeper')?.orders).toHaveLength(0)
  })

  it('generates a realm and lets the bots live through a day without acting instantly', () => {
    const state = newGame({ speed: 20, seed: 7, realNow: 0, playerName: 'Warden' })
    expect(state.towns.filter((town) => town.ownerId === state.playerId)).toHaveLength(1)
    expect(state.owners.filter((owner) => owner.kind === 'bot').length).toBeGreaterThan(8)
    const started = state.towns.filter((town) => town.ownerId !== state.playerId && town.ownerId !== 'wild')
    expect(started.every((town) => town.buildQueue.length === 0)).toBe(true)
    const next = advance(state, 60 * 60 * 1000)
    expect(next.gameTime).toBeGreaterThan(state.gameTime)
    expect(next.towns.length).toBe(state.towns.length)
  })

  it('sometimes picks a worse building than the one a careful steward would', () => {
    const town = makeTown({
      id: 'camp',
      ownerId: 'bot-1',
      buildings: starterBuildings({ warehouse: 8 }),
      resources: { wood: 3000, clay: 3000, iron: 3000 },
    })
    const careful = chooseBuild(town, focusedTraits({ mistakeChance: 0, hesitation: 0, fickle: 0 }), () => 0)
    const sloppy = chooseBuild(town, focusedTraits({ mistakeChance: 1, hesitation: 0, fickle: 0 }), () => 0)
    expect(careful).toBe('timber')
    expect(sloppy).not.toBe(careful)
    expect(sloppy).not.toBeNull()
  })
})

function seq(values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 1
}

describe('wake on alert', () => {
  function sleeping(wakeOnAlert: number) {
    const state = makeState()
    state.gameTime = hours(2)
    state.lastRealMs = hours(2)
    const schedule = daySchedule({ sleepCheckProbability: 0 })
    state.owners.push(
      makeOwner({
        id: 'sleeper',
        kind: 'bot',
        name: 'Nessa Crowe',
        personality: 'defender',
        difficulty: 'hard',
        schedule,
        traits: focusedTraits({ wakeOnAlert, dodgeChance: 1, attention: 0.2 }),
        nextLoginAt: hours(9),
      }),
    )
    return { state, schedule }
  }

  it('lets a casual lord sleep through an alarm', () => {
    const { state } = sleeping(0)
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    const deadline = currentScheduleNow(state) + hours(3)
    expect(() => considerAlertWake(state, owner, deadline, () => {
      throw new Error('casual lords do not roll')
    })).not.toThrow()
    expect(owner.nextLoginAt).toBe(hours(9))
    expect(owner.wokenByAlert).toBeFalsy()
  })

  it('pulls a hardcore lord forward by the groggy delay, and ignores a deadline they cannot meet', () => {
    const { state } = sleeping(1)
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    const now = currentScheduleNow(state)
    expect(considerAlertWake(state, owner, now + minutes(3), () => 0)).toBe(false)
    expect(owner.nextLoginAt).toBe(hours(9))
    expect(considerAlertWake(state, owner, now + hours(2), () => 0)).toBe(true)
    expect(owner.wokenByAlert).toBe(true)
    expect(owner.nextLoginAt).toBe(now + minutes(AI_CONFIG.alertGroggyMin[0]))
  })

  it('wakes in-between lords only when the roll lands under their chance', () => {
    const { state } = sleeping(0.45)
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    const deadline = currentScheduleNow(state) + hours(2)
    expect(considerAlertWake(state, owner, deadline, seq([0.45]))).toBe(false)
    expect(owner.nextLoginAt).toBe(hours(9))
    expect(considerAlertWake(state, owner, deadline, seq([0.44, 0]))).toBe(true)
    expect(owner.nextLoginAt).toBe(currentScheduleNow(state) + minutes(AI_CONFIG.alertGroggyMin[0]))
  })

  it('does not replace a login that is already sooner than the groggy sit-up', () => {
    const { state } = sleeping(1)
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    owner.nextLoginAt = currentScheduleNow(state) + minutes(3)
    expect(considerAlertWake(state, owner, currentScheduleNow(state) + hours(2), () => 0)).toBe(false)
    expect(owner.nextLoginAt).toBe(hours(2) + minutes(3))
    expect(owner.wokenByAlert).toBeFalsy()
  })

  it('sits up for an incoming attack, gives one order, then goes back to sleep', () => {
    const { state } = sleeping(1)
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings(),
        units: zeroUnit('spear', 40),
      }),
      makeTown({
        id: 'asleep',
        ownerId: 'sleeper',
        x: 0,
        y: 6,
        buildings: starterBuildings(),
        units: zeroUnit('spear', 12),
      }),
      makeTown({
        id: 'refuge',
        ownerId: 'sleeper',
        x: 1,
        y: 6,
        buildings: starterBuildings(),
        units: zeroUnit('spear', 0),
      }),
    )
    expect(sendArmy(state, 'home', 'asleep', 'attack', zeroUnit('spear', 40), null)).toBeNull()
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    const now = hours(2)
    expect(owner.wokenByAlert).toBe(true)
    expect(owner.nextLoginAt!).toBeGreaterThanOrEqual(now + minutes(AI_CONFIG.alertGroggyMin[0]))
    expect(owner.nextLoginAt!).toBeLessThanOrEqual(now + minutes(AI_CONFIG.alertGroggyMin[1]))
    const woken = atGame(state, owner.nextLoginAt!)
    const up = woken.owners.find((entry) => entry.id === 'sleeper')!
    expect(up.wokenByAlert).toBe(false)
    expect(up.lastLoginAt).toBe(owner.nextLoginAt)
    expect(up.orders.some((order) => order.type === 'dodge')).toBe(true)
    expect(up.nextLoginAt!).toBeGreaterThanOrEqual(hours(7))
    expect(phaseAt(daySchedule(), up.nextLoginAt!)).not.toBe('sleep')
  })

  it('measures the groggy delay in real minutes while the game clock runs fast', () => {
    const state = makeState()
    state.botClock = 'real'
    state.speed = 20
    state.gameTime = 0
    state.lastRealMs = hours(2)
    state.owners.push(
      makeOwner({
        id: 'sleeper',
        kind: 'bot',
        name: 'Nessa Crowe',
        personality: 'raider',
        difficulty: 'normal',
        schedule: daySchedule({ sleepCheckProbability: 0 }),
        traits: focusedTraits({ wakeOnAlert: 1 }),
        nextLoginAt: hours(10),
      }),
    )
    const now = currentScheduleNow(state)
    const deadline = gameInstantToSchedule(state, 60 * minutes(20), state.gameTime, now)
    const owner = state.owners.find((entry) => entry.id === 'sleeper')!
    expect(considerAlertWake(state, owner, deadline, () => 0)).toBe(true)
    expect(owner.nextLoginAt).toBe(now + minutes(4))
    expect(state.gameTime).toBe(0)
  })

  it('wakes the defender when a siege opens later on the wall clock', () => {
    const state = makeState()
    state.botClock = 'real'
    state.speed = 20
    state.lastRealMs = hours(2)
    const travelReal = 30 * 60_000
    state.owners.push(
      makeOwner({
        id: 'sleeper',
        kind: 'bot',
        name: 'Nessa Crowe',
        personality: 'farmer',
        difficulty: 'easy',
        schedule: daySchedule({ sleepCheckProbability: 0 }),
        traits: focusedTraits({ wakeOnAlert: 1 }),
        nextLoginAt: hours(9),
      }),
    )
    const column = zeroUnit('commander', 1)
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings(),
        units: zeroUnit('spear', 0),
      }),
      makeTown({
        id: 'asleep',
        ownerId: 'sleeper',
        x: 1,
        y: 0,
        buildings: starterBuildings(),
        units: zeroUnit('spear', 0),
      }),
    )
    state.movements.push({
      id: 'm-siege',
      ownerId: 'player',
      originTownId: 'home',
      targetTownId: 'asleep',
      mission: 'siege',
      units: column,
      resources: { wood: 0, clay: 0, iron: 0 },
      departsAt: 0,
      arrivesAt: travelReal * state.speed,
      travelMs: travelReal * state.speed,
      catapultTarget: null,
      tradeDelivered: false,
      returnsAt: null,
      merchantCount: 0,
    })
    const after = advance(state, hours(2) + travelReal + 1000)
    expect(after.sieges).toHaveLength(1)
    const owner = after.owners.find((entry) => entry.id === 'sleeper')!
    const arrivalReal = hours(2) + travelReal
    expect(owner.wokenByAlert).toBe(true)
    expect(owner.nextLoginAt!).toBeGreaterThanOrEqual(arrivalReal + minutes(AI_CONFIG.alertGroggyMin[0]))
    expect(owner.nextLoginAt!).toBeLessThanOrEqual(arrivalReal + minutes(AI_CONFIG.alertGroggyMin[1]))
  })

  it('wakes a nearby hardcore neighbor for a call for aid and leaves casual, distant, and attacking lords asleep', () => {
    const state = makeState()
    state.gameTime = hours(2)
    state.lastRealMs = hours(2)
    const schedule = daySchedule({ sleepCheckProbability: 0 })
    const add = (id: string, wakeOnAlert: number) => {
      state.owners.push(
        makeOwner({
          id,
          kind: 'bot',
          name: id,
          personality: 'defender',
          difficulty: 'normal',
          schedule,
          traits: focusedTraits({ wakeOnAlert }),
          nextLoginAt: hours(9),
        }),
      )
    }
    add('near', 1)
    add('casual', 0)
    add('far', 1)
    add('attacker', 1)
    state.towns.push(
      makeTown({ id: 'home', ownerId: 'player', x: 0, y: 0, buildings: starterBuildings() }),
      makeTown({ id: 'near-town', ownerId: 'near', x: 3, y: 0, buildings: starterBuildings() }),
      makeTown({ id: 'casual-town', ownerId: 'casual', x: 4, y: 0, buildings: starterBuildings() }),
      makeTown({ id: 'far-town', ownerId: 'far', x: 0, y: 20, buildings: starterBuildings() }),
      makeTown({ id: 'attack-town', ownerId: 'attacker', x: 1, y: 1, buildings: starterBuildings() }),
    )
    state.sieges.push({
      id: 'sg-aid',
      townId: 'home',
      attackerOwnerId: 'attacker',
      originTownId: 'attack-town',
      units: zeroUnit('commander', 1),
      startedAt: hours(1),
      endsAt: hours(5),
    })
    expect(callForAid(state, 'home')).toBeNull()
    const login = (id: string) => state.owners.find((entry) => entry.id === id)!
    expect(login('near').wokenByAlert).toBe(true)
    expect(login('near').nextLoginAt!).toBeLessThan(hours(3))
    expect(login('casual').nextLoginAt).toBe(hours(9))
    expect(login('far').nextLoginAt).toBe(hours(9))
    expect(login('attacker').nextLoginAt).toBe(hours(9))
    expect(login('casual').wokenByAlert).toBeFalsy()
    expect(login('far').wokenByAlert).toBeFalsy()
    expect(login('attacker').wokenByAlert).toBeFalsy()
  })

  it('spreads dedication inside each personality, with castellans likelier than stewards', () => {
    const farmers: number[] = []
    const defenders: number[] = []
    const raiders: number[] = []
    for (let i = 0; i < 400; i++) {
      farmers.push(rollWakeOnAlert('farmer', makeRng({ rngState: i + 3 })))
      defenders.push(rollWakeOnAlert('defender', makeRng({ rngState: i + 3 })))
      raiders.push(rollWakeOnAlert('raider', makeRng({ rngState: i + 11 })))
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean(defenders)).toBeGreaterThan(mean(farmers) + 0.3)
    expect(Math.min(...farmers)).toBeLessThan(0.05)
    expect(Math.max(...farmers)).toBeGreaterThan(0.5)
    expect(Math.min(...defenders)).toBeLessThan(0.4)
    expect(Math.max(...defenders)).toBeGreaterThan(0.95)
    expect(Math.max(...farmers)).toBeGreaterThan(Math.min(...defenders))
    expect(Math.min(...raiders)).toBeLessThan(0.2)
    expect(Math.max(...raiders)).toBeGreaterThan(0.8)
    expect(new Set(farmers).size).toBeGreaterThan(20)
    expect(alarmBlurb(0.9)).toMatch(/alarms on/)
    expect(alarmBlurb(0.5)).toMatch(/Sometimes/)
    expect(alarmBlurb(0.1)).toMatch(/Sleeps through/)
  })
})
