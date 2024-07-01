# !/bin/bash
#
# MIT License
#
# Copyright (c) 2024 Ronan Le Meillat
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

# How to install FFmpeg on different operating systems.
# For macOS using Homebrew:
# brew install ffmpeg
# For RPM-based Linux distributions like Centos or Fedora using Yum:
# sudo yum install ffmpeg
# For Debian-based Linux distributions like Ubuntu using apt-get:
# sudo apt-get install ffmpeg

# a key.json file is generated in the same directory as the video file
# the key.json file contains the master playlist and the resolutions with their respective chunks and init file
# the key.json file can be used to generate the video player
# this is a sample TypeScript type for the key.json file
# type VideoDataResolution = {
# 	chunks: string[];
# 	init: string;
# }

# type VideoData = {
# 	master: string;
# 	resolutions: string[];
# 	[resolution: string]: VideoDataResolution | string | string[];
# }

# s3-config.json file is used by hls-video-s3-proxy on cloudflare
# // The S3 configuration
# export type S3Config = {
# 	region: string;
# 	credentials: {
# 		accessKeyId: string;
# 		secretAccessKey: string;
# 	};
# 	endpoint: string;
# 	expiration: string;
# 	videoBucket: string;
# };

# Function to check if required binaries are installed
# This function checks if the following binaries are installed:
# - ffmpeg: Required for video conversion and manipulation
# - ffprobe: Required for video analysis and metadata extraction
# - bc: Required for performing mathematical calculations
# - uuidgen: Required for generating unique identifiers
# - jq: Required for JSON parsing and manipulation
# - mc: Required for interacting with MinIO object storage
# If any of the binaries are not found, an error message is displayed.
# Returns:
# - 0 if all required binaries are found
# - 1 if any of the required binaries are not found
test_required_binaries() {
    if ! command -v ffmpeg &>/dev/null; then
        echo "ffmpeg could not be found see https://ffmpeg.org/download.html"
        return 1
    fi
    if ! command -v ffprobe &>/dev/null; then
        echo "ffprobe could not be found see https://ffmpeg.org/download.html"
        return 1
    fi
    if ! command -v bc &>/dev/null; then
        echo "bc could not be found"
        return 1
    fi
    if ! command -v uuidgen &>/dev/null; then
        echo "uuidgen could not be found"
        return 1
    fi
    if ! command -v jq &>/dev/null; then
        echo "jq could not be found see https://stedolan.github.io/jq/download/"
        return 1
    fi
    if ! command -v mc &>/dev/null; then
        echo "mc could not be found see https://docs.min.io/docs/minio-client-complete-guide.html"
        return 1
    fi
    return 0
}

# This function is used to set or remove mc aliases based on the s3-config.json file used by hls-video-s3-proxy on cloudflare
#
#    Defines MinIO client aliases based on the provided action and s3-config.json file.
#
#    Args:
#        action (str): The action to perform. Must be one of "set", "rm", or "remove".
#        json_file (str): The path to the s3-config.json file used by hls-video-s3-proxy on Cloudflare.
#
#    Returns:
#        None
#
#    Raises:
#        None
#
#    Example:
#        define_mc_aliases "set" "s3-config.json"
define_mc_aliases() {
    test_required_binaries
    action=$1
    json_file=$2
    usage="usage: define_mc_aliases action s3-config.json"
    if [[ -z $action ]]; then
        echo "Please provide an action"
        echo $usage
        return
    fi
    if [[ $action != "set" && $action != "rm" && $action != "remove" ]]; then
        echo "Please provide a valid action"
        echo $usage
        return
    fi
    if [[ -z $json_file ]]; then
        echo "Please provide the s3-config.json file used by hls-video-s3-proxy on cloudflare"
        echo $usage
        return
    fi
    for row in $(cat "${json_file}" | jq -r '.[] | @base64'); do
            _jq() {
            echo ${row} | base64 --decode | jq -r ${1}
            }
        if [[ $action == "set" ]]; then
            mc alias set $(_jq '.endpoint' | sed -n 's|.*//\([^\.]*\)\.\([^\.]*\)\..*|\1\_\2|p' ) $(_jq '.endpoint') $(_jq '.credentials.accessKeyId') $(_jq '.credentials.secretAccessKey')
        fi
        if [[ $action == "rm" || $action == "remove" ]]; then
            mc alias rm $(_jq '.endpoint' | sed -n 's|.*//\([^\.]*\)\.\([^\.]*\)\..*|\1\_\2|p' )
        fi
    done
}

