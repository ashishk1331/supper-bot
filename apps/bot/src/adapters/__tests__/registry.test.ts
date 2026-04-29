import { afterEach, describe, expect, test } from "bun:test"
import type { ChannelAdapter } from "@/adapters/base"
import {
  clearAdapterRegistry,
  getAdapter,
  listAdapters,
  registerAdapter,
  unregisterAdapter,
} from "@/adapters/registry"

function fakeAdapter(platform: ChannelAdapter["platform"]): ChannelAdapter {
  return {
    platform,
    parseIncoming: async () => null,
    sendMessage: async () => ({ messageId: "M-test" }),
    start: async () => undefined,
    stop: async () => undefined,
  }
}

describe("adapter registry", () => {
  afterEach(() => clearAdapterRegistry())

  test("register / get / unregister", () => {
    const slack = fakeAdapter("slack")
    registerAdapter(slack)
    expect(getAdapter("slack")).toBe(slack)
    expect(listAdapters()).toEqual([slack])
    unregisterAdapter("slack")
    expect(getAdapter("slack")).toBeUndefined()
  })

  test("supports multiple platforms simultaneously", () => {
    const a = fakeAdapter("slack")
    const b = fakeAdapter("discord")
    registerAdapter(a)
    registerAdapter(b)
    expect(listAdapters()).toHaveLength(2)
    expect(getAdapter("discord")).toBe(b)
  })
})
