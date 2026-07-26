# Browser test script — post-reframe release

A test plan for **Claude in Chrome** (or any browser agent) against the live app.

Paste the whole of "The prompt" below into Claude in Chrome. Everything above it
is context for you, not for the agent.

---

## Before you start

**URL:** https://the-edge-xi.vercel.app

**You will need:** your login for the app. If the account has never onboarded,
you get the onboarding flow; if it has, skip to §2 and use the profile page to
check the context UI instead.

**Two things to be aware of:**

1. **Each completed session writes a real row to the production ledger** and
   costs Anthropic tokens (roughly 5–8 model calls per session). Two sessions is
   enough for this script.
2. To remove test rows afterwards, note the day numbers as you go and delete by
   `id` — do not delete by `day`, since real sessions share those numbers.

**What has genuinely never been exercised by a human:** the onboarding context
multi-select, the score chips, the phase pips, and the trend dashboard. Every
API route has been driven programmatically end to end, but nobody has looked at
any of this in a browser.

---

## The prompt

> You are testing a web app called The Edge at **https://the-edge-xi.vercel.app**.
> It has just had a large release and I want to know whether it actually works
> for a real person. Work through the checks below in order. After each numbered
> section, tell me PASS or FAIL with what you actually saw — quote the text on
> screen rather than summarising it. Do not fix anything; just report.
>
> Take a screenshot at each point marked 📷.
>
> ---
>
> **1. Onboarding — the context picker** *(skip if the account has already
> onboarded; say so and go to §2)*
>
> Log in and go to `/session`. You should reach a step headed
> **"Where do you want to get better with people?"**
>
> - Confirm exactly **five** options are listed: Dating & romance, Friendships,
>   Groups & parties, Family & hard conversations, Work. 📷
> - Confirm **four are already selected** and Work is not.
> - Click a selected option — it should **deselect**. Click it again — it should
>   reselect. This is a multi-select, not a radio group.
> - **Now try to turn all five off, one by one.** It must be impossible to end up
>   with zero selected; at least one must remain on. Report exactly what happens
>   when you click the last remaining one. 📷
> - Select only **Dating & romance**, continue.
> - On the bio step, read the prompt text. It should ask about **you and the
>   people in your life** — it must NOT ask for your role, company, or industry.
>   Quote it. 📷
> - Enter: *"I am an engineer. Fine one to one, silent in groups. I have drifted
>   from friends I care about and I go blank on dates."* Continue.
> - Pick any feedback style and finish onboarding.
>
> **FAIL if:** you see a three-way Professional / Social / Both choice anywhere;
> the options behave as a radio group; you can deselect everything; or the bio
> prompt asks about your job.
>
> ---
>
> **2. The session — this is the important one**
>
> Run a full session to completion. As you go:
>
> **2a. The scenario.** When the roleplay starts, there is a scene-setting brief
> and then a character speaks first. Read the brief carefully and tell me:
>
> - **Who is "you" in it?** It must be addressed to **the character** you are
>   about to talk to — "You're sitting at a corner table…", "You've just
>   arrived…". 📷
> - **FAIL if the brief is addressed to you, the learner.** The specific broken
>   pattern to watch for is a third person acting on you — *"Your mum has just
>   finished making tea… **She turns to you** and says…"*. That means the app has
>   briefed the wrong person and the character will play the wrong role. Quote
>   the first sentence verbatim either way.
> - **FAIL if the character has your job.** You said you were an engineer — the
>   character must not turn out to be an engineer, or reference your deployments,
>   sprints, or standups. That is your biography leaking onto them.
> - Does the character have something going on that has nothing to do with you?
>   (A bad day, a text they are ignoring, something on their mind.) That is
>   intended — note whether it is there.
>
> **2b. The conversation.** Send 3–4 replies. Report:
> - Does the character stay in character, or does it become a helpful assistant?
> - Does it stay short and punchy (1–3 sentences), or monologue?
> - Does it ever mention the skill you are supposedly practising? It must not. 📷
>
> **2c. The debrief — check the score labels.** When the debrief appears, find
> the five score dimensions. 📷
>
> - You chose **Dating**, so they should be about presence, playfulness,
>   vulnerability, attunement, spark — or similar relational language.
> - **FAIL if you see "Technique Application", "Tactical Awareness", "Frame
>   Control", "Emotional Regulation", or "Strategic Outcome".** Those are the old
>   work rubric and must not appear in a dating session.
> - Quote all five labels exactly as shown.
>
> **2d. Finish the session.** Continue through to the mission and complete it.
>
> - **This is the highest-risk step.** Report whether the session completes
>   cleanly or errors at the end. 📷
> - **FAIL if you see any error after the debrief** — particularly anything about
>   saving, or a spinner that never resolves. The final phase is where a failure
>   would land.
> - Quote the mission text. It should be one concrete thing to try with a real
>   person in the next day, not generic advice.
>
> ---
>
> **3. The progress pips**
>
> During the session, look at the row of dots at the top. 📷
>
> - Count them and name the labels.
> - Sessions now vary in shape, so this may be 2, 3, or 4 steps depending on the
>   day. Just report what you saw — I want to know the count and labels, not
>   whether it matches a fixed expectation.
>
> ---
>
> **4. Start a second session**
>
> Go back to `/session` and begin again (do not complete it — the opening is
> enough).
>
> - Is it a **different character** from the first session? 📷
> - Is the scenario a **different situation**, not a variation of the same
>   evening?
> - Does the session have the **same shape** as before, or a different one
>   (different number of pips, or straight into the conversation with no lesson)?
>
> **FAIL if:** same character or a near-identical scenario. Avoiding repeats is
> the entire point of this release.
>
> ---
>
> **5. The profile page**
>
> Go to `/profile`. 📷
>
> - Under "Where you want to get better", confirm the same five contexts appear
>   as a multi-select, with your onboarding choice reflected.
> - Change the selection — add Family & hard conversations — and save.
> - Reload the page and confirm it persisted.
>
> **FAIL if:** you see a Professional / Social / Both toggle, or the change does
> not survive a reload.
>
> ---
>
> **6. The home screen**
>
> Go to `/`. 📷
>
> - If you have two or more completed sessions, a trend section should appear.
> - Report the dimension labels shown there and whether anything looks broken —
>   empty sparklines, `NaN`, `undefined`, or dimension names in `snake_case`
>   rather than readable words.
>
> ---
>
> **At the end, give me:**
>
> 1. A PASS/FAIL line per section.
> 2. **The full text of the first scenario brief, verbatim.** I want to read it
>    myself — this is the part I trust least.
> 3. The five score labels you saw.
> 4. Anything that felt off as a *product*, separate from whether it worked:
>    scenarios that felt generic, a character that felt like a chatbot, a debrief
>    that felt like flattery, copy that still sounds corporate.

