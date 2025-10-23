const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

module.exports = function(app) {
  // 用户注册
  app.post('/api/auth/register', async (req, res) => {
    try {
      const user = new User({
        studentId: req.body.studentId,
        nickname: req.body.nickname,
        password: bcrypt.hashSync(req.body.password, 8)
      });
      await user.save();
      res.send({ message: '用户注册成功!' });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 用户登录
  app.post('/api/auth/login', async (req, res) => {
    try {
      const user = await User.findOne({ studentId: req.body.studentId });
      if (!user) return res.status(404).send({ message: '用户未找到.' });

      const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
      if (!passwordIsValid) {
        return res.status(401).send({ accessToken: null, message: '密码错误!' });
      }

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: 86400 }); // 24小时

      // 发送给客户端的数据
      const responsePayload = {
        id: user._id,
        studentId: user.studentId,
        nickname: user.nickname,
        isAdmin: user.isAdmin, // 从数据库中获取 isAdmin
        accessToken: token
      };
      
      // 发送响应
      res.status(200).send(responsePayload);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });
};
