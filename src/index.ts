/*
 * Copyright (c) 2024 Ronan LE MEILLAT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import _s3Config from "./s3-config.json";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { KVNamespace } from "@cloudflare/workers-types";
import CryptoJS from "crypto-js";

type KVMetadata = {
	expiration: number;
};

// The video object
export type VideoObject = {
	name: string;
	expiration: number;
	metadata: KVMetadata;
};

// The S3 configuration
export type S3Config = {
	region: string;
	credentials: {
		accessKeyId: string;
		secretAccessKey: string;
	};
	endpoint: string;
	expiration: string;
	videoBucket: string;
};

// The S3 proxy client
export type S3ProxyClient = {
	s3Client: S3Client;
	s3Config: S3Config;
};

const s3Config = _s3Config as S3Config[];
const POSTER_CACHE_TTL = 2592000; // 30 days
const SEGMENTS_REGEX = /([\w\-_.]+\.(m4s|mp4|mp3|aac|webm))/g; // Matches segment files
const M3U8_REGEX = /(.*[\w\-_.]+\.m3u8)/g; // Matches M3U8 files (optionally in a URL)
const URL_REGEX = /^https|http?:\/\//i; // Matches URLs
const HSL_MIME_TYPE = "application/x-mpegURL"; // MIME type for HLS playlists
const EXPIRATION_DEFAULT = 3600; // Default expiration time for signed URLs in seconds
const EXPIRATION_MARGIN = 100; // Margin in seconds for expiration time the cache will expire before the signed URL

// Create a S3 client for each Amazon S3 or compatible services
// for IDrive® e2 the region is not pertinent you must use  a fake region
const s3ProxyClients = s3Config.map((conf) => {
	const awsS3Client = new S3Client({
		region: conf.region,
		credentials: {
			accessKeyId: conf.credentials.accessKeyId,
			secretAccessKey: conf.credentials.secretAccessKey,
		},
		endpoint: conf.endpoint,
	});
	return { s3Client: awsS3Client, s3Config: conf } as S3ProxyClient;
});


/**
 * Generates a signed URL for an object in an S3 bucket.
 *
 * @param bucket - The name of the S3 bucket where the object is stored.
 * @param key - The key of the object for which to generate a signed URL.
 * @param s3ProxyConfig - The S3 proxy client
 * @returns A signed URL for the object.
 * @throws {Error} If the bucket name or the key is not provided.
 */
async function getSignedUrlForObject(
	bucket: string,
	key: string,
	s3ProxyConfig: S3ProxyClient,
): Promise<string> {
	if (!bucket || !key) {
		throw new Error("No bucket or key provided");
	}

	try {
		const command = new GetObjectCommand({ Bucket: bucket, Key: key });
		const expiration = parseInt(s3ProxyConfig.s3Config.expiration)
			? parseInt(s3ProxyConfig.s3Config.expiration)
			: 3600;
		const signedUrl = await getSignedUrl(s3ProxyConfig.s3Client, command, {
			expiresIn: expiration,
		});
		return signedUrl;
	} catch (error) {
		console.error(error);
		throw new Error("Failed to get signed URL for object");
	}
}

/**
 * Replaces the URLs of the segments in an M3U8 file with signed URLs.
 *
 * @param m3u8 - The original M3U8 file as a string.
 * @param bucket - The name of the S3 bucket where the M3U8 file is stored.
 * @param s3ProxyConfig - The S3 proxy client
 * @returns A new M3U8 file as a string with the URLs of the segments replaced by signed URLs.
 * @throws {Error} If the M3U8 file or the bucket name is not provided.
 */
