# 2026: Storm Atlas

A playable, original vertical scrolling shooter. Choose one of three aircraft and fight through three Pacific sectors. Gameplay art, interface elements, effects, music and sound are generated at runtime. The public build contains only the game shell and its six runtime modules.

## Run locally

Requires Node.js 20.11 or newer. No package installation is needed.

~~~powershell
npm run dev
~~~

Open http://127.0.0.1:4173/ for the development game. The existing local workbench and review captures remain in the original workspace and are excluded from Git.

## Build and deploy

~~~powershell
npm run build
$env:PORT = '4176'
npm run preview
~~~

Open http://127.0.0.1:4176/ to review the static build. Deploy the contents of dist/ as the static site root on your host. The build contains index.html, style.css, and the six procedural runtime modules under src/; it does not include workbench pages, reports, screenshots, scripts or tests. The preview server enforces that file allowlist and returns 404 for review paths.

## GitHub Pages

Repository: [KnotEnvy/Knotz2026](https://github.com/KnotEnvy/Knotz2026).

1. Open [Settings → Pages](https://github.com/KnotEnvy/Knotz2026/settings/pages).
2. Under Build and deployment, set Source to **GitHub Actions**.
3. Open [Actions](https://github.com/KnotEnvy/Knotz2026/actions/workflows/pages.yml), select **Test and deploy GitHub Pages**, and choose **Run workflow** on main.
4. After the deployment succeeds, play at **https://knotenvy.github.io/Knotz2026/**.

The workflow runs syntax checks, game/audio tests and the public build on main pushes and pull requests. Pull requests only validate. Main pushes and manual runs deploy after Pages is configured; before that, they complete the build and skip deployment with a notice. Every later push to main republishes the game.

The deployed artifact is dist/ only. Runtime links and imports are relative, so the game works under the repository URL path. There is no dependency installation or secret configuration. Official actions are pinned to verified commit hashes. The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

To preview the same URL layout locally:

~~~powershell
npm run build
$env:PORT = '4176'
$env:BASE_PATH = '/Knotz2026/'
npm run preview
~~~

Open http://127.0.0.1:4176/Knotz2026/. Omit BASE_PATH, or set it to '/', for a root preview.

## Playtest checklist

- Enter the hangar, select each aircraft, and launch a sortie.
- Check movement, firing, focus, special, roll, touch controls and any connected controller.
- Open the field manual during flight; confirm the sortie clock and aircraft stop, then continue after closing it.
- Pause and resume with both buttons and keyboard; switch tabs during flight and confirm the game pauses.
- On the flight record, use Skip once and confirm it reveals the result before any launch action.

## Controls

| Action | Keyboard | Mouse / touch | Controller |
| --- | --- | --- | --- |
| Move | WASD / arrows | Drag on playfield | Left stick / D-pad |
| Fire | Space / Z | Hold on playfield | A / right trigger |
| Focus | Shift | FOCUS button | Left trigger / bumper |
| Ship special | X | NOVA / BARRIER / STORM button | B |
| Barrel roll | C | ROLL button | X |
| Pause / resume | P / Esc / Enter | Pause / resume button | Start |
| Open hangar / launch | Enter / Space | On-screen buttons | A / Start |
| Select aircraft | Arrows / WASD in hangar | Tap an aircraft card | Left stick / D-pad |

In the hangar, arrows select an aircraft; Tab moves to Back and Launch. Enter or Space activates the focused button.

Sound starts on first interaction because browsers gate Web Audio until a user gesture. The SOUND button mutes and unmutes it.

## Runtime layout

- src/game.js: gameplay, enemies, pickups, stages, bosses and scoring
- src/render.js and src/background.js: procedural craft, scenery and effects
- src/ui.js: combat HUD and critical-damage feedback
- src/audio.js: Web Audio music and sound synthesis
- src/main.js: browser input, screen flow and animation loop
- scripts/: local build, preview and QA utilities

## Quality and playtesting

The optimization release passed 34 game/audio tests, 18 browser check groups and 974 matching full-campaign checkpoints. Historical reports and recordings remain local; CI reruns the portable tests and build for every change.

See [PLAYTEST.md](PLAYTEST.md) for deployment and feedback instructions. The public repository contains source, portable tests and build/preview tools. Generated builds, old release archives, local comparison pages and machine-specific QA scripts are excluded.
