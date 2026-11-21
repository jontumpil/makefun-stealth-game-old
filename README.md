# Shadowstep

[![Competition](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![Rank](https://make.fun/badge/best-stealth-game-20261121-1759/jontumpil/makefun-stealth-game/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard)
[![Reward](https://make.fun/badge/best-stealth-game-20261121-1759/jontumpil/makefun-stealth-game/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

An original top-down **stealth game** for the make.fun competition
**best-stealth-game**: slip through the Lantern Manor at night,
lift every golden relic, and reach the exit unseen.

## The game

Three wings of a lantern-lit manor, drawn from above:

- **Guards with real vision cones.** Each guard patrols a loop with
  a lantern; the amber cone is raycast against the walls, so a
  corner genuinely breaks a sight line. Being seen fills the Eye
  meter — full meter, and the manor wakes.
- **Cover that works.** Deep indigo rugs are pools of shadow:
  stand on one and you fade from sight (unless a guard is close
  enough to trip over you).
- **Noise is a mechanic.** Walking is silent; holding Shift hurries
  — and hurrying is loud. A guard who hears you leaves his patrol
  to investigate, looks around, then returns.
- **A clean job.** Each wing's exit stays barred until every relic
  is in your bag. The win screen grades the run: time, and how
  often you were glimpsed.

## Controls

- **Arrow keys / WASD** — move (or **click** where to walk)
- **Shift** — hurry (fast, but loud)
- **Enter** — begin, retry a wing, advance to the next wing

## Tech

Plain HTML canvas and JavaScript; every sound is synthesized with
WebAudio (steps, a pickup chime, a glimpse sting, the heartbeat
that rises with the alarm). No assets, no network, no
dependencies. `main.ts` assembles the hand-in dossier; `serve.ts`
is a tiny local server for play-testing.

## License

MIT
