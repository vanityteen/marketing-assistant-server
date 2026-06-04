/**
 * 身份认证路由模块
 * 
 * 该模块处理用户登录、登出、获取当前用户信息以及角色更新等身份认证相关功能。
 * 使用 express-session 进行会话管理，通过 userId 存储在 session 中来识别用户身份。
 */

import { Router, Request, Response } from 'express'
import db from '../db'

const router = Router()

/**
 * 用户登录接口
 * 
 * POST /auth/login
 * 
 * 功能：用户登录系统
 * - 如果用户名不存在，则创建新用户并初始化默认设置
 * - 将用户ID存储在session中用于后续身份验证
 * 
 * 请求体参数：
 * - name: 用户名（必需）
 * 
 * 返回值：
 * - user: 当前登录的用户信息
 */
router.post('/login', async (req: Request, res: Response) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: '请输入用户名' })

  let user = await db.get('SELECT * FROM users WHERE name = ?', name)
  if (!user) {
    const result = await db.run('INSERT INTO users (name) VALUES (?)', name)
    user = await db.get('SELECT * FROM users WHERE id = ?', result.insertId)
    await db.run('INSERT INTO settings (user_id, recovery_days) VALUES (?, 7)', user.id)
  }

  (req.session as unknown as Record<string, unknown>).userId = user.id
  res.json({ user })
})

/**
 * 获取当前用户信息接口
 * 
 * GET /auth/me
 * 
 * 功能：获取当前登录用户的信息
 * - 从session中读取userId
 * - 查询并返回用户详细信息
 * 
 * 返回值：
 * - user: 当前用户信息对象
 * - 错误：如果未登录则返回401错误
 */
router.get('/me', async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const user = await db.get('SELECT * FROM users WHERE id = ?', userId)
  if (!user) return res.status(401).json({ error: '未登录' })
  res.json({ user })
})

/**
 * 更新用户角色接口
 * 
 * PUT /auth/role
 * 
 * 功能：更新当前用户的角色信息
 * - 需要用户已登录
 * - 更新数据库中的用户角色字段
 * 
 * 请求体参数：
 * - role: 新的角色值
 * 
 * 返回值：
 * - user: 更新后的用户信息
 */
router.put('/role', async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const { role } = req.body
  await db.run('UPDATE users SET role = ? WHERE id = ?', role, userId)
  const user = await db.get('SELECT * FROM users WHERE id = ?', userId)
  res.json({ user })
})

/**
 * 用户登出接口
 * 
 * POST /auth/logout
 * 
 * 功能：销毁当前用户的会话，实现登出功能
 * - 调用session.destroy()方法清除会话数据
 * 
 * 返回值：
 * - message: 登出成功消息
 * - 错误：登出失败时返回500错误
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: '退出登录失败' })
    res.json({ message: '已退出登录' })
  })
})

export default router