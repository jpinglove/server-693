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
      res.send({ message: 'User was registered successfully!' });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // 用户登录
  app.post('/api/auth/login', async (req, res) => {
    try {
      const user = await User.findOne({ studentId: req.body.studentId });
      if (!user) return res.status(404).send({ message: 'User Not found.' });

      const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
      if (!passwordIsValid) {
        return res.status(401).send({ accessToken: null, message: 'Invalid Password!' });
      }

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: 86400 }); // 24 hours

            // 准备要发送给客户端的数据
      const responsePayload = {
        id: user._id,
        studentId: user.studentId,
        nickname: user.nickname,
        isAdmin: user.isAdmin, // 确保从数据库文档中获取了 isAdmin
        accessToken: token
      };
      
      // 【新增调试信息】：在发送前，打印这个对象
      console.log('-------------------------------------------');
      console.log('[AUTH DEBUG] Login successful! Sending payload to client:');
      console.log(responsePayload);
      console.log('-------------------------------------------');

      // 发送响应
      res.status(200).send(responsePayload);

      // res.status(200).send({
      //   id: user._id,
      //   studentId: user.studentId,
      //   nickname: user.nickname,
      //   isAdmin: user.isAdmin,
      //   accessToken: token
      // });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });
};
