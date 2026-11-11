/**
 * The network half of the premium AI features: one call to Claude, one to
 * ElevenLabs. Everything about what is asked and what is accepted back lives
 * in `ai-advisor.ts`; this file only moves bytes and turns provider failures
 * into messages a customer can read.
 *
 * Every function here throws on failure. Callers run inside `runMetered`,
 * which turns a throw into a points refund.
 */
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL, TTS_MODEL } from './ai-advisor';

interface ClaudeJsonRequest {
  system: string;
  user: string;
  /** Base64 JPEG payload, already validated by `planImageBase64`. */
  imageBase64?: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Defaults to low: most of these are short writing tasks. Planning a
   *  home is not, and asks for medium. */
  effort?: 'low' | 'medium';
  /** One attempt, this long. Defaults to 50 seconds. */
  timeoutMs?: number;
}

/**
 * One structured-output request. Returns the parsed JSON object; the caller
 * validates its contents.
 *
 * No refusal fallback is configured on purpose. A fallback re-runs the request
 * on another model at that model's rates, which would make the worst-case cost
 * of a call depend on which model answered -- and the points price is computed
 * from one model's rates (G1). A declined request is simply refunded.
 */
export async function claudeJson(apiKey: string, request: ClaudeJsonRequest): Promise<unknown> {
  // No automatic retries: the SDK retries timeouts too, which would double the
  // wall-clock ceiling. The app waits 90s for these routes; one 50s attempt
  // (plus up to 30s of narration for a tour) fails early enough that the
  // refund reaches the customer before the app gives up on the request.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: request.timeoutMs ?? 50_000 });
  const content: Anthropic.ContentBlockParam[] = [];
  if (request.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: request.imageBase64 } });
  }
  content.push({ type: 'text', text: request.user });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: request.maxTokens,
      system: request.system,
      // Thinking is always on for this model and is controlled by effort,
      // which also decides how much of max_tokens the thinking may use.
      output_config: { effort: request.effort ?? 'low', format: { type: 'json_schema', schema: request.schema } },
      messages: [{ role: 'user', content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('The AI designer is busy right now. Your points were returned; please try again in a minute.', { cause: error });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('Claude credentials were rejected', error.status);
      throw new Error('The AI designer is not available right now. Your points were returned.', { cause: error });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Claude request failed', error.status, error.message);
      throw new Error('The AI designer could not answer. Your points were returned; please try again.', { cause: error });
    }
    throw new Error('The AI designer could not be reached. Your points were returned; please try again.', { cause: error });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The AI designer could not review this plan. Your points were returned.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The AI designer ran out of room for its answer. Your points were returned; please try again.');
  }
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) throw new Error('The AI designer returned an empty answer. Your points were returned.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('The AI designer returned an unreadable answer. Your points were returned.');
  }
}

/** Largest narration file accepted back. A 900-character tour at 64 kbps is
 *  well under a megabyte; anything bigger is not what was asked for. */
const MAX_AUDIO_BYTES = 2_000_000;

/** Text to speech. Returns MP3 bytes. */
export async function elevenLabsSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
  languageCode: string,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: TTS_MODEL, language_code: languageCode }),
      },
    );
  } catch {
    throw new Error('The voice service could not be reached. Your points were returned; please try again.');
  }
  if (!response.ok) {
    console.error('ElevenLabs request failed', response.status);
    throw new Error('The voice service could not record the tour. Your points were returned; please try again.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > MAX_AUDIO_BYTES) {
    throw new Error('The voice service returned an unusable recording. Your points were returned.');
  }
  return bytes;
}

/** Base64 without building one enormous argument list for fromCharCode. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
