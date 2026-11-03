# Workflows

## Why

A single pass isn't enough for creative writing. Models fall into patterns, repeat themselves and make mistakes that a second look would catch. A write → review → rewrite flow fixes a lot of this.

Rather than building "rewrite with review" as a fixed feature, Hanoki gets generic tooling for it: workflows. A workflow describes how a request moves through one or more AI steps before the result lands in the chat. Review and rewrite is the first use case, but the same tool covers anything else, image generation included later.

## Workflows as workspace items

- A workflow is its own item in the workspace tree, next to chats, notes and terminals. It can be grouped in folders.
- Workflows are separate from chats. Any chat can use any workflow.
- The workflow editor opens as a tab, shown full-size or in split view. You can edit a workflow next to the chat that uses it.

## The workflow graph

A workflow is a graph of nodes connected by edges, built in a visual editor.

- **Input** is where the request enters. **Output** is what becomes the chat message.
- **AI node** has a model, a system prompt and a prompt. It takes one incoming connection.
- **Merge node** combines several outputs into one using a text template, e.g. `{{step.draft}}\n\n{{step.review}}`. It's the only node that accepts multiple incoming connections. It has no model.
- **Decision node** asks a model a yes/no question about its input and goes on along its **Yes** or **No** output. It hands its input on unchanged, so the steps after it work on the text it judged, not on its answer. Steps only the other branch reaches don't run ("branch not taken"); a Merge after both branches joins whatever ran.
- **Parallel** isn't a node type. Connecting one node's output to several nodes runs those branches at the same time. Branches can have several steps of their own before they're merged.
- **Loops** start at a Decision: connect its Yes or No back to a step before it. Taking that branch runs every step from there again (see below).
- **Unconnected nodes are allowed.** A node that doesn't lead to Output still runs, and its result is saved in the run, e.g. a side note. The editor shows a small warning about nodes not connected to Output.
- A node can be **disabled** without deleting it.

### AI node options

- **Include context** (checkbox):
  - Off: the node gets only the output of the previous node.
  - On: the node gets the normal chat context, the same as a regular message, plus the outputs of the nodes before it.
- **Role:** whether the node's input is sent as a user or an assistant message. This gives control over how a model treats earlier output, e.g. as a text to review or as its own draft to continue.
- **Model:** use the chat's model (default), or pin a specific model.
- **Models on later passes:** when a loop runs the step again, pass 2 uses the first model in this list, pass 3 the second, and so on; after the last it starts over with the step's own model. Pass N uses `[model, ...list][(N − 1) % length]`. The typical use: the draft was refused, so the retry goes to another model. Each pass in the run shows the model it ran with. A chat's model override replaces only the step's own model (pass 1 and every restart), not the list.

- **Retries:** after an error or a reply with no text, try again up to N times (0–5) before the step fails. The partial text of a failed try is dropped. Provider limits (429, overloaded) are always waited out and don't count.

### Decisions

