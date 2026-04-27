import type { UnifiedEvent } from "./events"
import type { ActiveChatWindow, OrderSession } from "./session"
import type { GroupContext, UserContext } from "./memory"

export interface ToolDefinitionMeta {
  name: string
  description: string
}

export interface AgentInput {
  trigger: UnifiedEvent
  session: OrderSession
  chatWindow: ActiveChatWindow
  userContext: UserContext
  groupContext: GroupContext
  availableTools: ToolDefinitionMeta[]
}

export interface RichBlock {
  kind: string
  payload: Record<string, unknown>
}

export interface Button {
  id: string
  label: string
  style?: "primary" | "secondary" | "danger"
  value?: string
}

export interface AgentResponse {
  text: string
  blocks?: RichBlock[]
  buttons?: Button[]
}
