import axios from 'axios';
import { Parser } from 'm3u8-parser';

/**
 * isJpeg - Checks if the buffer is a JPEG image by looking at the first two bytes.
 * @param buffer 
 * @returns true if the buffer is a JPEG image, false otherwise
 */
export function isJpeg(buffer: Buffer): boolean {
  // JPEG files start with the bytes 0xFF, 0xD8
  return buffer[0] === 0xFF && buffer[1] === 0xD8;
}

/**
 * isM3u8 - Checks if the buffer is an m3u8 file by looking at the first 7 bytes.
 * @param buffer 
 * @returns true if the buffer is an m3u8 file, false otherwise
 */
export function isM3u8(buffer: Buffer): boolean {
  // m3u8 files start with the bytes 0x23, 0x45, 0x58, 0x54, 0x4D, 0x33, 0x55
  // which represents the string "#EXTM3U"
  return buffer[0] === 0x23 && buffer[1] === 0x45 && buffer[2] === 0x58 && buffer[3] === 0x54 && buffer[4] === 0x4D && buffer[5] === 0x33 && buffer[6] === 0x55;
}

/**
 * isMp4 - Checks if the buffer is an mp4 file by looking at the first 3 bytes.
 * @param buffer 
 * @returns true if the buffer is an mp4 file, false otherwise
 */
export function isMp4(buffer: Buffer): boolean {
  // mp4 files start with the bytes 0x00, 0x00, 0x00, 0x18 or 0x00, 0x00, 0x00, 0x1c
  return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && (buffer[3] === 0x18 || buffer[3] === 0x1c);
}

/**
 * getSignedM3u8 - Retrieves the signed m3u8 file
 * @param port 
 * @returns 
 */
export async function getSignedM3u8(port: string) {
  const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.m3u8`, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');
  const parser = new Parser();
  parser.push(buffer.toString());
  parser.end();
  const parsed = parser.manifest;
  return parsed;
}

/**
 * isM4s - Checks if the buffer is an m4s file by looking at the first 4 bytes.
 * @param buffer 
 * @returns true if the buffer is an m4s file, false otherwise
 */
export function isM4s(buffer: Buffer): boolean {
  // m4s files start with the bytes 0x00, 0x00, 0x00, 0x18
  return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x18;
}