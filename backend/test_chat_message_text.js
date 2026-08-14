import assert from 'node:assert/strict';
import {
  describeCompletionChoice,
  extractChatMessageText,
  requireChatMessageText,
  stripJsonFences,
  withThinkingDisabled,
} from './src/services/chatMessageText.js';

assert.equal(
  extractChatMessageText({ choices: [{ message: { content: 'pong' } }] }),
  'pong'
);
assert.equal(
  extractChatMessageText({
    choices: [{ message: { content: '', reasoning_content: 'think…' }, finish_reason: 'length' }],
  }),
  ''
);
assert.equal(
  extractChatMessageText({
    choices: [{ message: { content: [{ type: 'text', text: 'hello' }] } }],
  }),
  'hello'
);

const empty = describeCompletionChoice({
  choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'abcd' } }],
});
assert.equal(empty.finishReason, 'length');
assert.equal(empty.reasoningChars, 4);

assert.throws(
  () => requireChatMessageText({ choices: [{ finish_reason: 'length', message: { content: '' } }] }),
  /empty content/
);

assert.deepEqual(withThinkingDisabled({ model: 'mimo-v2.5', messages: [] }).thinking, {
  type: 'disabled',
});
assert.equal(withThinkingDisabled({ model: 'gpt-4o-mini' }).thinking, undefined);
assert.deepEqual(
  withThinkingDisabled({ model: 'deepseek-v4-flash', thinking: { type: 'enabled' } }).thinking,
  { type: 'enabled' }
);

assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');

console.log('test_chat_message_text: OK');
