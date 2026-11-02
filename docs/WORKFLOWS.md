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
- **Parallel** isn't a node type. Connecting one node's output to several nodes runs those branches at the same time. Branches can have several steps of their own before they're merged.
- **No loops** for now.
- **Unconnected nodes are allowed.** A node that doesn't lead to Output still runs, and its result is saved in the run, e.g. a side note. The editor shows a small warning about nodes not connected to Output.
- A node can be **disabled** without deleting it.

### AI node options

- **Include context** (checkbox):
  - Off: the node gets only the output of the previous node.
  - On: the node gets the normal chat context, the same as a regular message, plus the outputs of the nodes before it.
- **Role:** whether the node's input is sent as a user or an assistant message. This gives control over how a model treats earlier output, e.g. as a text to review or as its own draft to continue.
- **Model:** use the chat's model (default), or pin a specific model.

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

- Loops, e.g. "review until the reviewer says OK, max 3".
- Image generation steps.
- Agent steps with tools.
- A per-provider concurrency queue.
