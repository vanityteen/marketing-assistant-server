"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marketing_assistant',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});
exports.pool = pool;
const db = {
    get: async (sql, ...params) => {
        const [rows] = params.length ? await pool.execute(sql, params) : await pool.execute(sql);
        return rows[0];
    },
    all: async (sql, ...params) => {
        const [rows] = params.length ? await pool.execute(sql, params) : await pool.execute(sql);
        return rows;
    },
    run: async (sql, ...params) => {
        const [result] = params.length ? await pool.execute(sql, params) : await pool.execute(sql);
        return result;
    }
};
async function initDB() {
    const conn = await pool.getConnection();
    await conn.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'marketer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await conn.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      budget DECIMAL(10,2) DEFAULT 0,
      expense DECIMAL(10,2) DEFAULT 0,
      description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      form_fields TEXT,
      created_by INT REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await conn.execute(`
    CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      event_id INT REFERENCES events(id),
      status VARCHAR(50) DEFAULT 'pending',
      owner_id INT REFERENCES users(id),
      rating INT DEFAULT 0,
      custom_data TEXT,
      claimed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await conn.execute(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT REFERENCES leads(id),
      user_id INT REFERENCES users(id),
      status VARCHAR(50),
      rating INT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await conn.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNIQUE REFERENCES users(id),
      recovery_days INT DEFAULT 7,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Seed initial data if empty
    const [rows] = await conn.execute('SELECT COUNT(*) as count FROM users');
    if (rows[0].count === 0) {
        await conn.execute("INSERT INTO users (name, role) VALUES ('张三', 'marketer')");
        await conn.execute("INSERT INTO users (name, role) VALUES ('李经理', 'salesperson')");
        await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('夏季促销活动', '2026-06-01', '2026-06-30', 10000, 6500,
        '夏季促销活动，针对新品进行推广，通过线上线下结合的方式吸引客户参与，提升品牌知名度和产品销量。',
        'active',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true},{\"name\":\"感兴趣的产品\",\"type\":\"select\",\"required\":false,\"options\":\"产品A,产品B,产品C,其他\"}]',
        1)
    `);
        await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('春季展会活动', '2026-04-01', '2026-04-30', 8000, 4000,
        '春季行业展会参展活动，展示公司最新产品和解决方案。',
        'ended',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true}]',
        1)
    `);
        await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('新品发布会', '2026-05-15', '2026-05-30', 15000, 8500,
        '新品发布会，邀请行业客户和媒体参加，重点推广新一代产品。',
        'active',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true},{\"name\":\"公司名称\",\"type\":\"text\",\"required\":false}]',
        1)
    `);
        // Public pool leads (no owner)
        await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('张三', '13812341234', 1, 'pending')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('李四', '13956785678', 2, 'pending')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('王五', '13790129012', 1, 'pending')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('赵六', '13634563456', 3, 'pending')");
        // Personal leads (owned by user 1)
        await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, claimed_at) VALUES ('钱七', '13511112222', 1, 'pending', 1, '2026-05-10 10:00:00')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('孙八', '13622223333', 1, 'contacted', 1, 3, '2026-05-09 10:00:00')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('周九', '13733334444', 2, 'negotiating', 1, 4, '2026-05-11 10:00:00')");
        await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('吴十', '13844445555', 1, 'converted', 1, 5, '2026-05-08 10:00:00')");
        // Settings
        await conn.execute('INSERT INTO settings (user_id, recovery_days) VALUES (1, 7)');
        console.log('✅ Seed data inserted successfully');
    }
    conn.release();
    console.log('✅ MySQL tables initialized');
}
initDB().catch(err => {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
});
exports.default = db;
//# sourceMappingURL=db.js.map