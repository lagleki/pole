# DIFF_FROM_ORIGINAL

Accepted, intentional deviations of the TypeScript port from the original DOS game.
The behavioral oracle is the public-domain Delphi reconstruction (`Pole2/PoleWin32.dpr`);
where that reconstruction itself deviated from DOS (per `Pole2/Readme.md`), the port
follows DOS unless noted. Full policy with rationale: `docs/architecture.md`.

## Web-platform substitutions (no DOS equivalent possible)

1. **Esc** restarts to the splash screen instead of exiting to DOS (`ExitProcess`).
   As in the original, nothing is persisted on exit.
2. **Tab** (boss key) mutes the sound but cannot minimize the browser window.
3. **Alt+Enter** toggles fullscreen via the browser Fullscreen API instead of the
   Win32/DOS mode switch.
4. **Top-8 list (POLE.PIC)** is updated in session memory only — never written to disk
   (CLAUDE.md hard constraint). Insertion semantics (strict-less, 0-based rank labels,
   `$` suffix, inserted-row highlight) match the original exactly.
5. The two hand-cursor busy-loops yield to the event loop every 10 ms (the original
   busy-waited the CPU); timing of all visible behavior is unaffected.
   Click or Space on the splash intro leaves immediately to the studio and
   stops the opening music; the original waited out the animation.
6. Sound is produced by an 8 kHz PWM synth through WebAudio at a fixed master gain.
   Envelopes, frequencies, durations, and pacing replicate the original routines;
   the speaker timbre is an approximation (parity case `ts-audio-approximation`).

## Evidence-based corrections to the reconstruction

7. **OVL pairing**: words are odd records, themes even records (verified directly
   against POLE.OVL). The literal reconstruction indexing pairs word w+1 with theme w
   and reads out of bounds at the last word; the port uses the verified pairing.

## DOS-first policy calls (reconstruction deviated; port follows DOS, capture-unverified)

8. **Box (шкатулки) trigger**: after 3 successful moves (DOS) rather than 3 opened
   letters (reconstruction), and offered to human seats only.
9. **NPC on СЕКТОР ПРИЗ**: always answers «Играем!» — NPCs never take the prize.
10. **Prize bargaining**: Yakubovich always escalates to МИЛЛИОН before handing over
    the prize (the reconstruction could stop earlier at random).
11. **Player speech**: only NPC seats get speech bubbles; the human plays silently.

## Reconstruction behaviors kept although DOS differed

12. **Player modes.** The web default is «1 игрок + 2 НПС»: only seat 2 is
    prompted for a name and an empty name keeps the seat human as «ИГРОК».
    The settings tab offers «2 игрока (как в оригинале)», which restores the
    original prompts for seats 2–3 with the reconstruction's empty-name → NPC
    fallback (DOS itself kept unnamed seats human). Seat 1 is never prompted
    in any mode, exactly as in the code.
13. **Word-repeat avoidance across stages** (DOS could repeat words): kept; if the
    session question pool has fewer than 8 entries, repeats are allowed to avoid the
    original's selection soft-lock.
14. **Word/round-title centering** and the **board-typed word entry** follow the
    reconstruction; the DOS placement/mechanism is unknown pending captures
    (parity case `ts-text-centering-provisional`).

## Minor

15. The brick-wall pattern was effectively fixed in the original (drawn before the
    RNG was seeded); the port draws it from the seeded RNG stream, so it varies per
    run and follows `?seed=`.
16. The admin question editor sanitizes words to А–Я (a word containing any other
    byte could never be completed or solved by the engine).
17. Sound defaults to OFF — this matches DOS (the reconstruction turned it on by
    default); listed here for visibility, not a deviation.
