## 引入方式

````
 <script type="module" src="dist/ffmpeg.js"></script>
 对应的ffmpeg目录也放到根目录，或者自行打包修改目录
````

## 使用方式

## 检测视频格式

````
<input type="file" onchange="checkType(this.files[0])">
<script>
    async function checkType(e){
       const fileType = await checkFileType(e);
       //h264或hevc等等
    }
</script>
````

## 视频分片

````
<input type="file" onchange="split(this.files[0])">
<script>
    async function split(e) {
       const result = await splitFile(e, {
            size: 60 //分片大小 单位MB 默认60MB
       });
       //格式为[{file,size}]
    }
</script>
````