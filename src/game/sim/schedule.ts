import { AI_CONFIG, type Chronotype, type Difficulty, type Personality } from '../config/ai.ts'
import { GAME_HOUR_MS, GAME_MINUTE_MS } from './time.ts'
import { clamp, lerp, type Rng } from './rng.ts'
import type { BotSchedule, GameState, Owner, Phase } from './types.ts'

/** Wall-clock instant the bot schedule should read. Compressed mode uses game time. */
export function botScheduleNow(state: Pick<GameState, 'botClock' | 'gameTime'>, realNow: number, gameNow = state.gameTime): number {
  return state.botClock === 'compressed' ? gameNow : realNow
}

export function gameInstantToSchedule(state: Pick<GameState, 'botClock' | 'speed'>, gameInstant: number, gameNow: number, scheduleNow: number): number {
  if (state.botClock === 'compressed') return gameInstant
  return scheduleNow + (gameInstant - gameNow) / state.speed
}

export function gameSpanToSchedule(state: Pick<GameState, 'botClock' | 'speed'>, gameSpanMs: number): number {
  if (state.botClock === 'compressed') return gameSpanMs
  return gameSpanMs / state.speed
}

export function scheduleInstantToGame(
  state: Pick<GameState, 'botClock' | 'speed'>,
  scheduleInstant: number,
  anchor: { game: number; real: number; speed: number },
): number {
  if (state.botClock === 'compressed') return scheduleInstant
  return Math.round(anchor.game + (scheduleInstant - anchor.real) * anchor.speed)
}

export function scheduleNowFromGame(
  state: Pick<GameState, 'botClock'>,
  gameInstant: number,
  anchor: { game: number; real: number; speed: number },
): number {
  if (state.botClock === 'compressed') return gameInstant
  return anchor.real + (gameInstant - anchor.game) / anchor.speed
}

export function localHour(gameTimeMs: number, offsetHours: number): number {
  const hours = gameTimeMs / GAME_HOUR_MS + offsetHours
  return ((hours % 24) + 24) % 24
}

export function isInWindow(hour: number, start: number, end: number): boolean {
  const h = ((hour % 24) + 24) % 24
  if (start === end) return false
  const s = ((start % 24) + 24) % 24
  const e = ((end % 24) + 24) % 24
  if (s < e) return h >= s && h < e
  return h >= s || h < e
}

export function localWeekday(gameTimeMs: number, offsetHours: number): number {
  const localMs = gameTimeMs + offsetHours * GAME_HOUR_MS
  const day = Math.floor(localMs / (24 * GAME_HOUR_MS))
  return ((day % 7) + 7) % 7
}

export function isRestDay(schedule: BotSchedule, gameTimeMs: number): boolean {
  if (schedule.restWeekday == null) return false
  return localWeekday(gameTimeMs, schedule.timezoneOffsetHours) === schedule.restWeekday
}

export function phaseAt(schedule: BotSchedule, gameTimeMs: number): Phase {
  const hour = localHour(gameTimeMs, schedule.timezoneOffsetHours)
  if (isInWindow(hour, schedule.sleepStartHour, schedule.sleepEndHour)) return 'sleep'
  if (!isRestDay(schedule, gameTimeMs)) {
    for (const window of schedule.busyWindows) {
      if (isInWindow(hour, window.startHour, window.endHour)) return 'busy'
    }
  }
  return 'active'
}

export function hoursUntil(fromHour: number, targetHour: number): number {
  let delta = targetHour - fromHour
  if (delta <= 0) delta += 24
  return delta
}

export function nextLocalHour(gameTimeMs: number, offsetHours: number, targetLocalHour: number): number {
  const local = localHour(gameTimeMs, offsetHours)
  return gameTimeMs + Math.round(hoursUntil(local, targetLocalHour) * GAME_HOUR_MS)
}

/**
 * The next time this lord sits down. Never equal to `afterMs`.
 * Sleep usually skips straight to a groggy wake-up. Busy hours use a longer, still irregular gap.
 */
