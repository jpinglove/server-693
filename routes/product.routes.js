const { Parser } = require("json2csv");
const csv = require("csv-parser");
const stream = require("stream");
const multer = require("multer");
const { verifyToken } = require("../middleware/authJwt");
const Product = require("../models/product.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");

// Multer 配置: 使用内存存储，把文件转成Buffer存入DB
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = function (app) {
  // 获取单个商品详情
  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id)
        .select("-image")
        .populate("owner", "nickname reputation")
        .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'nickname'
                },
                options: {
                    sort: { 'createdAt': -1 } // 按创建时间降序排列
                }
        });
      if (!product) {
        return res.status(404).send({ message: "商品未找到." });
      }
      res.status(200).send(product);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 用于获取图片的接口
  app.get("/api/products/:id/image", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product || !product.image.data) {
        return res.status(404).send({ message: "图片未找到." });
      }
      res.set("Content-Type", product.image.contentType);
      res.send(product.image.data);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 修改商品状态/ 下架商品
  app.put("/api/products/:id/status", [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).send({ message: "商品不存在." });
      }
      // 当前用户是否是商品所有者
      if (product.owner.toString() !== req.userId) {
        return res.status(403).send({
          message: "你不是商品的发布者.",
        });
      }
      product.status = req.body.status;
      await product.save();
      res.status(200).send({ message: "商品状态更新成功." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 发布新商品
  // 使用 multer 中间件来处理 'imageFile' 字段的单个文件上传
  app.post(
    "/api/products",
    [verifyToken, upload.single("imageFile")],
    async (req, res) => {
      // 验证文件是否存在
      if (!req.file) {
        return res.status(400).send({ message: "未上传商品图片" });
      }

      try {
        const product = new Product({
          title: req.body.title,
          description: req.body.description,
          price: req.body.price,
          category: req.body.category,
          owner: req.userId,
          campus: req.body.campus,
          condition: req.body.condition,
          image: {
            data: req.file.buffer, // 文件数据
            contentType: req.file.mimetype, // 文件类型
          },
        });
        
        await product.save();
        res.status(201).send({ message: "商品创建成功." });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    }
  );

  // 留言
  app.post("/api/products/:id/comments", [verifyToken], async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      const product = await Product.findById(req.params.id);
      product.comments.push({
        user: req.userId,
        nickname: user.nickname,
        content: req.body.content,
      });
      await product.save();
      res.status(201).send(product.comments);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 收藏
  app.post("/api/products/:id/favorite", [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      const index = product.favoritedBy.indexOf(req.userId);
      if (index > -1) {
        product.favoritedBy.splice(index, 1);
      } else {
        product.favoritedBy.push(req.userId);
      }
      await product.save();
      res.status(200).send({ favoritedCount: product.favoritedBy.length });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 评价
  app.post("/api/users/:id/evaluate", [verifyToken], async (req, res) => {
    try {
      const { type } = req.body;
      const userToEvaluate = await User.findById(req.params.id);
      if (type in userToEvaluate.reputation) {
        userToEvaluate.reputation[type]++;
      }
      await userToEvaluate.save();
      res.status(200).send({ message: "评价提交成功." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 获取用户收藏的商品列表
  app.get("/api/user/favorites", [verifyToken], async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      // 找到 favoritedBy 数组包含当前用户ID的商品
      const products = await Product.find({ favoritedBy: user._id }).select(
        "-image"
      );
      res.status(200).send(products);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 获取用户发布的商品列表
  app.get("/api/user/publications", [verifyToken], async (req, res) => {
    try {
      // 找到所有 owner 是当前用户ID的商品
      const products = await Product.find({ owner: req.userId })
        .select("-image")
        .sort({ createdAt: -1 });
      res.status(200).send(products);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 更新商品信息接口
  const updateProductLogic = async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).send({ message: "商品不存在." });
      }
      if (product.owner.toString() !== req.userId) {
        return res.status(403).send({
          message: "你不是商品的发布者.",
        });
      }

      product.title = req.body.title;
      product.description = req.body.description;
      product.price = req.body.price;
      product.category = req.body.category;

      if (req.file) {
        product.image.data = req.file.buffer;
        product.image.contentType = req.file.mimetype;
      }

      await product.save();
      res.status(200).send({ message: "商品更新成功." });
    } catch (error) {
      console.error("错误信息:", error);
      res.status(500).send({ message: error.message });
    }
  };

  // 更新商品信息接口
  app.put(
    "/api/products/:id",
    [verifyToken, upload.single("imageFile")],
    updateProductLogic
  );

  app.post(
    "/api/products/:id",
    [verifyToken, upload.single("imageFile")],
    updateProductLogic
  );

  // 获取所有商品
  app.get("/api/products", async (req, res) => {
    const {
      category,
      search,
      campus,
      condition,
      priceMin,
      priceMax,
      sortBy,
      sortOrder,
    } = req.query;
    let query = { status: "selling" };

    // 筛选条件
    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: "i" };
    if (campus) query.campus = campus;
    if (condition) query.condition = condition;
    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = Number(priceMin);
      if (priceMax) query.price.$lte = Number(priceMax);
    }

    // 排序
    let sort = { createdAt: -1 }; // 按创建时间降序
    if (sortBy) {
      sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    }

    try {
      const products = await Product.find(query)
        .select("-image")
        .populate("owner", "nickname")
        .sort(sort);
      
      res.status(200).send(products);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 增加商品浏览量
  app.put("/api/products/:id/view", [verifyToken], async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.userId;

        // 增加商品浏览量
        await Product.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } });
        
        // 更新用户浏览记录
        // 拉取商品的旧记录
        await User.findByIdAndUpdate(userId, {
            $pull: { viewHistory: { product: productId } }
        });

        // 在数组的开头插入一条新记录
        await User.findByIdAndUpdate(userId, {
            $push: {
                viewHistory: {
                    $each: [{ product: productId, viewedAt: new Date() }],
                    $position: 0 // 插入到数组的最前面
                }
            }
        });

        res.status(200).send({ message: '增加浏览量成功.' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: error.message });
    }
  });

  // 修改商品状态/下架 接口 - 增加创建订单的逻辑
  app.put("/api/products/:id/status", [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product)
        return res.status(404).send({ message: "商品不存在." });
      if (product.owner.toString() !== req.userId)
        return res.status(403).send({ message: "您不是商品的发布者." });

      product.status = "sold";
      await product.save();

      // 创建一条订单交易记录
      const order = new Order({
        product: product._id,
        seller: product.owner,
        price: product.price,
      });
      await order.save();

      res
        .status(200)
        .send({ message: "商品状态更新成功." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

    // 卖出商品并创建订单
    app.post("/api/products/:id/sell", [verifyToken], async (req, res) => {
      try {
        const product = await Product.findById(req.params.id);
        if (!product) {
          return res.status(404).send({ message: "商品不存在." });
        }
        // 验证当前用户是否是商品所有者
        if (product.owner.toString() !== req.userId) {
          return res.status(403).send({ message: "您不是商品的发布者." });
        }
        // 防止重复卖出
        if (product.status === 'sold') {
          return res.status(400).send({ message: "商品已经卖出." });
        }
        // 商品状态更新为 "sold"
        product.status = "sold";
        await product.save();

        // 创建订单交易记录
        const order = new Order({
          product: product._id,
          seller: product.owner,
          // userId: req.userId,
          price: product.price,
          // transactionDate 字段使用默认的当前时间
        });
        await order.save();

        res.status(200).send({ message: "商品卖出成功." });

      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // 获取用户订单记录
    app.get("/api/user/orders", [verifyToken], async (req, res) => {
      try {
        const orders = await Order.find({ seller: req.userId }).populate(
          "product"
        );
        res.status(200).send(orders);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // 获取用户浏览记录
    app.get("/api/user/view-history", [verifyToken], async (req, res) => {
      try {
          const page = parseInt(req.query.page, 10) || 1;
          const limit = parseInt(req.query.limit, 10) || 10;
          const skip = (page - 1) * limit;

          const user = await User.findById(req.userId)
              .populate({
                  path: 'viewHistory.product',
                  select: '-image', // 不加载图片
                  // 获取发布者昵称
                  populate: {
                      path: 'owner',
                      select: 'nickname'
                  }
              })
              .select('viewHistory'); // 只选择 viewHistory 字段

          if (!user || !user.viewHistory) {
              return res.status(200).send({
                  history: [],
                  total: 0,
                  page: 1,
                  pages: 1
              });
          }

          // 浏览记录数组默认就是按最新浏览排序的
          const total = user.viewHistory.length;
          const historySlice = user.viewHistory.slice(skip, skip + limit);
          
          res.status(200).send({
              history: historySlice,
              total: total,
              page: page,
              pages: Math.ceil(total / limit)
          });

      } catch (error) {
          res.status(500).send({ message: error.message });
      }
    });

    // 普通用户导出自己的发布列表
    app.get('/api/user/export/publications', [verifyToken], async (req, res) => {
      try {
        console.log('[DEBUG] Exporting publications for user:', req.userId);
        
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
        
        const products = await Product.find({ owner: req.userId }).populate({
          path: 'owner',
          select: 'nickname'
        }).select('-image').lean();
        if (products.length === 0) {
          return res.status(200).json({ message: '没有数据可导出.' });
        }
        const csvData = parser.parse(products);
        res.header('Content-Type', 'text/csv');
        res.attachment('my_publications.csv');
        res.send(csvData);
      } catch (error) {
        console.error(error);
        
        res.status(500).send({ message: error.message });
      }
    });

    // 普通用户导出自己的订单列表
    app.get('/api/user/export/orders', [verifyToken], async (req, res) => {
      try {
        const orders = await Order.find({ seller: req.userId })
          .populate('seller', 'nickname')
          .populate('product', 'title').lean();
        const fields = [
          { label: '订单ID', value: '_id' },
          { label: '商品标题', value: 'product.title' },
          { label: '成交价格', value: 'price' },
          { label: '卖家', value: 'seller.nickname' },
          { label: '成交日期', value: 'transactionDate' }
        ];
        const opts = { fields, withBOM: true };
        const parser = new Parser(opts);
        if (orders.length === 0) {
          return res.status(200).json({ message: '没有数据可导出.' });
        }
        const csvData = parser.parse(orders);
        res.header('Content-Type', 'text/csv');
        res.attachment('my_orders.csv');
        res.send(csvData);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // 普通用户导出自己的收藏列表
    app.get('/api/user/export/favorites', [verifyToken], async (req, res) => {
      try {
        const user = await User.findById(req.userId);
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
        const products = await Product.find({ favoritedBy: req.userId }).populate({
          path: 'owner',
          select: 'nickname'
        }).select('-image').lean();
        if (products.length === 0) {
          return res.status(200).json({ message: 'No data to export.' });
        }
        const csvData = parser.parse(products);
        res.header('Content-Type', 'text/csv');
        res.attachment('my_favorites.csv');
        res.send(csvData);
      } catch (error) {
        res.status(500).send({ message: '服务器内部错误.' });
      }
    });

  
    // 导入商品
    app.post(
      "/api/user/import/products",
      [verifyToken, upload.single("file")],
      (req, res) => {
        const results = [];
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const csvOptions = {
          bom: true,
          mapHeaders: ({ header, index }) => header.trim().replace(/\uFEFF/g, '')
        };
              
        bufferStream.pipe(csv(csvOptions))
          .on('data', (data) => {
            console.log('检查导入数据字段:', Object.keys(data));
            results.push(data)
          })
          .on('end', async () => {
            let validProductsToInsert = [];
            let errorLogs = [];
            let successCount = 0;
            let failureCount = 0;
            const requiredFields = ['title', 'price', 'category', 'campus', 'condition'];

            // 使用 循环来处理
            for (const [index, row] of results.entries()) {
              const lineNumber = index + 2; // CSV行号从2开始 , 1是表头

              // 字段非空校验
              let missingField = requiredFields.find(field => !row[field] || row[field].trim() === '');
              if (missingField) {
                errorLogs.push(`Line ${lineNumber}: Missing or empty required field "${missingField}".`);
                failureCount++;
                continue; // 跳过此行
              }

              try {
                // 准备插入的数据
                validProductsToInsert.push({
                  title: row.title,
                  description: row.description || '', // description 可选
                  price: Number(row.price),
                  category: row.category,
                  campus: row.campus,
                  condition: row.condition,
                  owner: req.userId, // 使用查找到的用户的 id 作这 owner
                  // 导入的商品没有图片，后续让用户自己编辑添加
                });
                successCount++;

              } catch (dbError) {
                errorLogs.push(`Line ${lineNumber}: Database error - ${dbError.message}`);
                failureCount++;
              }
            }

            // 插入有效数据
            if (validProductsToInsert.length > 0) {
              try {
                await Product.insertMany(validProductsToInsert, { ordered: false });
              } catch (insertError) {
                console.error(insertError);
              }
            }
                
            // 返回详细的导入报告
            res.status(200).send({
              message: `导入完成.`,
              successCount: successCount,
              failureCount: failureCount,
              errors: errorLogs
            });
          });
      }
    );

  
    // 对已售出商品的卖家评价
    app.post('/api/products/:id/evaluate', [verifyToken], async (req, res) => {
        try {
            const { type } = req.body; // 'good', 'neutral', 'bad'
            const productId = req.params.id;
            const evaluatorId = req.userId; // 当前评价者ID

            // 评价类型是否合法
            if (!['good', 'neutral', 'bad'].includes(type)) {
                return res.status(400).send({ message: '无效评价类型.' });
            }

            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).send({ message: '商品不存在.' });
            }

            if (product.status !== 'sold') {
                return res.status(400).send({ message: '只能对已售出商品进行评价.' });
            }
            if (product.owner.toString() === evaluatorId) {
                return res.status(403).send({ message: '不能给自己评价.' });
            }
            if (product.evaluatedBy.includes(evaluatorId)) {
                return res.status(400).send({ message: '你已经评价过此商品.' });
            }

            // 更新卖家的信誉计数,$inc 原子操作
            const updateQuery = { $inc: { [`reputation.${type}`]: 1 } };
            await User.findByIdAndUpdate(product.owner, updateQuery);

            // 将评价者ID记录到商品中
            product.evaluatedBy.push(evaluatorId);
            await product.save();

            res.status(200).send({ message: '评价成功提交.' });

        } catch (error) {
            console.error(error);
            res.status(500).send({ message: '服务器内部错误.' });
        }
    });
  
  };

