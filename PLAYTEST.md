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

Desktop Edge and emulated mobile touch passed the previous release checks. Actual phones/tablets, other browsers and physical controllers are useful human feedback targets.

## Ask players for

- Browser, device, input method, ship chosen and sector reached.
- Whether movement, firing, focus, roll and special feel responsive and clear.
- Any unreadable attack, hitch, crash or confusing upgrade, with a screenshot/video if possible.
- Whether music, impact feedback and progression are satisfying.

The game has no feedback submission service; collect reports through your chosen channel.

For local build and preview commands, see [README.md](README.md).
