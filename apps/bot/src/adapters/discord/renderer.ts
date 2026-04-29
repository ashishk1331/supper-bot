import type { AgentResponse, Button, RichBlock } from "@supper-bot/types"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js"

function styleFor(b: Button): ButtonStyle {
  if (b.style === "primary") return ButtonStyle.Primary
  if (b.style === "danger") return ButtonStyle.Danger
  return ButtonStyle.Secondary
}

function richBlockToEmbed(block: RichBlock): EmbedBuilder | null {
  if (block.kind === "section") {
    const text = typeof block.payload.text === "string" ? block.payload.text : ""
    return new EmbedBuilder().setDescription(text)
  }
  return null
}

export function renderDiscord(response: AgentResponse): MessageCreateOptions {
  const embeds: EmbedBuilder[] = []
  for (const rb of response.blocks ?? []) {
    const e = richBlockToEmbed(rb)
    if (e) embeds.push(e)
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = []
  if (response.buttons && response.buttons.length > 0) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      response.buttons.map((b) =>
        new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(styleFor(b)),
      ),
    )
    components.push(row)
  }

  return {
    content: response.text || undefined,
    ...(embeds.length > 0 ? { embeds } : {}),
    ...(components.length > 0 ? { components } : {}),
  }
}
