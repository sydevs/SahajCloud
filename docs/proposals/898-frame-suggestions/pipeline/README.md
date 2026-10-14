# How the frame suggestions are made

This folder is for whoever builds the real suggester for sydevs/SahajCloud#898. It describes the approach that was measured in a local pilot (13–14 October 2026), the exact prompt it sent, how it was tested, and what was tried and dropped on the way. It is a reference, not code to merge: how the suggester runs inside the CMS is left to the implementation.

**The short version:** one call to Claude Sonnet 5.5 per meditation, with the whole transcript, a fixed set of rules, a description of every picture, and a short subtle-system reference. Plain code turns the answer into frames. On 14 meditations that were kept back from all the tuning, it showed the same picture as the editors 92% of the time. Judged against the rules, it was wrong 3.3% of the time (2.0% without one transcription fault), against 1.8% for the editors and 12.9% for the best Jev pipeline. It costs about 1.7 cents a meditation and takes about 6 seconds (8 at the slowest tenth).

## The files here

| File | What it is |
| --- | --- |
| `rules.md` | The rules, in plain words, each with the meditation that settled it. This is the specification. |
| `prompt-rules.txt` | The same rules as sent to the model (system block 1). |
| `prompt-subtle-system.md` | What each chakra and channel is responsible for, taken from wemeditate.com (system block 2). The model uses it when a narrator names a quality but no place. |
| `prompt-catalogue-male.txt`, `prompt-catalogue-female.txt` | Every pose in the narrator's image set, one line each: name · still or video · what it shows · what it is not for (system block 3). |
| `pose-frames.json` | Which frame id each pose name stands for, per image set, and which frames share a picture. |

The transcripts the tests used are on `proposal/897-transcripts`, in `seeds/meditation-transcripts/<id>.json`.

## Step by step

```
transcript → 1 cut into sentences → 2 one Sonnet call → 3 turn the answer into frames → suggestions
```

