// Based on https://github.com/nodejs/node/blob/2cd96871/lib/internal/streams/utils.js

// Copyright Node.js contributors. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

const kIsDestroyed = Symbol.for("nodejs.stream.destroyed");
const kIsErrored = Symbol.for("nodejs.stream.errored");
const kIsReadable = Symbol.for("nodejs.stream.readable");
const kIsWritable = Symbol.for("nodejs.stream.writable");
const kIsDisturbed = Symbol.for("nodejs.stream.disturbed");

const kOnConstructed = Symbol.for("nodejs.stream.kOnConstructed");

const kIsClosedPromise = Symbol.for("nodejs.webstream.isClosedPromise");
const kControllerErrorFunction = Symbol.for(
  "nodejs.webstream.controllerErrorFunction",
);

const kState = Symbol("kState");
const kObjectMode = 1 << 0;
const kErrorEmitted = 1 << 1;
const kAutoDestroy = 1 << 2;
const kEmitClose = 1 << 3;
const kDestroyed = 1 << 4;
const kClosed = 1 << 5;
const kCloseEmitted = 1 << 6;
const kErrored = 1 << 7;
const kConstructed = 1 << 8;

function isReadableNodeStream(obj: any, strict = false) {
  return !!(
    (
      obj &&
      typeof obj.pipe === "function" &&
      typeof obj.on === "function" &&
      (!strict ||
        (typeof obj.pause === "function" &&
          typeof obj.resume === "function")) &&
      (!obj._writableState || obj._readableState?.readable !== false) && // Duplex
      (!obj._writableState || obj._readableState)
    ) // Writable has .pipe.
  );
}

function isWritableNodeStream(obj: any) {
  return !!(
    (
      obj &&
      typeof obj.write === "function" &&
      typeof obj.on === "function" &&
      (!obj._readableState || obj._writableState?.writable !== false)
    ) // Duplex
  );
}

function isDuplexNodeStream(obj: any) {
  return !!(
    obj &&
    typeof obj.pipe === "function" &&
    obj._readableState &&
    typeof obj.on === "function" &&
    typeof obj.write === "function"
  );
}

function isNodeStream(obj: any) {
  return (
    obj &&
    (obj._readableState ||
      obj._writableState ||
      (typeof obj.write === "function" && typeof obj.on === "function") ||
      (typeof obj.pipe === "function" && typeof obj.on === "function"))
  );
}

function isReadableStream(obj: any) {
  return !!(
    obj &&
    !isNodeStream(obj) &&
    typeof obj.pipeThrough === "function" &&
    typeof obj.getReader === "function" &&
    typeof obj.cancel === "function"
  );
}

function isWritableStream(obj: any) {
  return !!(
    obj &&
    !isNodeStream(obj) &&
    typeof obj.getWriter === "function" &&
    typeof obj.abort === "function"
  );
}

function isTransformStream(obj: any) {
  return !!(
    obj &&
    !isNodeStream(obj) &&
    typeof obj.readable === "object" &&
    typeof obj.writable === "object"
  );
}

function isWebStream(obj: any) {
  return (
    isReadableStream(obj) || isWritableStream(obj) || isTransformStream(obj)
  );
}

function isIterable(obj: any, isAsync: boolean) {
  if (obj == null) return false;
  if (isAsync === true) return typeof obj[Symbol.asyncIterator] === "function";
  if (isAsync === false) return typeof obj[Symbol.iterator] === "function";
  return (
    typeof obj[Symbol.asyncIterator] === "function" ||
    typeof obj[Symbol.iterator] === "function"
  );
}

function isDestroyed(stream: any) {
  if (!isNodeStream(stream)) return null;
  const wState = stream._writableState;
  const rState = stream._readableState;
  const state = wState || rState;
  return !!(stream.destroyed || stream[kIsDestroyed] || state?.destroyed);
}

// Have been end():d.
function isWritableEnded(stream: any) {
  if (!isWritableNodeStream(stream)) return null;
  if (stream.writableEnded === true) return true;
  const wState = stream._writableState;
  if (wState?.errored) return false;
  if (typeof wState?.ended !== "boolean") return null;
  return wState.ended;
}

// Have emitted 'finish'.
function isWritableFinished(stream: any, strict: boolean) {
  if (!isWritableNodeStream(stream)) return null;
  if (stream.writableFinished === true) return true;
  const wState = stream._writableState;
  if (wState?.errored) return false;
  if (typeof wState?.finished !== "boolean") return null;
  return !!(
    wState.finished ||
    (strict === false && wState.ended === true && wState.length === 0)
  );
}

// Have been push(null):d.
function isReadableEnded(stream: any) {
  if (!isReadableNodeStream(stream)) return null;
  if (stream.readableEnded === true) return true;
  const rState = stream._readableState;
  if (!rState || rState.errored) return false;
  if (typeof rState?.ended !== "boolean") return null;
  return rState.ended;
}

