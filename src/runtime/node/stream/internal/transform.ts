// Based on https://github.com/nodejs/node/blob/2cd96871/lib/internal/streams/transform.js

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

const { Object.setPrototypeOf, Symbol } = primordials;

export default  Transform;
const { ERR_METHOD_NOT_IMPLEMENTED } = require("internal/errors").codes;
const Duplex = require("internal/streams/duplex");
const { getHighWaterMark } = require("internal/streams/state");
Object.setPrototypeOf(Transform.prototype, Duplex.prototype);
Object.setPrototypeOf(Transform, Duplex);

const kCallback = Symbol("kCallback");

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  // TODO (ronag): This should preferably always be
  // applied but would be semver-major. Or even better;
  // make Transform a Readable with the Writable interface.
  const readableHighWaterMark = options
    ? getHighWaterMark(this, options, "readableHighWaterMark", true)
    : null;
  if (readableHighWaterMark === 0) {
    // A Duplex will buffer both on the writable and readable side while
    // a Transform just wants to buffer hwm number of elements. To avoid
    // buffering twice we disable buffering on the writable side.
    options = {
      ...options,
      highWaterMark: null,
      readableHighWaterMark,
      writableHighWaterMark: options.writableHighWaterMark || 0,
    };
  }

  Duplex.call(this, options);

  // We have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this[kCallback] = null;

  if (options) {
    if (typeof options.transform === "function")
      this._transform = options.transform;

    if (typeof options.flush === "function") this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  // Backwards compat. Some Transform streams incorrectly implement _final
  // instead of or in addition to _flush. By using 'prefinish' instead of
  // implementing _final we continue supporting this unfortunate use case.
  this.on("prefinish", prefinish);
}

function final(cb) {
  if (typeof this._flush === "function" && !this.destroyed) {
    this._flush((er, data) => {
      if (er) {
        if (cb) {
          cb(er);
        } else {
          this.destroy(er);
        }
        return;
      }

      if (data != null) {
        this.push(data);
      }
      this.push(null);
      if (cb) {
        cb();
      }
    });
  } else {
    this.push(null);
    if (cb) {
      cb();
    }
  }
}

function prefinish() {
  if (this._final !== final) {
    final.call(this);
  }
}

Transform.prototype._final = final;

Transform.prototype._transform = function (chunk, encoding, callback) {
  throw new ERR_METHOD_NOT_IMPLEMENTED("_transform()");
};

Transform.prototype._write = function (chunk, encoding, callback) {
  const rState = this._readableState;
  const wState = this._writableState;
  const length = rState.length;

  this._transform(chunk, encoding, (err, val) => {
    if (err) {
      callback(err);
      return;
    }

    if (val != null) {
      this.push(val);
    }

    if (rState.ended) {
      // If user has called this.push(null) we have to
      // delay the callback to properly progate the new
      // state.
      process.nextTick(callback);
    } else if (
      wState.ended || // Backwards compat.
      length === rState.length || // Backwards compat.
      rState.length < rState.highWaterMark
    ) {
      callback();
    } else {
      this[kCallback] = callback;
    }
  });
};

Transform.prototype._read = function () {
  if (this[kCallback]) {
    const callback = this[kCallback];
    this[kCallback] = null;
    callback();
  }
};
