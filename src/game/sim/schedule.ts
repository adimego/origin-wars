import { AI_CONFIG, type Chronotype, type Difficulty, type Personality } from '../config/ai.ts'
import { GAME_HOUR_MS, GAME_MINUTE_MS } from './time.ts'
import { clamp, lerp, type Rng } from './rng.ts'
import type { BotSchedule, Owner, Phase } from './types.ts'

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

export function formatClock(hour: number): string {
  const whole = Math.floor(hour)
  const mins = Math.round((hour - whole) * 60) % 60
  const hh = ((whole % 24) + 24) % 24
  return `${String(hh).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function localClock(gameTimeMs: number, offsetHours: number): string {
  return formatClock(localHour(gameTimeMs, offsetHours))
}

export function habitBlurb(schedule: BotSchedule): string {
  const manner =
    schedule.chronotype === 'early_bird'
      ? 'an early riser'
      : schedule.chronotype === 'night_owl'
        ? 'a night owl'
        : 'someone who keeps daylight hours'
  const sleep = `${formatClock(schedule.sleepStartHour)}–${formatClock(schedule.sleepEndHour)}`
  const shift =
    Math.abs(schedule.timezoneOffsetHours) < 0.25
      ? 'Their day matches the realm clock.'
      : `Their day runs ${Math.abs(schedule.timezoneOffsetHours)}h ${schedule.timezoneOffsetHours > 0 ? 'ahead of' : 'behind'} the realm clock.`
  return `Keeps the hours of ${manner}. Usually asleep ${sleep}, their time. ${shift}`
}

export function presence(
  owner: Owner,
  gameTime: number,
): { phase: Phase; label: string; local: string } | null {
  if (!owner.schedule) return null
  const phase = phaseAt(owner.schedule, gameTime)
  const local = localClock(gameTime, owner.schedule.timezoneOffsetHours)
  let label = 'Up, not at their maps'
  if (phase === 'sleep') label = 'Asleep'
  else if (
    owner.lastLoginAt != null &&
    owner.sessionEndsAt != null &&
    gameTime >= owner.lastLoginAt &&
    gameTime < owner.sessionEndsAt
  ) {
    label = 'At the table'
  } else if (phase === 'busy') label = 'Busy. Checks in rarely.'
  return { phase, label, local }
}

export function presetSleep(chronotype: Chronotype): { start: number; end: number } {
  const preset = AI_CONFIG.chronotypes[chronotype]
  return { start: preset.sleepStart, end: preset.sleepEnd }
}
