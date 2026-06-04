"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const auth_1 = __importDefault(require("./routes/auth"));
const events_1 = __importDefault(require("./routes/events"));
const leads_1 = __importDefault(require("./routes/leads"));
const contacts_1 = __importDefault(require("./routes/contacts"));
const settings_1 = __importDefault(require("./routes/settings"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'marketing-assistant-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/events', events_1.default);
app.use('/api/leads', leads_1.default);
app.use('/api/contacts', contacts_1.default);
app.use('/api/settings', settings_1.default);
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map