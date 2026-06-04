"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Simple login - for demo purposes
router.post('/login', async (req, res) => {
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: '请输入用户名' });
    let user = await db_1.default.get('SELECT * FROM users WHERE name = ?', name);
    if (!user) {
        const result = await db_1.default.run('INSERT INTO users (name) VALUES (?)', name);
        user = await db_1.default.get('SELECT * FROM users WHERE id = ?', result.insertId);
        await db_1.default.run('INSERT INTO settings (user_id, recovery_days) VALUES (?, 7)', user.id);
    }
    req.session.userId = user.id;
    res.json({ user });
});
// Get current user
router.get('/me', async (req, res) => {
    const userId = req.session.userId || 1;
    const user = await db_1.default.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user)
        return res.status(401).json({ error: '未登录' });
    res.json({ user });
});
// Update role
router.put('/role', async (req, res) => {
    const userId = req.session.userId || 1;
    const { role } = req.body;
    await db_1.default.run('UPDATE users SET role = ? WHERE id = ?', role, userId);
    const user = await db_1.default.get('SELECT * FROM users WHERE id = ?', userId);
    res.json({ user });
});
// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err)
            return res.status(500).json({ error: '退出登录失败' });
        res.json({ message: '已退出登录' });
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map