async function replaceFilesInM3U8(
	basePath: string,
	m3u8: string,
	bucket: string,
	s3ProxyConfig: S3ProxyClient,
): Promise<string> {
	if (!m3u8 || !bucket) {
		throw new Error("No M3U8 file or bucket provided");
	}

	let pathInBucket = "";
	const lines = m3u8.split("\n");
	const promises = [] as { signedUrl: Promise<string>; line: number }[];

	// Check if the base path is the bucket
	if (basePath.split("/")[0] == bucket) {
		// Remove the bucket name from the base path
		pathInBucket = basePath.split("/").slice(1).join("/") + "/";
	} else {
		// Will use the default bucket
		pathInBucket = "";
	}
	pathInBucket = basePath.split("/").slice(1).join("/") + "/";
	lines.forEach((line, index) => {
		const match = line.match(SEGMENTS_REGEX);
		if (match) {
			const promise = getSignedUrlForObject(bucket, `${pathInBucket}${match[0]}`, s3ProxyConfig);
			promises.push({ signedUrl: promise, line: index });
		}
	});

	try {
		let newM3u8 = "";
		const urls = await Promise.all(promises.map((p) => p.signedUrl));
		urls.forEach((url, index) => {
			const newLine = lines[promises[index].line].replace(
				SEGMENTS_REGEX,
				url,
			);
			lines[promises[index].line] = newLine;
		});
		newM3u8 = lines.join("\n"); // Join the lines back into a single string
		
		return newM3u8;
	} catch (error) {
		console.error(error);
		throw new Error("Failed to replace files in M3U8");
	}
}

/**
 * Retrieves the base path from a request.
 * @param request - The request object
 * @returns The base path of the request URL.
 */
function getBasePath(request: Request): string {
	const urlObj = new URL(request.url);
	const path = urlObj.pathname.split("/").slice(0, -1).join("/").substring(1);
	console.log(`Base path: ${path}`);
	return path;
}

/**
 *
 * Replace the URLs of the M3U8 file with localhost
 * @param request
 * @param m3u8
 * @returns
 * @throws {Error} If the request or M3U8 file is not provided
 */
function replaceM3u8Urls(request: Request, m3u8: string): string {
	if (!request || !m3u8) {
		throw new Error("No request or M3U8 file provided");
	}

	let url = {} as URL;
	try {
		url = new URL(request.url);
	} catch (error) {
		throw new Error("Invalid request URL");
	}

	const host = url.origin;
	m3u8 = m3u8.replace(M3U8_REGEX, (match) => {
		// Check if the match looks like a URL
		const isUrl = URL_REGEX.test(match);
		const path = getBasePath(request);
		if (!isUrl) {
			return `${host}/${path}/${match}`;
		}
		return match;
	});
	return m3u8;
}

/**
 * Retrieves an M3U8 file from an S3 bucket, signs the URL of the segments, and returns the signed M3U8 file
 *
 * @param request - The request object
 * @param bucket - The S3 bucket where the M3U8 file is stored
 * @param key - The requested M3U8 files
 * @param s3ProxyClient - The S3 proxy client
 * @returns The signed M3U8 file
 * @throws {Error} If the requested M3U8 file is not found
 */
async function getSignedM3u8(request: Request, bucket: string, key: string, s3ProxyClient: S3ProxyClient) {
	if (!bucket || !key) {
		throw new Error("Invalid bucket or key");
	}

	try {
		// Get the M3U8 file from the S3 bucket
		const clearM3uRequest = await s3ProxyClient.s3Client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);
		if (!clearM3uRequest.Body) {
			// If the M3U8 file is empty, throw an error
			throw new Error("No body");
		}

		const clearM3u8 = await clearM3uRequest.Body?.transformToString();
		const signedM3u8 = await replaceFilesInM3U8(
			getBasePath(request),
			clearM3u8,
			bucket,
			s3ProxyClient
		);
		const finalM3u8 = replaceM3u8Urls(request, signedM3u8);

		return finalM3u8;
	} catch (error) {
		// An asynchronous error occurred
		console.error(error);
		throw new Error("Failed to get signed M3U8");
	}
}

/**
 * The environment object
 */
export interface Env {
	s3proxy_cache: KVNamespace;
}

/**
 * Checks if the provided clear code is valid.
 * The code is valid if it matches the temporary code generated based on the number of days since the epoch and the  one of the secret keys.
 *
 * @param clearCode - The clear code to check
 * @returns True if the clear code is valid, false otherwise
 */
