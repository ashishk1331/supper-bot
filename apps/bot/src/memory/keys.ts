import type { Platform } from "@supper-bot/types"

export const sessionActiveKey = (platform: Platform, groupId: string) =>
  `session:active:${platform}:${groupId}`

export const sessionChatKey = (sessionId: string) => `session:chat:${sessionId}`

export const sessionLockKey = (sessionId: string) => `session:lock:${sessionId}`

/** Lock used for session creation when no sessionId exists yet. Group-scoped. */
export const sessionCreateLockKey = (platform: Platform, groupId: string) =>
  `session:create-lock:${platform}:${groupId}`

/** Lock used for chat-window read-modify-write. Session-scoped. */
export const sessionChatLockKey = (sessionId: string) => `session:chat-lock:${sessionId}`

export const ambientKey = (platform: Platform, groupId: string) => `ambient:${platform}:${groupId}`

export const trackedMessageIndexKey = (platform: Platform, messageId: string) =>
  `tracked:${platform}:${messageId}`
