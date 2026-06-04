"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get all contacts (all leads with status)
router.get('/', async (req, res) => {
    const { status, search } = req.query;
    let sql = `
    SELECT l.*, e.name as event_name
    FROM leads l
    LEFT JOIN events e ON l.event_id = e.id
    WHERE 1=1
  `;
    const params = [];
    if (status && status !== 'all') {
        sql += ' AND l.status = ?';
        params.push(status);
    }
    if (search) {
        sql += ' AND (l.name LIKE ? OR l.phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY l.created_at DESC';
    const contacts = await db_1.default.all(sql, ...params);
    const total = (await db_1.default.get('SELECT COUNT(*) as count FROM leads')).count;
    const [pending, contacted, negotiating, converted, abandoned] = await Promise.all([
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE status = 'pending'"),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE status = 'contacted'"),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE status = 'negotiating'"),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE status = 'converted'"),
        db_1.default.get("SELECT COUNT(*) as count FROM leads WHERE status = 'abandoned'")
    ]);
    const statusCounts = {
        pending: pending.count,
        contacted: contacted.count,
        negotiating: negotiating.count,
        converted: converted.count,
        abandoned: abandoned.count
    };
    res.json({ contacts, total, statusCounts });
});
exports.default = router;
//# sourceMappingURL=contacts.js.map