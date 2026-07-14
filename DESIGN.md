# EduQuest: Design Notes

A working document. Not a spec, a memory. It exists so that anyone picking this up
(including a future Claude, or Ben after a busy month) knows not just what was built
but why, and which arguments are already settled.

Repo: `benjaminedmondrobertcoady-sys/MSCsociology` (branch `main`)
Live: `benjaminedmondrobertcoady-sys.github.io/MSCsociology/`

---

## 1. What EduQuest is

A free, browser-based library of thinking tools for the classroom. Built by Ben Coady,
a VCE English and Sociology teacher at Mildura Senior College. No accounts, no logins,
no data collection, no backend. Every activity is a single self-contained HTML file
that a teacher can open on a school laptop and use in the next sixty seconds.

That last property is not an accident. It is the reason a teacher might actually use it.

---

## 2. The first axiom

**Nothing may merely SIGNIFY learning. It must INSTANTIATE it.**

This is the spine of the whole project and it settles most arguments.

An activity that looks educational but could be completed without thinking has failed,
however beautiful it is. The test: *can a student win this by pattern-matching, guessing,
or being fast?* If yes, redesign the mechanic, not the graphics.

Corollaries that have earned their place:

- **Every activity needs a fail state that teaches.** Not a red cross: a consequence that
  shows the student *why* they were wrong. Order Restored's current "falls short" and the
  norm line that will not settle. Writer's Workshop's "your reader meets your contention
  before they know what the issue is."
- **The FBI Corkboard was cut for exactly this reason.** A free-form connection board has no
  way to tell a good connection from a bad one. It signified investigation without
  instantiating it. If it is ever rebuilt, the fail state must come first.
- **Reward the thinking, not the completion.** Anything that can be speedrun will be.

---

## 3. House rules (non-negotiable)

- **No em dashes. Anywhere.** Build scripts hard-check for `\u2014` and abort. Use commas,
  colons, or full stops.
- **Single self-contained HTML file** per activity. All assets base64-embedded. No external
  runtimes, no frameworks. (CineMahjong was previously a "Bundled Page" built on an external
  DC runtime: it was rebuilt from scratch as vanilla because it could not be maintained.)
- **Aesthetic: "Utopian Scholastic / EduQuest '96".** Encarta 1995-96. Parchment, cream, navy,
  gold, green, teal. Trebuchet MS for UI, Georgia for prose (both are period-correct: 1996).
- **Scholastic Mode**: a toggle that swaps everything to DotGothic16 bitmap font, persisted in
  localStorage under `eduquest-scholastic`.
- **File size matters.** Thirty students on a Mildura school network. Target under 1.5MB per
  activity. Compress ruthlessly: a 1.7MB PNG became 43KB with no visible loss. Prefer SVG for
  icons and tiles: CineMahjong's entire tile set costs almost nothing because it is drawn, not
  photographed.

### The Encarta look: what it actually is

Diagnosed and worth recording. It is **not** the font or the palette, both of which are already
correct. It is **dimensionality**. Encarta's interface was skeuomorphic: raised buttons with a
light top-left edge and a dark bottom-right, inset wells, gradient title bars, chrome on panels.
Current EduQuest is "flat design wearing period colours". The tool tiles are the closest thing to
genuine Encarta in the project, precisely because they are raised, pictographic and labelled.

Also: Encarta used ornamental engravings **large, bleeding off the panel edge, cropped
arbitrarily, at low opacity, as texture**. Not small, centred and contained.

An "Encarta chrome pass" (bevels everywhere) is proposed and deferred.

---

## 4. Pedagogical commitments

These came out of long argument and should not be quietly reversed.

- **Worked example first.** Cognitive load theory, the worked-example effect (Sweller). A novice
  assembling something from components they do not yet understand is doing means-ends search, not
  learning. Show a complete annotated model first, then let them build.
  - The worked example must be on a **different topic** than the build task (isomorphic, not
    identical), or students pattern-match sentence by sentence and learn nothing.
  - The worked example must itself **fade** across the ladder (expertise reversal effect):
    prominent in lesson 1, on demand in the middle, gone by the end.
