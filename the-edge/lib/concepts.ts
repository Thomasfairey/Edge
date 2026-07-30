/**
 * Concept taxonomy and selection logic.
 * 76 concepts across 15 domains.
 *
 * Every concept is attributed to the person who actually established it, and
 * the attributions were checked rather than recalled. Sources are empirical
 * researchers (Gottman, Cialdini, Kahneman, Fiske, Pentland, Epley, Reis,
 * Aron, Wood Brooks, Hall, Freyd, Pfeffer), practitioners with a real record
 * (Voss, Navarro, Stokoe, Parker, Dicks, Ury), or foundational figures
 * (Rogers, Goffman, Sacks). Pop-psychology sources were removed.
 *
 * A concept's `domain` says what it is; its `contexts` say where it is
 * practised. Most concepts inherit contexts from their domain — declare them
 * explicitly only when a concept is broader or narrower than its domain.
 *
 * The LLM generates full lesson content at runtime; these definitions
 * provide the seed data and prompt injection context.
 * Reference: PRD Section 3.3, Appendix A
 */

import {
  Concept,
  LifeContext,
  SOCIAL_CONTEXTS,
  contextsForConcept,
  matchesContexts,
  resolveSessionContext,
} from "@/lib/types";
import { getDueReviews } from "@/lib/spaced-repetition";
import { chooseWithHistory, HISTORY_WINDOWS, type Picker } from "@/lib/selection";

// ---------------------------------------------------------------------------
// Master concept library
// ---------------------------------------------------------------------------