function isClearCodeValid(clearCode: string | null): boolean {
	// Generate a temporary code based on the number of days since the epoch and the secret key
	const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
	let returned = false;
	for(const s3ProxyClient of s3ProxyClients){
		const secret = s3ProxyClient.s3Config.credentials.secretAccessKey;
		const tempCode = CryptoJS.HmacSHA256(
			String(daysSinceEpoch),
			secret,
		).toString();
		// Compare the temporary code to the provided clear code
		if (clearCode === tempCode) {
			returned = true;
			break;
		}
	}
	return returned;
}

/**
 * Removes the leading slash from a path.
 * @param path - The path
 * @returns The path without the leading slash
 */
function removeLeadingSlash(path: string): string {
	return path.substring(1);
}

/**
 * Calculates the expiration time for a signed URL.
 * If the expiration time is not provided, the default expiration time is used.
 * @param expiration - The expiration time for the signed URL
 * @returns The expiration time in seconds
 */
function calculateExpirationTtl(expiration: string | undefined): number {
	const expirationMargin = EXPIRATION_MARGIN;
	const defaultExpiration = EXPIRATION_DEFAULT;
	return expiration
		? parseInt(expiration) - expirationMargin
		: defaultExpiration - expirationMargin;
}

/**
 * Clears the cache for a specific key.
 * @param env - The environment object
 * @param bucket - The name of the S3 bucket
 * @param key - The key of the S3 object
 */
async function clearCacheForKey(env: Env, bucket: string, key: string): Promise<void> {
	console.log(`Clearing cache for ${key}`);
	await env.s3proxy_cache.delete(`${key}`);
}

/**
 * Extracts the bucket and key from the requested file.
 * If the requested file contains a bucket, it is extracted from the path.
 * @param requestedFile - The requested file
 * @param defaultBucket - The default bucket
 * @returns The bucket and key
 */
function extractBucketAndKey(requestedFile: string, defaultBucket: string): { bucket: string, key: string } {
	let bucket = defaultBucket;
	let key = requestedFile;
	if (requestedFile.includes("/")) {
		bucket = requestedFile.split("/")[0]; // Get the bucket from the path
		key = requestedFile.substring(requestedFile.indexOf("/") + 1); // Get the key from the path
		console.log(`Bucket: ${bucket}, Key: ${key}`);
	}
	return { bucket, key };
}

/**
 * Validates the requested M3U8 file.
 * The key must not be empty and must end with ".m3u8".
 * @param key - The requested M3U8 file
 * @throws {Error} If the key is invalid
 */
function validateKey(key: string): void {
	if (!key || !key.endsWith(".m3u8")) {
		throw new Error("No M3U8 requested or invalid M3U8 file");
	}
}

/**
 * Adds a comment with the expiration date in the M3U8 file.
 * @param m3u8 - The M3U8 file
 * @param expirationDate - The expiration date
 * @returns The M3U8 file with the expiration date comment
 */
function addExpirationDateCommentInM3u8(m3u8: string, expirationDate: Date): string {
	const comment = `# Expires: ${expirationDate.toUTCString()}`;
	const lines = m3u8.split("\n");
	lines.splice(1, 0, comment);
	return lines.join("\n");

}

/**
 * Returns a random integer between 0 and max
 * @param max - The maximum value
 * @returns A random number
 */
function getRandomRobin(max: number): number {
	if (max <= 0) {
		return 0;
	}
	return Math.floor(Math.random() * Math.floor(max));
}

/**
 * Handles a request for an M3U8 file.
 * The request must contain the path to the M3U8 file.
 * If the M3U8 file is found, it is signed and returned.
 * @param request - The request object
 * @param env - The environment object
 * @param s3ProxyClient - The S3 proxy client
 * @returns A response containing the signed M3U8 file
 */
