# Black Cat Flap — Persistent Chaser V4

A responsive **HTML5 / CSS / JavaScript** arcade game inspired by the tap-to-fly obstacle genre. The Black Cat still dodges pipes, but the main threat is now a **giant open-mouth cat that is present from the beginning of the run and continuously follows the player**.

The project is fully static and ready for **GitHub Pages**. No framework, backend, build step, API, or external image dependency is required.

## V4 visual polish

- Removed the blue/gray halo behind the giant cat.
- Rebuilt the mouth so the upper and lower jaws close on the same center line.
- Replaced the rigid saw-like teeth with fewer rounded teeth attached to curved gum lines.
- Enlarged the bite telegraph with a thick inner ring, a larger dashed outer ring and four warning brackets.
- Increased the top bite-warning banner for better readability on desktop and mobile.
- Changed every pipe to a magenta palette centered on `#DE1A58`.


## V4 — Persistent giant cat

V2 could delay the giant cat for too long because its spawn depended on the pipe and coin state. V4 removes that problem completely.

- The giant cat is created as soon as the run starts.
- It remains on-screen instead of spawning once and disappearing.
- During its safe/open phase it follows the Black Cat with a small amount of visual lag.
- When a bite is about to begin, the giant cat **locks its target**. It stops following the player's vertical movement, which gives the player a real chance to escape the mouth.
- The giant cat repeatedly attacks throughout the same run.
- Surviving a complete chomp awards **+2 points**.

## Fair bite cycle

The bite now uses a predictable state machine:

1. **Tracking / Open** — the mouth is fully open and safe while the giant cat follows the player.
2. **Attack queued** — new pipes temporarily stop spawning. Existing pipes are allowed to leave the danger lane first.
3. **Warning** — the target position is locked for about **1.42 seconds**. The HUD and an on-screen arrow indicate whether the player has more room to escape upward or downward.
4. **Closing** — the jaw visibly closes for about **0.74 seconds**. The dotted ellipse is the real danger area.
5. **Chomp** — only the final part of the close and the short snap are lethal.
6. **Reopening** — the mouth becomes safe again, the giant cat retreats slightly, and then resumes following the player.

This prevents an unfair situation where the mouth keeps tracking the player while closing. The attack also waits for the local pipe lane to become clear so a pipe and bite are not intentionally stacked into an impossible dodge.

## Power-up coins

The **first pipe of every run is guaranteed to contain a power coin**. Additional coins appear more frequently than in V2, roughly every **5–7 seconds** when a valid pipe gap is generated. The first bite cycle also waits longer than later cycles so the opening coin has time to reach the player on wide desktop screens.

Every power has a visible countdown and automatically expires.

| Coin | Power | Duration | Effect |
| --- | --- | ---: | --- |
| `↻` | **Second Chance** | 15s | If the player is hit while active, the Black Cat revives at the death position, keeps the score, gains recovery grace, and forces the giant cat to reopen. |
| `◆` | **Force Field** | 10s | Creates a temporary shield that blocks one hit from a pipe or the giant-cat bite. |
| `★` | **Immortality** | 6s | Ignores pipe, floor and giant-cat damage while active. |
| `◐` | **White Cat** | 10s | Temporarily changes the playable Black Cat into a white cat. This remains a cosmetic timed effect. |

Collecting the same coin again refreshes that power's timer.

## Scoring

- Pass a pipe: **+1**
- Escape a giant-cat chomp: **+2**

## Controls

### Desktop

- `Space`
- `W`
- `Arrow Up`
- Mouse click
- `P` / `Esc` to pause

### Mobile / tablet

- Tap the game area
- Or use the large paw button in the lower-right corner

## Responsive behavior

The canvas, physics, giant-cat size, bite target, pipes, coins, HUD, timers and touch controls adapt to desktop monitors, laptops, tablets, portrait phones, landscape phones and high-DPI screens. The giant cat is also rescaled and repositioned after a resize or orientation change.

On narrow screens the bite HUD automatically switches to compact labels such as `BITE 1.2s ↑` so the timer remains readable instead of being truncated.

## GitHub Pages

Upload these files to the repository root:

```text
index.html
style.css
game.js
favicon.svg
README.md
```

Then enable **Settings → Pages → Deploy from a branch**, choose the branch (usually `main`) and `/ (root)`.

## Technical notes

- Vanilla JavaScript
- HTML5 Canvas rendering
- Responsive CSS HUD and overlays
- `localStorage` high score
- Web Audio API sound effects generated at runtime
- No external image dependencies
- Canvas-drawn Black Cat, pipes, clouds, coins, particles and giant cat
- Persistent giant-cat state machine with locked bite targeting
- Power-up state and countdown timers handled client-side

## Reference

The tap-to-fly interaction model was informed by the MIT-licensed `bxzex/flapbird` repository. The rendering, persistent giant-cat behavior, bite timing, power-ups and responsive systems in this project are custom implementations.


## Project structure

```text
blackcat-flap/
├── index.html
├── favicon.svg
├── README.md
└── assets/
    ├── css/
    │   └── style.css
    └── javascript/
        └── game.js
```

The HTML file references `assets/css/style.css` and `assets/javascript/game.js`, so the project remains ready for static hosting on GitHub Pages.
