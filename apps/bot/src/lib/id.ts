import { humanId } from "human-id"
import { v4 as uuidv4 } from "uuid"

export function newHumanId(): string {
  return humanId({ separator: "-", capitalize: false })
}

export function newUuid(): string {
  return uuidv4()
}

export const ORDER_REF_PATTERN = /#([a-z]+-[a-z]+-[a-z]+)/g

export function extractOrderRefs(text: string): string[] {
  const refs = new Set<string>()
  for (const match of text.matchAll(ORDER_REF_PATTERN)) {
    if (match[1]) refs.add(match[1])
  }
  return Array.from(refs)
}
