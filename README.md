# Typing Everywhere

一个非侵入式的 Tampermonkey 打字练习脚本。它会在普通网页右上角显示一个可拖动、可吸附的入口图标，允许你从任意语义文本段开始连续练习，并在右下角实时显示 `WPM`、`CPM` 和错误率。

## 安装

1. 安装 Tampermonkey。
2. 在项目目录运行 `npm install`。
3. 运行 `npm run build` 生成 [dist/typing-everywhere.user.js](/Users/mingday/myWeb/typing-everywhere/dist/typing-everywhere.user.js)。
4. 在 Tampermonkey 中安装生成的 userscript。

## 开发

- `npm test`：运行测试
- `npm run test:coverage`：运行覆盖率门禁
- `npm run lint`：运行 ESLint
- `npm run build`：构建单文件 userscript
- `npm run verify`：执行完整质量门禁

## 使用

拖动右上角图标可以调整位置。点击图标后，选择一个完整文本段作为起点并直接开始输入。脚本不会修改原文 DOM，只会在右下角显示实时统计。按 `Esc` 退出打字模式。

## 限制

不支持浏览器内部页面、Chrome Web Store、浏览器 PDF、Canvas 文本和跨域 iframe。
