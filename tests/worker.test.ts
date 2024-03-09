import { describe, expect, it, afterAll, beforeAll } from '@jest/globals';
import axios from 'axios';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import kill from 'tree-kill';
import { getSignedM3u8, isJpeg, isM3u8, isM4s, isMp4 } from './tests-helpers';
import CryptoJS from "crypto-js";

describe('Cloudflare Worker', () => {
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

  it('should return a valid jpeg image for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isJpeg(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
  }, 3000);

  it('should return a 304 response if etag is valid for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const etag = CryptoJS.MD5(CryptoJS.lib.WordArray.create(buffer)).toString();
    // Rerun the request and provide the etag to check if the response is 304
    const response2 = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.jpg`, {
      headers: { 'If-None-Match': etag },
      validateStatus: function (status) {
        return status >= 200 && status < 305; // default
      },
    });
    expect(response2.status).toBe(304);
  }, 3000);

  it('should return a valid m3u8 for GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.m3u8', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_136p.m3u8`, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    expect(isM3u8(buffer)).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-mpegURL');
  }, 3000);

  it('should return a Not found GET /lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.txt', async () => {
    const response = await axios.get(`http://localhost:${port}/lesailesdumontblanc-videos/admb-v1.mov/admb-v1.mov_poster.txt`, {
      responseType: 'arraybuffer',
      validateStatus: function (status) {
        return status >= 200 && status < 500; // default
      },
    });
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toBe('text/plain;charset=UTF-8');
  }, 3000);

  it('should return a valid mp4 for the map URI in the m3u8', async () => {
    const parsed = await getSignedM3u8(port);
    const uri = parsed.segments[0].map.uri;
    const response2 = await axios.get(`${uri}`, { responseType: 'arraybuffer' });
    const buffer2 = Buffer.from(response2.data, 'binary');
    expect(isMp4(buffer2)).toBe(true);
    expect(response2.status).toBe(200);
    expect(response2.headers['content-type']).toBe('video/mp4');
  }, 3000);

  it('should return a valid m4s for the first URI in the m3u8', async () => {
    const parsed = await getSignedM3u8(port);
    const uri = parsed.segments[0].uri;
    const response2 = await axios.get(`${uri}`, { responseType: 'arraybuffer' });
    const buffer2 = Buffer.from(response2.data, 'binary');
    expect(isM4s(buffer2)).toBe(true);
    expect(response2.status).toBe(200);
    expect(response2.headers['content-type']).toBe('video/iso.segment');
  }, 3000);

});
