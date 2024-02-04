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

The S3 client configuration is done via the `s3-config.json` file. You need to provide the following information:

```json
{
    "region": "your-region",
    "credentials": {
        "accessKeyId": "your-access-key-id",
        "secretAccessKey": "your-secret-access-key"
    },
    "endpoint": "your-s3-endpoint"
}
```

Replace "your-region", "your-access-key-id", "your-secret-access-key", and "your-s3-endpoint" with your S3 credentials and configuration.

## Cache

The Cloudflare worker caches the M3U8 files for 1 hour or for the value of s3Config.expiration minus 100 seconds.  
The video segments are not cached.
The cache can be cleared by adding a `?clear-cache` query parameter to the request with the value of a hash generated with the day and the `s3Config.credentials.secretAccessKey` . See the `isClearCodeValid` function in the worker code and the `get-secret-code.sh` script for more details.

## Usage

Deploy the Cloudflare worker with this code, then make a request to the worker's URL with the path to the M3U8 file in the S3 bucket.

## HLS Videos generation

With the supplied `generate-hls-videos.sh` script, you can generate HLS videos from a video file. The script uses ffmpeg to generate the HLS videos.  
with the help of Minio mc, the script uploads the generated videos to the S3 bucket.  
Here is an example of how to use the script:

```bash
. ./generate-hls-videos.sh
generate_multi_resolution_hls "your-video.mp4"
# it creates a directory with a uuid random name 
# now you can upload the videos to the S3 bucket
# you can create an alias for mc with the following command
# mc alias set s3e2bucket  https://e2.idrivee2-18.com access_key  secret_key
mc cp -a UUID/* s3e2bucket/your-video.mp4/
rm -rf UUID
```

## License

This project is licensed under the MIT license. See the LICENSE file for more details.  
