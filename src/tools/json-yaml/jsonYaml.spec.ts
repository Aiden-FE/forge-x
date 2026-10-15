import { describe, expect, it } from 'vitest'
import {
  ConversionSyntaxError,
  jsonToYaml,
  yamlToJson,
} from './jsonYaml'

function catchConversion(action: () => void): unknown {
  try {
    action()
    return null
  } catch (caught) {
    return caught
  }
}

function catchSyntaxError(action: () => void): ConversionSyntaxError | null {
  return catchConversion(action) as ConversionSyntaxError | null
}

describe('jsonToYaml', () => {
  it('双向转换嵌套 JSON 和 YAML', () => {
    const json = '{"service":{"name":"api","ports":[8080,8081]}}'
    const yaml = jsonToYaml(json)
    expect(yaml).toBe('service:\n  name: api\n  ports:\n    - 8080\n    - 8081\n')
    expect(yamlToJson(yaml)).toBe(JSON.stringify(JSON.parse(json), null, 2))
  })

  it('处理缩进、注释剥离、锚点别名和空值', () => {
    const yaml = [
      '# local service settings',
      'defaults: &defaults',
      '    timeout: 30',
      'service:',
      '    <<: *defaults',
      '    timeout: 60',
      '    empty:',
    ].join('\n')

    expect(yamlToJson(yaml)).toBe(
      JSON.stringify(
        {
          defaults: { timeout: 30 },
          service: { timeout: 60, empty: null },
        },
        null,
        2,
      ),
    )
  })

  it('保留多行块标量且不折叠长文本', () => {
    const yaml = 'text: |\n  first\n    indented\n'
    const roundTrip = jsonToYaml(yamlToJson(yaml))
    expect(roundTrip).toBe(yaml)

    const longText = 'a very long line that would otherwise be wrapped around the default width'
    expect(jsonToYaml(JSON.stringify({ description: longText }))).toBe(
      `description: ${longText}\n`,
    )
  })

  it('YAML 语法错误提供行列定位', () => {
    const error = catchConversion(() => yamlToJson('a: [1,'))

    expect(error).toBeInstanceOf(ConversionSyntaxError)
    expect(error).toMatchObject({
      source: 'yaml',
      line: 1,
      column: 7,
    })
  })
})

describe('yamlToJson', () => {
  it('双向转换数组和标量', () => {
    const yaml = 'enabled: true\ntags:\n  - dev\n  - local\n'
    expect(yamlToJson(yaml)).toBe('{\n  "enabled": true,\n  "tags": [\n    "dev",\n    "local"\n  ]\n}')
    expect(jsonToYaml(yamlToJson(yaml))).toBe(yaml)
  })

  it('JSON 语法错误提供行列定位', () => {
    const error = catchConversion(() => jsonToYaml('{\n  "a":1\n  "b":2\n}'))

    expect(error).toBeInstanceOf(ConversionSyntaxError)
    expect(error).toMatchObject({
      source: 'json',
      line: 3,
      column: 3,
    })
  })

  it('容错空输入和各类非法输入', () => {
    for (const invalid of ['', '   \n', '{not json}']) {
      expect(() => jsonToYaml(invalid)).toThrow(ConversionSyntaxError)
    }
    for (const invalid of ['', ' \n', 'a: *missing']) {
      expect(() => yamlToJson(invalid)).toThrow(ConversionSyntaxError)
    }

    const emptyJson = catchSyntaxError(() => jsonToYaml(''))
    expect(emptyJson).toMatchObject({ source: 'json' })
    expect(emptyJson?.line).toBeUndefined()
    expect(emptyJson?.column).toBeUndefined()
  })
})
