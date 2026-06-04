/**
 * 联系人管理路由模块
 * 
 * 该模块处理联系人（leads）的查询功能，提供按状态和搜索关键词过滤的联系人列表。
 * 联系人即潜在客户线索，包含基本信息和关联的活动信息。
 */

import { Router, Request, Response } from 'express'
import db from '../db'

const router = Router()

/**
 * 获取所有联系人列表接口
 * 
 * GET /contacts
 * 
 * 功能：获取所有联系人（潜在客户线索）列表，支持按状态和关键词搜索
 * - 查询联系人及其关联的活动名称
 * - 支持按状态过滤（pending, contacted, negotiating, converted, abandoned）
 * - 支持按姓名或电话号码模糊搜索
 * - 返回联系人总数和各状态的数量统计
 * 
 * 查询参数：
 * - status: 联系人状态（可选，'all'表示全部）
 * - search: 搜索关键词（可选，用于姓名或电话模糊匹配）
 * 
 * 返回值：
 * - contacts: 联系人列表数组
 * - total: 联系人总数
 * - statusCounts: 各状态的联系人数量统计对象
 */
router.get('/', async (req: Request, res: Response) => {
  const { status, search } = req.query
  let sql = `
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE 1=1
  `
  const params: string[] = []

  if (status && status !== 'all') {
    sql += ' AND l.status = ?'
    params.push(status as string)
  }
  if (search) {
    sql += ' AND (l.name LIKE ? OR l.phone LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }

  sql += ' ORDER BY l.created_at DESC'
  const contacts = await db.all(sql, ...params)

  const total = (await db.get('SELECT COUNT(*) as count FROM leads')).count

  const [pending, contacted, negotiating, converted, abandoned] = await Promise.all([
    db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'pending'"),
    db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'contacted'"),
    db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'negotiating'"),
    db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'converted'"),
    db.get("SELECT COUNT(*) as count FROM leads WHERE status = 'abandoned'")
  ])

  const statusCounts = {
    pending: pending.count,
    contacted: contacted.count,
    negotiating: negotiating.count,
    converted: converted.count,
    abandoned: abandoned.count
  }

  res.json({ contacts, total, statusCounts })
})

export default router