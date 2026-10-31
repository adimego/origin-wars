# Origin Wars

A browser strategy game in the vein of Tribal Wars. You hold a town on a shared map, grow its economy on a real clock, recruit companies, and march them at other lords. There is no premium currency and no way to buy time.

## Run it

```bash
npm install
npm test
npm run dev
```

The dev server listens on [http://127.0.0.1:4317](http://127.0.0.1:4317). That port is only for local development. The production build does not use it.

`npm run build` typechecks and writes a static site to `dist/`. `npm run lint` runs oxlint.

## Deploy on GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`. The workflow uses Node 22, then `npm ci`, `npm test`, and `npm run build`, and publishes `dist` with the official Pages upload and deploy actions.

The live site is [https://adimego.github.io/origin-wars/](https://adimego.github.io/origin-wars/). Production builds set Vite's `base` to `/origin-wars/` so scripts, styles, and the favicon load from that project path. `npm run dev` still serves the site root at [http://127.0.0.1:4317](http://127.0.0.1:4317).

The build copies `index.html` to `404.html`. GitHub Pages serves that file for unknown paths, so a direct visit under the project site still loads the app.

## How a session works

You found one town. Wood, clay, and iron arrive every game hour from the camps and the mine, until the warehouse is full. The farm is the population cap. Buildings take time and a queue; the headquarters shortens that time and, every few levels, adds a queue slot.

Recruit spears, swords, and axes from the barracks, scouts and cavalry from the stable, rams and catapults from the workshop, and a commander from the command hall. Most of those need a smithy research first. Spears and the commander are the exceptions.

Armies move in straight lines. Travel time is the distance in fields times a base pace, divided by the slowest unit in the column. Combat compares infantry and cavalry attack with the matching defense, multiplies defense by the wall, and applies a small luck swing. Rams that survive a win knock levels off the wall. Catapults damage one building. A raid hauls loot and goes home.

A siege is how a town changes hands. Win the field with enough siege weight, then hold the camp until a clock runs out. The defender, their other towns, and neighboring lords can send relief. Relief fights the camp in the open, with no wall bonus. If the camp is wiped out, drops below the holding population, or withdraws, the siege breaks. If it is still strong when the clock ends, the town is captured and that army becomes the garrison. While the camp sits outside, the town produces 30% of normal and new building and training take 2.5× as long.

Other lords are bots. Abandoned hamlets have no lord. Some are empty and worth raiding. Some still have stragglers.

The world speed (Relaxed, Standard, Blitz) multiplies the realm clock. It is a setting for the whole world, useful for learning or for a long evening, not a product.

## Bots act like people

Each bot has a personality (steward, raider, castellan, claimant), a difficulty, a chronotype, and a time zone offset from UTC.

Their day runs on **real wall-clock time**, not the sped-up game clock. A lord who sleeps 23:00–07:00 in their zone is offline for those eight real hours whether the world speed is 1× or 120×. Production, building, marches, and sieges still scale with world speed. Check-ins, busy periods, and the pause before the first click are real minutes too.

- They sleep. During that window they usually do not log in at all. A rare night check is possible, and even then they often miss what is in front of them.
- Each lord has a dedication, `wakeOnAlert`, rolled around a personality center with a wide spread (`src/game/config/ai.ts`). A hardcore lord keeps alarms on and can sit up for an attack or siege on their own town, or for a neighbor’s call for aid. They wait a groggy 4–22 real minutes, give an order if there is still time, and usually go back to sleep. A casual lord never wakes for an alarm. Most lords are in between and wake only when the roll lands under their chance. Castellans tend higher, stewards lower, but every type includes both.
- Work hours are busy: check-ins are sparse and the visit is short.
- While awake they sit down at irregular intervals, then wait a reaction delay before the first order. If the visit is shorter than that delay, they saw the screen and got pulled away.
- They do not fill the build queue the moment resources allow. One visit is one or two clicks, sometimes the wrong building, sometimes a raid that is too small.
- An attack or a siege that ends while they are asleep, or before they finish reacting, is not answered. If they notice in time they may sally, send relief from another town, or call the neighbors. A neighbor who is asleep answers only if their dedication wakes them, and only after the groggy delay. Everyone else waits for the next real visit.

Catch-up after you close the tab steps both clocks together. A login due at a real timestamp is applied at the game time that wall clock maps to under the current world speed. Changing speed does not move their bedtime.

None of that is shown to the player. The map names a town and its lord, and it shows points. A scout report lists troops, buildings, and resources. It does not list a personality, a difficulty, a sleep window, a time zone, a chronotype, whether they are awake, or whether they keep alarms on. The player learns how a lord behaves by watching what they do.

Schedules stay on the sim clock (`botClock: 'real'` by default). Tests can set `botClock: 'compressed'` so the same intervals run on the game clock. The client does not offer that switch.

All of the numbers live in `src/game/config/ai.ts`.

## Architecture

The simulation is plain TypeScript under `src/game` and does not import React. A later server can own the same `GameState` and call `advance`.

- `src/game/config/` — buildings, units, combat, world speed, and bot schedules.
- `src/game/sim/` — formulas, the event loop, combat, sieges, movement, and bot planning.
- `src/ui/` — the Origin Wars client.
- Saves go to `localStorage` under `origin-wars-save-v3`. A v2 save is kept, but bot logins are rescheduled onto the wall clock.

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
| `src/game/config/ai.ts` | Sleep, work hours, check-in gaps, reaction delays, wake-on-alert, personalities |

Production at level n is `base × growth^(n-1)` per game hour. Build cost and build time use the same shape. Headquarters divides build time by `1.05^level`.

## Tests

```bash
npm test
```

Vitest covers resource production and the storage cap, build times and the queue, recruit timers, combat (including the wall, rams, catapults, and scouts), sieges (the 20-minute floor, hamlet / mid-size / developed / cap durations, investing, relief, hampered production, a sleeping defender missing a short clock), and the bot schedule: sleep versus work, irregular logins, reaction delay, missed attacks, wake-on-alert, and a full scout that stays limited to troops, buildings, and resources. One case generates a realm and advances it an hour.

## Siege numbers

All of these live in `SIEGE` inside `src/game/config/world.ts`. Times are game-minutes. Divide by the world speed for real minutes.

| Knob | Value |
| --- | --- |
| Base duration | 480 min |
| Per headquarters level | +160 min |
| Per wall level | +240 min |
| Per town point | +28 min |
| Clamp | 400–12000 min |
| Weight | ram 1, catapult 2, commander 4 |
| Shorten | 2.5% per weight point, capped at 50% |
| Minimum weight to invest | 3 (one commander, or three rams, or a catapult and a ram) |
| Minimum population to hold the camp | 12 |
| Production while besieged | 30% |
| New build and train time | ×2.5 |
| Aid radius | 14 fields |

At Standard (20×), divide game-minutes by 20. These four are with no siege weight. A heavy camp can cut the raw duration by up to half, and the result never drops below the 20-minute floor.

| Town | Makeup | Real time at Standard |
| --- | --- | --- |
| Hamlet | Headquarters 1, no wall, 8 points | 43.2 minutes (21.6 after the full weight cut) |
| Mid-size | Headquarters 6, wall 6, 45 points | 3 hours 27 minutes |
| Developed | Headquarters 15, wall 15, 130 points | 8 hours 26 minutes |
| Cap, fully built | Headquarters 20, wall 20, 218 points | 10 hours |

Blitz (120×) is six times faster, so the same floor is 3 minutes 20 seconds and the same cap is 1 hour 40 minutes.

A fully built town’s raw duration sits above the cap, so a light camp (one commander, a 10% cut) still lasts the full 10 hours. A heavy camp pulls it down: 20% off is about 9 hours 43 minutes, and the full 50% cut is about 6 hours 5 minutes. A developed town at 8 hours 26 minutes outlasts a typical night unless the camp is heavy enough to cut it shorter. A hamlet does not.

Chance a bot who could raid will invest instead, if they have the weight: steward 8%, raider 38%, castellan 6%, claimant 72%. Chance they ride to help someone else’s call: steward 40%, raider 10%, castellan 72%, claimant 22%. The player is not told which is which.

Because bot hours are real, a full night is about eight real hours. A hamlet siege is over long before morning. A developed town can still be holding when the night ends. A lord who wakes for the alarm still needs the groggy delay (4–22 real minutes, plus a minute or two to give the order) and the march to fit before the camp falls. The longest aid-radius march is about six real minutes.

## Known gaps

- Single player. The sim is ready to move behind a server, but there is no networked realm yet.
- No alliances, messages, or shared tribes.
- The market is a lossy exchange plus shipments between your own towns, not an offer board.
- Combat is a readable model of attack, defense, wall, and luck, not a bit-exact copy of any live game.
- Support troops fight with the town’s research, not their home smithy.
- Terrain is scenery. Marches are straight lines.
- A very long absence at Blitz speed replays every event on the main thread and can hitch once when you return.
- Bots each start with one town. A claimant who takes another will only fuss over one or two of them per visit.
