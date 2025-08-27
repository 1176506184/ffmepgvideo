export function blobToFile(blob, fileName = 'video.mp4') {
    // 使用 Blob 创建一个 File 对象
    return new File([blob], fileName, {type: blob.type});
}