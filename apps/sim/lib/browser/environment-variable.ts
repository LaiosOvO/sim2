const ENVIRONMENT_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Returns whether a value is a portable environment-variable name. */
export function isValidEnvVarName(name: string): boolean {
  return ENVIRONMENT_VARIABLE_NAME.test(name)
}