export const CONCEPTS: Concept[] = [
  // ── Influence & Persuasion (Cialdini) ──────────────────────────────────
  {
    id: "reciprocity",
    name: "Reciprocity",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "The obligation to return favours creates leverage before a request is ever made. Giving first — even something small — triggers an automatic compliance response.",
  },
  {
    id: "commitment-consistency",
    name: "Commitment & Consistency",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Once someone takes a small public position, they feel compelled to act consistently with it. Getting a micro-commitment early locks in future compliance.",
  },
  {
    id: "social-proof",
    name: "Social Proof",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "People look to others' actions to determine their own, especially under uncertainty. The behaviour of similar others is the strongest signal.",
  },
  {
    id: "authority",
    name: "Authority",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Perceived expertise and status markers dramatically increase compliance. Titles, credentials, and confident delivery trigger automatic deference.",
  },
  {
    id: "scarcity",
    name: "Scarcity",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Limited availability increases perceived value and urgency to act. Loss of access is more motivating than potential gain.",
  },

  // ── Power Dynamics (Greene) ────────────────────────────────────────────
  {
    id: "never-outshine-master",
    name: "Managing Upward Visibility",
    domain: "Power Dynamics",
    source: "Pfeffer",
    description:
      "Pfeffer's research on organisational power finds that performance alone is a poor predictor of advancement, and that how your work is made visible to those above you matters as much as the work. The failure mode is not modesty but miscalibration — being seen as a threat by the person who decides your scope.",
  },
  {
    id: "conceal-intentions",
    name: "Sequencing What You Reveal",
    domain: "Power Dynamics",
    source: "Pfeffer",
    description:
      "Announcing an ambition before you have the position to support it invites opposition to organise against it. Pfeffer's point is not deception but sequencing: build the base, then state the aim, because the order determines whether people are choosing sides or accepting a fact.",
  },
  {
    id: "court-attention",
    name: "Visibility as a Resource",
    domain: "Power Dynamics",
    source: "Pfeffer",
    description:
      "Pfeffer's evidence is blunt: good work that nobody with power observes does not accrue to you. Visibility is not vanity, it is a condition of being considered — and the people who advance are consistently those who solved for being seen as well as for being right.",
  },
  {
    id: "crush-enemy",
    name: "Building a Power Base",
    domain: "Power Dynamics",
    source: "Pfeffer",
    description:
      "Power in organisations accumulates through relationships, resources and reputation rather than through defeating rivals. Pfeffer's data show that people who invest in a base outlast those who invest in winning fights — and that today's opponent is very often tomorrow's necessary ally.",
  },
  {
    id: "discover-thumbscrew",
    name: "Understanding What Someone Needs",
    domain: "Power Dynamics",
    source: "Pfeffer",
    description:
      "Influence follows from knowing what the other person is actually optimising for — their targets, their exposure, what their own boss is asking of them. This is the same observation Greene frames as finding a weakness, and it works considerably better framed as finding a shared interest.",
  },

  // ── Negotiation (Voss) ─────────────────────────────────────────────────
  {
    id: "tactical-empathy",
    name: "Tactical Empathy",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Demonstrating understanding of the other side's perspective — without agreeing with it — creates psychological safety that opens them to influence.",
    contexts: ["family", "friends", "dating", "work"],
  },
  {
    id: "mirroring",
    name: "Mirroring",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Repeating the last 1–3 words of what someone said triggers unconscious elaboration and builds rapport. It makes the other person feel heard and encourages them to reveal more.",
    contexts: ["family", "friends", "dating", "work"],
  },
  {
    id: "labelling",
    name: "Labelling",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Naming the other person's emotion ('It seems like you're frustrated by...') defuses negative feelings and creates a sense of being deeply understood.",
    contexts: ["family", "friends", "dating", "work"],
  },
  {
    id: "calibrated-questions",
    name: "Calibrated Questions",
    domain: "Negotiation",
    source: "Voss",
    description:
      "'How' and 'What' questions give the illusion of control to the other party while steering the conversation. They force the counterpart to solve your problem.",
  },
  {
    id: "accusation-audit",
    name: "The Accusation Audit",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Pre-emptively listing every negative thing the other side could think about you or your proposal neutralises objections before they crystallise into resistance.",
  },

  // ── Behavioural Psychology & Cognitive Bias (Kahneman) ─────────────────
  {
    id: "anchoring",
    name: "Anchoring Effect",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "The first number or frame presented disproportionately influences all subsequent judgments. Setting the anchor controls the entire negotiation range.",
  },
  {
    id: "framing",
    name: "Framing Effect",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Identical information presented differently produces opposite decisions. A 90% survival rate and a 10% mortality rate are logically identical but emotionally divergent.",
  },
  {
    id: "loss-aversion",
    name: "Loss Aversion",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Losses feel roughly twice as painful as equivalent gains feel good. Framing proposals in terms of what will be lost by inaction is more motivating than framing what will be gained.",
  },
  {
    id: "availability-heuristic",
    name: "Availability Heuristic",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "People judge probability by how easily examples come to mind, not by actual frequency. Vivid, recent, or emotionally charged events are massively overweighted.",
  },
  {
    id: "sunk-cost",
    name: "Sunk Cost Fallacy",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Prior investment — time, money, or effort — makes people continue failing courses of action to justify past decisions, even when quitting is clearly optimal.",
  },

  // ── Nonverbal Intelligence & Behavioural Profiling (Chase Hughes) ──────
  {
    id: "baseline-reading",
    name: "Baseline Behaviour",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Navarro",
    description:
      "Navarro's twenty-five years of FBI behavioural analysis start here: no gesture means anything in isolation, only as a deviation from that particular person's normal. Establishing what someone looks like when they are comfortable is the entire foundation, and skipping it turns observation into projection.",
  },
  {
    id: "deviation-detection",
    name: "Pacifying Behaviours",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Navarro",
    description:
      "When the limbic system registers stress, the body produces self-soothing behaviours to restore calm — touching the neck, stroking the face, rubbing the thighs, exhaling with puffed cheeks. They appear within moments of the thing that caused them, so their timing tells you what the discomfort was about.",
  },
  {
    id: "authority-posture",
    name: "Ventral Fronting & Denial",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Navarro",
    description:
      "We orient the soft front of the body toward what we like and angle it away from what we do not, largely below conscious control. Watching a torso turn a few degrees away mid-conversation is a more honest read on how it is going than anything the face is doing.",
  },
  {
    id: "microexpression-clusters",
    name: "Discomfort, Not Deception",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Navarro",
    description:
      "Navarro's central correction to the popular version of his field: nobody can reliably detect lies from behaviour, and the research on people who claim to is not kind. What you can detect is discomfort — and discomfort is a signal to ask a better question, not a verdict.",
  },
  {
    id: "ellipsis-model",
    name: "Reading Comfort Over Time",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Navarro",
    description:
      "The useful signal is not any single tell but the direction of travel: does this person get more comfortable as the conversation goes on, or less? Tracking that trajectory across an encounter is more informative, and far harder to fool yourself with, than cataloguing individual gestures.",
  },

  // ── Rapport & Relationship Engineering (Carnegie) ──────────────────────
  {
    id: "genuine-interest",
    name: "Genuine Interest Principle",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "Becoming genuinely interested in other people generates more influence in two months than trying to get others interested in you achieves in two years.",
  },
  {
    id: "name-recall",
    name: "Name Recall",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "A person's name is the sweetest and most important sound in any language to that person. Remembering and using it correctly builds instant rapport and signals respect.",
  },
  {
    id: "avoid-criticism",
    name: "Avoid Criticism",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "Direct criticism triggers defensive identity protection and shuts down receptivity. Any fool can criticise — it takes character to understand and redirect.",
  },
  {
    id: "talk-their-interests",
    name: "Talk in Terms of Their Interests",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "The royal road to influence is talking about what the other person values most. Reframe every proposal in terms of their goals, not yours.",
  },
  {
    id: "make-them-important",
    name: "Make Them Feel Important",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "The deepest principle in human nature is the craving to be appreciated. Sincere, specific recognition of someone's contribution creates loyalty that mere incentives cannot.",
  },

  // ── Dark Psychology & Coercive Technique Recognition ────────────────────
  {
    id: "gaslighting",
    name: "Reality Erosion",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Freyd",
    description:
      "The sustained undermining of someone's confidence in their own perception and memory, so that they come to rely on the other person's account of events over their own. Freyd's betrayal-trauma work explains why it is most effective from someone trusted: the closer the relationship, the higher the cost of disbelieving them.",
  },
  {
    id: "darvo",
    name: "DARVO",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Freyd",
    description:
      "Coined by Jennifer Freyd in 1997: Deny, Attack, and Reverse Victim and Offender. Confronted with accountability, the person denies the behaviour, attacks the credibility of whoever raised it, and repositions themselves as the injured party. Naming the pattern is most of the defence against it, because it works by disorienting the person who raised the concern.",
  },
  {
    id: "manufactured-urgency",
    name: "Manufactured Urgency",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Cialdini",
    description:
      "Creating artificial time pressure to bypass deliberate System 2 analysis and force impulsive System 1 compliance. Recognise it when deadlines appear suddenly with no structural justification.",
  },
  {
    id: "information-asymmetry",
    name: "Control of Information Flow",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Pfeffer",
    description:
      "Positions that sit between parts of an organisation carry power disproportionate to their rank, because they control what each side knows. Recognising who occupies those positions explains a great deal of otherwise puzzling decision-making — and recognising when it is being used on you is the defensive half.",
  },
  {
    id: "love-bombing-professional",
    name: "Manufactured Intimacy",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Freyd",
    description:
      "Intensity delivered far ahead of any earned basis for it — rapid flattery, disclosed confidences, accelerated closeness — which creates a sense of obligation before judgement has caught up. The tell is pace: real closeness is reciprocal and gradual, and this is neither.",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SOCIAL TRACK
  // ═══════════════════════════════════════════════════════════════════════

  // ── Charisma & Presence (Van Edwards / Cabane) ─────────────────────────
  {
    id: "warmth-competence-balance",
    name: "Warmth & Competence",
    domain: "Charisma & Presence",
    source: "Fiske",
    description:
      "Fiske's Stereotype Content Model found that people judge each other on two dimensions before anything else: warmth (are your intentions toward me good?) and competence (can you act on them?). Both are read within seconds, and being strong on one while absent on the other is the common failure — the impressive person nobody warms to, the warm person nobody trusts with anything.",
  },
  {
    id: "charismatic-presence",
    name: "Presence as a Measurable Signal",
    domain: "Charisma & Presence",
    source: "Pentland",
    description:
      "Pentland's MIT sociometer badges recorded real conversations and found that outcomes — job interviews, first dates, negotiations — were predicted by signals independent of content: how much you speak, how consistently, and how you vary. Presence is not a mood you summon; it is a pattern in behaviour that other people read unconsciously.",
  },
  {
    id: "nonverbal-warmth-cues",
    name: "Mimicry",
    domain: "Charisma & Presence",
    source: "Pentland",
    description:
      "One of Pentland's four honest signals: unconscious mirroring of posture, gesture and speech rhythm within a few seconds of the other person. It reliably tracks empathy and trust because it is expensive to fake in real time — which is exactly why deliberate, delayed copying reads as unsettling rather than warm.",
  },
  {
    id: "vocal-power",
    name: "Vocal Emphasis & Activity",
    domain: "Charisma & Presence",
    source: "Pentland",
    description:
      "Activity and emphasis — energy in the voice, variation in pitch and pace — are honest signals of interest and conviction that listeners decode without noticing. A flat delivery is read as low investment regardless of what the words claim, which is why the same sentence can persuade or die depending entirely on how it is carried.",
  },
  {
    id: "intentional-first-impression",
    name: "Managing the Impression",
    domain: "Charisma & Presence",
    source: "Goffman",
    description:
      "Goffman's dramaturgical account: in any encounter people are performing a self, with a front stage where the performance runs and a back stage where it does not. The point is not that this is dishonest, but that it is unavoidable — so the question is whether you are choosing the impression you give off, or leaking one by default.",
  },

  // ── Storytelling & Narrative (Dicks / Duarte / Van Edwards) ────────────
  {
    id: "five-second-moment",
    name: "The Five-Second Moment",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "Every worthwhile story is really about one small moment of change — five seconds where something shifted inside you. Find that moment first; everything else is just the runway to it.",
  },
  {
    id: "narrative-tension",
    name: "Narrative Tension",
    domain: "Storytelling & Narrative",
    source: "Duarte",
    description:
      "Attention is held by an open gap between what is and what could be. Open a question the listener needs answered, then delay the resolution — tension, not information, is what keeps people leaning in.",
  },
  {
    id: "stakes-and-vulnerability",
    name: "Stakes & Vulnerability",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "People invest in a story only when something is at risk for the teller. Naming what you stood to lose — and admitting how you really felt — is what turns an anecdote into something people feel.",
  },
  {
    id: "hook-opening",
    name: "The Opening Line",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "Dicks, a sixty-time Moth StorySLAM champion, opens on the moment rather than the setup — no throat-clearing about when and where, just straight into something already in motion. Context can be handed over later while the listener is already committed; delivered first, it is the point at which they decide not to listen.",
  },
  {
    id: "show-dont-summarise",
    name: "Show, Don't Summarise",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "Put the listener in the room with concrete, sensory detail rather than reporting the gist. A specific image ('he slid the cold coffee across the table') lands where an abstract summary ('the meeting was tense') evaporates.",
  },

  // ── Conversation & Memorability (Van Edwards / Carnegie) ───────────────
  {
    id: "conversational-spark",
    name: "The Undersociality Gap",
    domain: "Conversation & Memorability",
    source: "Epley",
    description:
      "Epley's experiments found people are systematically wrong about conversation: they expect talking to a stranger to be awkward and unwelcome, and are reliably wrong in the same direction. The other person is more interested than you think, and the deeper conversation goes better than the shallow one you defaulted to.",
  },
  {
    id: "threading",
    name: "Follow-Up Questions",
    domain: "Conversation & Memorability",
    source: "Wood Brooks",
    description:
      "Across 600 online conversations and 110 speed-dates, Huang and Wood Brooks found that people who ask more questions — and specifically follow-up questions on what was just said — are better liked, and go on more second dates. The follow-up is the signal, because it is the only kind of question that proves you listened to the answer.",
  },
  {
    id: "be-a-highlighter",
    name: "Perceived Responsiveness",
    domain: "Conversation & Memorability",
    source: "Reis",
    description:
      "Reis and Shaver's model of intimacy: closeness is not produced by disclosure alone but by whether the discloser perceives understanding, validation and caring in the response. You can be entirely attentive and still fail this if none of it reaches the other person — the perception is the mechanism, not your internal state.",
  },
  {
    id: "memorable-exit",
    name: "The Peak & the End",
    domain: "Conversation & Memorability",
    source: "Kahneman",
    description:
      "Kahneman, Fredrickson and colleagues found that people's memory of an experience is predicted almost entirely by its emotional peak and its final moments, with the duration barely registering. An hour that trails off is remembered as worse than a shorter one that ends well — so how you leave outweighs most of what came before.",
  },
  {
    id: "story-bank-and-signature",
    name: "A Bank of Ready Stories",
    domain: "Conversation & Memorability",
    source: "Dicks",
    description:
      "Dicks's Homework for Life is the practice: every evening, note the one moment from that day worth five minutes of anyone's time. It is not a memory exercise but a noticing one — people who do it find their days were never short of material, only of attention, and they are never caught with nothing to say.",
  },

  // ── Empathy & Attunement (Rogers, Nichols, Gottman) ────────────────────
  {
    id: "listening-to-understand",
    name: "Listening to Understand",
    domain: "Empathy & Attunement",
    source: "Nichols",
    description:
      "Most people listen while composing their reply. Real listening means holding your own response in abeyance until you could argue the other person's position better than they just did. The other person can feel the difference immediately.",
  },
  {
    id: "reflecting-back",
    name: "Reflecting Back",
    domain: "Empathy & Attunement",
    source: "Rogers",
    description:
      "Saying back the substance of what someone said, in your own words, before you respond to it. It proves you heard them, and it lets them correct you cheaply if you didn't.",
  },
  {
    id: "bids-for-connection",
    name: "Turning Toward Bids",
    domain: "Empathy & Attunement",
    source: "Gottman",
    description:
      "People constantly make small bids for attention — a comment, a sigh, a photo held up. Gottman found that turning toward these micro-bids, rather than away, predicts whether relationships survive. The bid is rarely about its literal content.",
  },
  {
    id: "validation-before-solution",
    name: "Validation Before Solution",
    domain: "Empathy & Attunement",
    source: "Rogers",
    description:
      "Jumping to advice tells someone their feeling was a problem to be removed. Naming the feeling first — and stopping there — is what actually lets them move. Most people need to be understood before they can think.",
  },
  {
    id: "reading-emotional-state",
    name: "Reading the Emotional Weather",
    domain: "Empathy & Attunement",
    source: "Gottman",
    description:
      "Before you decide what to say, read what state the other person is actually in — flooded, guarded, buoyant, exhausted. The same sentence lands completely differently depending on the weather you say it into.",
  },

  // ── Vulnerability & Intimacy (Aron, Brown) ─────────────────────────────
  {
    id: "disclosure-reciprocity",
    name: "Disclosure Reciprocity",
    domain: "Vulnerability & Intimacy",
    source: "Aron",
    description:
      "Closeness is built by escalating, matched self-disclosure. One person goes slightly deeper, the other matches, and it ratchets. Going far deeper than the other person is ready for breaks the ratchet rather than speeding it up.",
  },
  {
    id: "escalating-questions",
    name: "The Escalating Question",
    domain: "Vulnerability & Intimacy",
    source: "Aron",
    description:
      "Aron generated laboratory closeness between strangers using questions that deepened in sequence. The mechanism is the gradient, not the intensity: each question earns the right to the next one.",
  },
  {
    id: "strategic-imperfection",
    name: "Disclosure That Invites Reciprocity",
    domain: "Vulnerability & Intimacy",
    source: "Reis",
    description:
      "In Reis and Shaver's model, a disclosure only builds intimacy if the response conveys understanding rather than evaluation. Admitting something genuinely uncertain gives the other person a low-cost opportunity to be responsive, which is what actually moves a conversation toward closeness.",
  },
  {
    id: "sitting-with-discomfort",
    name: "Staying Responsive Under Discomfort",
    domain: "Vulnerability & Intimacy",
    source: "Reis",
    description:
      "The moment someone says something hard is the moment responsiveness is tested. Filling the silence, joking, or rushing to reassure are all ways of managing your own discomfort, and all read to the discloser as an absence of understanding — which is the one thing the model says has to be present.",
  },
  {
    id: "naming-the-unsaid",
    name: "Escalating the Disclosure Ladder",
    domain: "Vulnerability & Intimacy",
    source: "Aron",
    description:
      "Aron's closeness procedure works through sustained, escalating, reciprocal disclosure — each step slightly deeper than the last, matched by the other person. Naming what is going unsaid is simply a large step on that ladder, and it lands or fails on whether the previous rungs were climbed together.",
  },

  // ── Conflict & Repair (Gottman, Ury, Voss) ─────────────────────────────
  {
    id: "softened-startup",
    name: "The Softened Start-Up",
    domain: "Conflict & Repair",
    source: "Gottman",
    description:
      "Gottman could predict the outcome of an argument from its first three minutes. Opening with a complaint about a specific behaviour ('I felt dismissed when...') rather than a verdict on character ('you always...') changes where the whole conversation can go.",
  },
  {
    id: "repair-attempts",
    name: "Repair Attempts",
    domain: "Conflict & Repair",
    source: "Gottman",
    description:
      "Small moves mid-argument that de-escalate — a joke, an admission, 'wait, let me start again'. What separates stable relationships isn't fewer conflicts, it's whether repair attempts get made and, crucially, whether they get accepted.",
  },
  {
    id: "real-apology",
    name: "The Real Apology",
    domain: "Conflict & Repair",
    source: "Gottman",
    description:
      "A real apology names the specific thing you did, acknowledges its effect without justifying your intent, and stops. 'I'm sorry you felt that way' and 'I'm sorry but' are both defences wearing an apology's clothes.",
  },
  {
    id: "boundary-without-attack",
    name: "The Warm Boundary",
    domain: "Conflict & Repair",
    source: "Ury",
    description:
      "A boundary states what you will do, not what the other person must stop doing. 'I'm not going to discuss my job at dinner' is enforceable by you alone — which is precisely why it holds without needing their agreement.",
  },
  {
    id: "flooding-and-timeout",
    name: "Recognising Flooding",
    domain: "Conflict & Repair",
    source: "Gottman",
    description:
      "Past a physiological threshold, people stop processing what they hear — nothing said after that point lands. Recognising flooding, in yourself or the other person, and pausing deliberately is not avoidance; continuing is.",
  },
  {
    id: "going-to-the-balcony",
    name: "Going to the Balcony",
    domain: "Conflict & Repair",
    source: "Ury",
    description:
      "Ury's move for a conversation heading somewhere bad: mentally step off the stage and watch it from above before you respond. The pause between provocation and reaction is the entire space in which you have any choice at all.",
  },

  // ── Flirtation & Signalling (Hall, Van Edwards) ────────────────────────
  {
    id: "reading-interest",
    name: "Reading Interest Honestly",
    domain: "Flirtation & Signalling",
    source: "Hall",
    description:
      "Interest shows in clusters — sustained attention, leaning in, asking follow-ups, keeping the conversation alive past its natural end. One signal means nothing. The honest skill is reading the absence of a cluster and accepting it gracefully.",
  },
  {
    id: "playful-teasing",
    name: "Playful Teasing",
    domain: "Flirtation & Signalling",
    source: "Hall",
    description:
      "Light teasing works because it signals you're not intimidated and creates a shared private register. It fails the moment it targets something the person is actually insecure about — then it's just a small cruelty with a smile on it.",
  },
  {
    id: "calibrated-escalation",
    name: "Calibrated Escalation",
    domain: "Flirtation & Signalling",
    source: "Hall",
    description:
      "Moving from friendly to flirtatious in increments, each one small enough to retreat from without embarrassment for either person. The size of the step matters more than the direction.",
  },
  {
    id: "expressed-attraction",
    name: "Direct Over Ambiguous",
    domain: "Flirtation & Signalling",
    source: "Hall",
    description:
      "Hall's Flirting Styles Inventory, built from over five thousand respondents, identifies a sincere style — direct expression of genuine interest — that is associated with better outcomes than the playful or polite styles most people default to. After enough signalling, indirectness stops reading as intriguing and starts reading as unavailable.",
  },
  {
    id: "graceful-rejection",
    name: "Taking a No Well",
    domain: "Flirtation & Signalling",
    source: "Hall",
    description:
      "How you handle disinterest is itself a signal, and the one people remember. Accepting a no warmly and without a sulk or a second attempt is both the decent thing and, incidentally, the only thing that ever leaves a door open.",
  },

  // ── Group Dynamics & Inclusion (Van Edwards, Cain) ─────────────────────
  {
    id: "joining-a-group",
    name: "Entering a Conversation in Progress",
    domain: "Group Dynamics & Inclusion",
    source: "Stokoe",
    description:
      "Stokoe's conversation analysis works from recordings of real interaction rather than what people report doing, and finds that entries succeed or fail on sequence: joining at a natural transition and contributing to the topic in play is accepted, while resetting the topic to yourself is politely closed down.",
  },
  {
    id: "bringing-others-in",
    name: "Equalising the Room",
    domain: "Group Dynamics & Inclusion",
    source: "Parker",
    description:
      "Parker's generous authority has three jobs, and this is the second: actively addressing the power differences in a room rather than pretending they are not there. Handing a specific, easy opening to whoever has gone quiet costs you the floor and is the most reliably generous thing anyone in a group can do.",
  },
  {
    id: "reading-the-room",
    name: "Group Signal Patterns",
    domain: "Group Dynamics & Inclusion",
    source: "Pentland",
    description:
      "Pentland's badge data showed that a group's collective signal pattern — how evenly turns are distributed, how much energy circulates — predicts its performance better than the individual talent in it. Reading a room means reading that pattern before you change it, because arriving loud into a flat room does not lift it.",
  },
  {
    id: "holding-the-floor-briefly",
    name: "Turn-Taking",
    domain: "Group Dynamics & Inclusion",
    source: "Sacks",
    description:
      "Sacks, Schegloff and Jefferson's foundational analysis showed conversation is governed by an orderly turn-taking system with transition-relevance places where the floor can legitimately change hands. Attention in a group is lent at those points and reclaimed at the next one — taking it, using it, and handing it back is what makes people willing to lend it again.",
  },
  {
    id: "hosting-instinct",
    name: "Generous Authority",
    domain: "Group Dynamics & Inclusion",
    source: "Parker",
    description:
      "Parker's argument is that under-hosting is not kindness, it is abdication: guests left to fend for themselves are not free, they are stranded. Generous authority means using your position to protect, equalise and connect people — and it is available to anyone in the room, not just whoever owns the flat.",
  },
];

