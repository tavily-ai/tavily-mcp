/**
 * Incremental Server-Sent Events frame splitting.
 *
 * Events are separated by a blank line: two consecutive line terminators.
 * A terminator is CRLF, LF or CR, so a stream ending its lines with CRLF
 * separates events with "\r\n\r\n" and a split on "\n\n" alone never
 * matches, merging every event into one undeliverable buffer. Each
 * terminator below keeps "\r\n" atomic so a single CRLF can never be
 * mistaken for two line endings.
 */
const SSE_FRAME_SEPARATOR =
  /\r\n\r\n|\r\n\n|\r\n\r|\n\r\n|\n\n|\n\r|\r\r\n|\r\r/;

/**
 * Split a stream buffer into complete frames, keeping the unterminated
 * remainder. The caller appends the next chunk to `rest` and repeats.
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const frames = buffer.split(SSE_FRAME_SEPARATOR);
  const rest = frames.pop() ?? '';
  return { frames, rest };
}
