const { Parser } = require("json2csv");
const multer = require("multer");
const { verifyToken } = require("../middleware/authJwt");
const Product = require("../models/product.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");

// Multer 配置: 使用内存存储，把文件转成Buffer存入DB
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = function (app) {
  // 获取所有商品
  // 不再返回image数据，因为列表页不需要那么大的数据量
  app.get("/api/products", async (req, res) => {
    const { category, search } = req.query;
    // 默认查询条件增加了 status: 'selling'
    let query = { status: "selling" };
    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: "i" };

    try {
      // .select('-image') 表示查询结果中不包含 image 字段
      console.log("[DEBUG] Product query:", JSON.stringify(query));
      
      const products = await Product.find(query)
        .select("-image")
        .populate("owner", "nickname")
        .sort({ createdAt: -1 });
      res.status(200).send(products);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 获取单个商品详情 - 同样不直接返回图片数据
  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id)
        .select("-image")
        .populate("owner", "nickname reputation");
      res.status(200).send(product);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 专门用于获取图片的路由
  app.get("/api/products/:id/image", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product || !product.image.data) {
        return res.status(404).send({ message: "Image not found." });
      }
      res.set("Content-Type", product.image.contentType);
      res.send(product.image.data);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 修改商品状态（下架）接口
  app.put("/api/products/:id/status", [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).send({ message: "Product not found." });
      }
      // 验证当前用户是否是商品所有者
      if (product.owner.toString() !== req.userId) {
        return res.status(403).send({
          message: "Forbidden: You are not the owner of this product.",
        });
      }
      product.status = req.body.status; // 期望前端传来 'sold'
      await product.save();
      res.status(200).send({ message: "Product status updated successfully." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 发布新商品 (需要登录)
  // 使用 multer 中间件来处理 'imageFile' 字段的单个文件上传
  app.post(
    "/api/products",
    [verifyToken, upload.single("imageFile")],
    async (req, res) => {
      // 验证文件是否存在
      if (!req.file) {
        return res.status(400).send({ message: "No image file uploaded." });
      }

      try {
        const product = new Product({
          title: req.body.title,
          description: req.body.description,
          price: req.body.price,
          category: req.body.category,
          owner: req.userId,
          image: {
            data: req.file.buffer, // 文件数据
            contentType: req.file.mimetype, // 文件类型
          },
        });
        await product.save();
        res.status(201).send({ message: "Product created successfully." });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    }
  );

  // ... (添加留言、收藏、评价用户的路由保持不变) ...
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

  app.post("/api/users/:id/evaluate", [verifyToken], async (req, res) => {
    try {
      const { type } = req.body;
      const userToEvaluate = await User.findById(req.params.id);
      if (type in userToEvaluate.reputation) {
        userToEvaluate.reputation[type]++;
      }
      await userToEvaluate.save();
      res.status(200).send({ message: "Evaluation submitted successfully." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 获取用户收藏的商品列表
  app.get("/api/user/favorites", [verifyToken], async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      // 找到所有 favoritedBy 数组包含当前用户ID的商品
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
        return res.status(404).send({ message: "Product not found." });
      }
      if (product.owner.toString() !== req.userId) {
        return res.status(403).send({
          message: "Forbidden: You are not the owner of this product.",
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
      res.status(200).send({ message: "Product updated successfully." });
    } catch (error) {
      console.error("[ERROR in product update]", error);
      res.status(500).send({ message: error.message });
    }
  };

  // 更新商品信息接口 (用于不带图片的更新)
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

  // 获取所有商品 - 支持排序和筛选
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

    // 排序条件
    let sort = { createdAt: -1 }; // 默认按创建时间降序
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
      // 使用 $inc 原子操作增加浏览量
      await Product.findByIdAndUpdate(req.params.id, {
        $inc: { viewCount: 1 },
      });
      // 使用 $addToSet 将商品ID加入用户浏览记录，避免重复
      await User.findByIdAndUpdate(req.userId, {
        $addToSet: { viewHistory: req.params.id },
      });
      res.status(200).send({ message: "View count updated." });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 修改商品状态（下架）接口 - 增加创建订单的逻辑
  app.put("/api/products/:id/status", [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product)
        return res.status(404).send({ message: "Product not found." });
      if (product.owner.toString() !== req.userId)
        return res.status(403).send({ message: "Forbidden." });

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
        .send({ message: "Product status updated and order created." });
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
      const user = await User.findById(req.userId).populate({
        path: "viewHistory",
        select: "-image", // 同样不在列表页加载图片
      });
      res.status(200).send(user.viewHistory);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

    // 普通用户导出自己的发布列表
    app.get('/api/user/export/publications', [verifyToken], async (req, res) => {
      try {
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
            const opts = { fields };
            const parser = new Parser(opts);
        
            const products = await Product.find({ owner: req.userId }).select('-image').lean();
            if (products.length === 0) {
                return res.status(200).json({ message: 'No data to export.' });
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
            const orders = await Order.find({ seller: req.userId }).populate('product', 'title').lean();
            const fields = [
                  { label: '订单ID', value: '_id' },
                  { label: '商品标题', value: 'product.title' },
                  { label: '成交价格', value: 'price' },
                  { label: '卖家', value: 'seller.nickname' },
                  { label: '成交日期', value: 'transactionDate' }
              ];
            const opts = { fields };
            const parser = new Parser(opts);
            if (orders.length === 0) {
              return res.status(200).json({ message: 'No data to export.' });
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
            const opts = { fields };
            const parser = new Parser(opts);
            const products = await Product.find({ _id: { $in: user.favoritedBy } }).select('-image').lean();
            if (products.length === 0) {
              return res.status(200).json({ message: 'No data to export.' });
            }
            const csvData = parser.parse(products);
            res.header('Content-Type', 'text/csv');
            res.attachment('my_favorites.csv');
            res.send(csvData);
        } catch (error) {
            res.status(500).send({ message: error.message });
        }
    });

};
