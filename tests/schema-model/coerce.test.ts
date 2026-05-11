import { describe, it, expect } from "vitest";
import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLScalarType,
} from "graphql";
import { coerceInputValue, coerceScalar } from "../../src/schema-model/coerce.js";

describe("coerceScalar", () => {
  it("parses Boolean strings", () => {
    expect(coerceScalar("true", "Boolean")).toBe(true);
    expect(coerceScalar("TRUE", "Boolean")).toBe(true);
    expect(coerceScalar("yes", "Boolean")).toBe(true);
    expect(coerceScalar("1", "Boolean")).toBe(true);
    expect(coerceScalar("false", "Boolean")).toBe(false);
    expect(coerceScalar("no", "Boolean")).toBe(false);
    expect(coerceScalar("0", "Boolean")).toBe(false);
  });

  it("throws on invalid Boolean", () => {
    expect(() => coerceScalar("maybe", "Boolean")).toThrow(/Invalid Boolean/);
  });

  it("parses Int", () => {
    expect(coerceScalar("42", "Int")).toBe(42);
    expect(coerceScalar("-7", "Int")).toBe(-7);
  });

  it("rejects non-integer Int", () => {
    expect(() => coerceScalar("3.14", "Int")).toThrow(/Invalid Int/);
    expect(() => coerceScalar("abc", "Int")).toThrow(/Invalid Int/);
  });

  it("parses Float", () => {
    expect(coerceScalar("3.14", "Float")).toBeCloseTo(3.14);
    expect(coerceScalar("-1.5", "Float")).toBeCloseTo(-1.5);
    expect(coerceScalar("0", "Float")).toBe(0);
  });

  it("rejects invalid Float", () => {
    expect(() => coerceScalar("nope", "Float")).toThrow(/Invalid Float/);
  });

  it("passes through string-like scalars unchanged", () => {
    expect(coerceScalar("hello", "String")).toBe("hello");
    expect(coerceScalar("urn:1", "ID")).toBe("urn:1");
    expect(coerceScalar("2024-01-02T00:00:00Z", "DateTime")).toBe(
      "2024-01-02T00:00:00Z"
    );
    expect(coerceScalar("anything", "Money")).toBe("anything");
  });
});

describe("coerceInputValue", () => {
  it("unwraps NonNull", () => {
    expect(coerceInputValue("true", new GraphQLNonNull(GraphQLBoolean))).toBe(true);
    expect(coerceInputValue("5", new GraphQLNonNull(GraphQLInt))).toBe(5);
  });

  it("coerces top-level scalars", () => {
    expect(coerceInputValue("true", GraphQLBoolean)).toBe(true);
    expect(coerceInputValue("3", GraphQLInt)).toBe(3);
    expect(coerceInputValue("2.5", GraphQLFloat)).toBeCloseTo(2.5);
    expect(coerceInputValue("hi", GraphQLString)).toBe("hi");
    expect(coerceInputValue("urn:1", GraphQLID)).toBe("urn:1");
  });

  it("splits CSV lists and coerces elements", () => {
    expect(coerceInputValue("1,2,3", new GraphQLList(GraphQLInt))).toEqual([1, 2, 3]);
    expect(coerceInputValue("true,false", new GraphQLList(GraphQLBoolean))).toEqual([
      true,
      false,
    ]);
    expect(coerceInputValue("a, b ,c", new GraphQLList(GraphQLString))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("accepts JSON array for lists", () => {
    expect(coerceInputValue("[1,2,3]", new GraphQLList(GraphQLInt))).toEqual([1, 2, 3]);
  });

  it("returns empty array for empty list input", () => {
    expect(coerceInputValue("", new GraphQLList(GraphQLString))).toEqual([]);
    expect(coerceInputValue("   ", new GraphQLList(GraphQLString))).toEqual([]);
  });

  it("rejects malformed JSON array", () => {
    expect(() => coerceInputValue("[1,2", new GraphQLList(GraphQLInt))).toThrow(
      /Invalid JSON array/
    );
  });

  it("rejects non-array JSON for list type", () => {
    expect(() => coerceInputValue("{}", new GraphQLList(GraphQLInt))).toThrow(
      /Invalid JSON array/
    );
  });

  it("parses input objects from JSON", () => {
    const range = new GraphQLInputObjectType({
      name: "NumberRange",
      fields: { start: { type: GraphQLFloat }, end: { type: GraphQLFloat } },
    });
    expect(coerceInputValue('{"start":1,"end":10}', range)).toEqual({
      start: 1,
      end: 10,
    });
  });

  it("returns undefined for empty input object input", () => {
    const range = new GraphQLInputObjectType({
      name: "NumberRange",
      fields: { start: { type: GraphQLFloat }, end: { type: GraphQLFloat } },
    });
    expect(coerceInputValue("", range)).toBeUndefined();
  });

  it("rejects invalid JSON for input objects", () => {
    const range = new GraphQLInputObjectType({
      name: "NumberRange",
      fields: { start: { type: GraphQLFloat } },
    });
    expect(() => coerceInputValue("{notjson}", range)).toThrow(/Invalid JSON for NumberRange/);
  });

  it("passes enum values through", () => {
    const sortOrder = new GraphQLEnumType({
      name: "SortOrder",
      values: { ASC: { value: "ASC" }, DESC: { value: "DESC" } },
    });
    expect(coerceInputValue("ASC", sortOrder)).toBe("ASC");
  });

  it("passes through custom scalars as strings", () => {
    const money = new GraphQLScalarType({ name: "Money" });
    expect(coerceInputValue("1999", money)).toBe("1999");
  });
});
