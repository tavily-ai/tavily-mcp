import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSseFrames } from '../build/sse-frames.js';

test('splits events separated by LF blank lines', () => {
    const { frames, rest } = splitSseFrames('data: one\n\ndata: two\n\npartial');
    assert.deepEqual(frames, ['data: one', 'data: two']);
    assert.equal(rest, 'partial');
});

test('splits events separated by CRLF blank lines', () => {
    const { frames, rest } = splitSseFrames('data: one\r\n\r\ndata: two\r\n\r\nrest');
    assert.deepEqual(frames, ['data: one', 'data: two']);
    assert.equal(rest, 'rest');
});

test('splits events separated by CR blank lines', () => {
    const { frames, rest } = splitSseFrames('data: one\r\rdata: two\r\rrest');
    assert.deepEqual(frames, ['data: one', 'data: two']);
    assert.equal(rest, 'rest');
});

test('splits events separated by mixed line-ending blank lines', () => {
    const { frames, rest } = splitSseFrames('data: one\r\n\ndata: two\n\r\nrest');
    assert.deepEqual(frames, ['data: one', 'data: two']);
    assert.equal(rest, 'rest');
});

test('a lone CRLF inside a frame is not a separator', () => {
    const { frames, rest } = splitSseFrames('data: one\r\ndata: two\r\n');
    assert.deepEqual(frames, []);
    assert.equal(rest, 'data: one\r\ndata: two\r\n');
});

test('keeps an unterminated trailing frame in the buffer', () => {
    const { frames, rest } = splitSseFrames('event: done\n\n');
    assert.deepEqual(frames, ['event: done']);
    assert.equal(rest, '');
});
