import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import {terser} from 'rollup-plugin-terser';
import serve from 'rollup-plugin-serve'; // 引入开发服务器插件
import livereload from 'rollup-plugin-livereload';

// 判断环境是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

export default {
    input: 'src/index.js', // 入口文件
    output: {
        file: 'dist/ffmpeg.js',
        format: 'es', // 适用于浏览器
        name: 'FFmpegWeb', // 全局变量名
    },
    plugins: [
        resolve(), // 解析 node_modules
        commonjs(), // 处理 CommonJS 模块
        isDev ? livereload() : null,
        isDev && serve({ // 如果是开发环境，则启动开发服务器
            open: true, // 启动后自动打开浏览器
            contentBase: '', // 指定开发服务器的根目录
            port: 3000, // 设置端口
            openPage: '/index.html'
        }),
        !isDev && terser(), // 如果是生产环境，则启用压缩
    ],
};
