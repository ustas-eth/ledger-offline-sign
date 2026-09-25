import { select, text, isCancel, autocomplete } from "@clack/prompts"

export class Cancelled extends Error {}

export function checkCancel(value) {
  if (isCancel(value)) throw new Cancelled("Operation cancelled.")
  return value
}

export async function selectOrCustom(selectData, textData) {
  const { searchable, ...options } = selectData
  const result = checkCancel(await (searchable ? autocomplete : select)(options))
  return result === "Custom" ? textOrRevert(textData) : result
}

export async function textOrRevert(textData) {
  return checkCancel(await text(textData))
}

export async function selectOrRevert(selectData) {
  return checkCancel(await select(selectData))
}

export function validate(parser) {
  return (value) => {
    try {
      parser(value)
    } catch (error) {
      return error.message
    }
  }
}
