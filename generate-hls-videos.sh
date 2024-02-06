#!/bin/bash
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

generate_multi_resolution_hls() {
    HLS_SEGMENT_LENGTH=6
    # UUID="8DCDE049-2F20-4EEA-BE4C-CE6504BC2BAA"

    declare -A resolutions
    # resolutions["240"]="136x240"
    # resolutions["640"]="360x640"
    # resolutions["960"]="540x960"
    # resolutions["1280"]="720x1280"
    # resolutions["1920"]="1080x1920"
    # resolutions["3840"]="2160x3840"
    resolutions["136"]="240x136"
    resolutions["360"]="640x360"
    resolutions["540"]="960x540"
    resolutions["720"]="1280x720"
    resolutions["1080"]="1920x1080"
    resolutions["2160"]="3840x2160"
    input=$1
    base_name=$(basename "$input" .mp4)

    if [[ -z $UUID ]]; then

        if [[ -d "${base_name}" ]]; then
            UUID=$(uuidgen)
        else
            UUID=${base_name}
        fi
        mkdir -p ./$UUID
        # Encode video in multiple resolutions
        for resolution_hxv in "${resolutions[@]}"; do
            resolutionh=$(echo $resolution_hxv | sed 's/x.*//')
            resolutionv=$(echo $resolution_hxv | sed 's/.*x//')
            echo "Resolution: $resolutionh x $resolutionv"
            ratio=$(echo "scale=3; $resolutionv / $resolutionh" | bc)
            echo "Ratio: $ratio"
            echo "Encoding video in $resolution_hxv resolution"
            ffmpeg -i "$input" \
                -c:v libx264 -profile:v baseline -level 3.0 -s $resolution_hxv \
                -start_number 0 -hls_time $HLS_SEGMENT_LENGTH -hls_list_size 0 -hls_segment_type fmp4 -f hls \
                "${UUID}/${base_name}_${resolutionh}p.m3u8"
            mv "${UUID}/init.mp4" "${UUID}/${base_name}_${resolutionh}p.mp4"
            sed -i '' -e 's/init.mp4/'"${base_name}_${resolutionh}p.mp4"'/g' "${UUID}/${base_name}_${resolutionh}p.m3u8"
            # echo "please hit enter to continue"
            # read
        done

        # Create master playlist file
        echo "#EXTM3U" >"${UUID}/${base_name}_master.m3u8"

        for resolution_hxv in "${resolutions[@]}"; do
            resolutionh=$(echo $resolution_hxv | sed 's/x.*//')
            resolutionv=$(echo $resolution_hxv | sed 's/.*x//')
            echo "#EXT-X-STREAM-INF:BANDWIDTH=$((500000 * $resolutionh / 240)),RESOLUTION=${resolutionh}p" >>"${UUID}/${base_name}_master.m3u8"
            echo "${base_name}_${resolutionh}p.m3u8" >>"${UUID}/${base_name}_master.m3u8"
        done
    fi
    wait
    # Generate JSON file with filenames
    multiresolution_json=()
    generated_resolutions=()
    for resolution_hxv in "${resolutions[@]}"; do
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
    echo "{\"master\":\"${base_name}_master.m3u8\",\"resolutions\":$(
        IFS=,
        echo "[${generated_resolutions[*]}]"
    ),"$(
        IFS=,
        echo "${multiresolution_json[*]}"
    )"}" >"${UUID}/keys.json"
    unset UUID
}
