import { useState } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import { UNITS } from '@/game/config/units.ts'
import type { Report } from '@/game/sim/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { gameClock } from './format.ts'
import { useGame } from './game-context.tsx'

export function ReportsScreen() {
  const { state, markRead, markAllRead } = useGame()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!state) return null
  const reports = state.reports.filter((report) => report.ownerId === state.playerId)
  const open = reports.find((report) => report.id === openId) ?? reports[0] ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted">Battles, scouts, and the riders who made it home.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={markAllRead} disabled={reports.every((report) => !report.unread)}>
          Mark all read
        </Button>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-sm text-muted">
          No riders have returned. The road is quiet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <ScrollArea className="h-[60vh] rounded-lg border border-line">
            <ul>
              {reports.map((report) => (
                <li key={report.id}>
                  <button
                    type="button"
                    className={`w-full border-b border-line px-3 py-3 text-left ${open?.id === report.id ? 'bg-brass/10' : ''}`}
                    onClick={() => {
                      setOpenId(report.id)
                      markRead(report.id)
                    }}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      {report.unread ? <span className="h-1.5 w-1.5 rounded-full bg-brass" /> : null}
                      {report.title}
                    </span>
                    <span className="num mt-1 block text-xs text-faint">{gameClock(report.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <article className="rounded-lg border border-line bg-panel p-4">
            {open ? <ReportBody report={open} /> : null}
          </article>
        </div>
      )}
    </div>
  )
}

function ReportBody({ report }: { report: Report }) {
  return (
    <div className="space-y-3 text-sm">
      <h2 className="font-display text-2xl text-brass-2">{report.title}</h2>
      <p className="text-muted">{report.summary}</p>
      {report.battle ? (
        <div className="space-y-3">
          <p>
            {report.battle.attackerName} from {report.battle.attackerTown} ({report.battle.fromX}|{report.battle.fromY}) against{' '}
            {report.battle.defenderName} in {report.battle.defenderTown}. Luck {report.battle.luck >= 0 ? '+' : ''}
            {Math.round(report.battle.luck * 100)}%.
          </p>
          <LossTable title="Attackers" lines={report.battle.attackerUnits} />
          <LossTable title="Defenders" lines={report.battle.defenderUnits} />
          <p>
            Loot {report.battle.loot.wood} wood, {report.battle.loot.clay} clay, {report.battle.loot.iron} iron. Wall{' '}
            {report.battle.wallBefore} → {report.battle.wallAfter}.
          </p>
          {report.battle.buildingTarget ? (
            <p>
              {BUILDINGS[report.battle.buildingTarget].name} {report.battle.buildingBefore} → {report.battle.buildingAfter}.
            </p>
          ) : null}
          {report.battle.noblesUsed > 0 ? (
            <p>
              Nobles surviving the fight: {report.battle.noblesUsed}. Loyalty {report.battle.loyaltyBefore} → {report.battle.loyaltyAfter}.
              {report.battle.conquered ? ' The town changed hands.' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {report.scout ? (
        <div className="space-y-2">
          <p>{report.scout.success ? 'The scouts got in.' : 'The scouts did not return with anything useful.'}</p>
          {report.scout.resources ? (
            <p>
              Stores {Math.floor(report.scout.resources.wood)} / {Math.floor(report.scout.resources.clay)} /{' '}
              {Math.floor(report.scout.resources.iron)}
              {report.scout.loyalty != null ? ` · loyalty ${report.scout.loyalty}` : ''}
              {report.scout.points != null ? ` · ${report.scout.points} points` : ''}
            </p>
          ) : null}
          {report.scout.buildings ? (
            <p className="text-muted">
              {Object.entries(report.scout.buildings)
                .filter(([, level]) => level > 0)
                .map(([id, level]) => `${BUILDINGS[id as keyof typeof BUILDINGS].name} ${level}`)
                .join(' · ')}
            </p>
          ) : null}
          {report.scout.units ? (
            <p>
              {Object.entries(report.scout.units)
                .filter(([, count]) => count > 0)
                .map(([id, count]) => `${count} ${UNITS[id as keyof typeof UNITS].name}`)
                .join(', ') || 'No garrison.'}
            </p>
          ) : null}
          {report.scout.habit ? <p>{report.scout.habit}</p> : null}
        </div>
      ) : null}
      {report.trade ? (
        <p>
          Delivered {report.trade.delivered.wood} wood, {report.trade.delivered.clay} clay, {report.trade.delivered.iron} iron to{' '}
          {report.trade.targetName}.
        </p>
      ) : null}
    </div>
  )
}

function LossTable({ title, lines }: { title: string; lines: { id: keyof typeof UNITS; sent: number; lost: number }[] }) {
  if (lines.length === 0) return <p className="text-muted">{title}: none.</p>
  return (
    <div>
      <p className="text-xs tracking-wide text-faint">{title}</p>
      <ul className="mt-1">
        {lines.map((line) => (
          <li key={line.id} className="num flex justify-between gap-3">
            <span>{UNITS[line.id].name}</span>
            <span>
              {line.sent} sent · {line.lost} lost
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
