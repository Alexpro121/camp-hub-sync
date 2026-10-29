type Diagnostic = { requestId: string; stage: string; code?: number; status?: string; reason?: string };
export function logScheduleDiagnostic(value: Diagnostic) {
  // Never log source text, generated content, credentials or provider messages.
  console.error(JSON.stringify({ event: 'schedule_generation_error', ...value, timestamp: new Date().toISOString() }));
}

export function monitorScheduleStream(body: ReadableStream<Uint8Array>, requestId: string, log = logScheduleDiagnostic) {
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  let stopped = false;
  const inspect = (event: string) => {
    const payload = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (!payload || payload === '[DONE]') return;
    try {
      const data = JSON.parse(payload);
      if (data.error) {
        terminal = true;
        log({ requestId, stage: 'stream', code: typeof data.error.code === 'number' ? data.error.code : undefined, status: typeof data.error.status === 'string' ? data.error.status.slice(0, 80) : undefined });
      } else if (data.promptFeedback?.blockReason) {
        terminal = true;
        log({ requestId, stage: 'refusal', reason: String(data.promptFeedback.blockReason).slice(0, 80) });
      }
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'STOP') stopped = true;
      else if (reason) { terminal = true; log({ requestId, stage: 'finish', reason: String(reason).slice(0, 80) }); }
    } catch { terminal = true; log({ requestId, stage: 'parse', reason: 'INVALID_STREAM_JSON' }); }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) { inspect(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n'); }
      controller.enqueue(chunk);
    },
    flush() {
      buffer += decoder.decode();
      if (buffer.trim()) inspect(buffer);
      if (!stopped && !terminal) log({ requestId, stage: 'stream', reason: 'INCOMPLETE_STREAM' });
    },
  }));
}