export function nextLoginAt(schedule: BotSchedule, afterMs: number, rng: Rng): number {
  const phase = phaseAt(schedule, afterMs + 1)
  if (phase === 'sleep') {
    const roll = rng()
    if (roll < schedule.sleepCheckProbability) {
      const delay = lerp(schedule.sleepCheckMinMs, schedule.sleepCheckMaxMs, rng())
      return afterMs + Math.max(schedule.minCheckGapMs, Math.round(delay))
    }
    const wake = nextLocalHour(afterMs, schedule.timezoneOffsetHours, schedule.sleepEndHour)
    const groggy = lerp(schedule.wakeDelayMinMs, schedule.wakeDelayMaxMs, rng())
    return wake + Math.max(1, Math.round(groggy))
  }
  const mean = phase === 'busy' ? schedule.busyCheckMeanMs : schedule.activeCheckMeanMs
  const mult = 1 - schedule.checkJitter + rng() * schedule.checkJitter * 2
  return afterMs + Math.max(schedule.minCheckGapMs, Math.round(mean * mult))
}

export function rollSession(
  schedule: BotSchedule,
  phase: Phase,
  rng: Rng,
): { lengthMs: number; reactionDelayMs: number } {
  const lengthMs = Math.round(lerp(schedule.sessionMinMs[phase], schedule.sessionMaxMs[phase], rng()))
  const reactionDelayMs = Math.round(lerp(schedule.reactionMinMs, schedule.reactionMaxMs, rng()))
  return { lengthMs: Math.max(1, lengthMs), reactionDelayMs: Math.max(1, reactionDelayMs) }
}

export interface LoginMoment {
  at: number
  sessionLengthMs: number
  reactionDelayMs: number
}

/**
 * Whether a lord notices an incoming attack and still has time to click.
 * Reaction is measured from the login, and a short visit can end before they act.
 */
export function evaluateIncomingReaction(args: {
  schedule: BotSchedule
  logins: LoginMoment[]
  arrivesAt: number
  noticeRolls: number[]
  attention: number
}): { notices: boolean; reactsAt: number | null; loginAt: number | null } {
  let rollIndex = 0
  for (const login of args.logins) {
    if (login.at >= args.arrivesAt) break
    if (login.reactionDelayMs >= login.sessionLengthMs) {
      rollIndex += 1
      continue
    }
    const phase = phaseAt(args.schedule, login.at)
    const chance = clamp(args.schedule.noticeChance[phase] + args.attention, 0, 0.97)
    const roll = args.noticeRolls[rollIndex] ?? 1
    rollIndex += 1
    if (roll > chance) continue
    const reactsAt = login.at + login.reactionDelayMs
    if (reactsAt >= args.arrivesAt) continue
    return { notices: true, reactsAt, loginAt: login.at }
  }
  return { notices: false, reactsAt: null, loginAt: null }
}

function sleepDuration(start: number, end: number): number {
  let duration = end - start
  if (duration <= 0) duration += 24
  return duration
}

function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24
}

function pickWeighted<T extends string>(weights: Record<T, number>, rng: Rng): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = rng() * total
  for (const [key, weight] of entries) {
    cursor -= weight
    if (cursor <= 0) return key
  }
  return entries[entries.length - 1][0]
}

function jitterWindow(
  window: { startHour: number; endHour: number },
  amount: number,
  rng: Rng,
): { startHour: number; endHour: number } {
  return {
    startHour: wrapHour(window.startHour + (rng() * 2 - 1) * amount),
    endHour: wrapHour(window.endHour + (rng() * 2 - 1) * amount),
  }
}

