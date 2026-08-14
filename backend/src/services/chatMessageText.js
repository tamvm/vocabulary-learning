/**
 * OpenAI-compatible chat completion helpers.
 * Reasoning models (DeepSeek V4, MiMo) may return HTTP 200 with empty
 * message.content when thinking tokens exhaust max_tokens.
 */

export function extractChatMessageText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('');
    if (joined.trim()) return joined.trim();
  }
  return '';
}

export function describeCompletionChoice(response) {
  const choice = response?.choices?.[0] || {};
  const msg = choice.message || {};
  const reasoning =
    typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
  return {
    text: extractChatMessageText(response),
    finishReason: choice.finish_reason || '',
    reasoningChars: reasoning.length,
  };
}

export function requireChatMessageText(response) {
  const described = describeCompletionChoice(response);
  if (described.text) return described.text;
  const finish = described.finishReason || 'unknown';
  throw new Error(
    `AI returned empty content (finish_reason=${finish}, reasoning_chars=${described.reasoningChars})`
  );
}

export function withThinkingDisabled(data) {
  if (!data || data.thinking) return data;
  if (!/deepseek|mimo|hy3/i.test(String(data.model || ''))) return data;
  return { ...data, thinking: { type: 'disabled' } };
}

export function stripJsonFences(text) {
  return String(text || '')
    .replace(/```json\s*/g, '')
    .replace(/```\s*$/g, '')
    .trim();
}
