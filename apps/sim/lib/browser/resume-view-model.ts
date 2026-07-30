export type JsonObject = Record<string, unknown>

export function asJsonObject(value: unknown): JsonObject | null {
  const object =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : null
  return object
}

export function pauseResponseData(responseValue: unknown): {
  raw: unknown
  object: JsonObject
} {
  const response = asJsonObject(responseValue)
  const raw = response?.data
  return {
    raw,
    object: asJsonObject(raw) ?? {},
  }
}

export function submittedResumeValues(resumeInputValue: unknown): JsonObject {
  const resumeInput = asJsonObject(resumeInputValue)
  return asJsonObject(resumeInput?.submission) ?? resumeInput ?? {}
}
