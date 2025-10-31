const { Parser } = require("json2csv");
// const csv = require("csv-parser");
// const stream = require("stream");
const { verifyToken } = require("../middleware/authJwt"); // 假设管理员验证为 isAdmin
const Product = require("../models/product.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
// const upload = require("multer")(); // 使用 multer 处理导入的文件

module.exports = function (app) {
  // 导出用户
  app.get("/api/admin/export/users", [verifyToken], async (req, res) => {
    const fields = ['_id', 'studentId', 'nickname', 'isAdmin', 'reputation.good', 'reputation.neutral', 'reputation.bad', 'createdAt'];
    const opts = { fields, withBOM: true };
    const parser = new Parser(opts);
    const users = await User.find().select('-password').lean(); // 不导出密码

    if (users.length === 0) {
        return res.status(200).json({ message: '没有数据可导出.' });
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
        { label: '发布者', value: 'owner.nickname' },
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
        return res.status(200).json({ message: '没有数据可导出.' });
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
        return res.status(200).json({ message: '没有数据可导出.' });
    }
    const csvData = parser.parse(orders);
    res.header('Content-Type', 'text/csv');
    res.attachment('all_orders.csv');
    res.send(csvData);
});


  // 每日发布量统计
    app.get("/api/admin/stats/daily-posts", [verifyToken], async (req, res) => {
        try {
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
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: "获取每日发布量统计失败." });
        }
    });

    // 每日交易量
    app.get('/api/admin/stats/daily-transactions', [verifyToken], async (req, res) => {
        try {
            const stats = await Order.aggregate([
                // 按 "年-月-日" 对 transactionDate 分组，并计算每组的数量
                { 
                    $group: { 
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } }, 
                        count: { $sum: 1 } 
                    } 
                },
                // 按日期升序排列结果
                { 
                    $sort: { _id: 1 } 
                }
            ]);
            res.status(200).send(stats);
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: '获取每日交易量统计失败.' });
        }
    });

    // 热门分类销售统计
    app.get('/api/admin/stats/hot-categories-sales', [verifyToken], async (req, res) => {
        try {
            const stats = await Order.aggregate([
                // 使用 $lookup 关联 products 集合
                // 将 orders 集合中的 product 字段（ID）与 products 集合中的 _id 字段进行匹配
                {
                    $lookup: {
                        from: 'products', // products 集合的名称 (通常是复数)
                        localField: 'product',
                        foreignField: '_id',
                        as: 'productDetails' // 关联查询的结果存入 productDetails 数组
                    }
                },
                // 使用 $unwind 解构 productDetails 数组
                // 因为一个订单只对应一个商品，所以这个数组只有一个元素
                {
                    $unwind: '$productDetails'
                },
                // 按商品的分类 (category) 进行分组，并计算每个分组的数量
                {
                    $group: {
                        _id: '$productDetails.category', // 按商品分类进行分组
                        count: { $sum: 1 } // 计算每个分类的销售量
                    }
                },
                //按销售量降序排列
                {
                    $sort: { count: -1 }
                }
            ]);
            res.status(200).send(stats);
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: '统计热门分类失败.' });
        }
    });

    // 设置/取消管理员权限
    app.get('/api/setadmin', async (req, res) => {
        console.log(JSON.stringify(req.query))
        
        const { userId, setadmin, secretKey } = req.query;

        // 验证参数是否存在
        if (!userId || !setadmin) {
            return res.status(400).send({ message: '缺少参数.' });
        }

        // 验证 setadmin '0' 或 '1'
        if (setadmin !== '0' && setadmin !== '1') {
            return res.status(400).send({ message: 'setadmin 参数必须是 0 或 1.' });
        }
        const isAdminStatus = setadmin === '1'; // 如果是 '1' 则为 true, 否则为 false

        console.log("isAdminStatus =", isAdminStatus)

        try {
            // 更新用户
            const updatedUser = await User.findOneAndUpdate(
                { studentId: userId }, // 用户id 
                { $set: { isAdmin: isAdminStatus } }, // 更新的操作
                { new: true }
            );

            // 检查用户是否存在
            if (!updatedUser) {
                return res.status(404).send({ message: `ID为 "${userId}" 用户的信息不存在.` });
            }

            // 返回成功响应
            res.status(200).send({
                message: '用户管理员权限设置成功.',
                user: {
                    _id: updatedUser._id,
                    studentId: updatedUser.studentId,
                    nickname: updatedUser.nickname,
                    isAdmin: updatedUser.isAdmin
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).send({ message: '服务器内部错误.' });
        }
    });
};
