const multer = require('multer');
const { verifyToken } = require('../middleware/authJwt');
const Product = require('../models/product.model');
const User = require('../models/user.model');

// Multer 配置: 使用内存存储，因为我们想把文件转成Buffer存入DB
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = function(app) {
  // 获取所有商品 (可带分类和搜索) - 【重要修改】
  // 我们不再返回image数据，因为列表页不需要那么大的数据量
  app.get('/api/products', async (req, res) => {
    const { category, search } = req.query;
    // 默认查询条件增加了 status: 'selling'
    let query = { status: 'selling' };
    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: 'i' };

    try {
      // .select('-image') 表示查询结果中不包含 image 字段
      const products = await Product.find(query).select('-image').populate('owner', 'nickname').sort({ createdAt: -1 });
      res.status(200).send(products);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 获取单个商品详情 - 同样不直接返回图片数据
  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).select('-image').populate('owner', 'nickname reputation');
      res.status(200).send(product);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 【新增】专门用于获取图片的路由
  app.get('/api/products/:id/image', async (req, res) => {
      try {
          const product = await Product.findById(req.params.id);
          if (!product || !product.image.data) {
              return res.status(404).send({ message: 'Image not found.' });
          }
          res.set('Content-Type', product.image.contentType);
          res.send(product.image.data);
      } catch (error) {
          res.status(500).send({ message: error.message });
      }
  });
  
  // 修改商品状态（下架）接口
  app.put('/api/products/:id/status', [verifyToken], async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).send({ message: 'Product not found.' });
        }
        // 验证当前用户是否是商品所有者
        if (product.owner.toString() !== req.userId) {
            return res.status(403).send({ message: 'Forbidden: You are not the owner of this product.' });
        }
        product.status = req.body.status; // 期望前端传来 'sold'
        await product.save();
        res.status(200).send({ message: 'Product status updated successfully.' });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
  });

  // 发布新商品 (需要登录)
  // 使用 multer 中间件来处理 'imageFile' 字段的单个文件上传
  app.post('/api/products', [verifyToken, upload.single('imageFile')], async (req, res) => {
    // 验证文件是否存在
    if (!req.file) {
      return res.status(400).send({ message: 'No image file uploaded.' });
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
          contentType: req.file.mimetype // 文件类型
        }
      });
      await product.save();
      res.status(201).send({ message: 'Product created successfully.'});
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // ... (添加留言、收藏、评价用户的路由保持不变) ...
  app.post('/api/products/:id/comments', [verifyToken], async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      const product = await Product.findById(req.params.id);
      product.comments.push({ user: req.userId, nickname: user.nickname, content: req.body.content });
      await product.save();
      res.status(201).send(product.comments);
    } catch (error) { res.status(500).send({ message: error.message }); }
  });
  
  app.post('/api/products/:id/favorite', [verifyToken], async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      const index = product.favoritedBy.indexOf(req.userId);
      if (index > -1) { product.favoritedBy.splice(index, 1); } 
      else { product.favoritedBy.push(req.userId); }
      await product.save();
      res.status(200).send({ favoritedCount: product.favoritedBy.length });
    } catch (error) { res.status(500).send({ message: error.message }); }
  });

  app.post('/api/users/:id/evaluate', [verifyToken], async (req, res) => {
      try {
          const { type } = req.body;
          const userToEvaluate = await User.findById(req.params.id);
          if (type in userToEvaluate.reputation) { userToEvaluate.reputation[type]++; }
          await userToEvaluate.save();
          res.status(200).send({ message: 'Evaluation submitted successfully.'});
      } catch (error) { res.status(500).send({ message: error.message }); }
  });

  // 获取用户收藏的商品列表
  app.get('/api/user/favorites', [verifyToken], async (req, res) => {
      try {
          const user = await User.findById(req.userId);
          // 找到所有 favoritedBy 数组包含当前用户ID的商品
          const products = await Product.find({ favoritedBy: user._id }).select('-image');
          res.status(200).send(products);
      } catch (error) {
          res.status(500).send({ message: error.message });
      }
  });

  // 获取用户发布的商品列表
  app.get('/api/user/publications', [verifyToken], async (req, res) => {
      try {
          // 找到所有 owner 是当前用户ID的商品
          const products = await Product.find({ owner: req.userId }).select('-image').sort({ createdAt: -1 });
          res.status(200).send(products);
      } catch (error) {
          res.status(500).send({ message: error.message });
      }
  });
};

