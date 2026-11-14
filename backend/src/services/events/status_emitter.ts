import { EventEmitter } from "node:events";

// Global event emitter for pushing submission status transitions to live SSE clients
export const statusEmitter = new EventEmitter();

// Allow multiple clients / dashboard listeners without memory leak warnings
statusEmitter.setMaxListeners(500);
