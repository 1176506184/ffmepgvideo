import {FFmpeg} from "@ffmpeg/ffmpeg";
import {fetchFile} from "@ffmpeg/util";
import {blobToFile} from "./utils";

const ffmpeg = new FFmpeg();

await ffmpeg.load({
    coreURL: '/ffmpeg/ffmpeg-core.js',
    wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    workerURL: '/ffmpeg/worker.js',
    classWorkerURL: '/ffmpeg/worker.js'
});

export async function checkFileType(file) {
    const fileFFMPEG = await fetchFile(file);
    await ffmpeg.writeFile('input.mp4', fileFFMPEG);
    // 使用新版推荐命令格式
    await ffmpeg.ffprobe(["-v",
        "error",
        "-show_entries", 'stream=codec_name',
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        "-select_streams", "v:0", // 只选取视频流
        "input.mp4", "-o", "output.json"])
    const uint8Array = await ffmpeg.readFile('output.json')
    return new TextDecoder().decode(uint8Array)
}

export async function splitFile(file, options = {
    size: 60
}) {
    const fileType = file.type.split('/')[1];
    const fileExtension = file.name.split('.').pop() || fileType;
    const inputFileName = `input.${fileExtension}`;
    const result = [];
    const fileFFMPEG = await fetchFile(file);
    const fileSize = fileFFMPEG.byteLength;
    await ffmpeg.writeFile(inputFileName, fileFFMPEG);
    await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputFileName, "-o", "output.txt"]);
    const durationUnit8Array = await ffmpeg.readFile("output.txt");
    const duration = new TextDecoder().decode(durationUnit8Array);
    const targetSize = options.size * 1024 * 1024;
    const numSegments = Math.ceil(fileSize / targetSize);
    const segmentDuration = duration / numSegments;
    for (let i = 0; i < numSegments; i++) {
        const startTime = i * segmentDuration;
        const outputFileName = `segment_${i + 1}.mp4`;
        await ffmpeg.exec([
            '-i', inputFileName,
            '-ss', startTime.toString(),
            '-t', segmentDuration.toString(),
            '-c:v', 'copy',
            '-c:a', 'copy',
            outputFileName
        ]);
        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data.buffer], {type: 'video/mp4'});
        const blobSizeMB = (blob.size / (1024 * 1024)).toFixed(0) + 'MB';
        result.push({
            file: blobToFile(blob),
            size: blobSizeMB
        })
    }
    return result;
}

window.checkFileType = checkFileType;
window.splitFile = splitFile;