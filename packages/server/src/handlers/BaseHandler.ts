import EventEmitter from 'node:events'

import type {ServerOptions} from '../types'
import type {DataStore, Upload} from '../models'
import type http from 'node:http'

const reExtractFileID = /([^/]+)\/?$/
const reForwardedHost = /host="?([^";]+)/
const reForwardedProto = /proto=(https?)/
const own = Object.prototype.hasOwnProperty

export class BaseHandler extends EventEmitter {
  options: ServerOptions
  store: DataStore

  constructor(store: DataStore, options: ServerOptions) {
    super()
    if (!store) {
      throw new Error('Store must be defined')
    }

    this.store = store
    this.options = options
  }

  write(res: http.ServerResponse, status: number, headers = {}, body = '') {
    headers = status === 204 ? headers : {...headers, 'Content-Length': body.length}
    res.writeHead(status, headers)
    res.write(body)
    return res.end()
  }

  generateUrl(req: http.IncomingMessage, id: string) {
    const forwarded = req.headers.forwarded as string | undefined
    const path = this.options.path === '/' ? '' : this.options.path
    // @ts-expect-error baseUrl type doesn't exist?
    const baseUrl = req.baseUrl ?? ''
    let proto
    let host

    if (this.options.relativeLocation) {
      return `${baseUrl}${path}/${id}`
    }

    if (this.options.respectForwardedHeaders) {
      if (forwarded) {
        host ??= reForwardedHost.exec(forwarded)?.[1]
        proto ??= reForwardedProto.exec(forwarded)?.[1]
      }

      const forwardHost = req.headers['x-forwarded-host']
      const forwardProto = req.headers['x-forwarded-proto']

      // @ts-expect-error we can pass undefined
      if (['http', 'https'].includes(forwardProto)) {
        proto ??= forwardProto as string
      }

      host ??= forwardHost
    }

    host ??= req.headers.host
    proto ??= 'http'

    return `${proto}://${host}${baseUrl}${path}/${id}`
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    const match = reExtractFileID.exec(req.url as string)

    if (!match || this.options.path.includes(match[1])) {
      return false
    }

    return match[1]
  }

  parseMetadataString(str?: string) {
    const pairs: Record<string, string> = {}

    if (!str) {
      return pairs
    }

    for (const pair of str.split(',')) {
      const parts = pair.trim().split(' ')

      if (parts.length > 2) {
        continue
      }

      const [key, value] = parts
      if (key?.length > 0 && value?.length > 0) {
        pairs[key] = Buffer.from(value, 'base64').toString('ascii')
      }
    }

    return pairs
  }

  serializeMetadataString(metadata: Upload['metadata']) {
    let header = ''

    if (!metadata) {
      return header
    }

    for (const key in metadata) {
      if (own.call(metadata, key)) {
        header += `${key} ${Buffer.from(metadata[key]).toString('base64')},`
      }
    }

    // Remove trailing comma
    return header.slice(0, -1)
  }
}
