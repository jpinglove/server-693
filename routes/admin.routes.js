const { Parser } = require("json2csv");
const csv = require("csv-parser");
const stream = require("stream");
const { verifyToken } = require("../middleware/authJwt"); // 假设 管理员验证中间件 isAdmin
const Product = require("../models/product.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const upload = require("multer")(); // 使用 multer 处理导入的文件

module.exports = function (app) {
  // 导出用户
  app.get("/api/admin/export/users", [verifyToken], async (req, res) => {
    const users = await User.find().select('-password').lean(); // 不导出密码
    const parser = new Parser();
    const csv = parser.parse(users);
    res.header("Content-Type", "text/csv");
    res.attachment("all_users.csv");
    res.send(csv);
  });

  app.get('/api/admin/export/products', [verifyToken], async (req, res) => {
    // 使用 populate 获取 owner 的昵称
    const products = await Product.find().populate('owner', 'nickname').select('-image').lean();
    const parser = new Parser();
    const csvData = parser.parse(products);
    res.header('Content-Type', 'text/csv');
    res.attachment('all_products.csv');
    res.send(csvData);
});

app.get('/api/admin/export/orders', [verifyToken], async (req, res) => {
    const orders = await Order.find().populate('seller', 'nickname').populate('product', 'title').lean();
    const parser = new Parser();
    const csvData = parser.parse(orders);
    res.header('Content-Type', 'text/csv');
    res.attachment('all_orders.csv');
    res.send(csvData);
});
  
  // 导入商品
  app.post(
    "/api/admin/import/products",
    [verifyToken, upload.single("file")],
    (req, res) => {
      const results = [];
      const bufferStream = new stream.PassThrough();
      bufferStream.end(req.file.buffer);

      bufferStream
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", async () => {
          try {
            // 假设CSV列名和Model字段名一致
            await Product.insertMany(results);
            res.status(201).send({
              message: `${results.length} products imported successfully.`,
            });
          } catch (error) {
            res.status(500).send({ message: error.message });
          }
        });
    }
  );

  // 每日发布量统计
  app.get("/api/admin/stats/daily-posts", [verifyToken], async (req, res) => {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.status(200).send(stats);
  });

  // 热门分类统计
  app.get(
    "/api/admin/stats/hot-categories",
    [verifyToken],
    async (req, res) => {
      const stats = await Product.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      res.status(200).send(stats);
    }
  );
};
