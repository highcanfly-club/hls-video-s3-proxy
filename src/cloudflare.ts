// Implémenter l'interface pour Cloudflare KV
import type { KVNamespace } from "@cloudflare/workers-types";
import { DataStorage, VideoObject, KVMetadata } from "./index";

export class CloudflareKV implements DataStorage {
    kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.kv = kv;
    }

    async list(cursor: string) {
        const _keys = await this.kv.list({ cursor: cursor });
        return { list_complete: _keys.list_complete, keys: _keys.keys as VideoObject[],  cursor: cursor, cacheStatus: _keys.cacheStatus };
    }

    async delete(key: string) {
        return this.kv.delete(key);
    }

    async get(key: string) { 
        return this.kv.get(key);
    }
    
    async getWithMetadata(key: string) {
        const _ret = await this.kv.getWithMetadata(key) ;
        return { value: _ret.value, metadata: _ret.metadata as KVMetadata };
    }

    async put(key: string, value: string, expirationTtl: number ) { 
        const options = {
            metadata: { expiration: Math.floor(Date.now() / 1000 + expirationTtl) },
            expirationTtl: expirationTtl,
        }
        return this.kv.put(key, value, options);
    }

}