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

      const csvOptions = {
            bom: true,
            // separator: ';'
        };

        bufferStream.pipe(csv(csvOptions))
          .on('data', (data) => {
            console.log('Parsed CSV row keys:', Object.keys(data));
            results.push(data)
          })
            .on('end', async () => {
                let validProductsToInsert = [];
                let errorLogs = [];
                let successCount = 0;
                let failureCount = 0;
                const requiredFields = ['title', 'description', 'price', 'category', 'campus', 'condition', 'ownerStudentId'];

                // 使用 for...of 循环来正确处理 async/await
                for (const [index, row] of results.entries()) {
                    const lineNumber = index + 2; // CSV行号从2开始 (1是表头)

                    // 1. 字段非空校验
                    let missingField = requiredFields.find(field => !row[field] || row[field].trim() === '');
                    if (missingField) {
                        errorLogs.push(`Line ${lineNumber}: Missing or empty required field "${missingField}".`);
                        failureCount++;
                        continue; // 跳过此行
                    }

                    try {
                        // 2. 查找发布者
                        const owner = await User.findOne({ studentId: row.ownerStudentId });
                        if (!owner) {
                            errorLogs.push(`Line ${lineNumber}: Owner with studentId "${row.ownerStudentId}" not found.`);
                            failureCount++;
                            continue; // 跳过此行
                        }

                        // 3. 准备待插入的数据
                        validProductsToInsert.push({
                            title: row.title,
                            description: row.description || '', // description 可选
                            price: Number(row.price),
                            category: row.category,
                            campus: row.campus,
                            condition: row.condition,
                            owner: owner._id, // 使用查找到的用户的 _id
                            // 导入的商品没有图片，可以后续让用户自己编辑添加
                        });
                        successCount++;

                    } catch (dbError) {
                        errorLogs.push(`Line ${lineNumber}: Database error - ${dbError.message}`);
                        failureCount++;
                    }
                }

                // 4. 批量插入所有有效数据
                if (validProductsToInsert.length > 0) {
                    try {
                        await Product.insertMany(validProductsToInsert, { ordered: false }); // ordered: false 允许部分成功
                    } catch (insertError) {
                        // insertMany 的错误比较复杂，这里简化处理
                        console.error("Bulk insert error:", insertError);
                        // 即使批量插入失败，也继续往下走，返回日志
                    }
                }
                
                // 5. 返回详细的导入报告
                res.status(200).send({
                    message: `Import process finished.`,
                    successCount: successCount,
                    failureCount: failureCount,
                    errors: errorLogs
                });
            });
  
      /*
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
      */
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
