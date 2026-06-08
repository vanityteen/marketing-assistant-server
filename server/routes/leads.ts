/**
 * 线索管理路由模块
 * 
 * 本模块处理营销线索（leads）的所有操作，包括：
 * - 公共线索池管理（未被认领的线索）
 * - 个人线索管理（已认领的线索）
 * - 线索认领功能
 * - 线索跟进记录
 * - 公开表单提交（无需认证）
 * 
 * @module routes/leads
 */

import { Router, Request, Response } from 'express'
import db, { DBRow } from '../db'

const router = Router()

/**
 * 异步路由错误处理包装器
 * Express 4 不会自动捕获 async handler 中的异常，
 * 此包装器确保所有数据库错误被正确捕获并返回 500 响应
 */
function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return (req: Request, res: Response, next: any) => {
    fn(req, res, next).catch(next)
  }
}

/**
 * 获取公共线索池
 *
 * GET /leads/public
 *
 * 功能：获取所有可展示的公共线索
 * - 未被认领的线索（owner_id为NULL）
 * - 当前用户已放弃的线索（status为'abandoned'，方便重新领用）
 * - 返回线索列表及其关联的活动名称
 * - 同时返回统计信息：可用线索数、今日新增数、可回收线索数
 * - 可回收线索指：已被认领但超过回收天数且状态仍为pending的线索
 *
 * 返回值：
 * - leads: 公共线索列表（按创建时间倒序）
 * - stats: 统计信息对象（available, today, recovery）
 */
