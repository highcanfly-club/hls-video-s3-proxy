import { describe, expect, it, afterAll, beforeAll } from '@jest/globals';
import axios from 'axios';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import kill from 'tree-kill';

/**
 * isJpeg - Vérifie si le buffer est une image JPEG en regardant les deux premiers octets.
 * @param buffer 
 * @returns true si le buffer est une image JPEG, false sinon
 */
function isJpeg(buffer: Buffer): boolean {
  // Les fichiers JPEG commencent par les octets 0xFF, 0xD8
  return buffer[0] === 0xFF && buffer[1] === 0xD8;
}

/**
 * isM3u8 - Vérifie si le buffer est un fichier m3u8 en regardant les 7 premiers octets.
 * @param buffer
 * @returns true si le buffer est un fichier m3u8, false sinon
 */
function isM3u8(buffer: Buffer): boolean {
  // Les fichiers m3u8 commencent par les octets 0x23, 0x45, 0x58, 0x54, 0x4D, 0x33, 0x55
  // c'est à dire #EXTM3U
  return buffer[0] === 0x23 && buffer[1] === 0x45 && buffer[2] === 0x58 && buffer[3] === 0x54 && buffer[4] === 0x4D && buffer[5] === 0x33 && buffer[6] === 0x55;
}

/**
 * isMp4 - Vérifie si le buffer est un fichier mp4 en regardant les 3 premiers octets.
 * @param buffer
 * @returns true si le buffer est un fichier mp4, false sinon
 */
function isMp4(buffer: Buffer): boolean {
  // Les fichiers mp4 commencent par les octets 0x00, 0x00, 0x00, 0x18
  return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x18;
}

/**
 * isM4s - Vérifie si le buffer est un fichier m4s en regardant les 4 premiers octets.
 * @param buffer
 * @returns true si le buffer est un fichier m4s, false sinon
 */
function isM4s(buffer: Buffer): boolean {
  // Les fichiers m4s commencent par les octets 0x00, 0x00, 0x00, 0x18
  return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x18;
}

describe('Cloudflare Worker', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: ChildProcess;
  let port: string;

  beforeAll((done) => {
    worker = spawn('npx', ['wrangler', 'dev']);

    if (worker.stdout) {
      worker.stdout.on('data', (data: Buffer) => {
        const match = data.toString().match(/http:\/\/localhost:(\d+)/);
        if (match) {
          port = match[1];
          done();
        }
      });
    }
  }, 10000);

  afterAll((done) => {
    const pid = worker.pid;
    console.log(`Killing workerp id=${pid}...`);
    kill(worker.pid, 'SIGKILL', done);
  });

  it('should return a jpeg image for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isJpeg(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
  }, 5000);

  it('should return a valid m3u8 for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.m3u8', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.m3u8`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isM3u8(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-mpegURL');
  }, 5000);

  it('should return a Not found GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.txt', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.txt`, {
      responseType: 'arraybuffer',
      validateStatus: function (status) {
        return status >= 200 && status < 500; // default
      },
    });
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toBe('text/plain;charset=UTF-8');
  }, 5000);

  it('should return a valid mp4 for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.mp4', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.mp4`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isMp4(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('video/mp4');
  }, 5000);
  
  it('should return a valid m4s for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p0.m4s', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p0.m4s`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isM4s(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('video/iso.segment');
  }, 5000);

});