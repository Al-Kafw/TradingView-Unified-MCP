import { ToolError } from './errors.mjs';

// The shipped catalog uses this explicitly bounded JSON Schema subset.
// Unsupported schema keywords fail catalog validation rather than being ignored.
const SUPPORTED = new Set(['type','properties','required','additionalProperties','items','enum','const','minimum','maximum','minLength','maxLength','minItems','maxItems','minProperties','maxProperties','uniqueItems','multipleOf','pattern','description','default','title','anyOf','oneOf','allOf','format']);
export function validateSchemaDefinition(schema, path = '$') {
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object') throw new Error(`Invalid schema at ${path}`);
  for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) throw new Error(`Unsupported schema keyword ${key} at ${path}`);
  for (const [key, child] of Object.entries(schema.properties || {})) validateSchemaDefinition(child, `${path}.${key}`);
  if (schema.items) validateSchemaDefinition(schema.items, `${path}[]`);
  if (typeof schema.additionalProperties === 'object') validateSchemaDefinition(schema.additionalProperties, `${path}.*`);
  for (const keyword of ['anyOf','oneOf','allOf']) for (const child of schema[keyword] || []) validateSchemaDefinition(child, path);
}

export function validate(schema, value, path = 'arguments') {
  const fail = message => { throw new ToolError('INVALID_ARGUMENT', `${path}: ${message}`); };
  if (schema === true) return value;
  if (schema === false) fail('value is not allowed');
  if (schema.anyOf && !schema.anyOf.some(s => accepts(s, value))) fail('does not match an allowed shape');
  if (schema.oneOf && schema.oneOf.filter(s => accepts(s, value)).length !== 1) fail('must match exactly one allowed shape');
  if (schema.allOf) for (const s of schema.allOf) validate(s, value, path);
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) fail('does not match required constant');
  if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(value))) fail('not an allowed value');
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(t, value))) fail(`expected ${types.join(' or ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('string is too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail('string is too long');
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) fail('string format is invalid');
    if (schema.format === 'uri') { try { new URL(value); } catch { fail('expected an absolute URI'); } }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('number must be finite');
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
    if (schema.multipleOf !== undefined && Math.abs(value/schema.multipleOf-Math.round(value/schema.multipleOf))>1e-10) fail('not a permitted multiple');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('array is too short');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('array is too long');
    if (schema.uniqueItems && new Set(value.map(v=>JSON.stringify(v))).size!==value.length) fail('array entries must be unique');
    if (schema.items) value.forEach((v,i) => validate(schema.items, v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) fail('object has too few properties');
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) fail('object has too many properties');
    for (const key of Object.keys(value)) if (['__proto__','prototype','constructor'].includes(key)) fail('unsafe object key');
    for (const key of schema.required || []) if (!Object.hasOwn(value,key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {},key)) validate(schema.properties[key], item, `${path}.${key}`);
      else if (schema.additionalProperties === false) fail(`unknown property ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(schema.additionalProperties,item,`${path}.${key}`);
    }
  }
  return value;
}
function typeMatches(type,value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}
function accepts(schema,value) { try { validate(schema,value); return true; } catch { return false; } }

export const S = (description='', maxLength=5000) => ({type:'string',description,maxLength});
export const N = (minimum=0, maximum=100000) => ({type:'number',minimum,maximum});
export const B = (description='') => ({type:'boolean',description});
export const O = (properties={}, required=[]) => ({type:'object',properties,required,additionalProperties:false});