---

## What I expect to be fragile

Ranked by how likely they are to bite, based on what has already gone wrong:

| Risk | Where it shows | What it looks like |
|---|---|---|
| **High** | §2a | Scenario briefs the wrong person. This bug was real and was fixed by a prompt change, which is a softer guarantee than code — it can regress on a different character or context. |
| **High** | §2d | Session errors at the mission phase. A `NOT NULL` on the legacy score columns broke every ledger write in testing; it is fixed, but this is the failure that costs a user ten minutes of work before appearing. |
| Medium | §2c | Work rubric appearing in a social session — means the session context is not reaching the debrief. |
| Medium | §4 | Repeated character or scenario — the history-aware selection reads the ledger, so it degrades quietly if that read fails. |
| Low | §1 | Deselect-everything. Guarded in both the hook and the profile page, and covered by a test. |
| Low | §6 | Trend dashboard with mixed dimension sets. Existing sessions are all `work`; new ones are not, and the dashboard only trends the most recent set. |

## Cleaning up afterwards

Test sessions land in the production ledger. To find and remove them:

```sql
-- Look at what the test created (newest first)
SELECT id, day, date, concept, "character", context, dimension_set, shape_id
FROM ledger ORDER BY id DESC LIMIT 10;

-- Delete by id only — day numbers are shared with real sessions
DELETE FROM ledger WHERE id IN (...);
```
