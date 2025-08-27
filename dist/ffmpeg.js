
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var FFMessageType;
(function (FFMessageType) {
    FFMessageType["LOAD"] = "LOAD";
    FFMessageType["EXEC"] = "EXEC";
    FFMessageType["FFPROBE"] = "FFPROBE";
    FFMessageType["WRITE_FILE"] = "WRITE_FILE";
    FFMessageType["READ_FILE"] = "READ_FILE";
    FFMessageType["DELETE_FILE"] = "DELETE_FILE";
    FFMessageType["RENAME"] = "RENAME";
    FFMessageType["CREATE_DIR"] = "CREATE_DIR";
    FFMessageType["LIST_DIR"] = "LIST_DIR";
    FFMessageType["DELETE_DIR"] = "DELETE_DIR";
    FFMessageType["ERROR"] = "ERROR";
    FFMessageType["DOWNLOAD"] = "DOWNLOAD";
    FFMessageType["PROGRESS"] = "PROGRESS";
    FFMessageType["LOG"] = "LOG";
    FFMessageType["MOUNT"] = "MOUNT";
    FFMessageType["UNMOUNT"] = "UNMOUNT";
})(FFMessageType || (FFMessageType = {}));

/**
 * Generate an unique message ID.
 */
const getMessageID = (() => {
    let messageID = 0;
    return () => messageID++;
})();

const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_TERMINATED = new Error("called FFmpeg.terminate()");

/**
 * Provides APIs to interact with ffmpeg web worker.
 *
 * @example
 * ```ts
 * const ffmpeg = new FFmpeg();
 * ```
 */
