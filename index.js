require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mongooseOptions = {
    serverSelectionTimeoutMS: 30000, // 将服务器选择超时时间从10秒增加到30秒
    socketTimeoutMS: 45000, // 将套接字超时时间增加到45秒
};

// Database Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Successfully connected to MongoDB."))
  .catch((err) => console.error("Connection error", err));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Campus Trade API." });
});

require("./routes/auth.routes")(app);
require("./routes/product.routes")(app);

// 将 'app.listen' 部分移除，并导出 app
// Vercel 会处理监听，只需要导出 express 应用实例
// Vercel 部署专用
module.exports = app;

// 发布时把下面的listen注掉
// Set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

