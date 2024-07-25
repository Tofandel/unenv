// https://nodejs.org/api/nodeStream.html
import nodeStream from "node:stream";
import mock from "../../mock/proxy";
import * as utils from "./internal/utils";
import { Readable } from "./internal/readable";
import { Writable } from "./internal/writable";
import { Duplex } from "./internal/duplex";
import { Transform } from "./internal/transform";
import promises from "./promises/index";

export * from "./internal/utils";

export { Readable } from "./internal/readable";
export { Writable } from "./internal/writable";
export { Duplex } from "./internal/duplex";
export { Transform } from "./internal/transform";

export const Stream: nodeStream.Stream = mock.__createMock__("Stream");

export const PassThrough: nodeStream.PassThrough =
  mock.__createMock__("PassThrough");

export default {
  Readable: Readable as unknown as typeof nodeStream.Readable,
  Writable: Writable as unknown as typeof nodeStream.Writable,
  Duplex: Duplex as unknown as typeof nodeStream.Duplex,
  Transform: Transform as unknown as typeof nodeStream.Transform,
  Stream: Stream as unknown as typeof nodeStream.Stream,
  PassThrough: PassThrough as unknown as typeof nodeStream.PassThrough,
  promises,
  ...utils,
} satisfies typeof nodeStream;