# This function is used to publish the HLS videos to the remote s3 bucket
# Publishes HLS videos to a remote S3 bucket.
#
# Args:
#   json_file (str): The path to the s3-config.json file used by hls-video-s3-proxy on cloudflare.
#   bucket_name (str): The name of the S3 bucket.
#   local_folder (str): The local folder containing the HLS videos.
#
# Returns:
#   None
publish_hls_videos(){
    test_required_binaries
    usage="usage: publish_hls_videos s3-config.json bucket_name local_folder"
    json_file=$1
    bucket_name=$2
    local_folder=$3
    if [[ -z $json_file ]]; then
        echo "Please provide the s3-config.json file used by hls-video-s3-proxy on cloudflare"
        echo $usage
        return
    fi
    if [[ -z $bucket_name ]]; then
        echo "Please provide the name of the s3 bucket"
        echo $usage
        return
    fi
    if [[ -z $local_folder ]]; then
        echo "Please provide the local folder containing the HLS videos"
        echo $usage
        return
    fi
    define_mc_aliases "set" $json_file
    for alias in $(get_mc_aliases $json_file); do
        mc cp -r -a $local_folder $alias/$bucket_name/
    done
    define_mc_aliases "rm" $json_file
}

# This function is used to get the minio client aliases based on the s3-config.json file used by hls-video-s3-proxy on cloudflare
get_mc_aliases(){
    json_file=$1
    usage="usage: get_mc_aliases s3-config.json"
    if [[ -z $json_file ]]; then
        echo "Please provide the s3-config.json file used by hls-video-s3-proxy on cloudflare"
        echo $usage
        return
    fi
    for row in $(cat "${json_file}" | jq -r '.[] | @base64'); do
            _jq() {
            echo ${row} | base64 --decode | jq -r ${1}
            }
        echo $(_jq '.endpoint' | sed -n 's|.*//\([^\.]*\)\.\([^\.]*\)\..*|\1\_\2|p' )
    done
}

# Function to get the name of the current shell
# Returns the name of the shell
get_shell_name() {
    shell_name=$(basename "$SHELL")
    echo "$shell_name"
}


# Function to get the width and height ratio of a video file.
# Parameters:
#   $1: The path to the video file.
# Returns:
#   The width and height ratio of the video file.
get_video_ratio() {
    video_file=$1
    ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$video_file"
}

# Function to get the frame rate of a video file
# Arguments:
#   $1: video_file - the path to the video file
# Returns:
#   The frame rate of the video file
get_video_frame_rate() {
    video_file=$1
    rate_base=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=s=x:p=0 "$video_file" 2>/dev/null)
    rate=$(echo -n "scale=3; $rate_base" | bc)
    echo $rate | tail -n 1
}

# Function to get the numeric ratio of a video file
# Arguments:
#   $1: video_file - The path to the video file
# Returns:
#   The numeric ratio of the video file
get_video_ratio_numeric() {
    video_file=$1
    ratio_text=$(get_video_ratio "$video_file")
    resolutionh=$(echo $ratio_text | sed 's/x.*//')
    resolutionv=$(echo $ratio_text | sed 's/.*x//')
    ratio=$(echo "scale=3; $resolutionh / $resolutionv" | bc)
    echo $ratio
}

# Function to get the number of lines in a video file
# Parameters:
#   $1: video_file - the path to the video file
# Returns:
#   The number of lines in the video file
get_video_nb_lines() {
    video_file=$1
    ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=s=x:p=0 "$video_file"
}

# Function to generate multi-resolution HLS videos for files matching a given pattern.
# Parameters:
#   - pattern: The pattern to match the files. Example: /path/to/videos/*.mp4
# Usage: generate_multi_resolution_hls_for_pattern_files pattern
# Example: generate_multi_resolution_hls_for_pattern_files /path/to/videos/*.mp4
generate_multi_resolution_hls_for_pattern_files(){
    pattern=$1
    if [[ -z $pattern ]]; then
        echo "Please provide a pattern"
        echo "Usage: generate_multi_resolution_hls_for_pattern_files pattern"
        echo "Example: generate_multi_resolution_hls_for_pattern_files /path/to/videos/*.mp4"
        return
    fi
    _filename=$(basename $pattern)
    _dirname=$(dirname $pattern)

    find $_dirname -name "$_filename"
    echo "Are you sure you want to process all these files? (y/n)"
    read -r response
    if [[ $response != "y" ]]; then
        echo "Exiting"
        return
    fi

    for file in $(find $_dirname -name "$_filename"); do
        echo "Processing file: $file"
        generate_multi_resolution_hls "$file"
    done
    unset pattern _filename _dirname
}

