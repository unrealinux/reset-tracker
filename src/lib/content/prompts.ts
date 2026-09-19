export type PromptGroup = "project" | "conversation";

export interface PromptEntry {
  slug: string;
  title: string;
  teaser: string;
  group: PromptGroup;
  tags: string[];
  /** The text copied to the clipboard. */
  body: string;
  /** What to expect, and how to tell the run went well. */
  notes: string[];
}

export const promptGroups: { id: PromptGroup; titleKey: string; subKey: string }[] = [
  { id: "project", titleKey: "prompts.group.project", subKey: "prompts.group.project.sub" },
  {
    id: "conversation",
    titleKey: "prompts.group.conversation",
    subKey: "prompts.group.conversation.sub",
  },
];

export const prompts: PromptEntry[] = [
  {
    slug: "agents-md-checkup",
    title: "Give AGENTS.md a focused checkup",
    teaser: "Find conflicting rules and deliver replacement passages.",
    group: "project",
    tags: ["docs", "agents", "review"],
    body: `Read AGENTS.md (and CLAUDE.md if present) in this repository, then audit it against how the project actually works.

Steps:
1. List every instruction that is a rule ("always", "never", "must").
2. For each rule, find whether the repository still supports it. Check the file paths, scripts and commands it references.
3. Flag contradictions between rules, and rules that duplicate each other with different wording.
4. Flag rules that are now impossible to follow (missing script, renamed folder, removed tool).
5. Note anything important that is missing: how to run tests, how to run the dev server, how to add a new module.

Deliver:
- A table: rule | status (valid / stale / conflicting / duplicate) | evidence (file:line).
- For every stale, conflicting or duplicate rule, the exact replacement passage, ready to paste.
- At most five missing rules, each written in the same voice as the existing file.

Do not rewrite the whole file. Do not invent commands — verify each one exists before recommending it.`,
    notes: [
      "Good output cites a file and line for every claim.",
      "If the agent cannot verify a command, it should say so rather than guess.",
    ],
  },
  {
    slug: "clarify-skill",
    title: "Clarify one existing Skill",
    teaser: "Tighten its trigger, inputs and stopping conditions.",
    group: "project",
    tags: ["skills", "agents"],
    body: `Pick the Skill in this repository whose description is vaguest about when it should trigger. Ask me to confirm the choice, then tighten it.

For the chosen Skill, rewrite only its front matter description and the top of its body so that it states:
- the exact trigger conditions (what a user says or what state the project is in),
- the required inputs and where they come from,
- what the Skill will not do (its boundaries),
- how the Skill knows it is finished.

Rules:
- Keep the description within the platform's character limit; count the characters and show the count.
- Do not change the Skill's implementation steps unless they contradict the new description.
- Keep the existing formatting and heading style.

Output the diff, not the whole file.`,
    notes: [
      "Ask it to show the character count to prove the description still fits.",
      "A tightened trigger is the single biggest quality win for a Skill.",
    ],
  },
  {
    slug: "refresh-docs",
    title: "Refresh the project documentation",
    teaser: "Reconcile guides with each other and the code, then deliver coordinated revisions.",
    group: "project",
    tags: ["docs"],
    body: `Audit the documentation in this project against the code, then propose coordinated fixes.

1. Inventory the docs: README, docs/, and any guide in a subdirectory. List each file with its apparent audience.
2. Inventory the code that the docs describe: entry points, scripts in package.json, configuration files, environment variables.
3. Find every drift:
   - commands that no longer exist,
   - environment variables that were renamed or removed,
   - file paths that moved,
   - behaviour described in prose that the code contradicts,
   - the same topic explained differently in two places.
4. Rank the drift by how likely it is to waste a new contributor's time.

Deliver a single set of edits: for each drifted section, the current text, the corrected text, and the file it belongs in. Where two docs contradict each other, say which one wins and why. Do not rewrite sections that are already correct.`,
    notes: [
      "The ranking matters more than the list — it tells you what to fix first.",
      "Reject any edit that changes wording without fixing a factual drift.",
    ],
  },
  {
    slug: "docs-navigation",
    title: "Add a navigation page for project docs",
    teaser: "Organize existing documents around practical questions.",
    group: "project",
    tags: ["docs"],
    body: `Create a documentation index for this project at docs/README.md.

Do it in this order:
1. Read every existing document under docs/ and the root README.
2. Write the questions a new contributor actually asks, for example: "how do I run this locally", "how do I add a new endpoint", "where do I change the database schema", "how do I deploy".
3. Map each question to the document and section that answers it today.
4. Mark questions with no answer as gaps.

Structure the index as a table: question | where to read | status. Group the rows by intent (Getting started / Changing behaviour / Operating it / Reference). Link with relative paths and anchor fragments that exist — verify each one.

Finally, list the top three gaps as short task descriptions I can hand to an agent.`,
    notes: [
      "Verify every anchor link; a broken index is worse than no index.",
      "The gap list doubles as a backlog.",
    ],
  },
  {
    slug: "onboarding-guide",
    title: "Write an onboarding guide for this project",
    teaser: "Find the entry points and document one representative flow.",
    group: "project",
    tags: ["docs", "onboarding"],
    body: `Write an onboarding guide for a developer who has never seen this repository.

First, work out the facts yourself:
1. Find the real entry points (main file, route table, CLI commands).
2. Determine how to install, configure and run the project locally. Run the commands if the environment allows; otherwise read the configuration and say that it is unverified.
3. Trace one representative flow end to end — from user action to the code that handles it to the store it touches.
4. Note the three things most likely to trip up a newcomer.

Then write docs/ONBOARDING.md with:
- What this project does, in three sentences.
- Prerequisites with exact versions from the repository's own files.
- Setup steps as copy-pasteable commands.
- A walkthrough of the representative flow, naming real files and symbols.
- A troubleshooting section with the failure modes you actually observed.

Mark anything you could not verify with "unverified".`,
    notes: [
      "The 'unverified' markers are the most valuable part of the output.",
      "A traced flow with real file names is what makes onboarding stick.",
    ],
  },
  {
    slug: "draft-tests",
    title: "Draft tests for one meaningful branch",
    teaser: "Select isolated behavior and deliver complete test code.",
    group: "project",
    tags: ["tests"],
    body: `Find the most valuable untested branch in this project — prefer pure logic with clear inputs and outputs, or a data transformation with edge cases.

Then:
1. State why you chose it, in two sentences.
2. Read the existing test setup and match its framework, file naming and assertion style exactly. If there is no test setup, propose the smallest one that fits the project and add it.
3. Write the tests: the happy path, the boundary cases, and one case where the code should fail loudly.
4. Run the test command and report the real output.

Deliver the complete test file and the exact command to run it. Do not change production code to make a test pass — if you believe there is a bug, write the failing test and stop there, then explain the bug.`,
    notes: [
      "A failing test plus an explanation is a good outcome, not a failure.",
      "Match the existing framework; a second test runner is a net loss.",
    ],
  },
  {
    slug: "health-check",
    title: "Run one project health check",
    teaser: "Find an existing check and return evidence or a repair draft.",
    group: "project",
    tags: ["quality"],
    body: `Run this project's own checks and report what they find.

1. Read package.json (or the equivalent) and list every check the project defines: lint, type check, tests, build, format.
2. Run them in the cheapest-first order and capture the real output.
3. For each failure: the file, the line, the error, and one sentence on the cause.
4. For the highest-severity failure, prepare a minimal repair: the smallest diff that resolves it without changing behaviour elsewhere.
5. If a check cannot run because of missing configuration, say exactly what is missing instead of installing something on your own.

Deliver a status table (check | result | time) followed by the failure details and the repair diff. Do not fix more than the one failure you were asked to prepare, and do not reformat unrelated code.`,
    notes: [
      "Insist on real command output — no imagined results.",
      "One justified repair teaches more than ten speculative ones.",
    ],
  },
  {
    slug: "explain-flow",
    title: "Explain one core flow with a diagram",
    teaser: "Create a standalone page from an automatically selected feature.",
    group: "project",
    tags: ["docs", "diagrams"],
    body: `Pick the single most important user-facing flow in this project and document it as a standalone page.

1. Choose the flow and say why it is the most important one.
2. Trace it in code: the entry point, each module it passes through, where state changes, where it talks to the outside world, and where it can fail.
3. Draw it as a Mermaid diagram with no more than 12 nodes. Label edges with the data that moves, not with vague verbs.
4. Below the diagram, write a numbered walkthrough. Each step names a real file and the function or symbol involved.
5. List the failure points you found and what the user sees in each case.

Write the result to docs/flows/<name>.md. Every claim must be traceable to code you actually read — mark anything inferred as "inferred".`,
    notes: [
      "Twelve nodes is a hard ceiling; more means the flow was not really chosen.",
      "Edge labels carrying data names make the diagram useful rather than decorative.",
    ],
  },
  {
    slug: "review-latest-change",
    title: "Review the latest change for gaps",
    teaser: "Inspect a concrete diff for behavior that could go wrong.",
    group: "project",
    tags: ["review"],
    body: `Review the most recent change in this repository.

1. Identify the change: the latest commit, or the working tree diff if there are uncommitted edits. Show the command you used to find it.
2. Read the diff and the surrounding code, not just the changed lines.
3. Answer, with evidence:
   - What can now happen that could not happen before?
   - Which existing callers assume the old behaviour?
   - What happens on the error path, the empty input, and the largest plausible input?
   - Is anything now unhandled: a rejected promise, a missing case, a resource that is never released?
   - Did a comment, doc or type signature become false?
4. Rank the findings by severity and give the smallest correct fix for each.

Deliver findings only — no praise, no summary of what the change does well. If the change is clean, say so in one line and stop.`,
    notes: [
      "Explicitly asking for no praise keeps the review signal high.",
      "The 'which callers assume the old behaviour' question finds the real bugs.",
    ],
  },
  {
    slug: "trim-claude-md",
    title: "Remove unnecessary weight from CLAUDE.md",
    teaser: "Keep essential instructions and draft focused replacements.",
    group: "project",
    tags: ["docs", "agents"],
    body: `CLAUDE.md has grown. Reduce it without losing anything that changes agent behaviour.

1. Classify every paragraph as one of: instruction (changes what the agent does), context (background only), or noise (restates what the code already makes obvious).
2. For each instruction, find the shortest wording that preserves the exact constraint. Preserve the specifics: paths, commands, limits, names.
3. Delete the noise outright. Move background context into docs/ and leave a one-line link.
4. Rewrite anything that reads like a story as an imperative line.

Deliver:
- The proposed new file, complete.
- A line count before and after.
- A checklist of every constraint you preserved, so I can verify nothing was dropped.

Never remove a constraint to hit a length target. If a paragraph is ambiguous, keep it and flag it for me.`,
    notes: [
      "The preserved-constraint checklist is what makes trimming safe.",
      "Ambiguity should be surfaced, never silently deleted.",
    ],
  },
  {
    slug: "repeated-step-template",
    title: "Turn a repeated step into a template",
    teaser: "Use existing task records to produce something reusable.",
    group: "conversation",
    tags: ["reuse", "templates"],
    body: `Look back through this conversation and find the step we performed more than once.

1. Name the step and count how many times it appears.
2. Extract the invariant part — what stays the same every time — and the variable part — what changes.
3. Write a template for the invariant part with clearly marked placeholders, using the same commands and paths we actually used. Do not generalise beyond what we did.
4. Show one filled-in example using a real instance from this conversation, so I can check the template against reality.
5. State when the template should not be used.

Deliver the template as a code block I can copy, plus the example below it.`,
    notes: [
      "Refusing to over-generalise is the point; a template for everything helps nobody.",
      "'When not to use it' prevents the template from becoming a trap.",
    ],
  },
  {
    slug: "save-task-as-prompt",
    title: "Save a completed task as a reusable prompt",
    teaser: "Keep the steps that worked so you can reuse them.",
    group: "conversation",
    tags: ["reuse", "prompts"],
    body: `We just finished a task in this conversation. Turn it into a reusable prompt.

1. State the task in one sentence: the goal, not the steps.
2. Replay what actually worked, in order. For each step note whether it was essential or incidental. Drop the incidental work — the wrong turns, the retries caused by typos.
3. Note the context the task needed: which files had to be read first, which commands had to be available, what had to be true before starting.
4. Write the prompt so a fresh agent with the same repository could complete the task. Include the verification step we used to know it was done.
5. Add a short "if this fails" section with the one or two dead ends we actually hit.

Deliver the prompt only, ready to copy. Do not include our conversation-specific details such as my preferences or the exact file we happened to touch, unless the task genuinely requires them.`,
    notes: [
      "Dropping the wrong turns is what separates a prompt from a transcript.",
      "The verification step is what makes it repeatable.",
    ],
  },
  {
    slug: "save-issue-as-note",
    title: "Save a resolved issue as a troubleshooting note",
    teaser: "Preserve symptoms, working steps and recovery evidence.",
    group: "conversation",
    tags: ["reuse", "troubleshooting"],
    body: `We just resolved a problem in this conversation. Write it up as a troubleshooting note for the next person who hits it.

Structure:
1. **Symptoms** — what was observed, including the exact error text and where it appeared.
2. **When it happens** — the conditions that trigger it, and the conditions that do not.
3. **What did not work** — each dead end we tried, and why it failed. This is the most valuable section.
4. **The fix** — the exact steps, in order, with the commands as we ran them.
5. **How to confirm it is fixed** — the evidence we actually saw.
6. **Related** — anything that looks similar but is a different problem.

Write it to docs/troubleshooting/<short-name>.md. Do not speculate about causes we did not verify: if the root cause is still unknown, say "root cause not established" and describe only the working recovery.`,
    notes: [
      "The dead-ends section saves the next person the most time.",
      "'Root cause not established' is an honest, useful outcome.",
    ],
  },
  {
    slug: "improve-old-prompt",
    title: "Make an old prompt easier to execute",
    teaser: "Rewrite a prompt so a fresh agent can run it without guessing.",
    group: "conversation",
    tags: ["prompts", "quality"],
    body: `Find the oldest prompt in this conversation — the instruction I gave near the start — and rewrite it so an agent with no context could execute it correctly.

1. Quote the original prompt.
2. List every ambiguity in it: undefined nouns, missing paths, unstated success criteria, missing output format, unstated constraints.
3. Find where the conversation resolved each ambiguity, and write down the resolution that actually worked.
4. Rewrite the prompt to include those resolutions, in the order an agent would need them.
5. Add the stopping condition: how the agent knows it is finished, and what it must not do.

Show the before and after side by side, and note which ambiguities you could not resolve from the conversation — those need my input.`,
    notes: [
      "Unresolvable ambiguities should be surfaced, not papered over.",
      "A stopping condition is the most commonly missing part of a prompt.",
    ],
  },
];

export function getPrompt(slug: string): PromptEntry | undefined {
  return prompts.find((p) => p.slug === slug);
}

export function promptsByGroup(group: PromptGroup): PromptEntry[] {
  return prompts.filter((p) => p.group === group);
}
