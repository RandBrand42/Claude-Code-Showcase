/* Mock notebook content. Every note is invented prose for the demo - an "@@ Title | days-ago | flags" header starts each one.
   Fences use ~~~ so the text can live inside a template literal. */
(function (M) {
  'use strict';
  const CURVE = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20580%20250%22%20width%3D%22580%22%20height%3D%22250%22%3E%3Crect%20width%3D%22580%22%20height%3D%22250%22%20rx%3D%2212%22%20fill%3D%22%23f7f3ea%22%2F%3E%3Cg%20stroke%3D%22%23d9cfba%22%20stroke-width%3D%221%22%3E%3Cpath%20d%3D%22M56%2030H526M56%2093H526M56%20155H526M56%20206H526%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M56%2030V206H526%22%20fill%3D%22none%22%20stroke%3D%22%238b8173%22%20stroke-width%3D%221.4%22%2F%3E%3Cpath%20d%3D%22M56.0%2030.0L67.8%2043.1L79.5%2055.3L91.3%2066.5L103.0%2076.9L114.8%2086.5L126.5%2095.4L138.3%20103.7L150.0%20111.3L161.8%20118.4L173.5%20124.9L185.3%20131.0L197.0%20136.6L208.8%20141.7L220.5%20146.5L232.3%20151.0L244.0%20155.1L255.8%20158.9L267.5%20162.4L279.3%20165.6L291.0%20168.6L302.8%20171.4L314.5%20174.0L326.3%20176.4L338.0%20178.6L349.8%20180.6L361.5%20182.5L373.3%20184.3L385.0%20185.9L396.8%20187.4L408.5%20188.8L420.3%20190.1L432.0%20191.3L443.8%20192.4L455.5%20193.4L467.3%20194.3L479.0%20195.2L490.8%20196.0L502.5%20196.7L514.3%20197.4L526.0%20198.1%22%20fill%3D%22none%22%20stroke%3D%22%23b9a98c%22%20stroke-width%3D%222%22%20stroke-dasharray%3D%225%205%22%2F%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%238a4b22%22%20stroke-width%3D%222.4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M56.0%2030.0L61.9%2044.2L67.8%2057.2L73.6%2069.2L79.5%2080.2L85.4%2090.3L91.3%2099.6L97.1%20108.2L103.0%20116.1L108.9%20123.3L114.8%20130.0L120.6%20136.1L126.5%20141.7L132.4%20146.9L138.3%20151.6L144.1%20156.0L150.0%20160.0%22%2F%3E%3Cpath%20d%3D%22M150.0%2030.0L157.5%2040.7L165.0%2050.7L172.5%2060.1L180.0%2068.9L187.5%2077.2L195.0%2085.0L202.5%2092.4L210.0%2099.3L217.5%20105.7L225.0%20111.8L232.5%20117.5L240.0%20122.9L247.5%20127.9L255.0%20132.6L262.5%20137.1L270.0%20141.3%22%2F%3E%3Cpath%20d%3D%22M270.0%2030.0L279.4%2037.7L288.8%2045.0L298.1%2052.1L307.5%2058.8L316.9%2065.2L326.3%2071.4L335.6%2077.2L345.0%2082.9L354.4%2088.2L363.8%2093.4L373.1%2098.3L382.5%20103.0L391.9%20107.5L401.3%20111.8L410.6%20115.9L420.0%20119.8%22%2F%3E%3Cpath%20d%3D%22M420.0%2030.0L426.6%2032.8L433.3%2035.5L439.9%2038.1L446.5%2040.8L453.1%2043.3L459.8%2045.9L466.4%2048.4L473.0%2050.9L479.6%2053.3L486.3%2055.7L492.9%2058.0L499.5%2060.4L506.1%2062.6L512.8%2064.9L519.4%2067.1L526.0%2069.3%22%2F%3E%3C%2Fg%3E%3Cg%20fill%3D%22%238a4b22%22%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%2230%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22270%22%20cy%3D%2230%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22420%22%20cy%3D%2230%22%20r%3D%224%22%2F%3E%3C%2Fg%3E%3Cg%20font-family%3D%22Georgia%2Cserif%22%20font-size%3D%2211%22%20fill%3D%22%235d554a%22%3E%3Ctext%20x%3D%2218%22%20y%3D%2234%22%3E100%25%3C%2Ftext%3E%3Ctext%20x%3D%2224%22%20y%3D%2297%22%3E60%25%3C%2Ftext%3E%3Ctext%20x%3D%2224%22%20y%3D%22159%22%3E30%25%3C%2Ftext%3E%3Ctext%20x%3D%2230%22%20y%3D%22210%22%3E0%25%3C%2Ftext%3E%3Ctext%20x%3D%2256%22%20y%3D%22228%22%3Eday%200%3C%2Ftext%3E%3Ctext%20x%3D%22136%22%20y%3D%22228%22%3Eday%201%3C%2Ftext%3E%3Ctext%20x%3D%22254%22%20y%3D%22228%22%3Eday%204%3C%2Ftext%3E%3Ctext%20x%3D%22404%22%20y%3D%22228%22%3Eday%2011%3C%2Ftext%3E%3Ctext%20x%3D%22470%22%20y%3D%22228%22%3Eday%2030%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%2260%22%20fill%3D%22%238b8173%22%20font-style%3D%22italic%22%3Eone%20exposure%2C%20no%20review%3C%2Ftext%3E%3Ctext%20x%3D%22160%22%20y%3D%2222%22%20fill%3D%22%238a4b22%22%20font-style%3D%22italic%22%3Eeach%20review%20flattens%20the%20slope%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fsvg%3E";
  M.SEED = `
@@ Welcome to Mnemo | 62 | pin
# A notebook that remembers how your ideas connect

Mnemo is a *local-first* notebook. Everything you write stays in this browser, and every double-bracket link you type becomes an edge in a living graph of your thinking. This note is a guided tour - each step is a real feature you can try right now.

> [!idea] Start anywhere
> You do not need a filing system. Write a note, link it to two others, and let the structure emerge. The history behind that habit is in [[Zettelkasten]] and [[Commonplace Books]].

## Try it in five minutes

- [x] Read this note in **Read** mode, then press Ctrl+E to cycle through Edit, Split and Read
- [ ] Hover a link like [[Spaced Repetition]] to preview the note without leaving this page
- [ ] Open the quick switcher with Ctrl+O and type "feyn"
- [ ] Put the cursor at the end of this line and type [[ to autocomplete a link
- [ ] Click the graph icon in the sidebar - watch the clusters, then press the time-lapse button
- [ ] Press Ctrl+D to open today's [[Daily Notes|daily note]]
- [ ] Rename a note from its title and watch every link to it update

## What the editor understands

| Syntax | Result | Notes |
| --- | --- | --- |
| \`[[Note]]\` | link to a note | unresolved links appear dashed - click to create |
| \`[[Note|alias]]\` | link with custom text | hover for a preview card |
| \`#tag\` | tag | browse them in the sidebar |
| \`- [ ]\` | task | click the box in Read mode, the source updates |
| \`> [!note]\` | callout | also idea, warning, tip, question |
| \`/\` | slash menu | headings, tables, callouts, dates, footnotes |

> [!warning] Your notes live in localStorage
> Clearing site data erases them. Use the menu in the sidebar footer to export everything as JSON or as a Markdown bundle.

## Where to go next

The demo notebook is about *how to think with notes*, and it links out in every direction: [[Systems Thinking]], [[Stoic Practice]], [[Mycelial Networks]], [[Sourdough Fermentation]] and [[Cartography]]. The graph will show you how they quietly relate - [[Small-World Networks]] explains why that is possible at all.[^1]

A link that does not exist yet, like [[Your first note]], is rendered differently. Click it to create the note.

[^1]: Short path lengths plus tight local clusters is the signature of a well-linked notebook.

#guide #mnemo

@@ Zettelkasten | 58 | pin
# Slips, links and a second brain made of paper

A **Zettelkasten** (German for "slip box") is a system of small, atomic notes that point at each other. Its power is not storage - it is *surprise*: a slip you wrote years ago, linked from a slip you wrote today, suggests an idea neither contained alone.

The most famous practitioner was [[Niklas Luhmann]], who credited his box with helping him publish dozens of books. The physical tool was the [[The Index Card]]; the digital descendants are [[Evergreen Notes]] and [[Maps of Content]].

## The working rules

1. One idea per note - small enough to link precisely.
2. Write in your own words, as if explaining to someone else (see [[Feynman Technique]]).
3. Every new note must link to at least one existing note.
4. Give notes a stable address so links never break.
5. Let structure emerge; add hubs only when a cluster gets crowded.

> [!note] Fleeting, literature, permanent
> Fleeting notes are quick captures. Literature notes summarise a source. Permanent notes are the ones that enter the box and get linked. Process the first two into the third within a day or two.

## Why it works

The box acts as a conversation partner. Because each slip is short and linked, you retrieve by *association* rather than by folder, which mirrors how memory works - compare [[Spaced Repetition]] and [[Active Recall]]. Writing each permanent note is itself a form of [[Writing to Think]].

#method #notes

@@ Niklas Luhmann | 57
# The sociologist and his slip box

Niklas Luhmann (1927-1998) taught at Bielefeld and left behind roughly 90,000 index cards, organised in two boxes: one of bibliographic references, one of ideas. He called the main box his "communication partner".

His system had two quirks worth stealing.

- **Branching addresses.** A card numbered 21/3d7a4 was a child of 21/3d7a. New thoughts were filed *next to the idea they continued*, not in a fixed taxonomy.
- **Sparse hubs.** A few index cards pointed into the main sequence, but the real structure was in the direct links between slips.

Luhmann's output is often quoted as evidence for the method, yet he also had a rigid daily routine and a university post. The box was a multiplier for [[Deep Work]], not a substitute for it.

See [[Zettelkasten]] for the rules of the game and [[The Index Card]] for the physical medium.

#history #notes

@@ The Index Card | 55
# A small rectangle that organised the modern world

Carl Linnaeus sorted species onto loose paper slips in the 1750s because bound notebooks could not be reordered. The French Revolution's first national catalogue was written on the backs of playing cards. By 1876 Melvil Dewey's Library Bureau was standardising the 3 x 5 inch card, and a generation of offices, libraries and scientists arranged their memory in drawers.

| Year | Milestone | Why it mattered |
| --- | --- | --- |
| 1750s | Linnaeus uses paper slips | Notes become sortable |
| 1789 | Catalogue on playing cards | State-scale indexing |
| 1876 | Library Bureau standard card | Interchangeable drawers |
| 1950s | [[Niklas Luhmann]] starts his box | Cards as a thinking partner |

The constraint is the feature. A card holds roughly one idea, which forces the compression that makes [[Evergreen Notes]] and the [[Zettelkasten]] method work. Older still is the habit of copying quotes into a [[Commonplace Books|commonplace book]].

> [!quote] On constraint
> A small surface keeps you honest: if the idea does not fit, it is probably two ideas.

#history #notes

@@ Commonplace Books | 52
# Copying the world into your own words

From the Renaissance to the Victorians, educated readers kept **commonplace books**: notebooks where they copied passages, proverbs and recipes under topical headings. John Locke's indexing method, published in English in 1706, let him find any entry in seconds by using the first letter and following vowel of a keyword.

What a commonplace book is for:

- collecting quotations worth rereading
- training attention - you must read closely to copy well
- building a personal anthology that reflects *your* taste

The modern equivalent is the literature note inside a [[Zettelkasten]]. The difference is linking: where a commonplace book files by topic, a linked notebook files by relationship, which makes [[Maps of Content]] necessary as a later layer.

Copying is not passive. As Didion said of her own notebooks, the point is to find out what you are looking at - a close cousin of [[Writing to Think]]. The habit of re-reading entries is the analogue ritual behind [[Spaced Repetition]].

#history #writing #notes

@@ Evergreen Notes | 47
# Notes that get better with time

Andy Matuschak's term for notes written to *accumulate* rather than to be filed and forgotten. The principles, in short:

1. **Atomic** - one concept, so it can be linked precisely.
2. **Concept-oriented** - organised around ideas, not around books or projects.
3. **Densely linked** - the links are the structure.
4. **Titles are APIs** - a good title is a claim you can cite in a sentence.

An evergreen note is revised whenever you learn something new. The contrast is with a dated journal or a meeting note, which is a record of the past. Good evergreen titles read like statements: "Feedback loops explain most surprises" rather than "Loops".

This is the living form of the [[Zettelkasten]]; hubs for navigating them are [[Maps of Content]]; and the habit of reviewing is shared with [[Spaced Repetition]]. The [[Feynman Technique]] is a good test: if you cannot explain the note simply, it is not finished.

#method #notes

@@ Maps of Content | 41
# Hubs for navigating a growing notebook

When a cluster passes about a dozen notes, folders stop helping and search becomes noisy. A **map of content** (MOC) is an ordinary note that only links out, arranged by your current understanding of the territory.

~~~md
# Systems (MOC)
- Foundations: [[Systems Thinking]], [[Feedback Loops]]
- Practice: [[Leverage Points]]
- Nature: [[Emergence]], [[Stigmergy]]
~~~

An MOC is a *hand-drawn map*, so it shares the distortions of any map - see [[Cartography]] and [[The Map Is Not the Territory]]. Keep them shallow and rewrite them often.

| Situation | Reach for |
| --- | --- |
| Five related notes | just link them |
| A dozen, one topic | an MOC |
| A dozen, many topics | rename the notes first |

The graph view in Mnemo draws a map automatically (see [[Label Propagation]]), but the hand-made version encodes judgement. Both belong in a healthy [[Zettelkasten]].

#method #notes #maps

@@ Writing to Think | 44
# The page as a thinking tool

"I write entirely to find out what I'm thinking," Joan Didion wrote in 1976. The claim is stronger than it sounds: writing is not the transcription of finished thought but the place where thought happens.

Three cheap practices:

- **Free-write for ten minutes** with no editing. Circle the sentence that surprised you.
- **Write the claim first**, then the reasons. If the reasons do not support it, you learned something.
- **Explain it to a beginner** - the heart of the [[Feynman Technique]].

Writing also externalises working memory. A paragraph holds what your head cannot, which frees attention for the next step; compare [[Attention Residue]] for what happens when unfinished thoughts stay in your head instead.

In a linked notebook, each note you write is a small essay with a title that states a claim ([[Evergreen Notes]]). Daily entries become raw material ([[Daily Notes]]), and periodic reviews are where [[Decision Journal]] entries are judged.

#writing #mind

@@ Daily Notes | 30
# One page per day, links out to everything

Press Ctrl+D in Mnemo to open today's note. It is created from a template with intentions, a scratch area and an evening prompt, and it links to yesterday and tomorrow so you can walk the timeline.

Why bother?

- A dated page removes the decision of *where* to write.
- Anything interesting gets promoted into its own note and linked back - the daily page is the inbox of a [[Zettelkasten]].
- The evening section feeds an [[Evening Review]], a practice older than notebooks.

The daily page is where [[Writing to Think]] happens at low stakes. Do not curate it; curate what you extract from it. If you only keep one habit from this notebook, keep this one, and pair it with a weekly pass over unlinked notes.

#practice #notes

@@ Spaced Repetition | 50 | pin
# Reviewing at the moment you are about to forget

Memory decays predictably ([[The Forgetting Curve]]), and each successful recall flattens the next decline. **Spaced repetition** schedules reviews at expanding intervals so you spend effort only when it counts.

Sebastian Leitner's 1970s box system used physical compartments: answer correctly and a card moves forward (reviewed less often); miss and it returns to box one. Piotr Wozniak's SM-2 algorithm replaced the boxes with a per-card *ease factor*.

~~~js
// A simplified SM-2 step. quality: 0 (blackout) .. 5 (perfect)
function review(card, quality) {
  if (quality < 3) return { ...card, reps: 0, interval: 1 };
  const ease = Math.max(1.3, card.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const reps = card.reps + 1;
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(card.interval * ease);
  return { ...card, reps, interval, ease };
}
~~~

| Review | Typical gap | Retention goal |
| --- | --- | --- |
| 1st | 1 day | ~90% |
| 2nd | 6 days | ~90% |
| 3rd | ~2 weeks | ~90% |
| 4th | ~5 weeks | ~90% |

Pair with [[Active Recall]] - the scheduler only works if each review is a retrieval attempt, not a re-read. A notebook is a slow-motion version: [[Evergreen Notes]] are revisited when linked from new ideas.

#memory #learning

@@ The Forgetting Curve | 49
# Hermann Ebbinghaus and the shape of forgetting

In 1885 Ebbinghaus memorised lists of nonsense syllables and measured how much effort it took to relearn them after a delay. Over a month he found a steep initial drop followed by a long, slowly flattening tail.

| Delay | Savings retained |
| --- | --- |
| 20 minutes | 58% |
| 1 hour | 44% |
| 1 day | 34% |
| 6 days | 25% |
| 31 days | 21% |

![Forgetting curve with review points](${CURVE} "Each review resets the curve and flattens its slope")

The dashed line is one exposure; the solid segments show how each review (the dots) restarts decay at a slower rate. That is the entire justification for [[Spaced Repetition]].

> [!warning] Be careful with the numbers
> Ebbinghaus tested one person (himself) on meaningless syllables. Meaningful material, strong context, and sleep all change the curve. Treat the shape as reliable and the exact percentages as illustrative.

What flattens the curve in practice: meaning, vivid context, [[Active Recall]] instead of rereading, and connections to things you already know - the same reason a linked [[Zettelkasten]] is memorable.

#memory #history #learning

@@ Active Recall | 46
# Retrieval is the workout

Reading feels productive because it is fluent. **Active recall** replaces that fluency with effort: close the book, then write down or say everything you remember. The struggle is not a sign of failure; it is the mechanism. Retrieval strengthens the trace and exposes gaps.

Practical forms:

1. **Blank-page recall** after a chapter.
2. **Question-first notes** - write the question on the front, the answer on the back.
3. **Teach it** to an imaginary novice ([[Feynman Technique]]).
4. **Predict before you look** - guess the answer, then check.

The retrieval attempt should come *before* the answer, and the gaps should drive what you restudy on a schedule ([[Spaced Repetition]]). Testing yourself also pairs naturally with [[Writing to Think]]: a recall attempt is a rough draft of understanding.

Rule of thumb: if studying feels smooth, you are probably not learning much. That mismatch between feeling and learning is why [[Deep Work]] sessions are designed to be uncomfortable in a specific way.

#memory #learning

@@ Feynman Technique | 43
# If you cannot explain it simply, you do not understand it yet

A four-step loop often attributed to Richard Feynman:

1. **Pick a concept** and write its name at the top of a page.
2. **Explain it** in plain language, as to a twelve-year-old.
3. **Find the gaps** - wherever you hand-wave or reach for jargon, go back to the source.
4. **Simplify and use an analogy**, then repeat.

> [!idea] Notes as explanations
> Turn this into a note-taking rule: permanent notes must be understandable by you in a year without the source open. That is the standard behind an [[Evergreen Notes|evergreen note]].

The technique is [[Active Recall]] wearing a friendlier costume, and it is the easiest way to practise [[Writing to Think]]. Feynman himself was sceptical of names over understanding - the difference between knowing the name of a bird and knowing what it does. Keep your [[Mental Models]] honest by testing them on a beginner.

#learning #method

@@ Deep Work | 38
# Long, unbroken attention as a competitive skill

Cal Newport's 2016 book argues that the ability to concentrate without distraction on cognitively demanding tasks is becoming both rarer and more valuable. The practical parts are modest:

- Schedule blocks of 90 minutes or more and protect them.
- Decide in advance what counts as done.
- Keep a shutdown ritual, so the work can stop.
- Track a simple metric, such as hours of deep work per week.

Interruptions carry a hidden cost - see [[Attention Residue]]. When the challenge matches your skill you may slip into [[Flow State]], which is the reward rather than the method.

Tools matter less than environment. A linked notebook like this one lets you park tangents in a few words and get back to work, which keeps the session intact. [[Niklas Luhmann]] is a good example: a routine plus a box.

> [!tip] Start with one hour
> Ninety minutes is a goal, not a starting point. An honest hour beats a fragmented afternoon.

#focus #practice

@@ Flow State | 36
# When challenge and skill meet

Mihaly Csikszentmihalyi described **flow** as complete absorption in an activity with clear goals, immediate feedback, and a balance between challenge and skill. Too little challenge is boredom; too much is anxiety.

| Challenge \\ Skill | Low skill | High skill |
| --- | --- | --- |
| Low challenge | apathy | boredom |
| High challenge | anxiety | flow |

You cannot force flow, but you can design for it: remove interruptions ([[Deep Work]]), choose a task slightly beyond your current reach, and shorten the feedback loop ([[Feedback Loops]]). Hours pass because attention is fully allocated, not because time is unusually slow.

Paradoxically, flow is fragile; a single context switch creates [[Attention Residue]]. Activities as varied as bread baking ([[Sourdough Fermentation]]) and map-making ([[Cartography]]) produce it in people who love them.

#focus #mind

@@ Attention Residue | 33
# The cost of switching that you do not notice

Sophie Leroy's 2009 research found that when people switch tasks before finishing the first, part of their attention stays on the old task. Performance on the new one suffers, especially when the previous task was unfinished and time-pressured.

Ways to reduce residue:

- Finish or *explicitly park* a task before moving on - a one-line note about the next step is enough.
- Batch small interruptions.
- End work with a short shutdown list ([[Deep Work]]).

A notebook helps because it is a trusted place for loose ends; parking a thought in writing ([[Writing to Think]]) releases it from working memory. The same principle underlies the closing prompts in an [[Evening Review]].

It also explains why a constant stream of notifications is so expensive: not the seconds spent reading them, but the half-minute of mental reassembly after each. Protecting [[Flow State]] is mostly about protecting against this.

#focus #mind

@@ Systems Thinking | 54 | pin
# Seeing the loops behind the events

Donella Meadows defined a system as "an interconnected set of elements that is coherently organized in a way that achieves something". Three ingredients: **elements**, **interconnections**, and a **purpose** (which you infer from behaviour, not from slogans).

The basic vocabulary:

- **Stocks** - things you can count at a moment: water in a bathtub, money in an account, notes in a notebook.
- **Flows** - rates that fill or drain a stock.
- **Feedback loops** - where a stock's level influences its own flows ([[Feedback Loops]]).

Events are the tip of the iceberg; patterns, structures and mental models lie beneath. To change behaviour you usually need to change structure, which is the subject of [[Leverage Points]]. Self-organising behaviour without a controller appears in [[Emergence]] and [[Stigmergy]], and in ecosystems ([[Ecological Succession]], [[Tide Pools]]).

Seeing systems also means accepting that our descriptions are maps ([[The Map Is Not the Territory]]). Good [[Mental Models]] are explicit about what they omit.

> [!question] A useful question
> What is the stock here, what fills it, and what drains it?

#systems

@@ Feedback Loops | 51
# Reinforcing and balancing

A **reinforcing loop** amplifies change: compound interest, viral growth, a popular note attracting more links. A **balancing loop** resists change and seeks a goal: a thermostat, a predator population, your appetite.

Most surprising behaviour comes from *delays* in a loop. You turn the shower tap, nothing happens, you turn it more, then scald yourself.

~~~py
# A thermostat with sensor delay overshoots its target
temp, target, delay = 14.0, 20.0, 3
history = [temp] * delay
for minute in range(40):
    error = target - history[-delay]
    temp += 0.35 * error
    history.append(temp)
    if minute % 5 == 0:
        print(minute, round(temp, 1))
~~~

Delete the delay and the curve is a gentle exponential; keep it and it rings. Balancing loops with delays are everywhere: inventories, hiring, [[Ecological Succession|forest recovery]].

A shared set of loops gives a system its character ([[Systems Thinking]]). The most powerful interventions target the loops themselves ([[Leverage Points]]). Feedback also explains learning: a fast loop is why [[Flow State]] feels good and why the [[Decision Journal]] exists.

#systems

@@ Leverage Points | 40
# Where a small push changes the whole system

In a 1999 essay Donella Meadows ranked twelve places to intervene in a system, from weakest to strongest. A shortened version:

1. Constants and numbers (taxes, quotas) - the weakest.
2. Buffer sizes and stock-and-flow structures.
3. Delays relative to the rate of change.
4. The strength of balancing loops.
5. The gain of reinforcing loops.
6. Information flows - who sees what, and when.
7. The rules of the system.
8. The power to add, change or evolve structure.
9. The goal of the system.
10. The mindset that produces the goal - the strongest.

Most effort goes into the weakest points because numbers are easy to change. Adding a *missing information flow* is often dramatically more effective; publishing a house's real-time electricity use changed household consumption more than a lecture would have.

See [[Systems Thinking]] for the vocabulary and [[Feedback Loops]] for the dynamics. The top of the list, paradigms, is where [[Mental Models]] live, and why dissolving a wrong map ([[The Map Is Not the Territory]]) matters more than polishing a right one.

#systems

@@ Emergence | 37
# Order without a conductor

In a starling murmuration, each bird tracks only its six or seven nearest neighbours, yet thousands turn together like smoke. No bird holds the plan. **Emergence** is the appearance of coordinated, often surprising structure from simple local rules.

Conway's Game of Life makes the point in four lines: a live cell survives with two or three neighbours, a dead cell with exactly three is born. Gliders, oscillators and even computers emerge from it.

~~~js
const next = (alive, n) => (alive && (n === 2 || n === 3)) || (!alive && n === 3);
~~~

Emergence is a property of interacting parts, so the map of the parts does not contain the behaviour ([[The Map Is Not the Territory]]). It is the reason that understanding each node of a [[Mycelial Networks|mycelial network]] does not predict the forest, and that the structure of a linked notebook ([[Small-World Networks]]) outgrows anything you planned.

Coordination through traces left in the environment is called [[Stigmergy]]. Ecosystems develop the same way ([[Ecological Succession]]). For the feedback machinery underneath, read [[Feedback Loops]].

#systems #nature

@@ Stigmergy | 29
# Coordination by leaving marks

Pierre-Paul Grasse coined **stigmergy** in 1959 studying termites: the workers do not talk to each other, they modify the environment, and the modified environment guides the next worker. Ants lay pheromone trails that evaporate unless reinforced, so short, busy routes win.

A wiki is stigmergic. So is a shared notebook: a link left on one page invites someone to write the target page. In Mnemo an unresolved link is a pheromone trail - it is a visible invitation.

- No central planner is needed.
- Marks decay or get reinforced, so the system adapts.
- Activity concentrates where it is useful.

It is a concrete mechanism behind [[Emergence]], and the trail-and-reinforcement loop is a classic case of [[Feedback Loops]]. Underground, [[Mycelial Networks]] allocate resources in a similar spirit. For a human analogy, see how a [[Commonplace Books|commonplace book]] gathers marks over decades.

Design consequence: make traces visible and cheap to extend. That is most of what [[Zettelkasten]] software does.

#systems #nature #networks

@@ Mycelial Networks | 45
# The underground web

What we call a mushroom is the fruiting body. The organism is **mycelium**: a mesh of microscopic threads (hyphae) that can extend for kilometres through soil, digesting dead matter and trading with living roots. In mycorrhizal partnerships the fungus delivers water and minerals in exchange for sugars.

In 1997 Suzanne Simard's group traced carbon moving between trees through such networks, inspiring the popular phrase "wood wide web".

> [!warning] Hold the romance lightly
> Whether fungal networks "share" resources to help neighbours, and how much this matters in a forest, is still argued. The links are real; the intentions are a story we tell.

What is uncontroversial is the structure: a decentralised web with no hub, redundant paths, and growth that reroutes around damage. That makes it a model of resilience and of [[Emergence]]. The fungus explores by trial and error and reinforces productive routes, a cousin of [[Stigmergy]], and it participates in [[Ecological Succession]] by recycling the dead.

Mycelium is also what a good notebook aspires to be - which is why the graph view looks the way it does ([[Small-World Networks]]). A sourdough starter is a related micro-ecosystem; see [[Sourdough Fermentation]].

#nature #networks

@@ Tide Pools | 35
# A whole ecosystem in a bathtub

On a rocky shore, the tide rises and falls twice a day and each pool is a small world that is alternately ocean and exposed. Life arranges itself in **zones** from the splash zone to the low intertidal, according to who can tolerate drying, heat and salinity swings.

Robert Paine's 1966 experiment on the Washington coast removed the predatory starfish *Pisaster ochraceus* from test plots. Mussels took over, diversity collapsed, and the concept of the **keystone species** was born.

- Anemones close up when the tide is out to hold moisture.
- Hermit crabs trade shells in orderly "vacancy chains".
- Barnacles cement themselves for life after a brief larval search.

A tide pool is a lesson in constraints: organisms that thrive there are not the strongest but the ones tolerant of change ([[Feedback Loops]] with daily delays). The community self-organises ([[Emergence]]) and recovers after storms by [[Ecological Succession|succession]]. Observation, slowly, with a notebook - a rewarding kind of [[Flow State]].

#nature

@@ Ecological Succession | 31
# How a bare rock becomes a forest

After a volcanic eruption or a glacier's retreat, life returns in stages. **Pioneer species** (lichens, mosses) break down rock and build thin soil. Grasses and shrubs follow, then fast-growing trees, and finally shade-tolerant species of a **climax community**.

| Stage | Typical organisms | Characteristic |
| --- | --- | --- |
| Pioneer | lichens, mosses | tolerate bare, harsh ground |
| Early | grasses, wildflowers | build soil and cover |
| Mid | shrubs, birch, alder | fast growth, shade out grasses |
| Late | beech, hemlock, maple | slow growth, stable |

Each stage alters conditions in ways that favour its successors - a reinforcing loop with built-in delays ([[Feedback Loops]]). Frederic Clements imagined a predictable march to a single climax; Henry Gleason argued for contingency and chance. Most ecologists now hold a middle view.

Fungal partners matter at every step ([[Mycelial Networks]]), and the pattern has analogues in a notebook: fast, messy notes first; structure later ([[Maps of Content]]). Zones and recolonisation also show up between the tides ([[Tide Pools]]).

#nature #systems

@@ Sourdough Fermentation | 42
# A slow conversation between yeast and bacteria

A sourdough starter is a stable community of wild yeast and lactic-acid bacteria living in flour and water. The yeast makes the gas that raises the loaf; the bacteria make the acids (lactic and acetic) that supply flavour and keep the culture safe from rivals.

Timing is temperature: the same dough takes roughly twice as long at 20 C as at 27 C. A workable rhythm:

1. **Feed** the starter at 1:1:1 (starter : flour : water by weight) and wait for it to double.
2. **Autolyse** flour and water for 30-60 minutes.
3. **Bulk ferment** with stretch-and-folds until the dough is airy and jiggly (about 50-75% rise).
4. **Shape**, rest, then cold-proof overnight.
5. **Bake** hot and steamed.

| Ingredient | Baker's % |
| --- | --- |
| Flour | 100 |
| Water | 75 |
| Salt | 2 |
| Starter | 20 |

The craft is [[Feedback Loops]] you can smell: acidity rises, slowing yeast, which slows the gas. Record each bake in the [[Sourdough Log]]. The culture is a micro-[[Ecological Succession|succession]] and a tiny cousin of [[Mycelial Networks]]. Kneading by attention alone can trigger [[Flow State]].

#food #nature

@@ Sourdough Log | 20
# Bake journal

A running log keeps the variables honest. Compare the notes with the method in [[Sourdough Fermentation]]; the habit of measuring is borrowed from the [[Decision Journal]].

| Date | Hydration | Bulk time | Room temp | Result |
| --- | --- | --- | --- | --- |
| Mar 02 | 70% | 6 h | 22 C | dense, pale crumb |
| Mar 09 | 75% | 7 h | 23 C | open crumb, slightly flat |
| Mar 16 | 75% | 5.5 h | 25 C | best so far, blistered crust |
| Mar 23 | 78% | 6 h | 24 C | too slack to shape |

## Next bake

- [x] Feed the starter the night before
- [x] Weigh the flour (do not scoop)
- [ ] Try 75% hydration with a 10% whole-wheat portion
- [ ] Shorten bulk to 5 hours if the kitchen is above 25 C
- [ ] Photograph the crumb for the log

> [!note] What I learned
> Temperature matters more than the clock. The dough tells you when it is ready: a domed top, bubbles at the edge, and a wobble when you shake the tub.

#food #practice

@@ Stoic Practice | 48
# Philosophy as daily training

For the Stoics of Rome and Greece - Epictetus, Seneca, Marcus Aurelius - philosophy was not a set of theories but exercises for living. They practised on purpose, like athletes.

A small repertoire:

- **Dichotomy of control** - separate what is up to you from what is not ([[Dichotomy of Control]]).
- **Negative visualisation** (*premeditatio malorum*) - rehearse setbacks so they arrive without drama.
- **Memento mori** - remember that time is finite ([[Memento Mori]]).
- **The view from above** - zoom out until the irritation shrinks.
- **Evening review** - audit the day without self-flagellation ([[Evening Review]]).

> [!quote] Meditations 5.20
> The impediment to action advances action. What stands in the way becomes the way.

Stoicism is sometimes caricatured as suppressing emotion. The texts are closer to cognitive training: examine the judgement attached to an event, because the judgement is the part you can change. It pairs well with writing ([[Writing to Think]]) and with recording predictions and outcomes in a [[Decision Journal]].

#stoicism #practice

@@ Memento Mori | 39
# Remember that you will die

The phrase is Roman and later Christian, but the practice is Stoic: keep mortality in view so that trivial anxieties lose their grip and important things get done.

Seneca wrote, in *On the Shortness of Life*, that "it is not that we have a short time to live, but that we waste a lot of it". The remedy is not panic but *attention*. Ask daily: what would I do with this hour if I took it seriously?

Modern takes are gentler than skulls on desks:

- Keep a weekly count: how many summers might I still have? (Fewer than feels right.)
- Finish something small every day.
- Prefer depth to busyness - see [[Deep Work]].

It is the counterpart to negative visualisation in [[Stoic Practice]]. What is in your power today is covered by [[Dichotomy of Control]]; the closing ritual in [[Evening Review]] makes the point nightly. The tide pools have it too: every pool is temporary ([[Tide Pools]]).

#stoicism

@@ Dichotomy of Control | 34
# What is up to you, and what is not

Epictetus opens the *Enchiridion* with it: "Some things are in our control and others not." In our control: judgements, intentions, effort. Not in our control: outcomes, other people's opinions, the weather, the market.

A worksheet you can do in five minutes:

1. Write the thing that is bothering you.
2. List what is in your control. Underline one action.
3. List what is not. Practise letting it be.
4. Do the action. Note the result in your [[Decision Journal]].

The aim is not indifference but energy well spent. It is easy to confuse control with influence: you cannot control whether a customer says yes, but you can control the quality of the proposal. In systems terms, you usually control a *flow* rather than a *stock* ([[Systems Thinking]]).

Part of [[Stoic Practice]]; in tension with the ambition of [[Leverage Points]] only at first glance - find the lever you can reach. Close the day with an [[Evening Review]].

#stoicism

@@ Evening Review | 26
# Ten minutes before sleep

Seneca describes a habit of the philosopher Sextius: each night he asked himself which bad habit he had cured, which fault he had resisted, in what way he was better. Seneca adds that he himself reviews the whole day, "hiding nothing from myself".

A template that fits on a [[Daily Notes|daily page]]:

- What went well?
- What did I avoid, and why?
- What would I do differently tomorrow?
- What is one thing that was in my control ([[Dichotomy of Control]])?

Be a judge, not a prosecutor. The goal is information, not punishment. Over a few weeks the entries become patterns you can use in a [[Decision Journal]] review.

It closes the loop ([[Feedback Loops]]) that daily life leaves open, and it is a gentle way to make [[Memento Mori]] practical. Part of [[Stoic Practice]]. If you finish with one line, make it a note to the morning-you.

#stoicism #practice #daily

@@ Cartography | 53
# Every map is an argument

A map is a *selection* - what to include, what to leave out, how to flatten a curved Earth onto paper. Gerardus Mercator's 1569 projection preserved angles, which let sailors steer a straight compass course, and it inflated areas near the poles until Greenland looked as large as Africa (Africa is about fourteen times larger).

Portolan charts of the Mediterranean drew coastlines from sailors' experience. Ptolemy's coordinates shaped Europe's view of the world for over a thousand years. Each made different trade-offs.

- **Projection** decides which distortion you accept.
- **Scale** decides which details disappear.
- **Legend** decides what counts as a feature.

The point is sharper than "maps are flawed": a map earns its keep by *omission* ([[The Map Is Not the Territory]]). The same is true of any [[Mental Models|model]] and of any [[Maps of Content|map of content]] in your notebook. The graph view applies this at a glance by colouring clusters ([[Label Propagation]]) and fading minor labels as you zoom out.

Missing pieces: [[Ptolemy's Geography]] and the blank areas labelled "here be dragons" deserve their own notes.

#maps #history

@@ The Map Is Not the Territory | 32
# A reminder from general semantics

Alfred Korzybski's 1931 slogan points at a trap: we navigate by representations, and forget they are representations. Jorge Luis Borges retold it in a paragraph - an empire whose cartographers draw a map the size of the empire, which later generations abandon as useless.[^1]

A map that matched the territory one-to-one would be no map at all. A good one is *smaller* and therefore wrong in useful ways.

> [!idea] Questions to ask of any model
> What does it leave out? Who drew it, and for what purpose? What would surprise me, if it were correct?

Practical consequences:

- Notes are maps of sources; keep a path back to the original.
- Metrics are maps of goals ([[Leverage Points]], paradigms).
- Dashboards beat dashboards of dashboards.

The idea connects [[Cartography]], [[Mental Models]], and [[Systems Thinking]], and it is why [[Emergence]] is surprising: no map of the parts predicts the whole.

[^1]: "On Exactitude in Science", a single-paragraph story attributed by Borges to an invented author.

#maps #mind

@@ Mental Models | 28
# Reusable explanations of how things work

A mental model is a simplified picture of a domain that lets you predict and reason. Charlie Munger urged collecting a "latticework" of the big ideas from many disciplines and using them together, rather than forcing every problem through one lens.

| Model | Field | One-line use |
| --- | --- | --- |
| Feedback loop | Systems | find the delay |
| Opportunity cost | Economics | what else could this hour buy? |
| Keystone species | Ecology | remove one thing, watch the rest |
| Survivorship bias | Statistics | where are the failures? |
| Inversion | Mathematics | what would guarantee failure? |

Models are maps ([[The Map Is Not the Territory]]), so the skill is less *having* them than *switching* between them and noticing when one stops working. Check each with the [[Feynman Technique]], store them as [[Evergreen Notes]], and look for places they overlap with [[Systems Thinking]], [[Feedback Loops]] and [[Tide Pools]].

Mindsets sit at the top of Meadows' list of [[Leverage Points]] - changing the model changes the system. Test predictions in a [[Decision Journal]].

#mind #systems

@@ Decision Journal | 22
# Write down what you expected

Before an important decision, record: the situation, the options, what you expect to happen, your confidence (as a percentage), and how you feel. Revisit in a few months.

Why it works: hindsight rewrites memory. Without a record, we remember having "known it all along". With one, we separate **decision quality** from **outcome quality** - a good decision can lose, and a bad one can get lucky.

~~~json
{
  "date": "2026-03-14",
  "decision": "Delay launch by two weeks",
  "expected": "Fewer support tickets, same revenue",
  "confidence": 0.65,
  "review": "2026-06-14"
}
~~~

Review questions: was the information available? Did I consider the options fairly? Did I confuse [[Dichotomy of Control|control]] with influence? The discipline is cousin to an [[Evening Review]] at longer timescales, and it feeds better [[Mental Models]].

Good records are short: a few lines beats an essay you will never read. Track [[Sourdough Log]]-style variables where you can.

#practice #mind

@@ Small-World Networks | 24
# Six degrees, many neighbourhoods

In 1998 Duncan Watts and Steven Strogatz showed that a few random long-range shortcuts added to a clustered ring lattice collapse the average path length while keeping the clustering high. That is a **small-world network**: most nodes are not neighbours, but any node is reachable in a few steps.

Stanley Milgram's 1967 letter-forwarding experiment suggested about six steps between strangers in the United States, the origin of "six degrees of separation" - though only a fraction of his chains were completed.

~~~js
// Local clustering coefficient of node v: how many of its neighbours know each other?
function clustering(v, adj) {
  const n = [...adj.get(v)];
  if (n.length < 2) return 0;
  let closed = 0;
  for (let i = 0; i < n.length; i++)
    for (let j = i + 1; j < n.length; j++) if (adj.get(n[i]).has(n[j])) closed++;
  return (2 * closed) / (n.length * (n.length - 1));
}
~~~

A notebook becomes small-world when you link across topics, not just within them: one bridge between [[Stoic Practice]] and [[Feedback Loops]] shortens every path. Communities can be found with [[Label Propagation]]. The same structure describes [[Mycelial Networks]] and the neurons in a brain.

Related: [[Emergence]]. Missing: [[Six Degrees of Separation]].

#networks #systems

@@ Label Propagation | 12
# Finding clusters by voting

**Label propagation** (Raghavan, Albert and Kumara, 2007) detects communities without knowing how many there are. Every node starts with its own label. Repeatedly, each node adopts the label most common among its neighbours. Densely connected groups converge on a single label within a few rounds.

~~~py
import random

def propagate(adj, rounds=20):
    label = {v: v for v in adj}
    nodes = list(adj)
    for _ in range(rounds):
        random.shuffle(nodes)
        changed = False
        for v in nodes:
            votes = {}
            for u in adj[v]:
                votes[label[u]] = votes.get(label[u], 0) + 1
            if votes:
                best = max(votes.values())
                pick = min(l for l, c in votes.items() if c == best)
                if pick != label[v]:
                    label[v], changed = pick, True
        if not changed:
            break
    return label
~~~

It is fast and needs no parameters, but it is random: different runs can give different splits. Mnemo runs several seeded attempts and keeps the one with the highest *modularity*, then colours the graph by cluster.

Why clusters matter in a notebook: they suggest where a [[Maps of Content|map of content]] is overdue. See [[Small-World Networks]] for the structure it exploits, and [[Emergence]] for why communities appear without a planner.

#networks #method
`;
})(window.Mnemo = window.Mnemo || {});