class FFmpeg {
    #worker = null;
    /**
     * #resolves and #rejects tracks Promise resolves and rejects to
     * be called when we receive message from web worker.
     */
    #resolves = {};
    #rejects = {};
    #logEventCallbacks = [];
    #progressEventCallbacks = [];
    loaded = false;
    /**
     * register worker message event handlers.
     */
    #registerHandlers = () => {
        if (this.#worker) {
            this.#worker.onmessage = ({ data: { id, type, data }, }) => {
                switch (type) {
                    case FFMessageType.LOAD:
                        this.loaded = true;
                        this.#resolves[id](data);
                        break;
                    case FFMessageType.MOUNT:
                    case FFMessageType.UNMOUNT:
                    case FFMessageType.EXEC:
                    case FFMessageType.FFPROBE:
                    case FFMessageType.WRITE_FILE:
                    case FFMessageType.READ_FILE:
                    case FFMessageType.DELETE_FILE:
                    case FFMessageType.RENAME:
                    case FFMessageType.CREATE_DIR:
                    case FFMessageType.LIST_DIR:
                    case FFMessageType.DELETE_DIR:
                        this.#resolves[id](data);
                        break;
                    case FFMessageType.LOG:
                        this.#logEventCallbacks.forEach((f) => f(data));
                        break;
                    case FFMessageType.PROGRESS:
                        this.#progressEventCallbacks.forEach((f) => f(data));
                        break;
                    case FFMessageType.ERROR:
                        this.#rejects[id](data);
                        break;
                }
                delete this.#resolves[id];
                delete this.#rejects[id];
            };
        }
    };
    /**
     * Generic function to send messages to web worker.
     */
    #send = ({ type, data }, trans = [], signal) => {
        if (!this.#worker) {
            return Promise.reject(ERROR_NOT_LOADED);
        }
        return new Promise((resolve, reject) => {
            const id = getMessageID();
            this.#worker && this.#worker.postMessage({ id, type, data }, trans);
            this.#resolves[id] = resolve;
            this.#rejects[id] = reject;
            signal?.addEventListener("abort", () => {
                reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
            }, { once: true });
        });
    };
    on(event, callback) {
        if (event === "log") {
            this.#logEventCallbacks.push(callback);
        }
        else if (event === "progress") {
            this.#progressEventCallbacks.push(callback);
        }
    }
    off(event, callback) {
        if (event === "log") {
            this.#logEventCallbacks = this.#logEventCallbacks.filter((f) => f !== callback);
        }
        else if (event === "progress") {
            this.#progressEventCallbacks = this.#progressEventCallbacks.filter((f) => f !== callback);
        }
    }
    /**
     * Loads ffmpeg-core inside web worker. It is required to call this method first
     * as it initializes WebAssembly and other essential variables.
     *
     * @category FFmpeg
     * @returns `true` if ffmpeg core is loaded for the first time.
     */
    load = ({ classWorkerURL, ...config } = {}, { signal } = {}) => {
        if (!this.#worker) {
            this.#worker = classWorkerURL ?
                new Worker(new URL(classWorkerURL, import.meta.url), {
                    type: "module",
                }) :
                // We need to duplicated the code here to enable webpack
                // to bundle worekr.js here.
                new Worker(new URL("./worker.js", import.meta.url), {
                    type: "module",
                });
            this.#registerHandlers();
        }
        return this.#send({
            type: FFMessageType.LOAD,
            data: config,
        }, undefined, signal);
    };
    /**
     * Execute ffmpeg command.
     *
     * @remarks
     * To avoid common I/O issues, ["-nostdin", "-y"] are prepended to the args
     * by default.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * await ffmpeg.writeFile("video.avi", ...);
     * // ffmpeg -i video.avi video.mp4
     * await ffmpeg.exec(["-i", "video.avi", "video.mp4"]);
     * const data = ffmpeg.readFile("video.mp4");
     * ```
     *
     * @returns `0` if no error, `!= 0` if timeout (1) or error.
     * @category FFmpeg
     */
    exec = (
    /** ffmpeg command line args */
    args, 
    /**
     * milliseconds to wait before stopping the command execution.
     *
     * @defaultValue -1
     */
    timeout = -1, { signal } = {}) => this.#send({
        type: FFMessageType.EXEC,
        data: { args, timeout },
    }, undefined, signal);
    /**
     * Execute ffprobe command.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * await ffmpeg.writeFile("video.avi", ...);
     * // Getting duration of a video in seconds: ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.avi -o output.txt
     * await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "video.avi", "-o", "output.txt"]);
     * const data = ffmpeg.readFile("output.txt");
     * ```
     *
     * @returns `0` if no error, `!= 0` if timeout (1) or error.
     * @category FFmpeg
     */
    ffprobe = (
    /** ffprobe command line args */
    args, 
    /**
     * milliseconds to wait before stopping the command execution.
     *
     * @defaultValue -1
     */
    timeout = -1, { signal } = {}) => this.#send({
        type: FFMessageType.FFPROBE,
        data: { args, timeout },
    }, undefined, signal);
    /**
     * Terminate all ongoing API calls and terminate web worker.
     * `FFmpeg.load()` must be called again before calling any other APIs.
     *
     * @category FFmpeg
     */
    terminate = () => {
        const ids = Object.keys(this.#rejects);
        // rejects all incomplete Promises.
        for (const id of ids) {
            this.#rejects[id](ERROR_TERMINATED);
            delete this.#rejects[id];
            delete this.#resolves[id];
        }
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
            this.loaded = false;
        }
    };
    /**
     * Write data to ffmpeg.wasm.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * await ffmpeg.writeFile("video.avi", await fetchFile("../video.avi"));
     * await ffmpeg.writeFile("text.txt", "hello world");
     * ```
     *
     * @category File System
     */
    writeFile = (path, data, { signal } = {}) => {
        const trans = [];
        if (data instanceof Uint8Array) {
            trans.push(data.buffer);
        }
        return this.#send({
            type: FFMessageType.WRITE_FILE,
            data: { path, data },
        }, trans, signal);
    };
    mount = (fsType, options, mountPoint) => {
        const trans = [];
        return this.#send({
            type: FFMessageType.MOUNT,
            data: { fsType, options, mountPoint },
        }, trans);
    };
    unmount = (mountPoint) => {
        const trans = [];
        return this.#send({
            type: FFMessageType.UNMOUNT,
            data: { mountPoint },
        }, trans);
    };
    /**
     * Read data from ffmpeg.wasm.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * const data = await ffmpeg.readFile("video.mp4");
     * ```
     *
     * @category File System
     */
    readFile = (path, 
    /**
     * File content encoding, supports two encodings:
     * - utf8: read file as text file, return data in string type.
     * - binary: read file as binary file, return data in Uint8Array type.
     *
     * @defaultValue binary
     */
    encoding = "binary", { signal } = {}) => this.#send({
        type: FFMessageType.READ_FILE,
        data: { path, encoding },
    }, undefined, signal);
    /**
     * Delete a file.
     *
     * @category File System
     */
    deleteFile = (path, { signal } = {}) => this.#send({
        type: FFMessageType.DELETE_FILE,
        data: { path },
    }, undefined, signal);
    /**
     * Rename a file or directory.
     *
     * @category File System
     */
    rename = (oldPath, newPath, { signal } = {}) => this.#send({
        type: FFMessageType.RENAME,
        data: { oldPath, newPath },
    }, undefined, signal);
    /**
     * Create a directory.
     *
     * @category File System
     */
    createDir = (path, { signal } = {}) => this.#send({
        type: FFMessageType.CREATE_DIR,
        data: { path },
    }, undefined, signal);
    /**
     * List directory contents.
     *
     * @category File System
     */
    listDir = (path, { signal } = {}) => this.#send({
        type: FFMessageType.LIST_DIR,
        data: { path },
    }, undefined, signal);
    /**
     * Delete an empty directory.
     *
     * @category File System
     */
    deleteDir = (path, { signal } = {}) => this.#send({
        type: FFMessageType.DELETE_DIR,
        data: { path },
    }, undefined, signal);
}

