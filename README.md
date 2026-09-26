# Run It Back

A small web app for learning K-pop dance covers faster from a YouTube practice video.

- Plays the video mirrored, with speed control, full screen and mute
- Set a rough tempo, then mark two 1s far apart: the app works out the exact tempo and counts 1–8 for you
- Flash and click on every count, to check the count lines up
- Trim the part you want to learn. It is cut into 8-count blocks automatically
- Each block starts on a 5-6-7-8 count-in and runs through your speeds (slow, faster, full speed), with a short pause after each run
- Every few blocks are connected together, then the whole section runs with the music
- Speeds, repeats, count-ins, pauses and block sizes are all adjustable

Everything runs in your browser. Your covers and settings are saved on your own device only.

## Files

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

| File | What it does |
|---|---|
| `index.html` | The page markup |
| `styles.css` | All the styling |
| `js/app.js` | The app: state, the YouTube player, the practice session, and keeping the page up to date |
| `js/beats.js` | Working out the tempo, from taps or from two marked 1s |
| `js/grid.js` | The beat grid: beats, counts, blocks and the trimmed range |
| `js/plan.js` | The practice plan (which part at which speed, in what order) and count-ins |
| `js/storage.js` | Saving on the device, and upgrading older saves |
| `js/log.js` | The private debug log behind the Log button |
| `js/util.js` | Small helpers |
| `tests.html`, `js/tests.js` | Tests for the logic modules |

`beats.js`, `grid.js` and `plan.js` never touch the page, so they can be tested on their own.

## Running it locally

Serve the folder with any static web server and open it in a browser, for example:

```
ruby -run -e httpd -- . -p 5173
```

Opening `index.html` directly from disk won't work: JavaScript modules and YouTube's player both need a web address.

Open `tests.html` on the same server to run the tests.

## Releasing

Change `APP_VERSION` at the top of `js/app.js` with every release. The debug log shows it, so you can tell which version a phone is running.

This project is not affiliated with YouTube.
