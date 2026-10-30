# 2026: Storm Atlas

**Play now: https://knotenvy.github.io/Knotz2026/**

A playable, original vertical scrolling shooter. Choose one of three aircraft and fight through four Pacific sectors in two acts. Act I / Operation Long Meridian runs through the Shallows, Storm Wall and the Crown. Act II / Iron Monsoon pits you against LEVIATHAN in the typhoon. Equipment builds across Act I, and enemy pressure follows your carried arsenal in both acts. Authored aircraft and environment art combine with procedural lighting, weather, effects, music and sound. The public build contains the game shell, runtime modules, five local raster game assets and the brand icon and share-card images under `assets/brand/`.

## Run locally

Requires Node.js 20.11 or newer. No package installation is needed to play. Browser QA uses the optional development dependencies.

~~~powershell
npm run dev
~~~

Open http://127.0.0.1:4173/ for the development game. QA and review captures are written to `artifacts/`, which Git ignores.

## Build and deploy

~~~powershell
npm run build
$env:PORT = '4176'
npm run preview
~~~

Open http://127.0.0.1:4176/ to review the static build. Deploy the contents of dist/ as the static site root on your host. The build contains index.html, style.css, four presentation stylesheets under css/, the nineteen runtime modules under src/, and five WebP assets under assets/; it does not include workbench pages, reports, screenshots, scripts or tests. The preview server enforces that file allowlist and returns 404 for review paths.

## GitHub Pages