18. **Wheel spin (superseded for live play by DIFF #26).** The DOS animation
    travelled `(random(10)+5) shl 1` half-steps. Live play now uses the 36-sector
    TV drum and a long ease-out spin; the oracle 16-wedge tables remain in
    `constants.ts` / `defaultFlowSpec` for documentation tests.
19. **SVG drum overlay.** The four `FORTUNE_WHEEL` frames, 16 rim icons and
    arrow sprite are no longer blitted into the framebuffer. Live play is a
    36-sector TV drum (DIFF #26) in the original 223×172 box at (128, 154).
    Esc / splash / prize / endgame still hide it. Seat 1 continues to be
    redrawn under the drum rect.
20. **Mid-game localStorage resume (PWA reloads).** A checkpoint is written
    at stable turn/stage boundaries (`pole-chudes-2:progress`). Reloading the
    page (or reopening the installed web app) continues the current round or
    the next stage. `between-rounds` is written again at the start of
    `stageSetup` (before round-start music), so a reload re-runs setup and
    plays the intro bed after the audio gate. Esc, «Новая игра» and a
    player-mode change discard the save, as in DIFF #1. Sound and 1P/2P prefs
    live in `pole-chudes-2:prefs`. Seeded/`?fast=` runs do not read or write
    storage (smoke stays deterministic). Question-editor edits remain
    session-only with explicit OVL download.
21. **Host TTS.** Yakubovich no longer prints a speech bubble or the round
    theme on the DOS surface — those lines go through the browser Speech
    Synthesis API (`ru-RU` on every utterance, including Android `ru_RU` voices). The PWM 7-burst
    mumble still runs for RNG/timing (muted). Every player replica (letter,
    drum/word choice, prize, шкатулки) is spoken through TTS in a male or
    female voice (NPC gender; human names ending in А/Я are treated as
    female except a short list like Илья/Никита). That voice is not the
    host’s. NPC talk bubbles are unchanged.
    Web sound defaults to ON so the host is audible after the first gesture
    (Android Chrome blocks intro mp3s until a tap; the play view waits for
    that tap and then unlocks every SFX element). Ctrl+S / the sound button still mute both TTS and SFX. Spin/round-win
    lines use the name typed at presentation (not «2-ой игрок»). Static host
    cues are one spoken sentence with punctuation (not two DOS bubble rows).
    A name plus a continuation still joins with a comma when needed. Punctuation
    from the lines and CHGK prompts is kept in the TTS string; remote URLs encode ? ! . , and clip at a
    sentence end). If the browser has no speechSynthesis voices (typical
    Chromium on Linux), the host falls back to Google Translate TTS audio,
    then ResponsiveVoice. Probe logs go to the console as `[pole-tts]`.
    Playwright (`navigator.webdriver`) skips audible TTS.
22. **Tour prompts from CHGK Jeopardy.** Gameplay no longer uses POLE.OVL
    category+word pairs. The live bank is a 5816-question filter of the public
    Russian QA Jeopardy dataset (База вопросов ЧГК, http://db.chgk.info):
    one А–Я word as the board answer, with answers normalized to nominative
    singular where applicable. Names, titles, denominations, and pluralia
    tantum are retained; question text is lightly edited to agree with the
    answer form and is spoken by the host after «И вот задание на этот тур».
    Non-commercial license; `LICENSE-CHGK.txt` ships next to the pack.
    POLE.OVL.json remains for byte-exact asset rebuilds.
23. **Assistant walks to the board cell's vertical center.** The original
    stops at the cell's left-edge offset (ASSIST_STAY is 25px, cells are 16px)
    and can overshoot, so she stood a few pixels right of the card. The walk
    target is shifted left by `(25−16)/2` and the last step is clamped so she
    arrives on that pose without jumping back after stopping. WEB also walks
    her the full screen width (x=0→640) so she eases out from behind the left
    side wall and exits behind the right, instead of popping in at DOS x=40 /
    vanishing at x=582.
24. **Pause before the host replies to a player.** After a letter, a whole-word
    guess, a prize/box choice, Yakubovich waits ~700 ms (Space/click skips)
    before speaking so the player's answer can land. Other host lines are
    unchanged.
25. **TV-show samples instead of PC-speaker PWM.** Beeps, drum ticks and
    letter/word stings play as mp3s from the «Поле чудес» clip pack
    (zvukipro.com; files in `web/public/assets/sfx/`).     PWM still runs for
    delay and RNG timing; the browser mutes the square wave except the
    assistant’s walk to the board, the шкатулки bring-in / lid / shuffle ticks,
    and the money-stack recount ticks
    (original PC-speaker). Recount animation is at most 1 s below 10 000
    and 3 s above (drum values are 350+). No pile animation when the
    score did not increase. After the splash theme, «выход участников» plays as a quiet
    bed and ducks further before «И вот задание на этот тур». Host TTS
    (DIFF #21) is unchanged. Playwright skips audible samples.
26. **Classic 36-sector TV drum.** Live play no longer uses the DOS 16 wedges
    / 32 half-steps.     The SVG wheel has 36 sectors: point values 350–1000
    plus one Банкрот (Б), one Приз (П), two Плюс, ×2×2 and four Ноль. No Ключ or Шанс. A correct
    letter on a point sector adds value × number of hits. ×2 doubles the
    score if the letter is present. Neighbouring wedges never share the same
    point value. The SVG rotates opposite the sector index so the arrow, the
    host line and the score all name the same wedge. The disk rotates
    continuously for about 8–10 s (mean 9 s) under Coulomb plus viscous
    friction (ω̇ = −α − βω), not in 10° jumps. Initial ω is lower because
    the disk only needs about one extra turn, not several revolutions. The rim is a thin metal stroke; labels sit near the outer edge (Б / П).
    Sectors alternate black/white as before. The disk is larger than the DOS
    cell: the hub sits lower (with the arrow) and the overlay is clipped at the alphabet row.
    The canvas sits above the SVG with a circular hole so the drum tucks
    under the letters (players and name plates stay behind the disk) while
    the letter-pick hand stays on top. The alphabet row is the same SVG stack
    (32 tiles, 20×18, y = 332), not the DOS LETTER_BACK sprites. Seat captions,
    names and player speech bubbles are SVG as well: a two-option prompt is two
    clouds inside the sprite box (tails inward), vertically centered on the sprite.
    Name plates sit in an SVG layer above the canvas, clipped by the drum disk
    so they tuck under the wheel without punching black holes in the framebuffer.
    Name typing during presentation is the same plaque (live glyphs + caret), not
    DOS font cells under the overlay.     Score piles are SVG too: a stack of
    Twemoji 1f4b5 dollar notes (CC-BY 4.0) with the number centered on the top
    bill; score 0 is a Snickers wrapper (Wikimedia Commons 2000–2005 wordmark,
    public domain) instead of the DOS SNIKERS sprite. The assistant
    walk and Yakubovich (base + mouth/eye layers) are SVG overlays of the
    original sprites, not framebuffer blits over the board/host. The
    commercial-break plaque (ADWARE_BACKGROUND + DOS copy) rises in that
    overlay stack above the host, not under him on the canvas.
    Studio wallpaper is SVG too: a 12×3 geometric brick grid (three tile
    kinds, seeded RNG as DIFF #15; restore still uses i%3), hanging lamps
    and side walls as vertical rectangles (DOS 40×139) in the scenic stack under
    the canvas so the assistant walks full-width (x=0…640) between the back wall
    and the side walls without covering players/HUD — not BRICK*/LAMP/WALL_* blits.
    Шкатулки are the three original BOX_* sprites as an SVG overlay that
    translates in, rather than a screenCopy over the player.
    The hub is 8 px left of the DOS cell
    center. Seat 1 (2-ой игрок) is 4 px left and 24 px up; seat 2’s sprite
    stays 24 px right, its nameplate 8 px right so it sits under the sprite.
27. **Studio entrance greeting.** Entering the hall no longer uses the DOS
    «Представляю участников!». The host speaks the TV catchphrase (Wikiquote /
    Первый канал): «Добрый вечер! Здравствуйте, уважаемые дамы и господа!»,
    the current weekday instead of a hardcoded Friday, «В эфире капитал-шоу
    Поле чудес!», then — over the «выход участников» bed — «под аплодисменты
    зрительного зала, я рад представить вам тройку игроков!». Later tours use
    «И вновь в эфире…» plus a new triple; финал / суперфинал are named.
28. **No key wait after the tour prompt.** After the host speaks the round’s
    задание, play continues into the first spin without waiting for Space.
29. **Шкатулка pays 1000.** Guessing the box with money adds 1000, not the DOS 100.
