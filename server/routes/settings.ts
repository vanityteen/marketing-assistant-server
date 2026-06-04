/**
 * 用户设置管理路由模块
 * 
 * 本模块处理用户个人设置的获取和更新操作，
 * 主要包括回收天数（recovery_days）等个性化配置。
 * 
 * @module routes/settings
 */

import { Router, Request, Response } from 'express'
import db from '../db'

const router = Router()

/**
 * 获取当前用户设置
 * 
 * GET /settings
 * 
 * 功能：获取当前登录用户的个人设置
 * - 如果用户没有设置记录，则创建默认设置（回收天数为7天）
 * - 从session中获取用户ID进行查询
 * 
 * 返回值：
 * - settings: 用户设置对象
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  let settings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId)
  if (!settings) {
    await db.run('INSERT INTO settings (user_id, recovery_days) VALUES (?, 7)', userId)
    settings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId)
  }
  res.json({ settings })
})

/**
 * 更新回收天数设置
 * 
 * PUT /settings/recovery
 * 
 * 功能：更新用户的线索回收天数设置
 * - 回收天数用于确定多久未跟进的线索可以被其他用户认领
 * - 更新时同时更新updated_at时间戳
 * 
 * 请求体参数：
 * - recovery_days: 新的回收天数
 * 
 * 返回值：
 * - settings: 更新后的用户设置对象
 */
router.put('/recovery', async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const { recovery_days } = req.body
  await db.run("UPDATE settings SET recovery_days = ?, updated_at = NOW() WHERE user_id = ?", recovery_days, userId)
  const settings = await db.get('SELECT * FROM settings WHERE user_id = ?', userId)
  res.json({ settings })
})

export default router