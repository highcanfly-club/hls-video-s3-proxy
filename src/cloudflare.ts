// Implémenter l'interface pour Cloudflare KV
import type { KVNamespace } from "@cloudflare/workers-types";
import { DataStorage, VideoObject, KVMetadata, incomingHandler, S3ProxyClient, IRequest } from "./index.js";

export class CloudflareKV implements DataStorage {
    kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.kv = kv;
    }

    async list(cursor: string) {
        const _keys = await this.kv.list({ cursor: cursor });
        return { list_complete: _keys.list_complete, keys: _keys.keys as VideoObject[], cursor: cursor, cacheStatus: _keys.cacheStatus };
    }

    async delete(key: string) {
        return this.kv.delete(key);
    }

    async get(key: string) {
        return this.kv.get(key);
    }

    async getWithMetadata(key: string) {
        const _ret = await this.kv.getWithMetadata(key);
        return { value: _ret.value, metadata: _ret.metadata as KVMetadata };
    }

    async put(key: string, value: string, expirationTtl: number, etag: string) {
        const options = {
            metadata: {
                expiration: Math.floor(Date.now() / 1000 + expirationTtl),
                etag: etag
            },
            expirationTtl: expirationTtl,
        }
        return this.kv.put(key, value, options);
    }

}

/**
 * The environment object
 */
export interface Env {
    s3proxy_cache: KVNamespace;
}

/**
 * Cloudflare wrapper for generic handler
 * @param request - The request object as IRequest
 * @returns The response object as Response
 */
export async function cloudflareWrapper(request: IRequest, s3ProxyClient: S3ProxyClient): Promise<Response> {
    const iResponse = await incomingHandler(request, s3ProxyClient);
    return new Response(iResponse.body, {
        status: iResponse.status,
        headers: iResponse.headers,
    });
}

