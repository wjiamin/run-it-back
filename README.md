# Run It Back

A small web app for learning K-pop dance covers faster from a YouTube practice video.

- Plays the video mirrored, with speed control, full screen and mute
- Set a rough tempo, then mark two 1s far apart: the app works out the exact tempo and counts 1–8 for you
- Flash and click on every count, to check the count lines up
- Trim the part you want to learn. It is cut into 8-count blocks automatically
- Each block starts on a 5-6-7-8 count-in and runs through your speeds (slow, faster, full speed), with a short pause after each run
- Every few blocks are connected together, then the whole section runs with the music
- Speeds, repeats, count-ins, pauses and block sizes are all adjustable
- Again redoes a run, Got it moves on, and next time you can continue where you left off
- Install it to your home screen: it opens full screen and starts offline

Everything runs in your browser. Your covers and settings are saved on your own device only.

## Files

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

| File | What it does |
|---|---|
| `index.html` | The page markup |
| `styles.css` | All the styling |
| `js/app.js` | The app: state, the YouTube player, connecting the practice session to it, and keeping the page up to date |
| `js/beats.js` | Working out the tempo, from taps or from two marked 1s |
| `js/grid.js` | The beat grid: beats, counts, blocks and the trimmed range |
| `js/plan.js` | The practice plan (which part at which speed, in what order), count-ins, and where to continue |
| `js/practice.js` | The practice session: runs, pauses, count-ins, Again and Got it |
| `js/storage.js` | Saving on the device, and upgrading older saves |
| `js/log.js` | The private debug log behind the Log button |
| `js/pwa.js` | Installing to the home screen, and registering the service worker |
| `js/util.js` | Small helpers |
| `sw.js` | Service worker: the app opens offline, and updates never mix old and new files |
| `manifest.webmanifest`, `icons/` | The installed app's name and icons |
| `tools/make-icons.rb` | Draws the icons (`ruby tools/make-icons.rb`) |
| `tests.html`, `js/tests.js` | Tests for the logic modules |

`beats.js`, `grid.js`, `plan.js` and `practice.js` never touch the page, so they can be tested on their own (the practice
session is tested with a pretend player and clock).

## Running it locally

Serve the folder with any static web server and open it in a browser, for example:

```
ruby -run -e httpd -- . -p 5173
```

Opening `index.html` directly from disk won't work: JavaScript modules and YouTube's player both need a web address.

Open `tests.html` on the same server to run the tests.

## Releasing

Change `APP_VERSION` at the top of `js/app.js` with every release. The debug log shows it, so you can tell which version a phone is running.

If you add or rename a file, add it to `FILES` in `sw.js` and change `CACHE` there (for example `run-it-back-v2`), so installed apps pick up the new list.

This project is not affiliated with YouTube.