- **Fading scaffold / gradual release.** The scaffold thins by exactly one thing per rung. Fade
  along multiple axes, not just one: content support, structural support, distractor subtlety,
  and **feedback support** (the one everyone forgets, and the one that decides whether the student
  can do it alone in a SAC).
- **Rules, not answers.** Do not validate against a model answer. Validate the *relationships*
  that matter, so many different builds can pass. Writing is organic; a single correct solution is
  a lie about writing.
- **Be honest about what a machine cannot judge.** JavaScript can catch the traps (cliché openers,
  essay announcements, generic hooks with no topic-specific noun, copy-paste, over-length). It
  cannot tell a good hook from an adequate one. So: **the machine catches the traps, the student
  judges the quality** via self-assessment and model comparison. Say so out loud in the feedback.
- **Feedback tone is diagnostic, never punitive.** "Read it as your reader would meet it", not a
  red wall of failure. And always: *"You do not need to start again."* Students must be able to
  revise and resubmit. Forcing a restart punishes exactly the students who need most support.

---

## 5. Activities

### Order Restored (`order-restored.html`) — COMPLETE
Durkheim's four functions of deviance, using the department's exact vocabulary: **Affirmation**
(socialisation), **Clarification** (punishment), **Unification** (consensus), **Change**.

- Four Tube-map "stops" on an arc. Four cases: Tenacious D (Sydney 2024), Kyrgios (Wimbledon 2022),
  Coldplay Kiss Cam (2025), and **Maebashi** (Mayor Ogawa: the norm-CHANGE case, and the payoff).