- A Decision has a model (the chat's by default), a **question**, an optional system prompt and **Include chat context** (off by default: judging the text alone is cheaper and usually enough).
- Its input goes in a tag named after the step that wrote it, the same as an AI step's (`<draft>`), so the question can say "Did the text in the `<draft>` tags refuse the request?". A Decision is looked through: the step after it gets `<draft>` too.
- **How it's asked:** with a JSON schema (`{ reason, answer }`) through AI SDK structured output. On OpenRouter this is `response_format`, and the request asks OpenRouter to route only to endpoints that honor it (`provider.require_parameters`). Models OpenRouter lists without `structured_outputs`/`response_format`, and any model whose structured answer fails, are asked to reply YES or NO instead, which is then parsed. The run shows which way was used and the model's one-line reason.
- Decisions ask with temperature 0 where the model takes one.
- **Retries** apply to a Decision too: an error, or an answer that isn't yes or no, asks again.
- A **disabled** Decision asks nothing and goes on along the branch that doesn't loop, else No.
- Why not `experimental_decide`: AI SDK 7's decision API (native decision models such as TypeSafe's Jev or OpenAI's Luna) takes its state as content parts, not chat turns, and the OpenRouter provider has no decision models. On OpenRouter, Jev (`typesafe/jev-router`) and Luna are chat models with structured outputs, so they work as Decision models as they are. Native decision models can be added behind the same `decide` call later.

### Loops

- A loop goes from a Decision's Yes or No back to a step that runs before it. Only one branch of a Decision can loop, and a branch that loops connects nowhere else.
- Taking the loop runs its target and every step after it again: a new **pass** of each. A step still writing when the loop starts over (e.g. a side branch) is stopped and runs again too.
- **Max loops** (1–20, default 3) caps how often the branch is taken; 3 means the steps run up to 4 times. **If it's still Yes/No** after that: **Stop workflow** (the run ends as "didn't finish" and the message keeps the last finished text, e.g. the last attempt) or **take the other branch** (go on with the last attempt).
- A Decision inside another loop starts counting again whenever the outer loop runs it over.
- Loop connections don't carry text; the step a loop goes back to reads the same input as before. The typical use: retry a draft the model refused. Draft → Decision "Did it refuse?" → Yes loops back to Draft, No goes on.
- Every pass is kept on the message. A step's row shows its latest pass; earlier ones are listed under it, and any of them can be used as the message.

### How a step's input is sent

- **With a prompt** (role Natural or User), the input and the prompt go in one user turn, the input first, wrapped in a tag named after the step it comes from: `<draft>…</draft>`, `<draft_review>…</draft_review>`, or `<request>…</request>` for the message itself. Prompts can name it: "Review the draft in the `<draft>` tags."
- This matters most with **Include context** on. The text to work on must not look like one more turn of the conversation. Sent as an assistant turn followed by "Review the text above", a reviewer reviews every earlier reply in the chat, and the rewrite after it rewrites the whole story. Models also tend to go easy on text presented as their own.
- **A review with context on** sees the whole conversation as real turns and the draft in its tag, so it can check the draft against earlier messages (repeated lines, beats, contradictions) without reviewing them. The default Review step does this: "Use the conversation before it as reference: flag lines, beats, images and phrasing the draft repeats from earlier messages, and anything that contradicts them, but don't review the earlier messages themselves."
- **Without a prompt**, Natural continues the input as the model's own words when it follows a user turn.
- **Assistant** with a prompt keeps the input as the model's own turn, for a model that should treat it as its own draft.
- `{{input}}` in the prompt places the input yourself; nothing else is added.
- The step inspector's **Show what it sends** lists the exact turns, built by the same code the run uses, with placeholders for the chat and step outputs.
- Setting `HANOKI_DEBUG_CONTEXT=1` logs an outline of every model request (chat and workflow steps) to the console. `HANOKI_DEBUG_CONTEXT=/path/file.jsonl` also writes each full request to that file.

### Merge templates

- A Merge template names the steps it reads. A connected step the template doesn't read is dropped, and the editor flags it. This typically happens after duplicating a Merge for a second pass: the copy is wired to the new steps but still reads the old ones. **Use the connected steps** rewrites the template to read each connected step in its own tag.

## Using a workflow in a chat

- A workflow can be selected and removed in a chat at any time.
- When a workflow is active, sending a message runs it with the same context a normal message would get. The Output result becomes the assistant message.
- The workflow run is saved for the user, but only the final message goes into the chat context. Intermediate steps don't.
- **Regenerate** works as it does today: it uses the workflow if one is active, otherwise it doesn't. Like "regenerate with note", there's also an explicit "regenerate with workflow" option.

## Right sidebar

When a chat has a workflow selected, a right sidebar shows a simple version of it:

- A list of steps with each step's name, model and context setting.
- Quick model switching per step. Changes are overrides for this chat and this workflow only. The workflow itself stays unchanged.
- Floating cards with no background panel.
- When the chat tab is narrow (measured by the tab's space, not the whole window), the sidebar hides. A button opens it as an overlay above the content.

## Seeing a run

- While a workflow runs, the message shows its steps inline, similar to tool calls: name, model, status and expandable output.
- The final step streams into the message as usual.
- The same view is used later to look at a finished run from its message.
- Each run keeps a snapshot of the setup it used (models, prompts, settings). Older runs stay meaningful after the workflow is edited, and different models can be compared.

## Using any step's output

- Any step's output can be used as the message, e.g. when the first draft turned out better than the rewrite.
- It's added as a new version of the message, the same way regenerate works. Nothing is overwritten.
- **Rerun from step N** reruns a workflow from a given step and keeps the earlier outputs, e.g. keep the draft and redo only the review and rewrite.

## Stopping

- A running workflow can be stopped at any time.
- Finished steps keep their output. A step that was still writing keeps its partial text, marked as partial.
- The message uses the last finished step on the main path by default. Stopping after a good first pass gives you that text right away, with no extra cost.
- To continue later, rerun from the next step.

## Provider limits

- Some providers, e.g. Featherless, allow only a few requests at once. For now, requests that hit these limits retry with backoff and waiting steps show that they're waiting.
- Later: a per-provider limit on concurrent requests that queues them across the whole app.

## Later

- Loops that feed something back, e.g. "review until the reviewer says OK, max 3" with the review handed to the rewrite.
- Native decision models (`experimental_decide`) for providers that offer them.
- Image generation steps.
- Agent steps with tools.
- A per-provider concurrency queue.
