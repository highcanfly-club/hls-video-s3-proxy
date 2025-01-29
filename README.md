# HLS Video Streaming Proxy

This project enables HLS (HTTP Live Streaming) video streaming from a private S3-compatible bucket via a proxy running in a Cloudflare worker.

## Features

- Stream HLS videos from a private S3-compatible bucket.
- Proxy running in a Cloudflare worker.
- On-demand modification of M3U8 files to include temporary signed URLs to the bucket's elements.

## Advantages

- No need to expose the S3 bucket to the public.
- No need to modify the M3U8 files in the S3 bucket.
- No need to modify the video segments in the S3 bucket.
- No need to modify the video player.

## How It Works

The proxy receives a request for an M3U8 file. It fetches the M3U8 file from the S3 bucket, modifies the file to replace the segment URLs with temporary signed URLs, and then returns the modified M3U8 file. The signed URLs allow access to the video segments in the S3 bucket for a limited period of time.

## Configuration

The S3 client configuration is done via the `src/s3-config.json` file. You need to provide the following information:

```json
{
    "region": "your-region",
    "credentials": {
        "accessKeyId": "your-access-key-id",
        "secretAccessKey": "your-secret-access-key"
    },
    "endpoint": "your-endpoint",
    "expiration": "your-expiration-ttl-in-seconds",
    "videoBucket": "your-default-bucket-name"
}
```

for example for idrivee2 S3 bucket with Paris region, the configuration is as follows (note us-east-1 is not the correct region but idrivee2 uses the region in the endpoint and AWS SDK requires it so any value is accepted for the region field):

```json
[
    {
    "region": "us-east-1",
    "credentials": {
        "accessKeyId": "DYzO2ETMyoSvut729YKP",
        "secretAccessKey": "KJ3ETGF7X1faOcOhzDFauQH4hwybO2tIp9HhOI3P"
    },
    "endpoint": "https://l2e5.par.idrivee2-18.com",
    "expiration": "604800",
    "videoBucket": "my-videos"
    }
]
```

This is the associated schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "region": {
        "type": "string"
      },
      "credentials": {
        "type": "object",
        "properties": {
          "accessKeyId": {
            "type": "string"
          },
          "secretAccessKey": {
            "type": "string"
          }
        },
        "required": ["accessKeyId", "secretAccessKey"]
      },
      "endpoint": {
        "type": "string",
        "format": "uri"
      },
      "expiration": {
        "type": "string"
      },
      "videoBucket": {
        "type": "string"
      }
    },
    "required": ["region", "credentials", "endpoint", "expiration", "videoBucket"]
  }
}
```

Replace "your-region", "your-access-key-id", "your-secret-access-key", and "your-s3-endpoint" with your S3 credentials and configuration.  
As the array of configurations is supported, you can add multiple configurations for different S3 buckets.  
Obviously all the buckets should contain the same files with the same names and the same directory structure.  
It permits to randomly select a S3 account for each request.

## Cache

The Cloudflare worker caches the M3U8 files for 1 hour or for the value of s3Config.expiration minus 100 seconds.  
The video segments are not cached.

### Clearing the Cache per key

The cache can be cleared by adding a `?clear-cache` query parameter to the request with the value of a hash generated with the day and the `s3Config.credentials.secretAccessKey` . See the `isClearCodeValid` function in the worker code and the `get-secret-code.sh` script for more details.

### Clearing the Cache for all keys

The cache can be cleared for all keys by hitting a `/flush-cache?key=[same key as previous]` request.

## Usage

Deploy the Cloudflare worker with this code, then make a request to the worker's URL with the path to the M3U8 file in the S3 bucket.  
First, you need to create the wrangler.toml file with the following content:

```toml
main = "./src/index.ts"
name = "your-worker-name"
compatibility_date = "your-compatibility-date"
kv_namespaces = [
    { binding = "s3proxy_cache", id = "your-id" }
]
[build]
command = "your-build-command"
```

You also need to create a kv namespace with the name `s3proxy_cache` and the id `your-id` in the Cloudflare dashboard.

```bash
npx wrangler kv:namespace create "s3proxy_cache"
```

Replace the id `your-id` with the id of the created namespace.  
Then you can deploy the worker with the following command:

With the command:

```bash
npx wrangler deploy
```

## HLS Videos generation

With the supplied `generate-hls-videos.sh` script, you can generate HLS videos from a video file. The script uses ffmpeg to generate the HLS videos.  
with the help of Minio mc, the script uploads the generated videos to the S3 bucket.  
Edit the script for defining your target resolutions.  
Here is an example of how to use the script:

```bash
source ./generate-hls-videos.sh
generate_multi_resolution_hls "your-video.mp4"
# it creates a directory with a uuid random name if the "your-video" directory exists
# now you can upload the videos to the S3 bucket
# you can create an alias for mc with the following command
# mc alias set s3e2bucket  https://e2.idrivee2-18.com access_key  secret_key
mc cp -a your-video/* s3e2bucket/bucket_name/your-video.mp4/
rm -rf your-video.mp4
```

For multiple files using a pattern, you can use the following command:

```bash
source generate-hls-videos.sh
generate_multi_resolution_hls_for_pattern_files "$HOME/Downloads/*.mp4"
```

For publishing the videos, you can use the following command:

```bash
source generate-hls-videos.sh
publish_hls_videos s3-config.json bucket_name local_folder
```

If you want to use the script with Minio mc, you can use the following command:

```bash
source generate-hls-videos.sh
define_mc_aliases set s3-config.json
```

It will create the mc aliases for the S3 buckets defined in the s3-config.json file. In the form `endpoint_region` for each entry in the json file.

## License

This project is licensed under the MIT license. See the LICENSE file for more details.  
