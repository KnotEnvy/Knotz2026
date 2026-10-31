# Public playtesting through GitHub Pages

Repository: https://github.com/KnotEnvy/Knotz2026

## Publish

1. Open [Settings → Pages](https://github.com/KnotEnvy/Knotz2026/settings/pages) and select **GitHub Actions** as the source.
2. Open the [Pages workflow](https://github.com/KnotEnvy/Knotz2026/actions/workflows/pages.yml), choose **Run workflow**, and select main.
3. Wait for the build and deployment jobs to pass. Share **https://knotenvy.github.io/Knotz2026/** after deployment succeeds.

Each later push to main tests, builds and republishes the game. The workflow uploads only the public dist/ build, which excludes local review hooks, fixtures and evidence. No custom secrets or backend are required. Until Pages is enabled, the workflow validates and builds while skipping deployment.

## Check the published game

- Choose each aircraft and launch a sortie.
- Confirm keyboard/mouse controls and sound after the first interaction.
- Open the field manual during flight, then close it and continue.
- Pause, resume, switch tabs and try the touch buttons on a phone.
- Check that the end cinematic can be skipped before retrying.

The current local build passes Chromium and Firefox flow checks, including emulated portrait/landscape touch and the maximum-height shield/boss instruments. Actual phones/tablets and physical controllers still need hands-on testing. Local results do not establish what is currently deployed on Pages.

## Ask players for

- Browser, device, input method, ship chosen and sector reached.
- Whether movement, firing, focus, roll and special feel responsive and clear.
- Any unreadable attack, hitch, crash or confusing upgrade, with a screenshot/video if possible.
- Whether impact feedback, music, ambient sound and progression are satisfying. All audio, including the score, was rebuilt in October 2026 and has not been judged by ear yet, so listening notes are especially valuable.

## Sound check

Listen in two passes. Set MUSIC to 0, EFFECTS to 80 and AMBIENCE to 60 in Manual / Options. Compare all three aircraft for roughly a minute each, then try a dense flagship encounter. Listen for weak primary fire, harsh rail/shield transients, explosions that mask warnings, repetitive pickups, and wind/engine beds that compete with combat. Try pausing, muting and lowering each bus separately. Record the ship, sector, cue and listening device with each observation; meters alone cannot settle sound quality. Then set MUSIC back to 80 and play from the title through a full sortie. Note whether the main theme sticks, whether the flagship warning and boss themes raise tension, whether cue changes or the sector-clear fanfare feel abrupt, and whether the music ever masks the lance, flagship warning or critical-hull cues.

## Campaign check

Act I / Operation Long Meridian covers sectors 1–3: the Shallows, Storm Wall and the Crown. Act II / Iron Monsoon is sector 4, against LEVIATHAN. Check the ACT I launch beat and sector labels, act labels in pause and drills, and the act reached on the flight record. Note whether collecting equipment raises pressure smoothly, and whether a scatter gives enough breathing room to rebuild.

Start with the Vesper drill in the hangar. Compare hits taken and flight time over two or three clears with the same aircraft; separate drill bests appear on its button and result screen. Report whether the gaps stay readable, phase changes make sense, and the next attempt improves. Drill benchmarks remain separate from campaign records.

Use ordinary damage and controls, without fixtures or invulnerability. Include a first-time shooter player and an experienced player when possible. Note the sector, phase, hull and reserve resources at each death. Pay particular attention to whether the second lane opening is understood, whether Crown phase changes give enough time to recover, and how each aircraft regains power after losing a life. Report what caused the problem and what the player expected to happen. Automated runs and staged scenes establish behavior and presentation; they do not establish human difficulty or replay appeal.

For Aurelia, first observe whether the player notices and can explain the side targets without coaching. Then compare a main-hull approach with deliberate reactor aiming: the left reactor buys 3.2 seconds of cover, while the final right reactor also disables its spiral cannon for the rest of the fight. Record whether the aiming cost feels worthwhile, whether cover expiry stays readable at critical hull, and whether the remaining attacks make the disabled cannon's effect clear. Repeat with another airframe when practical. Check the small in-field labels on a physical phone; emulated screenshots do not settle legibility.

For Crown, record whether players distinguish tracking from the locked lane and leave before the lance fires. Note the warning time, position and any competing projectile that made an escape unclear. Compare an ordinary lateral escape with a roll or special; a special should vent the current charge, and pausing should hold its timer. Test the critical-hull warning at natural phone size. The user described the new lance as “Clear and satisfying,” supporting the current timing for this pass. Aircraft, device, duration and outcome were not specified; broader campaign and physical-device checks remain open.

The game has no feedback submission service; collect reports through your chosen channel.

For local build and preview commands, see [README.md](README.md).

SKYFORGE (sector 5) climbs above the typhoon into dusk. Watch for bombers from below, marked flak bands, sky aces and flying foundries. Break HALCYON’s bays, follow the laser gaps and roll through EMP pulses to protect escorts. HALCYON ends the current campaign; its drill unlocks on encounter. Act II continues.

### SKYFORGE round 2 — world iterator (2026-10-31)

World changes: cached cumulus tops with warm rims, shaded bases, three scroll rates
(0.025 / 0.055 / 0.12), sun glare, and rotor/gantry/furnace platforms with cloud
shadows (`art.js`). `warmSkyforge()` bakes and rasterizes every tile once, reads
one pixel, then returns immediately on subsequent calls. The combat iterator
calls it during the LEVIATHAN interlude.

`WorldAmbience.drawSkyforgeOver(c, game)` draws three thin amber strokes after the
player and before hostile bullets. Reduced effects omits them. `background.js`
also replaces the red lightning sprite with violet, clips it below y=285, uses
0.28 / 0.12 normal/reduced opacity multipliers, and adds a short cloud bolt.
The seven-second `lightningAt(time, 5)` schedule remains unchanged.

`main.js` and `css/ambience.css` shorten route names, give all nodes equal space,
and show only the active node's name. Five- and six-node fixtures have no route
overflow at 1440, 1280 and 1102 px. `ambience.js` uses flagship classes, logs
HALCYON breaking apart, throttles bay/flak messages, resets per-sortie throttles,
and removes stale EMP log lines on reset and flagship death. `cinema.js` keys its
victory backdrop by stage: sector 5 uses dusk above clouds. Result copy says
SECTOR 05 CLEARED / ACT II CONTINUES; sector 6 will say ACT II CLEARED / ACT III
AWAITS. `main.js` also names the actual defeated flagship in the cinema kicker.
`index.html` hangar copy mentions climbing above the storm.

Evidence lives in `artifacts/s5-r2-world/`: `sky-scroll-{0,2000,6000,11000}.png`
(parallax), `sector-4-vs-5.png`, `lightning-floor.png`,
`wisps-player-bullets.png`, `factories.png`, `desktop-route-1440.png`,
`route-{1440,1280,1102}-{5,6}.png`, `victory-cinema.png`, `victory-record.png`,
and `hangar.png`. Captures use the real game and renderer with frozen technical
fixtures, including authored bullet positions. No temporary over-player draw
call was needed: combat had already wired the export. The sixth route node is a
DOM-only fixture; sector 6 gameplay is not implemented.

Verification: 191 Node tests passed; build produced 34 runtime files; career QA
passed. The initial browser run found a non-finite gradient in combat-owned
`Renderer.drawEffects` / `bloom`; a trace is preserved in
`browser-trace/qa.json`. The combat iterator subsequently changed its effect
filter; the final full browser rerun passed with zero page errors
(`browser-final/qa.json`). `verification.json` proves
EMP reset removes the stale log, reduced effects omits wisps, and lightning
cannot paint above the cloud floor.

Performance (`report.json`): 240 requestAnimationFrame-paced background draws,
p50 0.10 ms, p95 0.20 ms, max 9.40 ms (CPU submission, software Chromium;
concurrent iterator/QA processes were active). Repeated warming averaged
0.00030 ms; a fresh-page cold bake plus forced raster measured 112.40 ms and
10,000 repeated calls averaged 0.00045 ms (`verification.json`). Cold work now
happens before sector 5 rather than on its first gameplay frame. No new visual
judge score is claimed. Own QA server: port 4391, PID 2028892; stopped after verification.

### Sector 6: ZERO MERIDIAN

Six sectors now end with THE SOVEREIGN, a mirror capital ship at the edge of space. Break its escorts, shoot shards and cut salvage tethers. Clearing it completes Act II; Act III remains unplanned. Check the eclipse, Earth limb, aurora, climb from SKYFORGE, clear tally and ACT III tease on desktop, phone, compact and reduced effects.
