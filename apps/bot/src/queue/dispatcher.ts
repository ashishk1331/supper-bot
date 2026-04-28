import { getLogger } from "@/lib/logger"
import { enqueueEvent } from "@/queue/producer"
import type { UnifiedEvent } from "@supper-bot/types"

/**
 * Single entry-point used by every adapter once an event has been parsed.
 * For now it just forwards to the (still-stub) BullMQ producer; Layer 3 will
 * give `enqueueEvent` real teeth and wire up workers.
 */
export async function dispatch(event: UnifiedEvent): Promise<void> {
  const log = getLogger()
  log.debug(
    {
      platform: event.platform,
      type: event.type,
      groupId: event.groupId,
      userId: event.userId,
      ...(event.type === "message" ? { trigger: event.trigger } : { emoji: event.emoji }),
    },
    "event dispatched",
  )
  await enqueueEvent(event)
}
