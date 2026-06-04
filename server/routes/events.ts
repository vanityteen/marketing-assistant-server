/**
 * 活动管理路由模块
 * 
 * 本模块处理营销活动相关的所有操作，包括：
 * - 活动的增删改查（CRUD）
 * - 活动二维码生成功能
 * - 活动数据统计（ROI计算、线索数量等）
 * - 表单字段配置管理
 * 
 * @module routes/events
 */

import { Router, Request, Response } from 'express'
import db, { pool, DBRow } from '../db'
import QRCode from 'qrcode'

const router = Router()

/**
 * 获取活动列表
 * 
 * GET /events
 * 
 * 功能：获取所有活动列表，支持按状态筛选和关键词搜索
 * - 返回每个活动的基本信息、线索数量、ROI（投资回报率）和表单字段
 * - ROI计算公式：(预算/支出) * 100，支出为0时ROI为0
 * 
 * 查询参数：
 * - status: 活动状态筛选（all表示全部）
 * - search: 活动名称关键词搜索
 * 
 * 返回值：
 * - events: 活动列表数组，包含处理后的ROI和解析的表单字段
 */
router.get('/', async (req: Request, res: Response) => {
  const { status, search } = req.query
  let sql = 'SELECT e.*, COUNT(l.id) as lead_count FROM events e LEFT JOIN leads l ON l.event_id = e.id'
  const params: string[] = []
  const conditions: string[] = []

  if (status && status !== 'all') {
    conditions.push('e.status = ?')
    params.push(status as string)
  }
  if (search) {
    conditions.push('e.name LIKE ?')
    params.push(`%${search}%`)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' GROUP BY e.id ORDER BY e.created_at DESC'

  const events = await db.all(sql, ...params)

  const result = events.map(event => ({
    ...event,
    roi: (event.expense as number) > 0 ? Math.round(((event.budget as number) / (event.expense as number)) * 100) : 0,
    form_fields: JSON.parse((event.form_fields as string) || '[]')
  }))

  res.json({ events: result })
})

/**
 * 获取单个活动详情
 * 
 * GET /events/:id
 * 
 * 功能：获取指定ID的活动详细信息及关联的最新10条线索
 * - 包含活动基本信息、ROI计算、表单字段解析
 * - 同时返回该活动下的最新线索列表（最多10条）
 * 
 * 路径参数：
 * - id: 活动ID
 * 
 * 返回值：
 * - event: 活动详细信息对象
 * - leads: 关联的线索列表（最多10条，按创建时间倒序）
 */
router.get('/:id', async (req: Request, res: Response) => {
  const event = await db.get(`
    SELECT e.*, COUNT(l.id) as lead_count
    FROM events e LEFT JOIN leads l ON l.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id
  `, req.params.id) as DBRow | undefined

  if (!event) return res.status(404).json({ error: '活动不存在' })

  event.form_fields = JSON.parse((event.form_fields as string) || '[]')
  event.roi = (event.expense as number) > 0 ? Math.round(((event.budget as number) / (event.expense as number)) * 100) : 0

  const leads = await db.all('SELECT * FROM leads WHERE event_id = ? ORDER BY created_at DESC LIMIT 10', req.params.id)

  res.json({ event, leads })
})

/**
 * 创建新活动
 * 
 * POST /events
 * 
 * 功能：创建新的营销活动
 * - 需要用户已登录（从session获取用户ID）
 * - 必填字段：活动名称、开始日期、结束日期
 * - 可选字段：预算、描述、自定义表单字段
 * 
 * 请求体参数：
 * - name: 活动名称（必需）
 * - start_date: 开始日期（必需）
 * - end_date: 结束日期（必需）
 * - budget: 预算金额（可选，默认0）
 * - description: 活动描述（可选）
 * - form_fields: 自定义表单字段配置（可选）
 * 
 * 返回值：
 * - event: 创建成功的活动对象（状态码201）
 */
router.post('/', async (req: Request, res: Response) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId || 1
  const { name, start_date, end_date, budget, description, form_fields } = req.body

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: '请填写必要字段' })
  }

  const result = await db.run(`
    INSERT INTO events (name, start_date, end_date, budget, description, form_fields, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, name, start_date, end_date, budget || 0, description || '', JSON.stringify(form_fields || []), userId)

  const event = await db.get('SELECT * FROM events WHERE id = ?', result.insertId) as DBRow
  event.form_fields = JSON.parse((event.form_fields as string) || '[]')

  res.status(201).json({ event })
})

/**
 * 更新活动信息
 * 
 * PUT /events/:id
 * 
 * 功能：更新指定ID的活动信息
 * - 支持更新活动的所有字段
 * - 未提供的字段将保持原值不变
 * 
 * 路径参数：
 * - id: 要更新的活动ID
 * 
 * 请求体参数：
 * - name: 活动名称
 * - start_date: 开始日期
 * - end_date: 结束日期
 * - budget: 预算金额
 * - expense: 实际支出
 * - description: 活动描述
 * - status: 活动状态
 * - form_fields: 自定义表单字段配置
 * 
 * 返回值：
 * - event: 更新后的活动对象
 */
router.put('/:id', async (req: Request, res: Response) => {
  const { name, start_date, end_date, budget, expense, description, status, form_fields } = req.body
  const event = await db.get('SELECT * FROM events WHERE id = ?', req.params.id) as DBRow | undefined
  if (!event) return res.status(404).json({ error: '活动不存在' })

  await db.run(`
    UPDATE events SET name = ?, start_date = ?, end_date = ?, budget = ?, expense = ?,
    description = ?, status = ?, form_fields = ? WHERE id = ?
  `,
    name || event.name, start_date || event.start_date, end_date || event.end_date,
    budget ?? event.budget, expense ?? event.expense,
    description ?? event.description, status || event.status,
    form_fields ? JSON.stringify(form_fields) : event.form_fields,
    req.params.id
  )

  const updated = await db.get('SELECT * FROM events WHERE id = ?', req.params.id) as DBRow
  updated.form_fields = JSON.parse((updated.form_fields as string) || '[]')
  res.json({ event: updated })
})

/**
 * 删除活动及其关联数据
 * 
 * DELETE /events/:id
 * 
 * 功能：删除指定ID的活动及所有关联的线索和跟进记录
 * - 使用数据库事务确保数据一致性
 * - 级联删除：先删除跟进记录，再删除线索，最后删除活动
 * 
 * 路径参数：
 * - id: 要删除的活动ID
 * 
 * 返回值：
 * - message: 删除成功消息
 * - 错误：删除失败时返回500错误
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('DELETE FROM follow_ups WHERE lead_id IN (SELECT id FROM leads WHERE event_id = ?)', [req.params.id])
    await conn.execute('DELETE FROM leads WHERE event_id = ?', [req.params.id])
    await conn.execute('DELETE FROM events WHERE id = ?', [req.params.id])
    await conn.commit()
    res.json({ message: '活动已删除' })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: '删除失败' })
  } finally {
    conn.release()
  }
})

/**
 * 生成活动二维码
 * 
 * GET /events/:id/qrcode
 * 
 * 功能：为指定活动生成用于线索提交的二维码
 * - 二维码指向活动的线索提交页面
 * - 支持自定义前端URL（通过origin查询参数或环境变量）
 * 
 * 路径参数：
 * - id: 活动ID
 * 
 * 查询参数：
 * - origin: 前端基础URL（可选）
 * 
 * 返回值：
 * - qrcode: 二维码图片的Data URL
 * - url: 线索提交页面的完整URL
 */
router.get('/:id/qrcode', async (req: Request, res: Response) => {
  const event = await db.get('SELECT * FROM events WHERE id = ?', req.params.id)
  if (!event) return res.status(404).json({ error: '活动不存在' })

  try {
    const frontendUrl = (req.query.origin as string) || process.env.FRONTEND_URL || (req.protocol + '://' + req.get('host'))
    const formUrl = `${frontendUrl}/submit/${req.params.id}`
    const qrDataUrl = await QRCode.toDataURL(formUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#333333', light: '#ffffff' }
    })
    res.json({ qrcode: qrDataUrl, url: formUrl })
  } catch (err) {
    res.status(500).json({ error: '二维码生成失败' })
  }
})

export default router