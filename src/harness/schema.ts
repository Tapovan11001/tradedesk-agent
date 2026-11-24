import type { JsonSchema } from "./types.ts";

/**
 * Validate a value against the JSON Schema subset in types.ts.
 * Returns a list of human-readable problems; empty means valid.
 *
 * Why not a library: tool inputs are small and flat, and this keeps the
 * harness dependency-free. The error messages go straight back to the model,
 * so they are written to be easy for it to act on.
 */
export function validate(value: unknown, schema: JsonSchema, path = "input"): string[] {
  const problems: string[] = [];

  if (schema.enum && !schema.enum.some((e) => e === value)) {
    problems.push(`${path} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
    return problems;
  }

  switch (schema.type) {
    case undefined:
      break;
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [`${path} must be an object`];
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) problems.push(`${path}.${key} is required`);
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (obj[key] !== undefined) problems.push(...validate(obj[key], sub, `${path}.${key}`));
      }
      if (schema.additionalProperties === false) {
        const known = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(obj)) {
          if (!known.has(key)) problems.push(`${path}.${key} is not an allowed field`);
        }
      }
      break;
    }
    case "array":
      if (!Array.isArray(value)) return [`${path} must be an array`];
      if (schema.items) value.forEach((v, i) => problems.push(...validate(v, schema.items!, `${path}[${i}]`)));
      break;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) return [`${path} must be an integer`];
      problems.push(...range(value, schema, path));
      break;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) return [`${path} must be a number`];
      problems.push(...range(value, schema, path));
      break;
    case "string":
    case "boolean":
      if (typeof value !== schema.type) return [`${path} must be a ${schema.type}`];
      break;
    case "null":
      if (value !== null) return [`${path} must be null`];
      break;
  }
  return problems;
}

function range(n: number, schema: JsonSchema, path: string): string[] {
  const out: string[] = [];
  if (schema.minimum !== undefined && n < schema.minimum) out.push(`${path} must be >= ${schema.minimum}`);
  if (schema.maximum !== undefined && n > schema.maximum) out.push(`${path} must be <= ${schema.maximum}`);
  return out;
}