# Function to generate multi-resolution HLS videos
# This function takes a video file as input and encodes it into multiple resolutions using FFmpeg.
# It generates HLS playlists and segments for each resolution, as well as a master playlist file.
# The function also extracts a frame from the video and creates a JSON file with the filenames of the generated videos.
# Parameters:
#   - $1: Path to the input video file
# Usage: generate_multi_resolution_hls /path/to/video.mp4
generate_multi_resolution_hls() {
    # Check if required binaries are available
    test_required_binaries

    # Set the segment length for HLS playlists
    HLS_SEGMENT_LENGTH=6

    # Get the shell type (zsh or bash)
    SHELLTYPE=$(get_shell_name)

    # Get the input video file path
    input=$1

    # Check if input video file is provided
    if [[ -z $input ]]; then
        echo "Please provide a video file"
        echo "Usage: generate_multi_resolution_hls /path/to/video.mp4"
        echo "Example: generate_multi_resolution_hls /path/to/video.mp4"
        return
    fi

    # Get the number of lines in the source video
    NBLINES=$(get_video_nb_lines "$input")

    # Get the video ratio (numeric value)
    RATIO=$(get_video_ratio_numeric "$input")

    # Get the frame rate of the video
    FRAME_RATE=$(get_video_frame_rate "$input")

    # Get the base name of the input video file
    base_name="$(basename "$input" .mp4)"

    # Print shell type, number of lines, and video ratio
    echo "Shell type: $SHELLTYPE"
    echo "Number of lines in source video: $NBLINES"
    echo "Video ratio: $RATIO"

    # Declare an associative array to store resolutions based on the video ratio
    declare -A resolutions

    # Select resolutions based on the video ratio
    if (( $(echo "$RATIO < 1" | bc -l) )); then
        # Resolutions for 9:16 ratio
        echo "Using 9:16 resolutions"
        resolutions[240]="136x240"
        resolutions[640]="360x640"
        resolutions[960]="540x960"
        resolutions[1280]="720x1280"
        resolutions[1920]="1080x1920"
        resolutions[2560]="1440x2560"
        resolutions[3840]="2160x3840"
    elif (( $(echo "$RATIO > 1.5 " | bc -l) )); then
        # Resolutions for 16:9 ratio
        echo "Using 16:9 resolutions"
        resolutions[136]="240x136"
        resolutions[240]="426x240"
        resolutions[480]="852x480"
        resolutions[720]="1280x720"
        resolutions[1080]="1920x1080"
        resolutions[1440]="2560x1440"
        resolutions[2160]="3840x2160"
    elif (( $(echo "1.1 < $RATIO <= 1.5 " | bc -l) )); then
        # Resolutions for 4:3 ratio
        echo "Using 4:3 resolutions"
        resolutions[136]="204x136"
        resolutions[240]="320x240"
        resolutions[480]="640x480"
        resolutions[720]="960x720"
        resolutions[1080]="1440x1080"
        resolutions[1440]="1920x1440"
        resolutions[2880]="3840x2880"
    else
        # Resolutions for 1:1 ratio
        echo "Using square resolutions"
        resolutions[136]="136x136"
        resolutions[240]="240x240"
        resolutions[480]="480x480"
        resolutions[720]="720x720"
        resolutions[1080]="1080x1080"
        resolutions[1440]="1440x1440"
        resolutions[2880]="2880x2880"
        resolutions[3840]="3840x3840"
    fi

    # Extract the keys from the resolutions associative array
    if [[ $SHELLTYPE == "zsh" ]]; then
        # For Zsh
        keys=("${(@k)resolutions}")
    else
        # For Bash
        keys=("${!resolutions[@]}")
    fi

    # Sort the keys in ascending order
    unset sorted_keys
    IFS=$'\n' sorted_keys=($(printf "%s\n" "${keys[@]}" | sort -n))
    unset IFS

    # Create a new associative array for resolutions that are less than or equal to the video resolution
    declare -A sub_resolutions
    for key in "${sorted_keys[@]}"; do
        if [[ $key -le $NBLINES ]]; then
            sub_resolutions[$key]="${resolutions[$key]}"
        fi
    done

    # Extract the keys from the sub_resolutions associative array
    if [[ $SHELLTYPE == "zsh" ]]; then
        # For Zsh
        keys=("${(@k)sub_resolutions}")
    else
        # For Bash
        keys=("${!sub_resolutions[@]}")
    fi

    # Sort the keys of the new associative array
    IFS=$'\n' sorted_keys=($(printf "%s\n" "${keys[@]}" | sort -n))
    unset IFS

    # Print the resolutions and their corresponding keys
    for key in "${sorted_keys[@]}"; do
        echo "Key: $key Value: ${resolutions[$key]}"
    done

    # Check if UUID is empty
    if [[ -z $UUID ]]; then
        # Generate UUID if the base directory already exists, otherwise use the base name
        if [[ -d "${base_name}" ]]; then
            UUID=$(uuidgen)
        else
            UUID=${base_name}
        fi

        # Create a directory with the UUID
        mkdir -p ./$UUID

        # Encode video in multiple resolutions
        for key in "${sorted_keys[@]}"; do
            resolution_hxv=${resolutions[$key]}
            resolutionh=$(echo $resolution_hxv | sed 's/x.*//')
            resolutionv=$(echo $resolution_hxv | sed 's/.*x//')
            echo "Resolution: $resolutionh x $resolutionv"
            ratio=$(echo "scale=3; $resolutionv / $resolutionh" | bc)
            echo "Ratio: $ratio"
            echo "Encoding video in $resolution_hxv resolution"

            # Encode video using FFmpeg
            ffmpeg -i "$input" \
                -c:v libx264 -profile:v high -level 4.0 -s $resolution_hxv \
                -c:a aac -b:a 128k \
                -start_number 0 -hls_time $HLS_SEGMENT_LENGTH -hls_list_size 0 -hls_segment_type fmp4 -f hls \
                "${UUID}/${base_name}_${resolutionh}p.m3u8"

            # Rename the init.mp4 file to match the resolution
            mv "${UUID}/init.mp4" "${UUID}/${base_name}_${resolutionh}p.mp4"

            # Update the m3u8 file to reference the renamed video file
            sed -i '' -e 's/init.mp4/'"${base_name}_${resolutionh}p.mp4"'/g' "${UUID}/${base_name}_${resolutionh}p.m3u8"

            echo "************"
        done

        # Extract a frame from the video
        fmpeg -i "$input" -ss 00:00:01 -vframes 1 "${UUID}/${base_name}_poster.jpg"

        # Create master playlist file
        echo "#EXTM3U" >"${UUID}/${base_name}_master.m3u8"
        echo "#EXT-X-VERSION:7" >>"${UUID}/${base_name}_master.m3u8"
        echo "## Created by Ronan Le Meillat" >>"${UUID}/${base_name}_master.m3u8"

        # Add stream information to the master playlist file
        for key in "${sorted_keys[@]}"; do
            resolution_hxv=${resolutions[$key]}
            resolutionh=$(echo $resolution_hxv | sed 's/x.*//')
            resolutionv=$(echo $resolution_hxv | sed 's/.*x//')
            echo "#EXT-X-STREAM-INF:BANDWIDTH=$((500000 * $resolutionh / 240)),CODECS=\"mp4a.40.2,avc1.100.40\",RESOLUTION=${resolutionh}x${resolutionv},FRAME-RATE=${FRAME_RATE}" >>"${UUID}/${base_name}_master.m3u8"
            echo "${base_name}_${resolutionh}p.m3u8" >>"${UUID}/${base_name}_master.m3u8"
        done
    fi

    wait

    # Generate JSON file with filenames
    multiresolution_json=()
    generated_resolutions=()
    for key in "${sorted_keys[@]}"; do
        resolution_hxv=${resolutions[$key]}
        filenames=()
        resolutionh=$(echo $resolution_hxv | sed 's/x.*//')
        generated_resolutions+=(\"${resolutionh}p\")
        for i in $(find "${UUID}" -name "${base_name}_${resolutionh}p*.m4s" | sort); do
            filenames+=$(echo \"$(basename $i)\")
        done
        current_resolution=$(echo "\"${resolutionh}p\":{\"chunks\":["$(
            IFS=,
            echo "${filenames[*]}"
        )"],\"init\":\""${base_name}_${resolutionh}p.mp4"\"}")
        echo "Current resolution: $current_resolution"
        multiresolution_json+=$current_resolution
    done

    # Create the JSON file with the master playlist, resolutions, and filenames
    echo "{\"master\":\"${base_name}_master.m3u8\",\"resolutions\":$(
        IFS=,
        echo "[${generated_resolutions[*]}]"
    ),"$(
        IFS=,
        echo "${multiresolution_json[*]}"
    )"}" >"${UUID}/keys.json"

    # Clean up variables
    unset HLS_SEGMENT_LENGTH SHELLTYPE input NBLINES RATIO FRAME_RATE base_name UUID resolutions keys sorted_keys sub_resolutions generated_resolutions multiresolution_json resolution_hxv resolutionh resolutionv ratio
}
