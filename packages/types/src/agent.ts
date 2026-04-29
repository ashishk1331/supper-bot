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