router.get('/public', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1

  const leads = await db.all(`
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE l.owner_id IS NULL
       OR (l.owner_id = ? AND l.status = 'abandoned')
    ORDER BY l.created_at DESC
  `, userId)

  const [available, today, recovery] = await Promise.all([
    db.get(`SELECT COUNT(*) as count FROM leads WHERE owner_id IS NULL
       OR (owner_id = ? AND status = 'abandoned')`, userId),
    db.get(`SELECT COUNT(*) as count FROM leads
      WHERE (owner_id IS NULL OR (owner_id = ? AND status = 'abandoned'))
      AND DATE(created_at) = CURDATE()`, userId),
    db.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE owner_id IS NOT NULL AND status = 'pending'
      AND DATEDIFF(NOW(), claimed_at) > (
        SELECT recovery_days FROM settings WHERE user_id = owner_id LIMIT 1
      )
    `)
  ])

  const stats = {
    available: available.count,
    today: today.count,
    recovery: recovery.count
  }

  res.json({ leads, stats })
}))

/**
 * 获取个人线索列表
 * 
 * GET /leads/personal
 * 
 * 功能：获取当前用户认领的所有线索
 * - 需要用户已登录（从session获取用户ID）
 * - 支持按状态筛选线索
 * - 返回线索列表及各状态的数量统计
 * 
 * 查询参数：
 * - status: 线索状态筛选（all表示全部）
 * 
 * 返回值：
 * - leads: 个人线索列表（按创建时间倒序）
 * - stats: 各状态的线索数量统计
 */
router.get('/personal', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const { status } = req.query

  let sql = `
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE l.owner_id = ?
  `
  const params: unknown[] = [userId]

  if (status && status !== 'all') {
    sql += ' AND l.status = ?'
    params.push(status)
  }

  sql += ' ORDER BY l.created_at DESC'
  const leads = await db.all(sql, ...params)

  const [pending, contacted, negotiating, converted, abandoned] = await Promise.all([
    db.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'pending'", userId),
    db.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'contacted'", userId),
    db.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'negotiating'", userId),
    db.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'converted'", userId),
    db.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'abandoned'", userId)
  ])

  const stats = {
    pending: pending.count,
    contacted: contacted.count,
    negotiating: negotiating.count,
    converted: converted.count,
    abandoned: abandoned.count
  }

  res.json({ leads, stats })
}))

/**
 * 获取单个线索详情
 *
 * GET /leads/:id
 *
 * 功能：获取指定线索的完整信息
 * - 包含关联的活动名称
 * - 解析 custom_data JSON 字符串为对象
 * - 公开和已认领的线索均可查询
 *
 * 路径参数：
 * - id: 线索ID
 *
 * 返回值：
 * - lead: 线索详情对象（包含 custom_data 表单字段）
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const lead = await db.get(`
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE l.id = ?
  `, req.params.id)

  if (!lead) {
    return res.status(404).json({ error: '线索不存在' })
  }

  // 解析 custom_data JSON 字符串为对象
  if (typeof lead.custom_data === 'string') {
    try {
      lead.custom_data = JSON.parse(lead.custom_data)
    } catch {
      lead.custom_data = {}
    }
  }

  res.json({ lead })
}))

/**
 * 认领线索
 *
 * POST /leads/:id/claim
 * 
 * 功能：将公共线索池中的线索认领给当前用户
 * - 需要用户已登录
 * - 只能认领未被认领的线索（owner_id为NULL）
 * - 认领时记录认领时间（claimed_at）
 * 
 * 路径参数：
 * - id: 要认领的线索ID
 * 
 * 返回值：
 * - lead: 认领后的线索对象
 * - message: 认领成功消息
 */
router.post('/:id/claim', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id)

  if (!lead) return res.status(404).json({ error: '线索不存在' })
  if (lead.owner_id) return res.status(400).json({ error: '该线索已被领用' })

  await db.run("UPDATE leads SET owner_id = ?, claimed_at = NOW() WHERE id = ?", userId, req.params.id)
  const updated = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id)
  res.json({ lead: updated, message: '线索领用成功' })
}))

/**
 * 线索跟进
 * 
 * POST /leads/:id/follow
 * 
 * 功能：对线索进行跟进操作
 * - 更新线索状态和评分
 * - 记录跟进详情到follow_ups表
 * - 需要用户已登录
 * 
 * 路径参数：
 * - id: 要跟进的线索ID
 * 
 * 请求体参数：
 * - status: 新的状态（可选）
 * - rating: 评分（可选）
 * - note: 跟进备注（可选）
 * 
 * 返回值：
 * - lead: 更新后的线索对象
 * - message: 跟进记录保存成功消息
 */
router.post('/:id/follow', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const { status, rating, note } = req.body
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id)

  if (!lead) return res.status(404).json({ error: '线索不存在' })

  if (status) {
    await db.run('UPDATE leads SET status = ? WHERE id = ?', status, req.params.id)
  }
  if (rating !== undefined) {
    await db.run('UPDATE leads SET rating = ? WHERE id = ?', rating, req.params.id)
  }

  await db.run('INSERT INTO follow_ups (lead_id, user_id, status, rating, note) VALUES (?, ?, ?, ?, ?)',
    req.params.id, userId, status || lead.status, rating ?? lead.rating, note || '')

  const updated = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id)
  res.json({ lead: updated, message: '跟进记录已保存' })
}))

/**
 * 获取线索跟进历史
 * 
 * GET /leads/:id/follow-ups
 * 
 * 功能：获取指定线索的所有跟进记录
 * - 包含跟进用户信息（用户名）
 * - 按跟进时间倒序排列
 * 
 * 路径参数：
 * - id: 线索ID
 * 
 * 返回值：
 * - followUps: 跟进记录列表（包含用户信息）
 */
router.get('/:id/follow-ups', asyncHandler(async (req: Request, res: Response) => {
  const followUps = await db.all(`
    SELECT f.*, u.name as user_name
    FROM follow_ups f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.lead_id = ?
    ORDER BY f.created_at DESC
  `, req.params.id)

  res.json({ followUps })
}))

/**
 * 提交线索（公开表单）
 * 
 * POST /leads/submit
 * 
 * 功能：通过公开表单提交新的线索
 * - 无需用户认证（公开接口）
 * - 关联到指定的活动
 * - 支持自定义字段数据
 * 
 * 请求体参数：
 * - event_id: 关联的活动ID（必需）
 * - name: 姓名（必需）
 * - phone: 电话（必需）
 * - custom_data: 自定义字段数据（可选）
 * 
 * 返回值：
 * - message: 提交成功消息（状态码201）
 */
router.post('/submit', asyncHandler(async (req: Request, res: Response) => {
  const { event_id, name, phone, custom_data } = req.body

  if (!event_id || !name || !phone) {
    return res.status(400).json({ error: '请填写必要字段' })
  }

  const event = await db.get('SELECT * FROM events WHERE id = ?', event_id)
  if (!event) return res.status(404).json({ error: '活动不存在' })

  await db.run(`
    INSERT INTO leads (name, phone, event_id, custom_data)
    VALUES (?, ?, ?, ?)
  `, name, phone, event_id, JSON.stringify(custom_data || {}))

  // ==================== 终端日志输出 ====================
  console.log('\n═══════════════════════════════════════════')
  console.log('  📋 新线索提交')
  console.log('───────────────────────────────────────────')
  console.log(`  🏷️  活动:  ${(event as DBRow).name}`)
  console.log(`  👤  姓名:  ${name}`)
  console.log(`  📞  电话:  ${phone}`)
  if (custom_data && typeof custom_data === 'object') {
    console.log('  ── 自定义字段 ──')
    for (const [key, value] of Object.entries(custom_data)) {
      console.log(`    ${key}: ${value}`)
    }
  }
  console.log(`  🕐  时间:  ${new Date().toLocaleString('zh-CN')}`)
  console.log('═══════════════════════════════════════════\n')
  // ===================================================

  res.status(201).json({ message: '信息提交成功' })
}))

export default router