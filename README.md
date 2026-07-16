# MCU Field Log

A personal, local Marvel watch tracker: narrative order, ratings, watched timestamps, and spoiler-safe post-credit scene indicators. Runs entirely on your own computer — no account, no subscription, no internet required after setup.

## One-time setup

1. **Install Node.js** (free, one-time): go to https://nodejs.org and download the "LTS" version for your operating system. Run the installer with default settings.
2. **Unzip this folder** somewhere on your computer (e.g. Desktop).
3. Open a terminal / command prompt **inside this folder**:
   - Windows: open the folder, click the address bar, type `cmd`, hit Enter.
   - Mac: right-click the folder → "New Terminal at Folder" (or open Terminal and `cd` into it).
4. Run:
   ```
   npm install
   ```
   This downloads the one small piece the app needs to run (only needs to be done once).

## Running it

Every time you want to use the app:
```
npm start
```
Then open **http://localhost:3939** in your browser. Leave the terminal window open while you use it; closing the terminal stops the app.

Your watched status, ratings, and timestamps are saved in `data/progress.json` — that file **is your save data**. It updates automatically every time you mark something watched or rate it. Don't delete it unless you want to start over.

 same folder (zip it up again). He follows the exact same setup steps on his own computer. His `data/progress.json` will be separate from yours, so you each track your own watched status and ratings independently.



- Phase One (7 films/appearances), narrative order + release order toggle
- Movie detail: summary, key characters to track, post-credit scene count (spoiler-free)
- Mark watched (with exact timestamp), rate 1–10
- Phase progress bar

## Coming next (not built yet)
- Additional phases
- Character database with phase-aware spoiler control
- Overall stats (hours watched, average rating)
- Possibly: Fox movies, anime section
