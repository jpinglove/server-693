# server-693
nau 693 项目作业, 服务端代码

测试运行:
npm start

.env
测试 MONGODB_URI 打开注释


index.js 打开下面的代码 (发布时注释)

// Set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});


