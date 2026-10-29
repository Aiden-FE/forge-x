/**
 * Thin worker shell for large (file-import) conversions.
 *
 * All conversion logic lives in ./csvJson.ts (unit-tested); this file only
 * routes messages and forwards progress. papaparse is loaded inside the
 * worker on first use via csvJson's dynamic import, so it never reaches the
 * entry bundle.
 */
import { csvToJsonStreaming, jsonToCsv } from './csvJson'
import type { CsvToJsonOptions, CsvToJsonOutcome, JsonToCsvOptions, JsonToCsvOutcome } from './csvJson'

export interface WorkerRequest {
  id: number
  kind: 'csv-to-json' | 'json-to-csv'
  text: string
  options: CsvToJsonOptions & JsonToCsvOptions
}

export type WorkerOutcome = CsvToJsonOutcome | JsonToCsvOutcome

export type WorkerResponse =
  | { id: number; type: 'progress'; bytes: number; total: number }
  | { id: number; type: 'done'; outcome: WorkerOutcome }

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.kind === 'csv-to-json') {
    void csvToJsonStreaming(request.text, request.options, (bytes, total) => {
      ctx.postMessage({ id: request.id, type: 'progress', bytes, total })
    }).then((outcome) => {
      ctx.postMessage({ id: request.id, type: 'done', outcome })
    })
    return
  }
  void jsonToCsv(request.text, request.options).then((outcome) => {
    ctx.postMessage({ id: request.id, type: 'done', outcome })
  })
}