var FFFSType;
(function (FFFSType) {
    FFFSType["MEMFS"] = "MEMFS";
    FFFSType["NODEFS"] = "NODEFS";
    FFFSType["NODERAWFS"] = "NODERAWFS";
    FFFSType["IDBFS"] = "IDBFS";
    FFFSType["WORKERFS"] = "WORKERFS";
    FFFSType["PROXYFS"] = "PROXYFS";
})(FFFSType || (FFFSType = {}));

const readFromBlobOrFile = (blob) => new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
        const { result } = fileReader;
        if (result instanceof ArrayBuffer) {
            resolve(new Uint8Array(result));
        }
        else {
            resolve(new Uint8Array());
        }
    };
    fileReader.onerror = (event) => {
        reject(Error(`File could not be read! Code=${event?.target?.error?.code || -1}`));
    };
    fileReader.readAsArrayBuffer(blob);
});
/**
 * An util function to fetch data from url string, base64, URL, File or Blob format.
 *
 * Examples:
 * ```ts
 * // URL
 * await fetchFile("http://localhost:3000/video.mp4");
 * // base64
 * await fetchFile("data:<type>;base64,wL2dvYWwgbW9yZ...");
 * // URL
 * await fetchFile(new URL("video.mp4", import.meta.url));
 * // File
 * fileInput.addEventListener('change', (e) => {
 *   await fetchFile(e.target.files[0]);
 * });
 * // Blob
 * const blob = new Blob(...);
 * await fetchFile(blob);
 * ```
 */
const fetchFile = async (file) => {
    let data;
    if (typeof file === "string") {
        /* From base64 format */
        if (/data:_data\/([a-zA-Z]*);base64,([^"]*)/.test(file)) {
            data = atob(file.split(",")[1])
                .split("")
                .map((c) => c.charCodeAt(0));
            /* From remote server/URL */
        }
        else {
            data = await (await fetch(file)).arrayBuffer();
        }
    }
    else if (file instanceof URL) {
        data = await (await fetch(file)).arrayBuffer();
    }
    else if (file instanceof File || file instanceof Blob) {
        data = await readFromBlobOrFile(file);
    }
    else {
        return new Uint8Array();
    }
    return new Uint8Array(data);
};

function blobToFile(blob, fileName = 'video.mp4') {
    // 使用 Blob 创建一个 File 对象
    return new File([blob], fileName, {type: blob.type});
}

const ffmpeg = new FFmpeg();

await ffmpeg.load({
    coreURL: '/ffmpeg/ffmpeg-core.js',
    wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    workerURL: '/ffmpeg/worker.js',
    classWorkerURL: '/ffmpeg/worker.js'
});

async function checkFileType(file) {
    const fileFFMPEG = await fetchFile(file);
    await ffmpeg.writeFile('input.mp4', fileFFMPEG);
    // 使用新版推荐命令格式
    await ffmpeg.ffprobe(["-v",
        "error",
        "-show_entries", 'stream=codec_name',
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        "-select_streams", "v:0", // 只选取视频流
        "input.mp4", "-o", "output.json"]);
    const uint8Array = await ffmpeg.readFile('output.json');
    return new TextDecoder().decode(uint8Array)
}

async function splitFile(file, options = {
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
        });
    }
    return result;
}

window.checkFileType = checkFileType;
window.splitFile = splitFile;

export { checkFileType, splitFile };
//# sourceMappingURL=ffmpeg.js.map
