import { CORE_SCHEMA, dump, load, mergeTag } from 'js-yaml'

const yamlSchema = CORE_SCHEMA.withTags(mergeTag)

export type ConversionSource = 'json' | 'yaml'

export class ConversionSyntaxError extends Error {
  readonly source: ConversionSource
  readonly line?: number
  readonly column?: number

  constructor(options: {
    source: ConversionSource
    message: string
    line?: number
    column?: number
  }) {
    super(options.message)
    this.name = 'ConversionSyntaxError'
    this.source = options.source
    this.line = options.line
    this.column = options.column
  }
}

function isEmptyInput(value: string): boolean {
  return value.trim().length === 0
}

function findJsonLocation(input: string, error: unknown): {
  line?: number
  column?: number
} {
  const message = error instanceof Error ? error.message : ''
  const location = message.match(/line\s+(\d+)\D+column\s+(\d+)|position\s+(\d+)/i)
  if (!location) {
    return {}
  }

  if (location[1] !== undefined && location[2] !== undefined) {
    return { line: Number(location[1]), column: Number(location[2]) }
  }

  const offset = Number(location[3])
  let line = 1
  let column = 1
  for (let index = 0; index < offset && index < input.length; index += 1) {
    if (input[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }

  return { line, column }
}

function findYamlLocation(error: unknown): {
  line?: number
  column?: number
} {
  const mark = (error as { mark?: { line?: unknown; column?: unknown } }).mark
  if (
    typeof mark?.line === 'number' &&
    typeof mark.column === 'number'
  ) {
    return { line: mark.line + 1, column: mark.column + 1 }
  }

  return {}
}

export function jsonToYaml(input: string): string {
  if (isEmptyInput(input)) {
    throw new ConversionSyntaxError({
      source: 'json',
      message: 'empty input',
    })
  }

  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (error) {
    const location = findJsonLocation(input, error)
    throw new ConversionSyntaxError({
      source: 'json',
      message: error instanceof Error ? error.message : 'Invalid JSON',
      ...location,
    })
  }

  return dump(value, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  })
}

export function yamlToJson(input: string): string {
  if (isEmptyInput(input)) {
    throw new ConversionSyntaxError({
      source: 'yaml',
      message: 'empty input',
    })
  }

  let value: unknown
  try {
    value = load(input, { schema: yamlSchema })
  } catch (error) {
    const location = findYamlLocation(error)
    throw new ConversionSyntaxError({
      source: 'yaml',
      message: error instanceof Error ? error.message : 'Invalid YAML',
      ...location,
    })
  }

  return JSON.stringify(value, null, 2)
}
