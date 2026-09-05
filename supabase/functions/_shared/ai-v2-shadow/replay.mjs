import { buildFilterInput } from "./input-adapter.mjs";
export async function replayConversation({ conversation, baseInput, processTurn }) {
  const ordered = [...conversation].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const visible = [];
  const outputs = [];
  let previousRun = null;
  for (const message of ordered) {
    visible.push(message);
    if (message.direction !== "inbound") continue;
    const filterInput = buildFilterInput({ ...baseInput, messages: visible, previousRun, inboundMessage: message });
    const output = await processTurn({ message, filterInput });
    outputs.push(output);
    if (output?.record?.next_state) previousRun = { next_state: output.record.next_state };
  }
  return outputs;
}
