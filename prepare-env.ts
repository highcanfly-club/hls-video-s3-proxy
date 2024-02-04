import fs from "fs";

console.log("Preparing environment...");

/*generate config.json file with s3 credentials*/
const s3conf = {
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    },
    endpoint: process.env.S3_ENDPOINT,
    expiration: process.env.S3_EXPIRATION,
    videoBucket: process.env.S3_VIDEO_BUCKET,
};

fs.writeFile(
    "./src/s3-config.json",
    JSON.stringify(s3conf),
    "utf8",
    function (err) {
        if (err) return console.log(err);
    }
);