async function handleM3U8Request(request: Request, env: Env, s3ProxyClient: S3ProxyClient): Promise<Response> {
	const url = new URL(request.url);
	const path = new URL(request.url).pathname;
	const requestedM3u = removeLeadingSlash(path);
	const expirationTtl = calculateExpirationTtl(s3ProxyClient.s3Config.expiration);

	let signedM3u8 = "" as string | null; // Default to empty string

	const { bucket, key } = extractBucketAndKey(requestedM3u, s3ProxyClient.s3Config.videoBucket);

	// Input validation
	validateKey(key);
	// Create a cache key from the bucket and key
	const cacheKey = getCacheKey(s3ProxyClient, bucket, key);
	const params = url.searchParams;
	const clearCache = params.get("clear-cache");
	if (clearCache) {
		// Clear the cache if the correct secret is provided
		if (isClearCodeValid(clearCache)) {
			// force clearing this key from the cache
			await clearCacheForKey(env, bucket, cacheKey);
		}
	}

	// Error handling
	// if bucket has a 0 length it means that s3Config.videoBucket is not set or the requested path does not contain a bucket 
	if (!s3ProxyClient.s3Config || !bucket.length) {
		throw new Error("Invalid S3 configuration");
	}

	// Get signed M3U8
	try {
		let expirationDate = new Date(Date.now() + expirationTtl * 1000);
		// Try to get the signed M3U8 from the cache
		const { value, metadata } = await env.s3proxy_cache.getWithMetadata(cacheKey) as { value: string, metadata: KVMetadata };
		signedM3u8 = value;
		if (metadata) {
			expirationDate = new Date(metadata.expiration * 1000);
			console.log(`Expiration date: ${expirationDate.toISOString()}`);
		}


		// If the signed M3U8 is not in the cache, generate it, cache it, and return it
		if (!signedM3u8) {
			console.log("Cache miss");
			signedM3u8 = requestedM3u
				? await getSignedM3u8(request, bucket, key, s3ProxyClient)
				: "";
			// Add expiration date comment in M3U8
			signedM3u8 = addExpirationDateCommentInM3u8(signedM3u8, expirationDate);
			// Cache the signed M3U8
			await env.s3proxy_cache.put(cacheKey, signedM3u8, {
				metadata: { expiration: Math.floor(Date.now() / 1000 + expirationTtl) },
				expirationTtl: expirationTtl,
			});
		} else {
			console.log("Cache hit");
		}

		// Check if getSignedM3u returned a non-empty string
		if (!signedM3u8) {
			throw new Error("Failed to get signed M3U8");
		}

		// Calculate the max age and expiration date for the response
		const maxAge = Math.floor((expirationDate.getTime() - Date.now()) / 1000);

		return new Response(signedM3u8, {
			headers: {
				"Content-Type": HSL_MIME_TYPE,
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Origin, Accept",
				"Access-Control-Max-Age": "86400", // 24 hours 
				"Cache-Control": `public, max-age=${maxAge}`,
				"Expires": expirationDate.toUTCString(),
			},
		});
	} catch (error) {
		// Handle asynchronous errors
		console.error(error);
		return new Response("An error occurred", { status: 500 });
	}
}

/**
 * Generates a cache key for an S3 object.
 * @param s3ProxyClient - The S3 proxy client
 * @param bucket - The name of the S3 bucket
 * @param key - The key of the S3 object
 * @returns A cache key for the S3 object
 */
function getCacheKey(s3ProxyClient: S3ProxyClient, bucket: string, key: string) {
	return `${s3ProxyClient.s3Config.endpoint}/${bucket}/${key}`;
}

/**
 * Deletes all keys from a KV namespace
 * @param kv - The KV namespace
 */
async function deleteAllKeys(kv: KVNamespace) {
	let keys = [] as VideoObject[];
	let cursor = "";

	// Récupérer toutes les clés
	do {
		const response = await kv.list({ cursor: cursor }) as {
			list_complete: false;
			keys: VideoObject[];
			cursor: string;
			cacheStatus: string | null;
		};
		const _keys = response.keys as VideoObject[]
		keys = _keys.concat();
		console.log(`Got ${response.keys} keys`);
		cursor = response.cursor;
	} while (cursor);

	console.log(`Deleting ${keys.length} keys`);
	// Supprimer toutes les clés
	for (const key of keys) {
		await kv.delete(key.name);
	}
}

/**
 * Handles a request to flush the cache.
 * The request must contain a query parameter "key" with the clear code.
 * If the clear code is valid, the entire cache is cleared.
 * @param request - The request object
 * @param env - The environment object
 * @returns A response indicating whether the cache was cleared
 */
