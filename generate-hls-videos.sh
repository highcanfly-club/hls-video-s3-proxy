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

get_shell_name() {
    shell_name=$(basename "$SHELL")
    echo "$shell_name"
}

get_video_ratio() {
    video_file=$1
    ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$video_file"
}

get_video_frame_rate() {
    video_file=$1
    rate_base=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=s=x:p=0 "$video_file" 2>/dev/null)
    rate=$(echo -n "scale=3; $rate_base" | bc)
    echo $rate | tail -n 1
}

get_video_ratio_numeric() {
    video_file=$1
    ratio_text=$(get_video_ratio "$video_file")
    resolutionh=$(echo $ratio_text | sed 's/x.*//')
    resolutionv=$(echo $ratio_text | sed 's/.*x//')
    ratio=$(echo "scale=3; $resolutionh / $resolutionv" | bc)
    echo $ratio
}

get_video_nb_lines() {
    video_file=$1
    ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=s=x:p=0 "$video_file"
}

generate_multi_resolution_hls_for_pattern_files(){
    pattern=$1
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

generate_multi_resolution_hls() {
    # nombre de secondes par segment
    HLS_SEGMENT_LENGTH=6
    SHELLTYPE=$(get_shell_name)
    input=$1
    if [[ -z $input ]]; then
        echo "Please provide a video file"
        return
    fi
    NBLINES=$(get_video_nb_lines "$input")
    RATIO=$(get_video_ratio_numeric "$input")
    FRAME_RATE=$(get_video_frame_rate "$input")
    base_name="$(basename "$input" .mp4)"
    echo "Shell type: $SHELLTYPE"
    echo "Number of lines in source video: $NBLINES"
    echo "Video ratio: $RATIO"

    # UUID="8DCDE049-2F20-4EEA-BE4C-CE6504BC2BAA"
    # Select the closest resolution based on the given ratio
    declare -A resolutions
    if (( $(echo "$RATIO < 1" | bc -l) )); then
        # résolutions 9:16
        echo "Using 9:16 resolutions"
        resolutions[240]="136x240"
        resolutions[640]="360x640"
        resolutions[960]="540x960"
        resolutions[1280]="720x1280"
        resolutions[1920]="1080x1920"
        resolutions[2560]="1440x2560"
        resolutions[3840]="2160x3840"
    elif (( $(echo "$RATIO > 1.5 " | bc -l) )); then
        # résolutions 16:9
        echo "Using 16:9 resolutions"
        resolutions[136]="240x136"
        resolutions[240]="426x240"
        resolutions[480]="852x480"
        resolutions[720]="1280x720"
        resolutions[1080]="1920x1080"
        resolutions[1440]="2560x1440"
        resolutions[2160]="3840x2160"
    elif (( $(echo "1.1 < $RATIO <= 1.5 " | bc -l) )); then
        # résolutions 4:3
        echo "Using 4:3 resolutions"
        resolutions[136]="204x136"
        resolutions[240]="320x240"
        resolutions[480]="640x480"
        resolutions[720]="960x720"
        resolutions[1080]="1440x1080"
        resolutions[1440]="1920x1440"
        resolutions[2880]="3840x2880"
    else
        # résolutions 1:1
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

    # Extraire les clés
    if [[ $SHELLTYPE == "zsh" ]]; then
        # Pour Zsh
        keys=("${(@k)resolutions}")
    else
        # Pour Bash
        keys=("${!resolutions[@]}")
    fi

    # Trier les clés
    unset sorted_keys
    IFS=$'\n' sorted_keys=($(printf "%s\n" "${keys[@]}" | sort -n))
    unset IFS

    # Créer un tableau associatif pour les résolutions inférieures ou égales à la résolution de la vidéo
    declare -A sub_resolutions
    for key in "${sorted_keys[@]}"; do
        if [[ $key -le $NBLINES ]]; then
            sub_resolutions[$key]="${resolutions[$key]}"
        fi
    done
        # Extraire les clés
    if [[ $SHELLTYPE == "zsh" ]]; then
        # Pour Zsh
        keys=("${(@k)sub_resolutions}")
    else
        # Pour Bash
        keys=("${!sub_resolutions[@]}")
    fi
    # Trier les clés du nouveau tableau associatif
    IFS=$'\n' sorted_keys=($(printf "%s\n" "${keys[@]}" | sort -n))
    unset IFS
    for key in "${sorted_keys[@]}"; do
        echo "Key: $key Value: ${resolutions[$key]}"
    done

    if [[ -z $UUID ]]; then

        if [[ -d "${base_name}" ]]; then
            UUID=$(uuidgen)
        else
            UUID=${base_name}
        fi
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
            # encode video according to the rfc6381 CODECS="mp4a.40.2,avc1.100.40"
            ffmpeg -i "$input" \
                -c:v libx264 -profile:v high -level 4.0 -s $resolution_hxv \
                -c:a aac -b:a 128k \
                -start_number 0 -hls_time $HLS_SEGMENT_LENGTH -hls_list_size 0 -hls_segment_type fmp4 -f hls \
                "${UUID}/${base_name}_${resolutionh}p.m3u8"
            mv "${UUID}/init.mp4" "${UUID}/${base_name}_${resolutionh}p.mp4"
            sed -i '' -e 's/init.mp4/'"${base_name}_${resolutionh}p.mp4"'/g' "${UUID}/${base_name}_${resolutionh}p.m3u8"
            echo "************"
            # echo "please hit enter to continue"
            # read
        done

        # Create master playlist file
        echo "#EXTM3U" >"${UUID}/${base_name}_master.m3u8"
        echo "#EXT-X-VERSION:7" >>"${UUID}/${base_name}_master.m3u8"
        echo "## Created by Ronan Le Meillat" >>"${UUID}/${base_name}_master.m3u8"

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
    echo "{\"master\":\"${base_name}_master.m3u8\",\"resolutions\":$(
        IFS=,
        echo "[${generated_resolutions[*]}]"
    ),"$(
        IFS=,
        echo "${multiresolution_json[*]}"
    )"}" >"${UUID}/keys.json"
    unset HLS_SEGMENT_LENGTH SHELLTYPE input NBLINES RATIO FRAME_RATE base_name UUID resolutions keys sorted_keys sub_resolutions generated_resolutions multiresolution_json resolution_hxv resolutionh resolutionv ratio
}
