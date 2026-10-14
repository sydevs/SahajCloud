# The frame rules

How a guided meditation's frames should be placed. Anton set every rule here on real meditations in October 2026, mostly one example at a time. The `#` numbers are meditation ids, and the times are positions in their recordings, so each rule can be checked against the case that settled it.

These rules are the specification the suggester is measured against. `prompt-rules.txt` is the same content, written as instructions for the model. When a rule changes, change both, then re-run the tests in `README.md`.

A **frame** is a picture, either a still of a hand position or a looping video of a hand movement. It shows from its timestamp until the next frame. Each meditation stores a list of `{ id, timestamp }`, in whole seconds.

## 1. The image set

- Every frame comes from the set that matches the **narrator's gender**, male or female. Twin frames share a pose. Open palms ("ready") is 3 or 11 (male) and 4 or 12 (female); use 3 / 4 by default. #109 and #111 exist only in the female set.
- **78 and 80 are female videos tagged male.** A male scalp massage shows still 47. A male Sahasrara bandhan shows a still.
- **Frames 53 (m) / 120 (f) show the LEFT hand to the ground, right hand on the lap.** Frames 1 (m) / 2 (f), and their twins 9 / 10, show the RIGHT hand to the ground, left hand on the lap.
- **Frames 126 (m) / 127 (f) show giving a bandhan:** writing your name on the left palm with the right index finger, then circling the right hand seven times around the palm.
- Images face the viewer, so they are mirrored: the person's right appears on the image's left. CMS tags use the person's own sides.

## 2. Which picture for which instruction

| The narrator says | Frame (male / female) |
| --- | --- |
| Hand on the heart, "our heart" | left Anahat 28 / 29 |
| "Centre of the chest", "central heart" | centre Anahat 26 / 27 |
| Tapping the centre of the chest (often while breathing) | tapping video 70 / 71, not the still |
| Right hand on the left side of the stomach / ribs | left Nabhi 122 / 21 |
| Left hand on the right side ("liver", "where the ribs end", "the right side of the abdomen") | right Nabhi 22 / 23 |
| "The stomach", "the belly", "centre of the belly", no side named | centre Nabhi 19 / 20, unless the narration is clearly working on the left side (then left Nabhi) |
| Left hand on the right lower abdomen, near the hip | right Swadhisthan 17 / 18 |
| Right hand on the left lower abdomen, "where the hip joins the body" | left Swadhisthan 15 / 16 |
| "Below the belly button", no side named | decide by the qualities described: creativity is centre Swadhisthan 13 / 14 |
| Throat | centre Vishuddhi 34 / 35; "left side of the neck" 36 / 37 |
| Forehead, "across the forehead" | centre Agnya 41 / 42 |
| Right hand on the right side of the head | left Agnya 43 / 44 |
| Left hand on the left side of the head | right Agnya 45 / 46 |
| Back of the head (lean the head back into the hand) | 40 / 119 |
| Both hands on the sides of the head | video 58 / 59 |
| Hand on top of the head, pressing, no rotation | still 47 / 48 |
| Massaging or rotating on the scalp | female video 79; male still 47 |
| Raise the Kundalini (cupped hand from the base of the spine to the top of the head) | video 74 / 75, never the hand-above-head still |
| Lift the hand above the head (to feel the vibrations) and hold it | still 49 / 50 |
| Lift the right hand, then the left, above the head | video 118 / 55, one placement |
| Right hand to the ground, left hand on the lap | 1 / 2 |
| Left hand to the ground, right hand on the lap | 53 / 120 |
| Both hands on the ground | 51 / 52 |
| Left hand raised behind you, elbow bent, palm facing back ("towards the sky behind us") | 7 / 8 |
| Pingala sweep with the RIGHT hand ("raise your left channel… down the right side") | video 114 / 115 |
| Ida sweep with the LEFT hand | video 109 (female only) |
| Writing your name on the palm, circling seven times around it | giving a bandhan 126 / 127 |
| Namaste, joining the hands, a bow | 5 / 6 |
| Hands on the lap | 3 / 4 |
| A bandhan on a chakra | that chakra's bandhan video (e.g. Void 106 / 107, centre Vishuddhi 104 / 105) |

Places and sides:

- **Left and right are the listener's own.** The channels cross at the Agnya: the left Agnya is on the right side of the head, and the right Agnya is on the left.
- **"The heart" alone is the left Anahat** (the physical heart). A named centre or right side wins, and the qualities described can also decide.
- **When no side is named, decide from the qualities** the narrator describes (`prompt-subtle-system.md`). Follow what the narrator says, even where it looks like their slip (#51 → centre Swadhisthan).
- A bandhan is a clockwise circling of the right hand. Bandhans are done with the right hand only. Hamsa belongs to the Vishuddhi.

## 3. Movements and videos

- **A movement gets its video, and a held pose gets a still.** A movement that ends in a position ("raise the hand to the top of the head and place it there") is one movement: its video.
- **Lifting or bringing a hand to a place** ("raise your right hand to your heart") is a placement there: the still.
- **Videos loop.** A repeated movement ("three times", "seven bandhans") is one placement, never repeated.
- **A video keeps looping through the prayers and affirmations after a movement, until the next hand instruction.** Go back to ready only when the narration makes clear the movement has stopped and a long, still pause follows. ("As we do this, we can affirm…" plainly counts as still moving.)
- **Massage after placing the palm on the head:** when the rotation follows within a few seconds, start the massage video at the placing, because it shows the hand arriving (#108). When the hand is placed and held first (pressing, a prayer) and the rotation comes later, show the still on the placing and the video from the rotation (#132, #1). The video stays until the next instruction, with no return to the still.
- **Either-or offers** ("with your hand on the Sahasrara, or resting on your lap, whichever is comfortable"): show the first option for a few seconds, then the second, like demonstrating the choices (#64, #71).

## 4. Attention, optional advice, announcements

- **Attention moved to a chakra gets that chakra's picture only when "putting the attention there" could just as well mean "placing the hand there"**, because the narrator is working on that chakra (#119 8:02 "shift our attention to our central Swadhisthana", #70 "bring our attention to our Void… raise our attention to our Vishuddhi", #120 "putting our attention on the Mooladhara", #142 "shift our attention to the third chakra").
- **No frame when the attention is only moving around** ("so we can feel this in our heart", "feel it where we sit at the base of our spine", #89).
- **An attention tour over several chakras gets one picture per chakra**, each at the words that bring the attention there (#17: belly, heart, throat, forehead). Skip a chakra that has no picture of its own (the Mooladhara).
- **The Sahasrara is the exception.** People hold their attention there while meditating, and a hand on the head gets in the way. So the hand goes on the head only when the narrator explicitly says to put it there, or for a massage (#54: "with our attention there, and if difficult to do then with our palm pressed down there" → no hand). When the attention moves to the top of the head, the picture on screen ends: ready.
- **Optional advice that helps right now gets its picture** ("if it helps, you can gently press the top of your head", "if your hand is getting tired, you can place it back on the lap"). **Advice about later gets none** ("keep meditating, and at the end raise your Kundalini").
- **An announcement of a technique to come is not an instruction** ("in this meditation we will raise the Kundalini").

## 5. Ready (hands on the lap)

- The meditation opens on ready at 0. If the first instruction comes later, a lap frame sits at 0.
- Add the lap frame where the narrator lowers the hand and the next hand instruction does not follow right after.
- **Implied lap frames are fine:** after a longer pause (#86 2:59, #71 5:14), and at the end when the listener is told to just meditate (#89 15:41).
- After the narrator's last instruction and closing words, when silence follows to the end, return to ready.
- **Two actions in one sentence** ("put the left hand back on the lap and place the right hand on the heart"): one frame for the final pose, starting at the first action's words, with no lap frame between (#73 2:28). **The exception is a hand on the Sahasrara**, which starts at the words that put it there (#45: "place the left hand back in the lap… and bring our right hand to the top of the head" → the head frame at "bring"). A short lap frame is fine when a real pause follows the first action (#73 4:08, #93 11:34).
- When one hand returns to the lap and the other stays, show the picture of the hand that stays.

## 6. Timing

- Use the word-level times in the transcript, never a segment's start. A segment can hold its instruction at the end.
- A frame starts on the word where the instruction begins ("place", "raise", "put", "bring", "take").
- **Tolerance:** a frame 3.0–3.1 s after its word can stay (#87, #97); one 3.2 s or more after it moves to the word (#132).
- Timestamps are whole seconds. A timestamp past the end of the recording is an error (#54 had 45000).

## 7. When no picture fits

- Don't invent, and don't stretch a picture to an instruction it doesn't show. **The fallback is ready**, the "silent meditation" picture with both hands open on the lap (#72: "raise along the left side of our body" has no video, so ready, not the straight-up Kundalini raise).
- Poses with no frame today: raising along the side of the body, the left hand alone above the head, hands raised to chest level, a left-hand sweep with the right hand, pulling down the ego and superego. Where ready is already on screen, nothing changes (#89 5:17, #114 4:47).
- A chakra frame over a music passage with no spoken cue is acceptable in this rare case (#64 5:56).
- When the transcript has a run of one repeated word (a transcription loop, or a long chant), the instruction may be missing from the text. Someone has to listen to the audio.
