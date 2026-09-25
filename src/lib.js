import { select, text, isCancel, autocomplete } from "@clack/prompts"

export class Cancelled extends Error {}

export function checkCancel(value) {
  if (isCancel(value)) throw new Cancelled("Operation cancelled.")
  return value
}

export async function selectOrCustom(selectData, textData, parse) {
  const { searchable, ...options } = selectData
  const result = checkCancel(await (searchable ? autocomplete : select)(options))
  return result === "Custom" ? input(textData, parse) : parse(result)
}

export async function input(options, parse, prompt = text) {
  return parse(checkCancel(await prompt({ ...options, validate: validate(parse) })))
}

export async function selectValue(selectData) {
  return checkCancel(await select(selectData))
}

function validate(parser) {
  return (value) => {
    try {
      parser(value)
    } catch (error) {
      return error.message
    }
  }
}
