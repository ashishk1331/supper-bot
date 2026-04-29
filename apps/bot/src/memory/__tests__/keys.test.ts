import { describe, expect, test } from "bun:test"
import {
  ambientKey,
  sessionActiveKey,
  sessionChatKey,
  sessionLockKey,
  trackedMessageIndexKey,
} from "@/memory/keys"

describe("keys", () => {
  test("matches the namespaces in ARCHITECTURE §6.3", () => {
    expect(sessionActiveKey("slack", "G1")).toBe("session:active:slack:G1")
    expect(sessionChatKey("swift-mango-lands")).toBe("session:chat:swift-mango-lands")
    expect(sessionLockKey("swift-mango-lands")).toBe("session:lock:swift-mango-lands")
    expect(ambientKey("discord", "G2")).toBe("ambient:discord:G2")
    expect(trackedMessageIndexKey("slack", "M1")).toBe("tracked:slack:M1")
  })
})