export function rollBotSchedule(personality: Personality, difficulty: Difficulty, rng: Rng): BotSchedule {
  const cfg = AI_CONFIG
  const chronotype = pickWeighted(cfg.chronotypeWeights[personality], rng)
  const preset = cfg.chronotypes[chronotype]
  let sleepStart = wrapHour(preset.sleepStart + (rng() * 2 - 1) * cfg.sleepJitterHours)
  let sleepEnd = wrapHour(preset.sleepEnd + (rng() * 2 - 1) * cfg.sleepJitterHours)
  let duration = sleepDuration(sleepStart, sleepEnd)
  if (duration < cfg.sleepDuration.min) sleepEnd = wrapHour(sleepStart + cfg.sleepDuration.min)
  if (duration > cfg.sleepDuration.max) sleepEnd = wrapHour(sleepStart + cfg.sleepDuration.max)
  duration = sleepDuration(sleepStart, sleepEnd)
  if (duration < cfg.sleepDuration.min) sleepEnd = wrapHour(sleepStart + cfg.sleepDuration.min)

  let busyWindows = preset.busy.map((window) => jitterWindow(window, cfg.busyJitterHours, rng))
  if (rng() < cfg.partTimeChance && busyWindows.length > 1) {
    const only = busyWindows[0]
    busyWindows = [{ startHour: only.startHour, endHour: wrapHour(only.startHour + 3.5) }]
  }

  const intervalScale = cfg.activityScale[personality] * cfg.difficultyIntervalScale[difficulty]
  const minToMs = (mins: number) => Math.round(mins * GAME_MINUTE_MS)
  const reaction = cfg.reactionMin[difficulty]
  const sessions = cfg.sessionsMin

  return {
    timezoneOffsetHours: cfg.timezone.min + Math.floor(rng() * (cfg.timezone.max - cfg.timezone.min + 1)),
    chronotype,
    sleepStartHour: sleepStart,
    sleepEndHour: sleepEnd,
    busyWindows,
    restWeekday: Math.floor(rng() * 7),
    sleepCheckProbability: cfg.sleepCheck[difficulty],
    sleepCheckMinMs: minToMs(cfg.sleepCheckDelayMin[0]),
    sleepCheckMaxMs: minToMs(cfg.sleepCheckDelayMin[1]),
    wakeDelayMinMs: minToMs(cfg.wakeDelayMin[0]),
    wakeDelayMaxMs: minToMs(cfg.wakeDelayMin[1]),
    activeCheckMeanMs: Math.round(minToMs(cfg.intervals.activeMeanMin) * intervalScale),
    busyCheckMeanMs: Math.round(minToMs(cfg.intervals.busyMeanMin) * intervalScale),
    checkJitter: cfg.intervals.jitter,
    minCheckGapMs: minToMs(cfg.intervals.minGapMin),
    sessionMinMs: {
      active: minToMs(sessions.active[0]),
      busy: minToMs(sessions.busy[0]),
      sleep: minToMs(sessions.sleep[0]),
    },
    sessionMaxMs: {
      active: minToMs(sessions.active[1]),
      busy: minToMs(sessions.busy[1]),
      sleep: minToMs(sessions.sleep[1]),
    },
    reactionMinMs: minToMs(reaction[0]),
    reactionMaxMs: minToMs(reaction[1]),
    noticeChance: { ...cfg.notice },
    clickGapMs: minToMs(cfg.clickGapMin),
  }
}

export function sleepLengthHours(schedule: BotSchedule): number {
  return sleepDuration(schedule.sleepStartHour, schedule.sleepEndHour)
}

/** Schedule-clock "now" for the current game instant. Uses the step anchor while the sim is replaying. */
export function currentScheduleNow(
  state: Pick<GameState, 'botClock' | 'gameTime' | 'lastRealMs' | 'clockAnchor'>,
): number {
  if (state.clockAnchor) return scheduleNowFromGame(state, state.gameTime, state.clockAnchor)
  return botScheduleNow(state, state.lastRealMs, state.gameTime)
}

/**
 * A sleeping lord may sit up for an alarm on their own town or a neighbor's call.
 * Casual lords (wakeOnAlert 0) never do. The visit is scheduled after a groggy delay
 * and only if they can still act before `deadlineSchedule`. A sooner natural login wins.
 */
export function considerAlertWake(state: GameState, owner: Owner, deadlineSchedule: number, rng: Rng): boolean {
  if (owner.kind !== 'bot' || !owner.schedule || !owner.traits) return false
  if (owner.traits.wakeOnAlert <= 0) return false
  const now = currentScheduleNow(state)
  if (phaseAt(owner.schedule, now) !== 'sleep') return false
  if (owner.sessionEndsAt != null && owner.sessionEndsAt > now) return false
  if (rng() >= owner.traits.wakeOnAlert) return false
  const groggyMin = lerp(AI_CONFIG.alertGroggyMin[0], AI_CONFIG.alertGroggyMin[1], rng())
  const groggy = Math.max(GAME_MINUTE_MS, Math.round(groggyMin * GAME_MINUTE_MS))
  const wakeAt = now + groggy
  const clickSlack = Math.round(AI_CONFIG.alertClickMin[1] * GAME_MINUTE_MS)
  if (wakeAt + clickSlack >= deadlineSchedule) return false
  if (owner.nextLoginAt != null && owner.nextLoginAt <= wakeAt) return false
  owner.nextLoginAt = wakeAt
  owner.wokenByAlert = true
  return true
}

export function presetSleep(chronotype: Chronotype): { start: number; end: number } {
  const preset = AI_CONFIG.chronotypes[chronotype]
  return { start: preset.sleepStart, end: preset.sleepEnd }
}
