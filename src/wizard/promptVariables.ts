/**
 * @module wizard/promptVariables
 *
 * Step 1 of the wizard: prompt for each operation argument.
 * For *ListOptions inputs, run a structured take/skip/sort/filter sub-flow.
 * For other args, prompt by scalar/enum/JSON type.
 */

import { text, select, confirm, isCancel, cancel, multiselect } from "@clack/prompts";
import {
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  getNamedType,
  type GraphQLArgument,
  type GraphQLSchema,
  type GraphQLInputType,
} from "graphql";
import { isListOptionsInput } from "../schema-model/classify.js";
import { DEFAULT_PAGE_SIZE, DEFAULT_SKIP } from "../constants.js";

function bail(): never {
  cancel("Cancelled. No request sent.");
  process.exit(130);
}

function isRequired(t: GraphQLInputType): boolean {
  return t instanceof GraphQLNonNull;
}

async function promptScalar(name: string, typeName: string, required: boolean): Promise<unknown> {
  if (typeName === "Boolean") {
    const v = await confirm({ message: `${name} (Boolean${required ? "" : ", optional"}):` });
    if (isCancel(v)) bail();
    return v;
  }
  const v = await text({
    message: `${name} (${typeName}${required ? "" : ", optional — leave empty to skip"}):`,
  });
  if (isCancel(v)) bail();
  const raw = String(v ?? "");
  if (raw === "" && !required) return undefined;
  if (typeName === "Int" || typeName === "Float") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`Invalid number for ${name}: "${raw}"`);
    return n;
  }
  return raw;
}

async function promptEnum(
  name: string,
  t: GraphQLEnumType,
  required: boolean
): Promise<unknown> {
  const opts = t.getValues().map((v) => ({ value: v.name, label: v.name }));
  if (!required) opts.push({ value: "__skip__", label: "(skip)" });
  const v = await select({ message: `${name} (${t.name}):`, options: opts });
  if (isCancel(v)) bail();
  if (v === "__skip__") return undefined;
  return String(v);
}

async function promptJsonInput(
  name: string,
  typeName: string,
  required: boolean
): Promise<unknown> {
  while (true) {
    const v = await text({
      message: `${name} (${typeName} as JSON${required ? "" : ", empty to skip"}):`,
      placeholder: "{}",
    });
    if (isCancel(v)) bail();
    const raw = String(v ?? "");
    if (raw === "" && !required) return undefined;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Invalid JSON: ${(err as Error).message}. Try again.`);
    }
  }
}

/* --------------------------- ListOptions flow --------------------------- */

async function promptListOptions(
  optionsType: GraphQLInputObjectType
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  const takeRaw = await text({
    message: "How many items? (take)",
    placeholder: String(DEFAULT_PAGE_SIZE),
  });
  if (isCancel(takeRaw)) bail();
  out.take = Number(String(takeRaw ?? "") || DEFAULT_PAGE_SIZE);

  const skipRaw = await text({
    message: "Skip how many? (skip)",
    placeholder: String(DEFAULT_SKIP),
  });
  if (isCancel(skipRaw)) bail();
  out.skip = Number(String(skipRaw ?? "") || DEFAULT_SKIP);

  const fields = optionsType.getFields();

  const sortField = fields.sort;
  if (sortField) {
    const sortType = getNamedType(sortField.type);
    if (sortType instanceof GraphQLInputObjectType) {
      const fieldNames = Object.keys(sortType.getFields());
      const picked = await multiselect({
        message: "Sort by which fields? (none = no sort)",
        required: false,
        options: fieldNames.map((n) => ({ value: n, label: n })),
      });
      if (isCancel(picked)) bail();
      if (picked.length > 0) {
        const sortObj: Record<string, string> = {};
        for (const f of picked) {
          const dir = await select({
            message: `Direction for "${f}":`,
            options: [
              { value: "ASC", label: "ASC" },
              { value: "DESC", label: "DESC" },
            ],
          });
          if (isCancel(dir)) bail();
          sortObj[f] = String(dir);
        }
        out.sort = sortObj;
      }
    }
  }

  const filterField = fields.filter;
  if (filterField) {
    const addAny = await confirm({ message: "Add filter conditions?", initialValue: false });
    if (isCancel(addAny)) bail();
    if (addAny) {
      const filterType = getNamedType(filterField.type);
      if (filterType instanceof GraphQLInputObjectType) {
        const filterObj: Record<string, unknown> = {};
        let more = true;
        while (more) {
          const fieldName = await select({
            message: "Filter field:",
            options: Object.keys(filterType.getFields()).map((n) => ({ value: n, label: n })),
          });
          if (isCancel(fieldName)) bail();
          const opType = getNamedType(filterType.getFields()[String(fieldName)].type);
          if (!(opType instanceof GraphQLInputObjectType)) {
            throw new Error(
              `Filter field "${String(fieldName)}" has unsupported type ${opType.name}.`
            );
          }
          const opName = await select({
            message: "Operator:",
            options: Object.keys(opType.getFields()).map((n) => ({ value: n, label: n })),
          });
          if (isCancel(opName)) bail();
          const valRaw = await text({
            message: `Value for ${String(fieldName)} ${String(opName)}:`,
          });
          if (isCancel(valRaw)) bail();
          filterObj[String(fieldName)] = { [String(opName)]: String(valRaw ?? "") };

          const cont = await confirm({ message: "Add another filter?", initialValue: false });
          if (isCancel(cont)) bail();
          more = Boolean(cont);
        }
        out.filter = filterObj;
      }
    }
  }

  return out;
}

/* --------------------------- entry point --------------------------- */

export async function promptVariables(
  args: readonly GraphQLArgument[],
  _schema: GraphQLSchema
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const a of args) {
    const required = isRequired(a.type);
    const inner = getNamedType(a.type);

    if (isListOptionsInput(inner) && inner instanceof GraphQLInputObjectType) {
      out[a.name] = await promptListOptions(inner);
      continue;
    }

    if (inner instanceof GraphQLScalarType) {
      const v = await promptScalar(a.name, inner.name, required);
      if (v !== undefined) out[a.name] = v;
    } else if (inner instanceof GraphQLEnumType) {
      const v = await promptEnum(a.name, inner, required);
      if (v !== undefined) out[a.name] = v;
    } else {
      const v = await promptJsonInput(a.name, inner.name, required);
      if (v !== undefined) out[a.name] = v;
    }
  }
  return out;
}
