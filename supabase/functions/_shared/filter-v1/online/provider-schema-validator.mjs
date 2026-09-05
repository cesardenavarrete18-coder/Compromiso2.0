const SUPPORTED = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "$ref", "$defs", "description", "title"]);

export function validateProviderStructuredOutputSchema(schema) {
  const errors = [];
  if (!schema || schema.type !== "object") errors.push("ROOT_TYPE_MUST_BE_OBJECT");
  if (schema?.anyOf || schema?.oneOf || schema?.allOf) errors.push("UNSUPPORTED_ROOT_COMPOSITION");
  const definitions = schema?.$defs ?? {};
  function walk(node, path = "$") {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const key of Object.keys(node)) if (!SUPPORTED.has(key)) errors.push(`UNSUPPORTED_KEYWORD:${path}.${key}`);
    if ((node.const !== undefined || node.enum) && node.type === undefined) errors.push(`TYPE_REQUIRED_FOR_CONST_OR_ENUM:${path}`);
    if (node.$ref) {
      const prefix = "#/$defs/";
      if (!node.$ref.startsWith(prefix) || !(node.$ref.slice(prefix.length) in definitions)) errors.push(`UNRESOLVABLE_REF:${path}:${node.$ref}`);
      return;
    }
    const objectLike = node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"));
    if (objectLike) {
      if (node.additionalProperties !== false) errors.push(`ADDITIONAL_PROPERTIES_MUST_BE_FALSE:${path}`);
      const keys = Object.keys(node.properties ?? {});
      const required = new Set(node.required ?? []);
      for (const key of keys) if (!required.has(key)) errors.push(`MISSING_REQUIRED_PROPERTY:${path}.${key}`);
      for (const key of required) if (!keys.includes(key)) errors.push(`REQUIRED_PROPERTY_NOT_DEFINED:${path}.${key}`);
      for (const [key, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.properties.${key}`);
    }
    if (node.items) walk(node.items, `${path}.items`);
    for (const [index, child] of (node.anyOf ?? []).entries()) walk(child, `${path}.anyOf[${index}]`);
    for (const [key, child] of Object.entries(node.$defs ?? {})) walk(child, `${path}.$defs.${key}`);
  }
  walk(schema);
  return Object.freeze({ compatible: errors.length === 0, errors: [...new Set(errors)] });
}
