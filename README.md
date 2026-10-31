# Origin Wars

A browser strategy game in the vein of Tribal Wars. You hold a town on a shared map, grow its economy on a real clock, recruit companies, and march them at rivals who keep human hours. There is no premium currency and no way to buy time.

## Run it

```bash
npm install
npm test
npm run dev
```

The dev server listens on [http://127.0.0.1:4317](http://127.0.0.1:4317).

`npm run build` typechecks and writes a production bundle to `dist/`. `npm run lint` runs oxlint.

## How a session works

You found one town. Wood, clay, and iron arrive every game hour from the camps and the mine, until the warehouse is full. The farm is the population cap. Buildings take time and a queue; the headquarters shortens that time and, every few levels, adds a queue slot.

Recruit spears, swords, and axes from the barracks, scouts and cavalry from the stable, rams and catapults from the workshop, and a commander from the command hall. Most of those need a smithy research first. Spears and the commander are the exceptions.

Armies move in straight lines. Travel time is the distance in fields times a base pace, divided by the slowest unit in the column. Combat compares infantry and cavalry attack with the matching defense, multiplies defense by the wall, and applies a small luck swing. Rams that survive a win knock levels off the wall. Catapults damage one building. A raid hauls loot and goes home.

A siege is how a town changes hands. Win the field with enough siege weight, then hold the camp until a clock runs out. The defender, their other towns, and neighboring lords can send relief. Relief fights the camp in the open, with no wall bonus. If the camp is wiped out, drops below the holding population, or withdraws, the siege breaks. If it is still strong when the clock ends, the town is captured and that army becomes the garrison. While the camp sits outside, the town produces 30% of normal and new building and training take 2.5× as long.

Other lords are bots. Abandoned hamlets have no lord. Some are empty and worth raiding. Some still have stragglers.

The world speed (Relaxed, Standard, Blitz) multiplies the realm clock. It is a setting for the whole world, useful for learning or for a long evening, not a product.

## Bots act like people

Each bot has a personality (steward, raider, castellan, claimant), a difficulty, a chronotype, and a timezone offset from the realm clock.

- They sleep. During that window they usually do not log in at all. A rare night check is possible, and even then they often miss what is in front of them.
- Work hours are busy: check-ins are sparse and the visit is short.
- While awake they sit down at irregular intervals, then wait a reaction delay before the first order. If the visit is shorter than that delay, they saw the screen and got pulled away.
- They do not fill the build queue the moment resources allow. One visit is one or two clicks, sometimes the wrong building, sometimes a raid that is too small.
- An attack or a siege that lands while they are asleep, or before they finish reacting, is not answered. If they notice in time they may sally, send relief from another town, or call the neighbors. Those neighbors answer on their own next visit, not instantly.

Their current presence (asleep, busy, at the table) is visible on the map. A full scout report adds the sleep window and how far their day sits from the realm clock.

All of the numbers live in `src/game/config/ai.ts`.

## Architecture

The simulation is plain TypeScript under `src/game` and does not import React. A later server can own the same `GameState` and call `advance`.

- `src/game/config/` — buildings, units, combat, world speed, and bot schedules.
- `src/game/sim/` — formulas, the event loop, combat, sieges, movement, and bot planning.
- `src/ui/` — the Origin Wars client.
- Saves go to `localStorage` under `origin-wars-save-v2`. Older saves are ignored.

Time is a game clock. Deadlines are game-time milliseconds. World speed only changes how fast that clock moves against the wall clock:

```text
gameNow = lastGameTime + (realNow - lastRealTime) × speed
```

Closing the tab does not pause the realm. On the next load, `advance` replays every build, recruit, march, and bot visit between the saved timestamp and now. Changing speed does not rewrite deadlines; the same game-time remaining simply takes less or more real time.

Bot visits are events on that clock (`nextLoginAt`, then orders at `login + reaction`). They are not a tight loop that spends resources the instant a timer finishes.

## Balance

Edit these without touching the loop:

| File | What it tunes |
| --- | --- |
| `src/game/config/buildings.ts` | Costs, build times, production, storage, population, requirements |
| `src/game/config/units.ts` | Combat stats, carry, population, training, research |
| `src/game/config/world.ts` | Map size, march pace, queue slots, luck, siege clock, market, speed presets |
| `src/game/config/ai.ts` | Sleep, work hours, check-in gaps, reaction delays, personalities |

Production at level n is `base × growth^(n-1)` per game hour. Build cost and build time use the same shape. Headquarters divides build time by `1.05^level`.

## Tests

```bash
npm test
```

Vitest covers resource production and the storage cap, build times and the queue, recruit timers, combat (including the wall, rams, catapults, and scouts), sieges (duration, investing, relief, hampered production, a sleeping defender missing the clock), and the bot schedule: sleep versus work, irregular logins, reaction delay, missed attacks, and personality differences. One case generates a realm and advances it an hour.

## Siege numbers

All of these live in `SIEGE` inside `src/game/config/world.ts`. Times are game-minutes. Divide by the world speed for real minutes.

| Knob | Value |
| --- | --- |
| Base duration | 28 min |
| Per headquarters level | +5 min |
| Per wall level | +7 min |
| Per town point | +0.6 min |
| Clamp | 18–180 min |
| Weight | ram 1, catapult 2, commander 4 |
| Shorten | 2.5% per weight point, capped at 50% |
| Minimum weight to invest | 3 (one commander, or three rams, or a catapult and a ram) |
| Minimum population to hold the camp | 12 |
| Production while besieged | 30% |
| New build and train time | ×2.5 |
| Aid radius | 14 fields |

A level-1 hamlet with 8 points and no wall is about 38 game-minutes with no engines, and about 34 with one commander (weight 4). A town with headquarters 8, wall 8, and 40 points is about 148 game-minutes, or about 89 if the camp has 16 weight. At Standard (20×) that is roughly two to seven real minutes. At Blitz (120×) a small siege is under half a minute.

Chance a bot who could raid will invest instead, if they have the weight: steward 8%, raider 38%, castellan 6%, claimant 72%. Chance they ride to help someone else’s call: steward 40%, raider 10%, castellan 72%, claimant 22%.

## Known gaps

- Single player. The sim is ready to move behind a server, but there is no networked realm yet.
- No alliances, messages, or shared tribes.
- The market is a lossy exchange plus shipments between your own towns, not an offer board.
- Combat is a readable model of attack, defense, wall, and luck, not a bit-exact copy of any live game.
- Support troops fight with the town’s research, not their home smithy.
- Terrain is scenery. Marches are straight lines.
- A very long absence at Blitz speed replays every event on the main thread and can hitch once when you return.
- Bots each start with one town. A claimant who takes another will only fuss over one or two of them per visit.