**1. Prepare the transcript.**
- Start from the #897 transcript, which has a start time for every word.
- Cut it into numbered sentences, and write each as `[s<n> m:ss] text`, for example `[s5 0:36] We can place our hand at the bottom of our spine…`. A typical meditation is about 2,000 tokens.
- Look up the narrator's gender. It picks the catalogue file and the image set.
- Flag a run of one repeated word (eight or more times, and most of a segment). It is either a transcription loop or a chant, and either way an instruction may be missing from the text. Three meditations in the library have one (#20, #81, #119).

**2. One call, with this request.**
- Model `claude-sonnet-5-5`, `max_tokens` 16000, and `output_config.effort` set to `medium`.
- The system prompt is three text blocks, in this order: `prompt-rules.txt`, then `Subtle-system notes (from wemeditate.com/subtle-system):` followed by `prompt-subtle-system.md`, then the narrator's catalogue file. The third block carries `cache_control: {type: "ephemeral"}`, so all three are cached. Together they are about 10k tokens and identical for every meditation of the same gender, so after the first call they cost a tenth.
- The user message is `Transcript, one sentence per line as [sentence-number start-time] text:`, a blank line, the sentence lines, a blank line, and then `List every frame change, in order.`
- The answer format is a JSON schema, set in `output_config.format`:
  ```json
  {"frames": [{"sentence": 5, "first_words": "We can place our hand", "pose": "kundalini-raise-right-hand", "kind": "movement", "reason": "…"}]}
  ```
  `pose` is `ready` or a name from the catalogue. `kind` is `position`, `movement`, `return` or `unsure`. Parse the text yourself rather than trusting the enum: the pose list is a strong hint to the model, not a guarantee.
- The pilot also used the server-side fallback beta (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`), so a refusal falls back to another model rather than failing. No refusal happened in about 360 calls.

**3. Turn the answer into frames.** This is plain code, and the same every time.
1. **Time.** Find the first three of `first_words` in that sentence's words. The frame starts at that word's time, in whole seconds. If they aren't found, use the sentence's start. That happened 4 times in about 4,600 frames.
2. **Picture.** Map the pose name to a frame id with `pose-frames.json`, using the narrator's set. An unknown name is dropped and counted, never guessed. That never happened in about 360 calls.
3. **Unsure means ready.** A frame of kind `unsure` shows ready, the "silent meditation" picture, and keeps the model's guess in its reason. Showing an unsure guess once looped a wrong video through 19 minutes of #129.
4. **Fixed substitutions.** The male set has no usable scalp-massage video (frame 78 shows a woman), so a male scalp massage shows still 47. `pose-frames.json` records this as `showsInstead`.
5. **No repeats.** Drop a frame that shows the same pose as the one already on screen.
6. **Closing silence.** If 30 seconds or more of silence follow the last word, add ready 3 seconds after it.

Each suggestion then has a time, a frame id, the sentence it came from, the model's reason and its kind. To show a suggestion only where it adds something, leave out any that match an editor's frame of the same picture from 8 s before to 2 s after. Where one disagrees with an editor's frame within 8 s, it replaces that frame.

**Why the model never writes a time.** Models are unreliable with numbers like 4:37.2, but they copy words reliably. Letting the model quote the instruction's first words, and letting code look up the time, gave exact starts in every run.

## How it was tested

**The test sets.** Meditations were split into fixed sets before any tuning, by id:

| Set | Meditations | Use |
| --- | --- | --- |
| `dev` | 22, 61, 70, 31, 28, 119, 138, 86 | Tuning. Errors were read freely. |
| `dev2` | 11, 25, 37, 46, 56, 65, 69, 73, 90, 100, 115, 43, 84, 54 | Tuning. Added to find more kinds of error (female narrators, ten narrators). |
| `heldOut2` | 14 meditations, sealed | Scores only. Sealed until the final run, so it measures how the suggester does on meditations nobody tuned it on. |

An earlier held-out set was retired once its errors had been read, and so stopped being a fair test. Left out of every set: #9 and #92 (the same audio, placed by two editors), near-copies of a meditation in another set, and the prototype's demo meditations.

**Each meditation ran three times**, and every score is the mean of the three, because neither Jev nor Sonnet answers the same way twice. One run is not a measurement. A set mean moves up to 3 points between runs, and a single meditation up to 30.

**What was measured**, second by second against the editors' frames on production:
- **Same picture:** the share of the recording where both show the same picture.
- **Wrong place:** the suggestion shows a different place on the body (another chakra, or another side).
- **Wrong picture shown:** wrong place, plus a pose where the editors show ready. This is the error a listener notices most.
- **Ready instead:** ready where the editors show a pose. This is a missed instruction.
- **Change F1:** how well the suggested picture changes line up with the editors' own, counting a match from 8 s before to 2 s after.

**Agreement with editors is not accuracy.** Two editors placing frames on the same audio (#9 and #92) agree only 74% of the time, and the editors are sometimes wrong themselves. So the deciding measure was a judge: a separate model read every stretch of 5 s or more where the suggester and the editors differ, with the transcript and both pictures, and decided by the rules who was right. The result is the share of the recording where the suggester is wrong by the rules, and the same for the editors.

**Targets for the held-out set:** wrong place at most 3%, wrong picture shown at most 8%, same picture at least 75%, and the three runs within 2 points of each other.

## Results

Mean of three runs per meditation. "Judged wrong" is by the rules, on the first run.

| Pipeline | Set | Same picture | Wrong place | Wrong picture shown | Ready instead | Change F1 | Judged wrong |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jev, one request per chunk (E1) | dev | 59% | 11% | – | – | 0.47 | – |
| Jev, one request per sentence (s8) | dev / dev2 | 75 / 79% | 3 / 2% | 5 / 5% | – | 0.60 / 0.66 | 10.9% |
| Jev, one request per sentence (s8) | heldOut2 | 85% | 4% | 6% | 7% | 0.76 | 12.9% |
| Haiku 5.5, whole meditation | dev / dev2 | 83 / 84% | 2 / 3% | 3 / 5% | 7 / 5% | 0.72 / 0.74 | 8.1% |
| Sonnet 5.5, whole meditation, first rules | dev / dev2 | 87 / 86% | 4 / 4% | 5 / 6% | 2 / 3% | 0.79 / 0.77 | 2.9% |
| Sonnet 5.5, with Anton's rules | heldOut2 | 88% | 2% | 8% | 2% | 0.86 | **4.9%** |
| **Sonnet 5.5, final rules** | dev / dev2 | 92 / 93% | 3 / 2% | 3 / 2% | 3 / 2% | 0.88 / 0.77 | – |
| **Sonnet 5.5, final rules** | heldOut2 | **92%** | **2%** | **4%** | **2%** | **0.84** | **3.3%** |
| Editors, judged the same way | dev+dev2 / heldOut2 | | | | | | 2.5% / 1.8% |

The first held-out judging found that 396 of Sonnet's 642 wrong seconds came from two rules it hadn't been given: an attention frame ends when the attention moves on to the top of the head, and the closing silence returns to ready. With both added, those errors are gone. The remaining 432 seconds have nothing to do with the rules. Most of them are fixable in the picture descriptions or in code: a transcription loop in #129 that hid an instruction (165 s), the left-hand ground picture chosen for "put our right hand on the ground" because its pose name misleads (140 s), "place our hands on the ground" shown with one hand (94 s), and a closing return to the lap placed 20 seconds before the last word (18 s). The editors' rate fell from 2.5% to 1.8% partly because several of their frames on these meditations were corrected on production the same day.

## What was tried, and what was learned

**Jev, one chunk at a time (E1, 59% same picture).** Jev is TypeSafe's classification model. It picks one option from a list and returns a probability for each. The first design cut the transcript into chunks at pauses and asked Jev, for each chunk, which picture should now be on screen, telling it which picture already was. Two problems showed up at once:
- **Jev is not deterministic.** Identical requests came back up to 0.13 apart in probability.
- **One noisy answer cascaded.** Because each request said what was on screen, which came from Jev's own last answer, one flipped pick changed every later one. Two identical runs of #22 scored 69% and 49%.

**Jev, one sentence at a time (s2–s8, up to 79%).** The redesign sent each sentence with two before and one after, and never Jev's earlier answers, so noise could no longer cascade. Around Jev's answer came rules in code: decide the place on the body first, then the pose; turn a pick under a probability margin into ready; keep the pose on screen for a continuation; treat poses with the same picture as one. A rewritten catalogue gave every pose a "not for" line and the phrasings narrators actually use. This took agreement from 59% to about 79%. But judged by the rules, it was still wrong 10.9–13.9% of the time, against the editors' 2.5%, and the remaining errors were nearly all of one kind: they needed the meditation around the sentence.
- Which hand is still on the ground after "bring the left hand to the lap".
- Whether a prayer belongs to the movement before it, so the video should keep playing.
- When a movement has ended.
- Whether "in this meditation we will raise the Kundalini" is an instruction or an announcement.
- Whether a sentence continues the last one or starts something new.

Fixing each of those with Jev meant one more rule in code, and the rules began to interact. That is the layering Anton had asked to avoid.

**Claude, the whole meditation in one call.** A model that reads the whole transcript sees all of that context at once. The first test, with the same catalogue and no new rules, took agreement to 86–87%, cut "ready instead" from 8–13% to 2–3%, and the judged error to 2.9%, level with the editors. It was cheaper too: Jev needed about 75 requests of 6k tokens per meditation ($0.022), and Sonnet needs one cached call ($0.017). And the code shrank, since the place tables, margins, decision rules and threshold sweeps all went.

**Haiku 5.5** costs a twentieth as much, but it picked wrong videos (the crown bandhan for a rotation on the head, the massage for the Kundalini raise) and misread rules, for 8.1% judged wrong. A wrong video is the error that looks worst to a listener, so Haiku was dropped.

**Not tried:** a hybrid, where Sonnet finds the moments and Jev picks the pose. Sonnet didn't need Jev's calibrated probabilities. Its own "unsure" isn't calibrated, but showing ready when unsure, and flagging those frames for an editor, works without them.

**Lessons that matter for the build:**
- **Judge by the rules, not by agreement.** The editors lag about 2 seconds, and some follow habits Anton has since reversed, for example "the stomach" as the left Nabhi, where he decided the centre. Agreement both overstates and understates accuracy.
- **Most hard cases are context and convention, not vocabulary.** A rule settles them only when it is written with the example that decided it. That is why `rules.md` keeps its examples.
- **The catalogue had errors, and they looked like model errors.** Frames 53 and 120 show the LEFT hand to the ground; the catalogue said right. Male frames 78 and 80 show a woman. When a rule seems to fail, check the picture.
- **Transcription errors pass straight through.** Lemonfox writes "nadi" for "Nabhi", stretches some segments so their word times are early, and produced one repeated-word loop. The #897 word list should cover the chakra names.
- **Showing a guess is worse than showing ready.** A wrong video can stay on screen for minutes, while ready is always acceptable.

## Things to keep as they are

Each of these was measured, and each alternative was worse. Change one only with the tests above, re-run on all three sets.

- **One call with the whole transcript**, not chunks or sentences. Context is what fixed the errors.
- **The model quotes words, and code finds the time.** The model never writes a timestamp.
- **"Unsure" shows ready.** Never the closest picture, and never an unsure guess.
- **The rules carry their examples.** Rewriting them as abstract principles loses what settled each case.
- **The catalogue's "not for" lines, and the narrators' own phrasings in it.** These came out of reading the errors, one at a time.
- **Sonnet, not Haiku.** Haiku's error rate is three times higher, in the error that shows most.
- **Three runs per meditation when measuring.** One run is noise.

## What is left

- **Record what editors decide.** Every Approve, Reject and Pick another says whether a suggestion was right. Kept, they become a running accuracy measure at no extra cost, and a source of new rules.
- **A new rule goes in three places:** `rules.md`, `prompt-rules.txt`, and then a re-run of `dev`, `dev2` and `heldOut2` to check that nothing got worse.
- **Pictures that don't exist yet:** raising along the side of the body, the left hand alone above the head, hands raised to chest level, a left-hand sweep with the right hand, pulling down the ego and superego. Until they exist, these show ready.
- **Only English was tested.** 121 of the 122 published meditations are English.
- **The fixes the last judging points to**, none of them a rule:
  - Name and describe the ground stills by the hand that touches the ground, so `right-mooladhara-left-hand-to-ground` (the left hand) is never picked for "put our right hand on the ground".
  - Describe frames 51 / 52 plainly as both hands on the ground.
  - Drop a closing return to the lap that the model places before the last word, since the code adds one after the closing silence.
  - Catch a loop of a repeated phrase, not just a repeated word (#129 has "Swadhisthana, Nirmala Devi" 30 times).
  - Keep the exact rules text with every test run. One regression (#85) appeared between two rule versions, and the earlier text wasn't kept to compare.
