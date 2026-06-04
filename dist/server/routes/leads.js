"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get public lead pool (unclaimed leads)
router.get('/public', async (req, res) => {
    const leads = await db_1.default.all(`
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE l.owner_id IS NULL
    ORDER BY l.created_at DESC
  `);
    const [available, today, recovery] = await Promise.all([
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id IS NULL"),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id IS NULL AND DATE(created_at) = CURDATE()"),
        db_1.default.get(`
      SELECT COUNT(*) as count FROM leads
      WHERE owner_id IS NOT NULL AND status = 'pending'
      AND DATEDIFF(NOW(), claimed_at) > (
        SELECT recovery_days FROM settings WHERE user_id = owner_id LIMIT 1
      )
    `)
    ]);
    const stats = {
        available: available.count,
        today: today.count,
        recovery: recovery.count
    };
    res.json({ leads, stats });
});
// Get personal leads for current user
router.get('/personal', async (req, res) => {
    const userId = req.session.userId || 1;
    const { status } = req.query;
    let sql = `
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE l.owner_id = ?
  `;
    const params = [userId];
    if (status && status !== 'all') {
        sql += ' AND l.status = ?';
        params.push(status);
    }
    sql += ' ORDER BY l.created_at DESC';
    const leads = await db_1.default.all(sql, ...params);
    const [pending, contacted, negotiating, converted, abandoned] = await Promise.all([
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'pending'", userId),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'contacted'", userId),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'negotiating'", userId),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'converted'", userId),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND status = 'abandoned'", userId)
    ]);
    const stats = {
        pending: pending.count,
        contacted: contacted.count,
        negotiating: negotiating.count,
        converted: converted.count,
        abandoned: abandoned.count
    };
    res.json({ leads, stats });
});
// Claim a lead from public pool
router.post('/:id/claim', async (req, res) => {
    const userId = req.session.userId || 1;
    const lead = await db_1.default.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    if (!lead)
        return res.status(404).json({ error: '线索不存在' });
    if (lead.owner_id)
        return res.status(400).json({ error: '该线索已被领用' });
    await db_1.default.run("UPDATE leads SET owner_id = ?, claimed_at = NOW() WHERE id = ?", userId, req.params.id);
    const updated = await db_1.default.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    res.json({ lead: updated, message: '线索领用成功' });
});
// Follow up on a lead
router.post('/:id/follow', async (req, res) => {
    const userId = req.session.userId || 1;
    const { status, rating, note } = req.body;
    const lead = await db_1.default.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    if (!lead)
        return res.status(404).json({ error: '线索不存在' });
    if (status) {
        await db_1.default.run('UPDATE leads SET status = ? WHERE id = ?', status, req.params.id);
    }
    if (rating !== undefined) {
        await db_1.default.run('UPDATE leads SET rating = ? WHERE id = ?', rating, req.params.id);
    }
    await db_1.default.run('INSERT INTO follow_ups (lead_id, user_id, status, rating, note) VALUES (?, ?, ?, ?, ?)', req.params.id, userId, status || lead.status, rating ?? lead.rating, note || '');
    const updated = await db_1.default.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    res.json({ lead: updated, message: '跟进记录已保存' });
});
// Get follow up history
router.get('/:id/follow-ups', async (req, res) => {
    const followUps = await db_1.default.all(`
    SELECT f.*, u.name as user_name
    FROM follow_ups f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.lead_id = ?
    ORDER BY f.created_at DESC
  `, req.params.id);
    res.json({ followUps });
});
// Submit lead via form (public, no auth needed)
router.post('/submit', async (req, res) => {
    const { event_id, name, phone, custom_data } = req.body;
    if (!event_id || !name || !phone) {
        return res.status(400).json({ error: '请填写必要字段' });
    }
    const event = await db_1.default.get('SELECT * FROM events WHERE id = ?', event_id);
    if (!event)
        return res.status(404).json({ error: '活动不存在' });
    await db_1.default.run(`
    INSERT INTO leads (name, phone, event_id, custom_data)
    VALUES (?, ?, ?, ?)
  `, name, phone, event_id, JSON.stringify(custom_data || {}));
    res.status(201).json({ message: '信息提交成功' });
});
exports.default = router;
//# sourceMappingURL=leads.js.map