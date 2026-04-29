import type { Platform } from "@supper-bot/types"
import type { ChannelAdapter } from "./base"

const registry = new Map<Platform, ChannelAdapter>()

export function registerAdapter(adapter: ChannelAdapter): void {
  registry.set(adapter.platform, adapter)
}

export function unregisterAdapter(platform: Platform): void {
  registry.delete(platform)
}

export function getAdapter(platform: Platform): ChannelAdapter | undefined {
  return registry.get(platform)
}

export function listAdapters(): ChannelAdapter[] {
  return Array.from(registry.values())
}

export function clearAdapterRegistry(): void {
  registry.clear()
}