// ---------------------------------------------------------------------------
// Concept selection
// ---------------------------------------------------------------------------

/**
 * How many sessions a concept gets before the curriculum moves on.
 *
 * One session per concept was coverage, not acquisition: a single eight-turn
 * conversation cannot make a technique available to you under real social
 * pressure, and 76 concepts at one a day is a tour, not training. Three
 * sessions with the *situation* varying and the *skill* held constant is the
 * shape the evidence actually supports, and it is also the right fix for the
 * product feeling repetitive — novelty belongs in who you are talking to, not
 * in what you are practising.
 */
export const REPS_PER_CONCEPT = 3;

/** How many sessions each concept has had, keyed by concept id. */
export function repsByConcept(completedIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of completedIds) {
    const concept = conceptFromLedgerValue(value);
    if (!concept) continue;
    counts.set(concept.id, (counts.get(concept.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The concept the user is part-way through, if there is one.
 *
 * Reads the most recent session and asks whether that concept still has
 * sessions left. `rep` is the number of the session about to happen — so the
 * day after a concept's first session, this returns rep 2.
 */
export function conceptInProgress(
  completedIds: string[],
  contexts: LifeContext[] = SOCIAL_CONTEXTS
): { concept: Concept; rep: number } | null {
  if (completedIds.length === 0) return null;

  const last = conceptFromLedgerValue(completedIds[completedIds.length - 1]);
  if (!last) return null;

  // A context change mid-cycle should not strand the user on a concept they can
  // no longer practise anywhere they care about.
  if (!matchesContexts(contextsForConcept(last), contexts)) return null;

  const done = repsByConcept(completedIds).get(last.id) ?? 0;
  if (done >= REPS_PER_CONCEPT) return null;

  return { concept: last, rep: done + 1 };
}

/**
 * Which contexts this concept has already been practised in.
 *
 * Used to push each repetition into a different setting — the same technique
 * against a friend, then a stranger at a party, then your brother, is what
 * makes it transfer rather than staying welded to one kind of room.
 */
function contextsUsedFor(
  conceptId: string,
  history: { concept: string; context?: LifeContext | null }[]
): LifeContext[] {
  const used: LifeContext[] = [];
  for (const entry of history) {
    if (conceptFromLedgerValue(entry.concept)?.id !== conceptId) continue;
    if (entry.context && !used.includes(entry.context)) used.push(entry.context);
  }
  return used;
}

/**
 * Whether this concept was one of the last few sessions.
 *
 * Reads backwards over the ledger rather than checking only the final entry,
 * because a concept can be interrupted and still be fresh in the user's mind.
 */
export function practisedRecently(
  conceptId: string,
  completedIds: string[],
  window: number = HISTORY_WINDOWS.review
): boolean {
  const recent = completedIds.slice(-window);
  return recent.some((value) => conceptFromLedgerValue(value)?.id === conceptId);
}

/**
 * Whether a due concept is a fair thing to offer as a review.
 *
 * Being due is not sufficient, and treating it as though it were is what made
 * the app feel stuck. Spaced repetition rows are written after every session,
 * including the first, and a session scoring below 3 sets the interval to a
 * single day — so the concept the user is one session into is due tomorrow
 * morning. Serving it takes them off a three-session cycle they had barely
 * started, and hands the concept back to selection as though it were new.
 */
export function eligibleForReview(
  concept: Concept,
  completedIds: string[],
  contexts: LifeContext[],
  reps: Map<string, number> = repsByConcept(completedIds)
): boolean {
  // A review is revision of something finished, not a shortcut through the
  // acquisition cycle.
  if ((reps.get(concept.id) ?? 0) < REPS_PER_CONCEPT) return false;
  // Revision the morning after is not spaced repetition, it is the same lesson
  // twice.
  if (practisedRecently(concept.id, completedIds)) return false;
  // And it has to be practisable where the user actually lives.
  return matchesContexts(contextsForConcept(concept), contexts);
}

/**
 * Select the next concept for today's session.
 *
 * Returns `{ concept, isReview, context, rep }` — `rep` is which of the
 * concept's three sessions this is, and drives how much lesson gets delivered
 * and how the header labels the day.
 *
 * Order of precedence:
 * 1. A due spaced-repetition review, 30% of the time — long-term retention of
 *    something already finished, which is a different job from the three-session
 *    acquisition cycle below. "Already finished" is enforced here rather than
 *    assumed: SR rows are written after every session, including the first, so
 *    a concept the user is one session into is due for review the next morning.
 * 2. The concept currently mid-cycle, in a context it has not been practised in
 *    yet where one is available.
 * 3. A new concept, excluding any that has already had its three sessions,
 *    preferring a domain the user has not seen recently.
 */
export async function selectConcept(
  completedIds: string[],
  userId?: string | null,
  contexts: LifeContext[] = SOCIAL_CONTEXTS,
  history: { concept: string; context?: LifeContext | null }[] = [],
  /** Injectable for tests; production passes nothing and gets Math.random. */
  pick?: Picker
): Promise<{ concept: Concept; isReview: boolean; context: LifeContext; rep: number }> {
  const reps = repsByConcept(completedIds);

  // Check for due reviews — 30% chance of review session.
  // Only surface a review the user can actually practise right now.
  try {
    const dueReviews = await getDueReviews(userId);
    if (dueReviews.length > 0 && Math.random() < 0.3) {
      for (const review of dueReviews) {
        const reviewConcept = CONCEPTS.find((c) => c.id === review.conceptId);
        if (!reviewConcept) continue;
        if (eligibleForReview(reviewConcept, completedIds, contexts, reps)) {
          return {
            concept: reviewConcept,
            isReview: true,
            context: resolveSessionContext(contextsForConcept(reviewConcept), contexts),
            rep: Math.min(reps.get(reviewConcept.id) ?? 1, REPS_PER_CONCEPT),
          };
        }
      }
    }
  } catch {
    // SR not available — continue with normal selection
  }

  const inProgress = conceptInProgress(completedIds, contexts);
  if (inProgress) {
    return {
      concept: inProgress.concept,
      isReview: false,
      context: nextContextFor(inProgress.concept, contexts, contextsUsedFor(inProgress.concept.id, history)),
      rep: inProgress.rep,
    };
  }

  // Not necessarily a concept with no history. selectNewConcept keeps anything
  // short of its full three sessions in the pool, so this branch also picks up
  // concepts stranded mid-cycle — by a review, or by a context change. Those
  // resume at the repetition they reached; assuming rep 1 here re-delivered the
  // full teaching lesson to someone who had already read it, which is the most
  // literal form of the app repeating itself.
  const concept = selectNewConcept(completedIds, contexts, pick);
  const priorReps = reps.get(concept.id) ?? 0;
  return {
    concept,
    isReview: false,
    context:
      priorReps > 0
        ? nextContextFor(concept, contexts, contextsUsedFor(concept.id, history))
        : resolveSessionContext(contextsForConcept(concept), contexts),
    rep: Math.min(priorReps + 1, REPS_PER_CONCEPT),
  };
}

/**
 * A context for this concept that it has not been practised in yet.
 *
 * Falls back to the normal resolution once every eligible context has been
 * used — repeating a setting beats refusing to run the session.
 */
export function nextContextFor(
  concept: Concept,
  contexts: LifeContext[],
  alreadyUsed: LifeContext[]
): LifeContext {
  const eligible = contextsForConcept(concept).filter((c) => contexts.includes(c));
  const fresh = eligible.find((c) => !alreadyUsed.includes(c));
  return fresh ?? resolveSessionContext(contextsForConcept(concept), contexts);
}

/** Resolve a concept from either an id or a formatted ledger name. */
export function conceptFromLedgerValue(value: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === value || `${c.name} (${c.source})` === value);
}

export function selectNewConcept(
  completedIds: string[],
  contexts: LifeContext[] = SOCIAL_CONTEXTS,
  pick: Picker = (n) => Math.floor(Math.random() * n)
): Concept {
  // A concept is only spent once it has had all REPS_PER_CONCEPT sessions.
  // Excluding anything merely *seen* is what the one-a-day curriculum did, and
  // it is exactly the behaviour the three-session cycle replaces.
  const reps = repsByConcept(completedIds);
  // Restrict the entire pool to the active contexts before anything else.
  const inContext = CONCEPTS.filter((c) => matchesContexts(contextsForConcept(c), contexts));
  // Guard: a context selection with no matching content must not wedge the app.
  const pool = inContext.length > 0 ? inContext : CONCEPTS;
  const available = pool.filter((c) => (reps.get(c.id) ?? 0) < REPS_PER_CONCEPT);

  // All in-context concepts exhausted — reset the pool (still in context)
  if (available.length === 0) {
    return pool[pick(pool.length)];
  }

  // Domains of the most recent sessions, most recent first. Avoiding the last
  // few domains rather than only the last one is what stops the curriculum
  // oscillating between two domains for a week.
  const recentDomains: string[] = [];
  for (let i = completedIds.length - 1; i >= 0; i--) {
    const concept = conceptFromLedgerValue(completedIds[i]);
    if (concept) recentDomains.push(concept.domain);
    if (recentDomains.length >= HISTORY_WINDOWS.domain) break;
  }

  const byDomain = chooseWithHistory(available, {
    idOf: (c) => c.domain,
    recentIds: recentDomains,
    window: HISTORY_WINDOWS.domain,
    pick,
  });

  return byDomain ?? available[pick(available.length)];
}