// Have emitted 'end'.
function isReadableFinished(stream: any, strict?: boolean) {
  if (!isReadableNodeStream(stream)) return null;
  const rState = stream._readableState;
  if (rState?.errored) return false;
  if (typeof rState?.endEmitted !== "boolean") return null;
  return !!(
    rState.endEmitted ||
    (strict === false && rState.ended === true && rState.length === 0)
  );
}

function isReadable(stream: any) {
  if (stream && stream[kIsReadable] != null) return stream[kIsReadable];
  if (typeof stream?.readable !== "boolean") return null;
  if (isDestroyed(stream)) return false;
  return (
    isReadableNodeStream(stream) &&
    stream.readable &&
    !isReadableFinished(stream)
  );
}

function isWritable(stream: any) {
  if (stream && stream[kIsWritable] != null) return stream[kIsWritable];
  if (typeof stream?.writable !== "boolean") return null;
  if (isDestroyed(stream)) return false;
  return (
    isWritableNodeStream(stream) && stream.writable && !isWritableEnded(stream)
  );
}

function isFinished(stream: any, opts: any) {
  if (!isNodeStream(stream)) {
    return null;
  }

  if (isDestroyed(stream)) {
    return true;
  }

  if (opts?.readable !== false && isReadable(stream)) {
    return false;
  }

  if (opts?.writable !== false && isWritable(stream)) {
    return false;
  }

  return true;
}

function isWritableErrored(stream: any) {
  if (!isNodeStream(stream)) {
    return null;
  }

  if (stream.writableErrored) {
    return stream.writableErrored;
  }

  return stream._writableState?.errored ?? null;
}

function isReadableErrored(stream: any) {
  if (!isNodeStream(stream)) {
    return null;
  }

  if (stream.readableErrored) {
    return stream.readableErrored;
  }

  return stream._readableState?.errored ?? null;
}

function isClosed(stream: any) {
  if (!isNodeStream(stream)) {
    return null;
  }

  if (typeof stream.closed === "boolean") {
    return stream.closed;
  }

  const wState = stream._writableState;
  const rState = stream._readableState;

  if (
    typeof wState?.closed === "boolean" ||
    typeof rState?.closed === "boolean"
  ) {
    return wState?.closed || rState?.closed;
  }

  if (typeof stream._closed === "boolean" && isOutgoingMessage(stream)) {
    return stream._closed;
  }

  return null;
}

function isOutgoingMessage(stream: any) {
  return (
    typeof stream._closed === "boolean" &&
    typeof stream._defaultKeepAlive === "boolean" &&
    typeof stream._removedConnection === "boolean" &&
    typeof stream._removedContLen === "boolean"
  );
}

function isServerResponse(stream: any) {
  return typeof stream._sent100 === "boolean" && isOutgoingMessage(stream);
}

function isServerRequest(stream: any) {
  return (
    typeof stream._consuming === "boolean" &&
    typeof stream._dumped === "boolean" &&
    stream.req?.upgradeOrConnect === undefined
  );
}

function willEmitClose(stream: any) {
  if (!isNodeStream(stream)) return null;

  const wState = stream._writableState;
  const rState = stream._readableState;
  const state = wState || rState;

  return (
    (!state && isServerResponse(stream)) ||
    !!(state && state.autoDestroy && state.emitClose && state.closed === false)
  );
}

function isDisturbed(stream: any) {
  return !!(
    stream &&
    (stream[kIsDisturbed] ?? (stream.readableDidRead || stream.readableAborted))
  );
}

function isErrored(stream: any) {
  return !!(
    stream &&
    (stream[kIsErrored] ??
      stream.readableErrored ??
      stream.writableErrored ??
      stream._readableState?.errorEmitted ??
      stream._writableState?.errorEmitted ??
      stream._readableState?.errored ??
      stream._writableState?.errored)
  );
}

export {
  kOnConstructed,
  isDestroyed,
  kIsDestroyed,
  isDisturbed,
  kIsDisturbed,
  isErrored,
  kIsErrored,
  isReadable,
  kIsReadable,
  kIsClosedPromise,
  kControllerErrorFunction,
  kIsWritable,
  isClosed,
  isDuplexNodeStream,
  isFinished,
  isIterable,
  isReadableNodeStream,
  isReadableStream,
  isReadableEnded,
  isReadableFinished,
  isReadableErrored,
  isNodeStream,
  isWebStream,
  isWritable,
  isWritableNodeStream,
  isWritableStream,
  isWritableEnded,
  isWritableFinished,
  isWritableErrored,
  isServerRequest,
  isServerResponse,
  willEmitClose,
  isTransformStream,
  kState,
  // bitfields
  kObjectMode,
  kErrorEmitted,
  kAutoDestroy,
  kEmitClose,
  kDestroyed,
  kClosed,
  kCloseEmitted,
  kErrored,
  kConstructed,
};
