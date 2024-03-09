import fs from "fs";
import { gitlogPromise, GitlogOptions } from "gitlog";
import type { S3Config } from "./src/index.js";

console.log("Preparing environment...");

const commits = await gitlogPromise({
    repo: ".",
    number: 1,
    fields: ["authorDate"],
  } as GitlogOptions);
  
  const commit = {
    date: new Date(commits[0].authorDate),
  };
  
  fs.writeFile(
    "./src/git-config.json",
    JSON.stringify(commit),
    "utf8",
    function (err) {
      if (err) return console.log(err);
    }
  );

/*generate config.json file with s3 credentials*/
if (
    !process.env.S3_SECRET_KEY ||
    !process.env.S3_REGION ||
    !process.env.S3_ACCESS_KEY ||
    !process.env.S3_SECRET_KEY ||
    !process.env.S3_ENDPOINT ||
    !process.env.S3_EXPIRATION ||
    !process.env.S3_VIDEO_BUCKET
) {
    console.error("Missing S3 configuration");
    process.exit(1);
}

const s3Regions = process.env.S3_REGION.split(",");
const s3Secrets = process.env.S3_SECRET_KEY.split(",");
const s3Endpoints = process.env.S3_ENDPOINT.split(",");
const videoBuckets = process.env.S3_VIDEO_BUCKET.split(",");
const s3AccessKeys = process.env.S3_ACCESS_KEY.split(",");
const s3Expirations = process.env.S3_EXPIRATION.split(",");

const s3confs = [] as S3Config[];
const arrays = [s3Regions, s3AccessKeys, s3Secrets, s3Endpoints, videoBuckets, s3Expirations];
const allSameLength = arrays.every(arr => arr.length === arrays[0].length);
const allNonEmpty = arrays.every(arr => arr.length > 0);
if (!allSameLength) {
    console.error("Invalid S3 configuration all arrays must be the same length.");
    arrays.forEach((arr, i) => {
        console.error(`Array ${i} length: ${arr.length}`);
    });
    process.exit(1);
}

for (let i = 0; i < s3Regions.length; i++) {
    if (!allNonEmpty) {
        console.error("Invalid S3 configuration all arrays must be non-empty.");
        process.exit(1);
    }
    const s3conf = {
        region: s3Regions[i],
        credentials: {
            accessKeyId: s3AccessKeys[i],
            secretAccessKey: s3Secrets[i],
        },
        endpoint: s3Endpoints[i],
        expiration: s3Expirations[i],
        videoBucket: videoBuckets[i],
    } as S3Config;
    s3confs.push(s3conf);
}


fs.writeFile(
    "./src/s3-config.json",
    JSON.stringify(s3confs, null, 2),
    "utf8",
    function (err) {
        if (err) return console.log(err);
    }
);