async function handleFlushCacheRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const params = url.searchParams;
	const clearCache = params.get("key");
	if (clearCache) {
		// Clear the cache if the correct secret is provided
		if (isClearCodeValid(clearCache)) {
			// Clear the entire cache
			await deleteAllKeys(env.s3proxy_cache);
			return new Response("Cache cleared", { status: 200 });
		}
	}
	return new Response("Invalid clear code", { status: 400 });
}

/**
 * Retrieves a poster from an S3 bucket and returns it
 * Cache the ETag for avoiding to download the poster each time
 * @param request - The request object
 * @param env - The environment object
 * @param s3ProxyClient - The S3 proxy client
 * @returns The poster
 */
async function handlePosterRequest(request: Request, env: Env, s3ProxyClient: S3ProxyClient): Promise<Response> {

	const path = new URL(request.url).pathname;
	const requestePoster = removeLeadingSlash(path);
	const { bucket, key } = extractBucketAndKey(requestePoster, s3ProxyClient.s3Config.videoBucket);
	const cacheKey = getCacheKey(s3ProxyClient, bucket, key);
	// Check if the request has an If-None-Match header
	const ifNoneMatch = request.headers.get("If-None-Match");
	if (ifNoneMatch) {
		const storedEtag = await env.s3proxy_cache.get(cacheKey)
		if (storedEtag) {
			// If the ETag matches, return a 304 Not Modified response
			if (ifNoneMatch === storedEtag) {
				console.log("ETag matches");
				return new Response(null, {
					status: 304,
					headers: {
						"ETag": ifNoneMatch,
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "GET, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type, Origin, Accept",
						"Access-Control-Max-Age": String(POSTER_CACHE_TTL), // 30 days
					},
				});
			}
		}
	}

	// Error handling
	// if bucket has a 0 length it means that s3Config.videoBucket is not set or the requested path does not contain a bucket 
	if (!s3ProxyClient.s3Config || !bucket.length) {
		throw new Error("Invalid S3 configuration");
	}
	try {
		const posterRequest = await s3ProxyClient.s3Client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);
		if (!posterRequest.Body) {
			// If the poster file is empty, throw an error
			throw new Error("No body");
		}
		// Compute the ETag as the MD5 hash of the poster
		const posterBuffer = await posterRequest.Body?.transformToByteArray();

		const etag = CryptoJS.MD5(CryptoJS.lib.WordArray.create(posterBuffer)).toString();

		// Cache the ETag
		await env.s3proxy_cache.put(cacheKey, etag, {
			expirationTtl: 2592000, // 30 days
		});
		return new Response(posterBuffer, {
			headers: {
				"Content-Type": "image/jpeg",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Origin, Accept",
				"Access-Control-Max-Age": String(POSTER_CACHE_TTL), // 30 days
				"Cache-Control": `public, max-age=${POSTER_CACHE_TTL}, immutable`, // 30 days
				"ETag": etag,
			},
		});
	}
	catch (error) {
		return new Response("An error occurred", { status: 500 });
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Get a random S3 proxy client
		const randomRobin = getRandomRobin(s3ProxyClients.length);
		const s3ProxyClient = s3ProxyClients[randomRobin];
		console.log(`Using S3 client ${randomRobin}`);

		if (request.method === "GET") {
			const path = new URL(request.url).pathname;
			if (path.endsWith(".m3u8")) {
				return await handleM3U8Request(request, env, s3ProxyClient);
			}
			if (path.endsWith("_poster.jpg")) {
				return await handlePosterRequest(request, env, s3ProxyClient);
			}
			switch (path) {
				case "/":
					return new Response("Welcome to the S3 Proxy", { status: 200 });
				case "/favicon.ico":
					return new Response(null, { status: 204 });
				case "/flush-cache":
					return handleFlushCacheRequest(request, env);
				case "/health":
					return new Response("OK", { status: 200 });
				case "/robots.txt":
					return new Response("User-agent: *\nDisallow: /", { status: 200 });
				default:
					return new Response("Not found", { status: 404 });
			}

		} else if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Origin, Accept",
					"Access-Control-Max-Age": "86400", // 24 hours
				},
			});
		}
		else {
			return new Response("Method not allowed", { status: 405 });
		}
	}
}
