# server-693
nau 693 项目作业, 服务端代码

** 测试运行: **
npm start

** 环境变量: **
.env
测试 MONGODB_URI 打开注释


** 发布时操作: **
index.js 打开下面的代码 (发布时注释)

// Set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});


** 服务器部署地址: **

https://vercel.com/jonathan-jis-projects/server-693-api/Ei5pa3VTv7VEUGJ7r4bNzb41APjf

** 设置管理员: **
https://server-693-api.vercel.app/api/setadmin?userId=admin&setadmin=1


