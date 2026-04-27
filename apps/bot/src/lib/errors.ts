export class AppError extends Error {
  readonly code: string
  override readonly cause?: unknown

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.cause = options?.cause
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("CONFIG_ERROR", message, options)
  }
}

export class ToolError extends AppError {
  readonly toolName: string

  constructor(toolName: string, message: string, options?: { cause?: unknown }) {
    super("TOOL_ERROR", message, options)
    this.toolName = toolName
  }
}

export class AdapterError extends AppError {
  readonly platform: string

  constructor(platform: string, message: string, options?: { cause?: unknown }) {
    super("ADAPTER_ERROR", message, options)
    this.platform = platform
  }
}

export class SessionStateError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("SESSION_STATE_ERROR", message, options)
  }
}

export class MemoryError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("MEMORY_ERROR", message, options)
  }
}