- **The seismograph.** A red-turned-slate line: calm past, violent oscillation at the deviant act,
  then at a branch point two black "potential new norm" lines fork off. While the case is unresolved
  the line **jumps between the three tracks**: the norm's future is genuinely undecided. Each correct
  answer calms the oscillation a notch. Completing Change **locks** the line onto its track: centre
  for the three reassert cases, the upper new-norm track (green) for Maebashi.
  - The line is **muted slate (#5A6E85), not red**. Red was too alarming for an exploratory interface.
  - The baseline is **cream**, so it does not compete with the result.
- Emile Durkheim appears bottom-left with the single instruction *"Work through the four stops to
  restore the norm"*, and leaves for good once stop 1 is cleared.
- Tools cluster (Encarta pictograph tiles): **The Chronicle** (draggable newspaper window with the
  case article), **Key Terms** (18-term glossary from the department's concept sheet), **Motion**
  (freezes the animation to a static illustration), **Sound**.
- **Sound is muted by default.** Thirty devices in a lab stay silent unless a student opts in.
  Web Audio API, not `new Audio()`: the latter is blocked in sandboxed iframes.
- **Completion codes** (see §6).

### Trade Routes (`trade_routes.html`) — LIVE
Supply chains, ethics, carbon, cost. Every route trades one against another; there is no free lunch.

- **Hover a component in the manifest and its sources pulse on the map** while everything else dims.
  (Hannah's suggestion. She could not find where the lithium was.)
- Two more cases (EV, t-shirt) exist as pure data and are not yet wired in.

### CineMahjong (`cinemahjong.html`) — REBUILT
Reading the language of film. Rebuilt from scratch as vanilla single-file; the previous version was
a bundled-framework outsider that could not be edited.

Five levels, locked progression. **This ladder exists because of Hannah**: the original served the
final exam as the first lesson, all shots at once, and she had no chance to learn anything first.

- **C.1 Shot Sizes** (3 tiles: medium, close-up, extreme close-up). Winnable first go.
- **C.2 Adding People** (+ one/two/three/crowd = 7).
- **C.3 Key Concepts** (establishing, over-the-shoulder, mise en scène). Standalone, not cumulative:
  ten at once is a wall.
- **C.4 The Full Deck** (all ten, no poster).
- **C.5 What a Shot Does** — match the shot to its **effect**, not its name. This is the analytical
  turn, and the reason the activity is VCE rather than a memory game.

Each level opens with Ben's illustrated poster as the worked example. Tiles are **SVG pictograms**,
so the whole file is 657KB (of which 469KB is the three posters).

### Writer's Workshop (`writers-workshop.html`) — O.1 and O.2 BUILT
Six Traits as a navigable architecture for VCE English writing.

**Traits:** I (Ideas) · O (Organisation) · V (Voice) · WC (Word Choice) · SF (Sentence Fluency) · C (Conventions)

Key framing decision: the traits are a **diagnostic vocabulary, not a curriculum**. The *moves*
(analyse a text, analyse an argument, create a text) are the task; the traits are the feedback
language. VCE criteria are already boxes; the problem is that they are *unactionable*
("sophisticated and controlled expression"). The traits give students boxes they can actually
climb into and work.

Analysis is **not** a trait. It is a disciplinary move that recruits traits (Ideas, Word Choice,
Organisation). Hooks are **Organisation**, not Voice: they are structural moves, not personality.

**The Organisation ladder (Option A: components only, all the same kind of thing):**

| | | |
|---|---|---|
| **O.1** | The Introductory Paragraph | worked example, then build; all sentences given |
| **O.2** | Hooks | you write the hook |
| **O.3** | Background | and the audience orientation it achieves |
| **O.4** | Contention | making an arguable claim |
| **O.5** | Preview | mapping the essay |
| **O.6** | Relevance and Redundancy | the distractors return, harder |
| **O.7** | The Whole Paragraph | unaided |

Properties (audience orientation, relevance) are taught as **what components do**, not as separate
lessons. O.1 and O.7 are the **same engine with different data**: O.7 has subtle distractors, no
colour, no scaffold. The bookends are the point.

**Parts of the introductory paragraph** (persuasive/argumentative essay; Ben to confirm faculty terms):
HOOK → BACKGROUND → CONTENTION → PREVIEW.

**Part colours** (a reveal, never a given): hook `#A63A32` burgundy, background `#B07A1E` amber,
contention `#1F3A5F` navy, preview `#2E7F87` teal. **Not ROYGBIV**: four parts, not seven, and a
primary rainbow would wreck the register. Colour is ON in the worked example, OFF in the library and
build space (colouring the library would collapse the task: students would just pick one of each
colour), and **illuminates the paragraph on a correct submission**. Always paired with a text label,
for colour-blindness.

**The hook taxonomy** (finite model set, O.2): The Scene · The Startling Fact · The Turn · The
Reversal · The Bold Declaration · The Rhetorical Question (**taught explicitly as a trap**: a
question a reader can answer in their head closes the gap instead of opening it).

The underlying mechanism, which matters more than the techniques: **a hook opens a gap the reader
needs closed.**

**Four topics** (built from real articles): the under-16 social media ban, the gas export tax, the AI
actor (Tilly Norwood), the boomers. **Worked example is a fifth issue**: the school phone ban (NYT).
(Dangerous dogs was rejected: a child being mauled is the wrong register for a writing exercise.)

**The tortoise.** The hint character. Twelve sprite frames, sliced from Ben's sheet, registered on the
feet and leg-centre so he does not jitter. He idles and blinks, thinks and has an idea when asked for
a hint, shrugs when a paragraph is well off, explains when it is close, celebrates when it works.
He is **not a GIF**, which is the point: a GIF can only loop, he *responds*.
- Note: row 2 of the source sheet was drawn ~9% smaller than row 1. It has been rescaled. If new
  frames are ever added, check the scale.
- On the worked-example screen he has only three lines, the last two being *"I am fresh outta hints,
  compadre"* and *"Flag down your teacher. Helping students is their raison d'être."* The worked
  example is already annotated; substantive hints there would be redundancy, the sin the activity
  teaches against.

---

## 6. Completion codes

**The accountability problem.** Some students adopt "I don't understand" as an opening position and
defend it to the exam. It is a rational strategy: it pre-excuses failure and costs nothing. This is
learned helplessness, and no browser activity will cure it. But a code **closes the escape route**:
"I did it, I just didn't get it" stops being unfalsifiable.

**The design.** Random codes are unverifiable (a student just writes "jaguar"). So the code is
**derived deterministically from the student's name plus the case**, via an FNV-1a hash into a word
list plus two digits. Same student, same case, same word, every time. Different students get
different words. Sharing is useless. The teacher regenerates and checks.

- Order Restored: salt `eduquest-order-restored-2026`
- CineMahjong: salt `eduquest-cinemahjong-2026` (a `*` is appended if the level was not a clean run)
- Verifier: **`eduquest-code-check.html`**. Paste a class list, get the expected codes. Also checks a
  single code and tells you which case it certifies.
- Names are matched loosely (case, spaces, punctuation ignored). A nickname will not match: ask what
  they typed before accusing anyone.

**What it proves:** they answered correctly. **What it does not prove:** they understood. A determined
student can still retry their way through.

---

## 7. Open questions

**The audience revelation (highest value).** Ben's English faculty says understanding *audience* is the
hardest thing to convey: students never quite grasp that they are writing for someone else. Telling
them does not work. It has to be **felt**. Writer's Workshop currently has no moment of revelation the
way Order Restored does (the norm line settling). Finding the moment where a student *feels their reader
failing to follow them* is what would make Writer's Workshop the best thing in the library. Possibly a
pop-up summary card, as in Order Restored and Trade Routes.

**Editability (highest leverage for spread).** Writer's Workshop is built to Ben's faculty's terms, his
four articles, his topics. Another teacher opens it, thinks "we say thesis, not contention", and closes
the tab. **The engine is the product; the content is a demo.** If a teacher could paste in their own
topics, sentences and worked example, the same engine serves a thousand classrooms. This is worth more
than another rung on the ladder.

**Zero external users.** Everything about spread, product, market, Eiken, TOEFL is speculation until
someone who is not Ben uses this. The next real move is to get it in front of five English teachers
outside MSC (VATE, teacher groups) and listen to why they *don't* use it. Note: MSC's culture is
individualist and Balkanised; a resource dying there tells you about the culture, not the resource.
**It is not a valid test bed.**

**Collectibles.** Ben made beautiful physical award cards in 2019 (the Matilda Card, the Rye O'Chanter
Card, the Morrigan Crow Card) that named a *specific mastery* and smuggled a reading list inside a
reward system. They worked because **a human being noticed**. EduQuest can only detect completion, and a
card for completion is a card for compliance. Two ways through: award for *verifiable mastery* (a clean
run, no misses), or keep the human in the loop (EduQuest reports, the teacher awards). Collect
**artefacts, not achievements**: the specimen cards, the Chronicle front pages, the things a student can
only obtain by doing the thinking that produces them.

**Heavy files.** `TheMergerMahjong.html` is **24MB** and `On the Run` is **6MB**. Almost certainly
uncompressed embedded images. On a school network with 25 students this will hurt. Both are fixable by
90% or more.

**Encarta chrome pass.** Bevels, inset wells, title bars on panels. Proposed, deferred.

**index.html.** The intro block copy is out of date (it describes sort/classify/rank activities that no
longer represent the library). Needs a rewrite, and a decision about whether it addresses students or
teachers. A leftover developer note under the puzzle ("Picture file: puzzle.jpg") needs removing.

---

## 8. Next up: Durkheim in Time (`Normative or Deviant?`)

The time-travel companion to Order Restored. Teaches **relative deviance**: the same behaviour read
completely differently depending on time and place. Reuses the Trade Routes interface (a world map plus
a timeline), because both activities are fundamentally about locating relationships on a map.

**The spine, and the thing that makes it work:** *the person is a constant; the reaction is the variable.*
The map is not a place to search, it is an **instrument you probe**. The student holds a character whose
behaviour never changes, drops them into a place and time, and the world *reacts*. Deviance is not in the
act. It is in the reaction. So the reaction is what the game returns.

**A probe returns a position on the sanctions ladder** (department vocabulary):
*Celebrated → Unremarkable → Eccentric, gossiped about → Informally sanctioned, shunned →
Formally sanctioned, charged → Lethal.*

Sally in Devon 1580: the village calls her when a child is sick. Devon 1640: a neighbour has mentioned her
to the curate. Devon 1662: the magistrate has opened an inquiry. Same woman, same herbs. The Carmen
Sandiego clue escalation falls out of this for free.

**The loop:** Survey (probe the space-time map) → Locate the danger window (you cannot extract her without
finding it) → Extract → **Relocate, and be judged on the destination**. The destination is a *second*
probe: Sally into 1692 Massachusetts is worse; Sally into 2026 Melbourne is fine. **The present is not
automatically safe.** What matters is the norm-set, not the date. Two judgements per case, a real fail
state at each end.

**Rejected:** "just place Sally somewhere safe" (drag her from a menu to a safe spot). If safety is the
objective, students *avoid* the very historical context we need them to inhabit.

**The reveal:** at case close, lay the character over a heat map of history: green where celebrated, red
where killed, the whole spread at once. *She never changed. Only the reaction did.*

**The cases:**

- **Sally the herbalist** — the flagship. The full sanctions ladder in one life.
- **The Jaywalker** — the best case on the list. "Jaywalker" was a slur **manufactured by the American
  auto industry** to shift blame for pedestrian deaths from drivers onto walkers. The norm did not drift;
  it was *sold to him*. This is **moral entrepreneurship**, a term already in the Order Restored glossary.
- **Haruki, face tattoos** — proves **place** matters as much as time. Irezumi was a *punishment* in Edo
  Japan; tā moko is sacred in Māori culture; and 2026 Tokyo still bars him from the onsen. Kills the false
  lesson that the present is automatically safe.
- **The smoker in the hospital ward** — the Whig-history antidote. 1965: doctors advertised cigarettes,
  nobody blinks. 2026: formally sanctioned. **Safe window behind him.** At least one case MUST travel
  backwards, or the game teaches "the past was ignorant, we are enlightened", which is not what relative
  deviance says. Norms *vary*; they do not necessarily *improve*.
- **The blood drinker** — historically solid and genuinely shocking. Roman epileptics drank gladiator
  blood; corpse medicine was respectable in early modern Europe; **Charles II drank preparations made from
  human skull.** 1670 London: prescribed by a physician. 2026: a deviant subculture.
- **The alchemist** — status collapse. Newton was one. England criminalised it in 1404 over coin-clipping.
  Celebrated → criminal → respectable → quackery.
- **The headmaster with the cane** — **the case that must not resolve.** A rescue mechanic would ask the
  student to relocate him somewhere he is *permitted to beat children*. That is an intolerable game rule.
  But it is a magnificent final case: the student searches for a safe destination and realises they do not
  want to find one. **This is the limit of relativism**: norms vary, but that does not make all norm-sets
  equal. Build it as the case that refuses to resolve, and let the class argue.

**Deliberately excluded from the build:**

- **The cannibal.** Only works as mortuary cannibalism (the Fore, the Wari', Herodotus's Callatiae). It is
  legitimate anthropology, and the pedagogical yield is no higher than the jaywalker's. Keep for discussion;
  do not ship it.
- **The throuple.** Sociologically legitimate (monogamy is a norm, not a natural law) but: the reaction is
  to an *identity*, not a visible act; polygamy is legal in ~50 countries and illegal in Australia, so the
  game would be telling Year 11s that Australian marriage law is parochial rather than moral; and a rescue
  mechanic embeds a *verdict*. In a regional school culture already braced against, this is a stick not
  worth handing anyone. **Arranged marriage** carries most of the same payload with far less heat.

---

## 9. Working notes

- **Claude can fetch any file directly from the repo.** No uploading. Just name the file.
  (`curl -sL https://raw.githubusercontent.com/benjaminedmondrobertcoady-sys/MSCsociology/main/<file>`)
  The GitHub API also lists the whole tree. If a file must be uploaded, wrapping it in **RTF** is the only
  path that has reliably worked.
- Every build script should hard-check for em dashes and for unreplaced `__TOKEN__` placeholders, and should
  `new Function()` the script block to catch syntax errors before shipping.
- Bugs found the hard way, worth not repeating: `overflow:hidden` on a container will clip any popup anchored
  to it (this hid the tortoise's speech bubble); `innerHTML +=` destroys child event listeners (this broke the
  remove buttons after grading); a CSS `animation` with `fill-mode: both` will override a later opacity
  transition (this stopped Durkheim from fading out); and "transparent" PNGs from image generators are often
  **fully opaque with a checkerboard or white background painted in** (this happened three separate times).
