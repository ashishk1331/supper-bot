import type { Platform } from "@supper-bot/types"

export const sessionActiveKey = (platform: Platform, groupId: string) =>
  `session:active:${platform}:${groupId}`

export const sessionChatKey = (sessionId: string) => `session:chat:${sessionId}`

export const sessionLockKey = (sessionId: string) => `session:lock:${sessionId}`

export const ambientKey = (platform: Platform, groupId: string) => `ambient:${platform}:${groupId}`

export const rateLimitKey = (platform: Platform, userId: string) =>
  `ratelimit:${platform}:${userId}`

export const trackedMessageIndexKey = (platform: Platform, messageId: string) =>
  `tracked:${platform}:${messageId}`
