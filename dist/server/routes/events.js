"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importStar(require("../db"));
const qrcode_1 = __importDefault(require("qrcode"));
const router = (0, express_1.Router)();
// List all events
router.get('/', async (req, res) => {
    const { status, search } = req.query;
    let sql = 'SELECT e.*, COUNT(l.id) as lead_count FROM events e LEFT JOIN leads l ON l.event_id = e.id';
    const params = [];
    const conditions = [];
    if (status && status !== 'all') {
        conditions.push('e.status = ?');
        params.push(status);
    }
    if (search) {
        conditions.push('e.name LIKE ?');
        params.push(`%${search}%`);
    }
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' GROUP BY e.id ORDER BY e.created_at DESC';
    const events = await db_1.default.all(sql, ...params);
    const result = events.map(event => ({
        ...event,
        roi: event.expense > 0 ? Math.round((event.budget / event.expense) * 100) : 0,
        form_fields: JSON.parse(event.form_fields || '[]')
    }));
    res.json({ events: result });
});
// Get single event
router.get('/:id', async (req, res) => {
    const event = await db_1.default.get(`
    SELECT e.*, COUNT(l.id) as lead_count
    FROM events e LEFT JOIN leads l ON l.event_id = e.id
    WHERE e.id = ?
    GROUP BY e.id
  `, req.params.id);
    if (!event)
        return res.status(404).json({ error: '活动不存在' });
    event.form_fields = JSON.parse(event.form_fields || '[]');
    event.roi = event.expense > 0 ? Math.round((event.budget / event.expense) * 100) : 0;
    const leads = await db_1.default.all('SELECT * FROM leads WHERE event_id = ? ORDER BY created_at DESC LIMIT 10', req.params.id);
    res.json({ event, leads });
});
// Create event
router.post('/', async (req, res) => {
    const userId = req.session.userId || 1;
    const { name, start_date, end_date, budget, description, form_fields } = req.body;
    if (!name || !start_date || !end_date) {
        return res.status(400).json({ error: '请填写必要字段' });
    }
    const result = await db_1.default.run(`
    INSERT INTO events (name, start_date, end_date, budget, description, form_fields, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, name, start_date, end_date, budget || 0, description || '', JSON.stringify(form_fields || []), userId);
    const event = await db_1.default.get('SELECT * FROM events WHERE id = ?', result.insertId);
    event.form_fields = JSON.parse(event.form_fields || '[]');
    res.status(201).json({ event });
});
// Update event
router.put('/:id', async (req, res) => {
    const { name, start_date, end_date, budget, expense, description, status, form_fields } = req.body;
    const event = await db_1.default.get('SELECT * FROM events WHERE id = ?', req.params.id);
    if (!event)
        return res.status(404).json({ error: '活动不存在' });
    await db_1.default.run(`
    UPDATE events SET name = ?, start_date = ?, end_date = ?, budget = ?, expense = ?,
    description = ?, status = ?, form_fields = ? WHERE id = ?
  `, name || event.name, start_date || event.start_date, end_date || event.end_date, budget ?? event.budget, expense ?? event.expense, description ?? event.description, status || event.status, form_fields ? JSON.stringify(form_fields) : event.form_fields, req.params.id);
    const updated = await db_1.default.get('SELECT * FROM events WHERE id = ?', req.params.id);
    updated.form_fields = JSON.parse(updated.form_fields || '[]');
    res.json({ event: updated });
});
// Delete event and cascading data
router.delete('/:id', async (req, res) => {
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.execute('DELETE FROM follow_ups WHERE lead_id IN (SELECT id FROM leads WHERE event_id = ?)', [req.params.id]);
        await conn.execute('DELETE FROM leads WHERE event_id = ?', [req.params.id]);
        await conn.execute('DELETE FROM events WHERE id = ?', [req.params.id]);
        await conn.commit();
        res.json({ message: '活动已删除' });
    }
    catch (err) {
        await conn.rollback();
        res.status(500).json({ error: '删除失败' });
    }
    finally {
        conn.release();
    }
});
// Generate QR code for event
router.get('/:id/qrcode', async (req, res) => {
    const event = await db_1.default.get('SELECT * FROM events WHERE id = ?', req.params.id);
    if (!event)
        return res.status(404).json({ error: '活动不存在' });
    try {
        const frontendUrl = req.query.origin || process.env.FRONTEND_URL || (req.protocol + '://' + req.get('host'));
        const formUrl = `${frontendUrl}/submit/${req.params.id}`;
        const qrDataUrl = await qrcode_1.default.toDataURL(formUrl, {
            width: 280,
            margin: 2,
            color: { dark: '#333333', light: '#ffffff' }
        });
        res.json({ qrcode: qrDataUrl, url: formUrl });
    }
    catch (err) {
        res.status(500).json({ error: '二维码生成失败' });
    }
});
exports.default = router;
//# sourceMappingURL=events.js.map