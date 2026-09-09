import bytes from "../generated/bytes.js";
import { initializeCore } from "./index.js";
initializeCore(Buffer.from(bytes, "base64"));
export { parseFeed, applyLibrary } from "./index.js";
