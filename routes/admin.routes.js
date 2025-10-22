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
    const fields = ['_id', 'studentId', 'nickname', 'isAdmin', 'reputation.good', 'reputation.neutral', 'reputation.bad', 'createdAt'];
    const opts = { fields, withBOM: true };
    const parser = new Parser(opts);
    const users = await User.find().select('-password').lean(); // 不导出密码

    if (users.length === 0) {
        return res.status(200).json({ message: 'No data to export.' });
    }

    const csv = parser.parse(users);
    res.header("Content-Type", "text/csv");
    res.attachment("all_users.csv");
    res.send(csv);
  });

  app.get('/api/admin/export/products', [verifyToken], async (req, res) => {
    const fields = [
        { label: '商品ID', value: '_id' },
        { label: '标题', value: 'title' },
        { label: '价格', value: 'price' },
        { label: '分类', value: 'category' },
        { label: '校区', value: 'campus' },
        { label: '新旧程度', value: 'condition' },
        { label: '状态', value: 'status' },
        { label: '浏览量', value: 'viewCount' },
        { label: '发布者', value: 'owner.nickname' }, // 支持嵌套路径
        { label: '发布时间', value: 'createdAt' }
    ];
    const opts = { fields, withBOM: true };
    const parser = new Parser(opts);
    // 使用 populate 获取 owner 的昵称
    const products = await Product.find().populate({
                    path: 'owner',
                    select: 'nickname'
                }).select('-image').lean();
    if (products.length === 0) {
        return res.status(200).json({ message: 'No data to export.' });
    }
    
    const csvData = parser.parse(products);
    res.header('Content-Type', 'text/csv');
    res.attachment('all_products.csv');
    res.send(csvData);
});

  app.get('/api/admin/export/orders', [verifyToken], async (req, res) => {
  const fields = [
        { label: '订单ID', value: '_id' },
        { label: '商品标题', value: 'product.title' },
        { label: '成交价格', value: 'price' },
        { label: '卖家', value: 'seller.nickname' },
        { label: '成交日期', value: 'transactionDate' }
    ];
    const opts = { fields, withBOM: true };
    const parser = new Parser(opts);
    const orders = await Order.find().populate({
                    path: 'seller',
                    select: 'nickname'
                }).populate('product', 'title').lean();
    if (orders.length === 0) {
        return res.status(200).json({ message: 'No data to export.' });
    }
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

};
