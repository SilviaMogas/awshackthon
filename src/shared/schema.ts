/**
 * Minimal, dependency-free runtime schema validator.
 *
 * The original spec calls for Zod, but this sandbox cannot install external
 * packages. This module provides a small, well-typed subset of a Zod-like API
 * (object/string/number/boolean/enum/array/optional/nullable/union/literal)
 * that is sufficient for validating every request and response in the system.
 *
 * Every service and API route validates its inputs and outputs with these
 * schemas so that malformed or hostile payloads are rejected before use.
 */

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export abstract class Schema<T> {
  abstract _parse(value: unknown, path: string): Result<T>;

  /** Parse and throw a SchemaError on failure. */
  parse(value: unknown): T {
    const r = this._parse(value, "$");
    if (!r.ok) throw new SchemaError(r.errors);
    return r.value;
  }

  /** Parse without throwing. */
  safeParse(value: unknown): Result<T> {
    return this._parse(value, "$");
  }

  optional(): Schema<T | undefined> {
    return new OptionalSchema(this);
  }

  nullable(): Schema<T | null> {
    return new NullableSchema(this);
  }

  /** Phantom accessor to extract the inferred type. */
  get _type(): T {
    throw new Error("_type is a compile-time-only helper");
  }
}

export class SchemaError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join("; ")}`);
    this.name = "SchemaError";
    this.errors = errors;
  }
}

class StringSchema extends Schema<string> {
  private minLen = 0;
  private maxLen = Number.MAX_SAFE_INTEGER;
  _parse(value: unknown, path: string): Result<string> {
    if (typeof value !== "string")
      return { ok: false, errors: [`${path}: expected string`] };
    if (value.length < this.minLen)
      return { ok: false, errors: [`${path}: shorter than ${this.minLen}`] };
    if (value.length > this.maxLen)
      return { ok: false, errors: [`${path}: longer than ${this.maxLen}`] };
    return { ok: true, value };
  }
  min(n: number): this {
    this.minLen = n;
    return this;
  }
  max(n: number): this {
    this.maxLen = n;
    return this;
  }
}

class NumberSchema extends Schema<number> {
  _parse(value: unknown, path: string): Result<number> {
    if (typeof value !== "number" || Number.isNaN(value))
      return { ok: false, errors: [`${path}: expected number`] };
    return { ok: true, value };
  }
}

class BooleanSchema extends Schema<boolean> {
  _parse(value: unknown, path: string): Result<boolean> {
    if (typeof value !== "boolean")
      return { ok: false, errors: [`${path}: expected boolean`] };
    return { ok: true, value };
  }
}

class LiteralSchema<L extends string | number | boolean> extends Schema<L> {
  constructor(private readonly literal: L) {
    super();
  }
  _parse(value: unknown, path: string): Result<L> {
    if (value !== this.literal)
      return {
        ok: false,
        errors: [`${path}: expected literal ${JSON.stringify(this.literal)}`],
      };
    return { ok: true, value: value as L };
  }
}

class EnumSchema<T extends readonly string[]> extends Schema<T[number]> {
  constructor(private readonly values: T) {
    super();
  }
  _parse(value: unknown, path: string): Result<T[number]> {
    if (typeof value !== "string" || !this.values.includes(value))
      return {
        ok: false,
        errors: [`${path}: expected one of ${this.values.join("|")}`],
      };
    return { ok: true, value: value as T[number] };
  }
}

class ArraySchema<T> extends Schema<T[]> {
  constructor(private readonly element: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): Result<T[]> {
    if (!Array.isArray(value))
      return { ok: false, errors: [`${path}: expected array`] };
    const out: T[] = [];
    const errors: string[] = [];
    value.forEach((item, i) => {
      const r = this.element._parse(item, `${path}[${i}]`);
      if (r.ok) out.push(r.value);
      else errors.push(...r.errors);
    });
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
  }
}

class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): Result<T | undefined> {
    if (value === undefined) return { ok: true, value: undefined };
    return this.inner._parse(value, path);
  }
}

class NullableSchema<T> extends Schema<T | null> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): Result<T | null> {
    if (value === null) return { ok: true, value: null };
    return this.inner._parse(value, path);
  }
}

class UnionSchema<T> extends Schema<T> {
  constructor(private readonly options: Schema<unknown>[]) {
    super();
  }
  _parse(value: unknown, path: string): Result<T> {
    const errors: string[] = [];
    for (const opt of this.options) {
      const r = opt._parse(value, path);
      if (r.ok) return { ok: true, value: r.value as T };
      errors.push(...r.errors);
    }
    return { ok: false, errors: [`${path}: no union member matched`] };
  }
}

class RecordSchema<V> extends Schema<Record<string, V>> {
  constructor(private readonly valueSchema: Schema<V>) {
    super();
  }
  _parse(value: unknown, path: string): Result<Record<string, V>> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return { ok: false, errors: [`${path}: expected object`] };
    const out: Record<string, V> = {};
    const errors: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      const r = this.valueSchema._parse(v, `${path}.${k}`);
      if (r.ok) out[k] = r.value;
      else errors.push(...r.errors);
    }
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
  }
}

class AnySchema extends Schema<unknown> {
  _parse(value: unknown): Result<unknown> {
    return { ok: true, value };
  }
}

type Shape = Record<string, Schema<unknown>>;
type InferShape<S extends Shape> = { [K in keyof S]: S[K] extends Schema<infer T> ? T : never };

class ObjectSchema<S extends Shape> extends Schema<InferShape<S>> {
  constructor(private readonly shape: S) {
    super();
  }
  _parse(value: unknown, path: string): Result<InferShape<S>> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return { ok: false, errors: [`${path}: expected object`] };
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const key of Object.keys(this.shape)) {
      const r = this.shape[key]._parse(record[key], `${path}.${key}`);
      if (r.ok) {
        if (r.value !== undefined) out[key] = r.value;
      } else {
        errors.push(...r.errors);
      }
    }
    return errors.length
      ? { ok: false, errors }
      : { ok: true, value: out as InferShape<S> };
  }
}

/** Zod-like factory namespace. */
export const s = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  literal: <L extends string | number | boolean>(v: L): LiteralSchema<L> =>
    new LiteralSchema(v),
  enum: <T extends readonly string[]>(values: T): EnumSchema<T> =>
    new EnumSchema(values),
  array: <T>(el: Schema<T>): ArraySchema<T> => new ArraySchema(el),
  object: <S extends Shape>(shape: S): ObjectSchema<S> => new ObjectSchema(shape),
  union: <T>(options: Schema<unknown>[]): UnionSchema<T> =>
    new UnionSchema<T>(options),
  record: <V>(value: Schema<V>): RecordSchema<V> => new RecordSchema(value),
  any: (): AnySchema => new AnySchema(),
};

export type Infer<T> = T extends Schema<infer U> ? U : never;