Repository: [KnotEnvy/Knotz2026](https://github.com/KnotEnvy/Knotz2026).

1. Open [Settings → Pages](https://github.com/KnotEnvy/Knotz2026/settings/pages).
2. Under Build and deployment, set Source to **GitHub Actions**.
3. Open [Actions](https://github.com/KnotEnvy/Knotz2026/actions/workflows/pages.yml), select **Test and deploy GitHub Pages**, and choose **Run workflow** on main.
4. After the deployment succeeds, play at **https://knotenvy.github.io/Knotz2026/**.

The workflow runs syntax checks, game/audio tests and the public build on main pushes and pull requests. Pull requests only validate. Main pushes and manual runs deploy after Pages is configured; before that, they complete the build and skip deployment with a notice. Every later push to main republishes the game.

The deployed artifact is dist/ only. Runtime links and imports are relative, so the game works under the repository URL path. The workflow installs development dependencies for browser QA; the published game has no external runtime dependencies or secret configuration. Official actions are pinned to verified commit hashes. The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

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
- src/render.js and src/background.js: procedural craft, scenery, in-world ambience and effects
- src/ui.js: combat HUD and critical-damage feedback
- src/main.js: browser input, screen flow and animation loop; it calls the presentation and audio modules through small hooks
- src/frontend.js: loading, the living title scene and the animated hangar blueprint (css/title.css)
- src/sequences.js: in-flight cinematics drawn over the playfield: sector intros, flagship warnings, phase cuts, sector-clear tallies and the end-of-run outro
- src/pause.js: the holding-pattern pause screen (css/pause.css)
- src/cinema.js: the end-of-sortie cinematics and flight-record reveal (css/end.css)
- src/ambience.js: the flight-command console around the playfield (css/ambience.css)
- src/timeline.js: shared names and timing (flagship warning lead, interlude length, the lightning schedule) so visuals and audio agree
- src/ships.js: aircraft data and drawing shared by the screens
- src/audio.js: audio engine, mixer and shared audio state; src/sfx.js: every sound effect and interface cue; src/music.js: the adaptive score; src/soundscape.js: environmental ambience beds
- src/art.js, src/settings.js and src/progress.js: raster loading, flight options and airframe records
- assets/: two original generated aircraft atlases and three environment paintings
- scripts/: local build, preview and QA utilities

## Quality and playtesting

The current suite covers gameplay, audio lifecycle, proportional analog input, collision ordering, final score persistence and player preferences. Run `npm test` and `npm run build`. For browser regression checks, run `npm ci`, `npx playwright install chromium`, start the development server and run `npm run qa`. Set `GAME_URL` to exercise a static preview; `CHROMIUM_EXECUTABLE` can select an existing browser. Set `QA_BROWSER=firefox` after installing that browser to run the same flow checks in Firefox. Browser captures are labeled as live gameplay or staged boss fixtures and saved under artifacts/current/. CI runs the public-build smoke checks as well as the portable tests.

PNG masters are preserved under assets/source/; only the compressed WebP variants are deployed.

The field manual includes separate music/effects/ambience levels, continuous fire, reduced shake/full-screen flash, and a visible collision core. Touch devices use readable HTML instruments, relative drag and controls in portrait or landscape. The controller can navigate pause/options with the D-pad, accept with A and return with B. These preferences persist locally.

See [PLAYTEST.md](PLAYTEST.md) for deployment and feedback instructions. The public repository contains source, portable tests and build/preview tools. Generated builds, old release archives, local comparison pages and machine-specific QA scripts are excluded.

### Audio

All audio was rebuilt from scratch in October 2026 and is fully synthesized with Web Audio. `src/audio.js` owns the context, unlock and mute, the mixer (combat, warning, effects, interface, music and ambience buses into a glue compressor and limiter), ducking, voice limits and the pause treatment. Each update it builds one shared state object (documented at the top of the file) and passes it to the score (`src/music.js`) and the ambience beds (`src/soundscape.js`). `src/sfx.js` designs every gameplay event plus the flagship warning siren, sector-clear fanfare, critical-hull pulse and interface cues. Thunder follows the same lightning schedule the playfield and page flash use. MUSIC, EFFECTS and AMBIENCE in the manual set the bus levels; SOUND mutes everything.

Audition renders live under `artifacts/audio-preview/` (sfx/, music/, ambience/, each with a README of what to listen for). They are local review files, not shipped assets, and none of them has been judged by ear yet.

For a music-free listening check, set MUSIC 0, EFFECTS 80 and AMBIENCE 60. Compare the three aircraft, dense targets, shields, WAKE, roll, specials and each sector environment. Judge impact, harshness, fatigue and masking by listening. Routing checks and peak meters do not establish perceived quality.

`npm run qa:audio` records three staged 12-second music-free clips under `artifacts/audio/` and verifies ambient-only output, isolated zero levels, pause silence, bounded sources and actual fire/special/roll events. It uses the same browser environment variables as Chromium QA. CI sets `QA_AUDIO_RECORD=0` to run the routing checks without recording the clips. Recordings are review artifacts, not shipped assets or human playtest evidence.

### Flagship drills and career

Vesper practice is available immediately in the hangar. Aurelia, Crown and LEVIATHAN drills unlock after encountering them during a campaign. Drills start with the arrival kit for that flagship and standard damage; they end after that flagship. Optional goals progress from securing a clear, to keeping all three lives, to a no-hit run. Result feedback distinguishes these outcomes without changing difficulty. Drills are explicitly unranked: practice score cannot change the campaign high score, earn career mastery or advance campaign records. Retry repeats the drill; Launch Sortie from the hangar starts the campaign.

Each airframe retains its best campaign score, sectors cleared, grazes, conversions, flights and victories locally. The flight record shows accuracy, hits taken, flight time, graze/conversion counts, a personal-best comparison and advice based on the run. Completed drills save separate fastest-time and fewest-hit benchmarks per airframe and flagship in `2026-drills`. These practice benchmarks never count toward campaign mastery or score. Career data uses `2026-career`; saves merge prior bests and new flights from other open tabs. Unavailable or corrupt storage falls back to a playable fresh career. Keyboard/touch buttons and D-pad menu navigation can enter drills. Enter on the selected aircraft launches a campaign; the departure bar also stays visible while the hangar scrolls. Global mute is available from pause in landscape.

Run `npm run qa:career` for drill isolation, controller menu, unlock persistence and debrief checks against development or static preview. Assisted terminal/encounter fixtures are labeled in the resulting artifacts. The QA runner reports a Firefox audio limitation separately when its context remains suspended at time zero. Game-flow checks can continue, while Chromium verifies routing and terminal voice counts. Routing checks are separate from listening certification.

Aurelia has an optional positional objective in phases two and three: direct fire can break a side reactor, opening an 88-pixel-wide cover lane for 3.2 seconds and awarding 1,000 points plus 20% WAKE. Its arm extends to a fixed side position during the opening cue, requiring a lateral firing line rather than incidentally rewarding centered fire. The main hull retains its normal armor/damage rules. Each phase offers one reactor; specials do not break it automatically. The final reactor also disables the right spiral cannon for the remainder of phase three; the left spiral, central fan and aimed volleys remain active. Cover removes hostile projectiles inside the marked lane and freezes on pause. Lane borders fade before expiry while the countdown stays opaque. Drill rewards remain unranked. `npm run qa:reactors` exercises aimed weapon damage, cover, pause and compact layouts with assisted encounter setup, separately labeled from normal complete encounters. Short landscape desktop windows also use the compact flight view so the full field fits at launch.

Crown's later phases introduce a tracking lance. Its marked lane follows the player for 0.65 seconds, locks for 0.85 seconds, then fires for 0.45 seconds. Bait the tracking aim and leave the lane after it locks. The accompanying projectile curtains are lighter; each full cycle lasts about 4.45 seconds in phase two and 3.85 seconds in phase three. Rolls retain their normal invulnerability, and any ship special vents the current charge. Pause freezes the attack. Warning/fire cues each use two voices on the effects combat bus; music composition remains unchanged. `npm run qa:lance` checks normal-rule Manta Crown play with assisted access only, then explicitly staged critical-hull portrait/landscape warning and control layouts.
