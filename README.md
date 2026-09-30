# Run It Back

A small web app for learning K-pop dance covers faster from a YouTube practice video.

- Plays the video mirrored, with speed control, full screen and mute
- Set a rough tempo, then mark two 1s far apart: the app works out the exact tempo and counts 1–8 for you
- Flash and click on every count, to check the count lines up
- Trim the part you want to learn. It is cut into 8-count blocks automatically
- Each block starts on a 5-6-7-8 count-in and runs through your speeds (slow, faster, full speed), with a short pause after each run
- Every few blocks are connected together, then the whole section runs with the music
- Each video has its own practice plan: pick Chill, Standard or Speed run, or customise the speeds, repeats, count-ins, pauses and block sizes
- As you add blocks, everything learned so far runs from the top (1–2, then 1–3, then 1–4…)
- Share a practice as a link: whoever opens it gets the video with the beat and part already set, and your practice plan if you choose
- Again redoes a run, Next skips to the next speed, and next time you can continue where you left off
- The screen stays on while a video is open, so your phone doesn't lock mid-practice
- Install it to your home screen: it opens full screen and starts offline

Everything runs in your browser. Your covers and settings are saved on your own device only.

## Files

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

| File | What it does |
|---|---|
| `index.html` | The page markup, plus the search and link-preview details in its `<head>` |
| `privacy.html` | The privacy page (linked from the home page footer). Update it before adding analytics, ads or anything that sends data |
| `guides/` | Practice guides for search engines to find (each links back to the app). Add new ones to `guides/index.html`, the Guides card in `index.html` and `sitemap.xml` |
| `sitemap.xml` | The list of pages for search engines (submit it in Google Search Console). Add new pages to it |
| `icons/share.png`, `tools/share-image.html` | The link-preview picture, and the page it is drawn from (how to redraw it is at the top of that file) |
| `styles.css` | All the styling |
| `js/app.js` | The app: state, the YouTube player, connecting the practice session to it, keeping the page up to date, and the Share panel and shared-practice card |
| `js/beats.js` | Working out the tempo, from taps or from two marked 1s |
| `js/grid.js` | The beat grid: beats, counts, blocks and the trimmed range |
| `js/plan.js` | The practice plan (blocks, connected runs, from-the-top runs, the whole section, at which speeds), count-ins, and where to continue |
| `js/practice.js` | The practice session: runs, pauses, count-ins, Again and skipping ahead |
| `js/share.js` | Share links: packing a cover's setup (and optionally the practice plan) into a link, and reading it back |
| `js/storage.js` | Saving on the device, upgrading older saves, the default plan and presets, and each video's own plan |
| `js/log.js` | The private debug log behind the Log button |
| `js/site.js` | Visit counts (GoatCounter) and the tip link, switched on by the two settings at its top |
| `js/pwa.js` | Installing to the home screen, and registering the service worker |
| `js/wakelock.js` | Keeping the screen on while a video is open, so the phone doesn't lock mid-practice |
| `js/util.js` | Small helpers |
| `sw.js` | Service worker: the app opens offline, and updates never mix old and new files |
| `manifest.webmanifest`, `icons/` | The installed app's name and icons |
| `tools/make-icons.rb` | Draws the icons (`ruby tools/make-icons.rb`) |
| `tests.html`, `js/tests.js` | Tests for the logic modules |
| `e2e/` | Browser tests: the whole app in a real browser, with a pretend YouTube player (see Tests below) |
| `.github/workflows/tests.yml` | Runs the browser tests on GitHub for every pull request |

`beats.js`, `grid.js`, `plan.js` and `practice.js` never touch the page, so they can be tested on their own (the practice
session is tested with a pretend player and clock).

The live site is https://wjiamin.github.io/run-it-back/ (GitHub Pages). The full addresses in `index.html`, `privacy.html`
and `sitemap.xml` use it, so change them if the site moves.

## Running it locally

Serve the folder with any static web server and open it in a browser, for example:

```
ruby -run -e httpd -- . -p 5173
```

Opening `index.html` directly from disk won't work: JavaScript modules and YouTube's player both need a web address.

Open `tests.html` on the same server to run the tests.

## Tests

There are two kinds:

- **Logic tests** (`tests.html`, `js/tests.js`): open `tests.html` on the local server. They cover the modules that never touch
  the page: tempo, beat grid, practice plan, practice session, saving, presets and share links.
- **Browser tests** (`e2e/`): the whole app in a real browser, using [Playwright](https://playwright.dev). YouTube is swapped for a
  pretend player (`e2e/fake-youtube.js`) that behaves like the real one where it matters (including the way it gets stuck at the end
  of a video), and visit counting is blocked. They check every page loads and fits a phone, sharing and opening share links,
  per-video plans, and practice at the end of a video. They also run the logic tests.

GitHub runs both on every pull request (`.github/workflows/tests.yml`); a failing run keeps its report for 14 days.
To run them yourself (needs [Node.js](https://nodejs.org) 22 or later):

```
cd e2e
npm install
npx playwright install chromium
npx playwright test
```

The app itself still has no dependencies: Playwright is only for testing.

## Releasing

Change `APP_VERSION` at the top of `js/app.js` with every release. The debug log shows it, so you can tell which version a phone is running.

If you add or rename a file, add it to `FILES` in `sw.js` and change `CACHE` there (for example `run-it-back-v2`), so installed apps pick up the new list.

This project is not affiliated with YouTube.
