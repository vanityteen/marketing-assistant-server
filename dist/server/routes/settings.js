"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get settings for current user
router.get('/', async (req, res) => {
    const userId = req.session.userId || 1;
    let settings = await db_1.default.get('SELECT * FROM settings WHERE user_id = ?', userId);
    if (!settings) {
        await db_1.default.run('INSERT INTO settings (user_id, recovery_days) VALUES (?, 7)', userId);
        settings = await db_1.default.get('SELECT * FROM settings WHERE user_id = ?', userId);
    }
    res.json({ settings });
});
// Update recovery days
router.put('/recovery', async (req, res) => {
    const userId = req.session.userId || 1;
    const { recovery_days } = req.body;
    await db_1.default.run("UPDATE settings SET recovery_days = ?, updated_at = NOW() WHERE user_id = ?", recovery_days, userId);
    const settings = await db_1.default.get('SELECT * FROM settings WHERE user_id = ?', userId);
    res.json({ settings });
});
exports.default = router;
//# sourceMappingURL=settings.js.map