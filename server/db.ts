// 导入 MySQL 数据库驱动（使用 Promise API）
import mysql from 'mysql2/promise'

/**
 * 创建 MySQL 连接池配置
 * 通过环境变量配置数据库连接参数，提供默认值用于本地开发
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',           // 数据库主机地址
  port: parseInt(process.env.DB_PORT || '3306'),      // 数据库端口号
  user: process.env.DB_USER || 'root',                // 数据库用户名
  password: process.env.DB_PASSWORD || '',            // 数据库密码
  database: process.env.DB_NAME || 'marketing_assistant', // 数据库名称
  waitForConnections: true,                           // 当无可用连接时等待
  connectionLimit: 10,                                // 最大连接数
  queueLimit: 0,                                      // 等待队列长度限制（0表示无限制）
  charset: 'utf8mb4',                                 // 字符集（支持 emoji 等）
  connectTimeout: 10000,                              // 连接超时（10秒）
  enableKeepAlive: true,                              // 启用TCP保活探测
  keepAliveInitialDelay: 10000                        // 保活探测初始延迟（10秒）
})

// 定义数据库查询结果的类型
export type DBRow = Record<string, unknown>           // 单行数据：键值对对象
export type DBResult = mysql.ResultSetHeader          // 执行结果：包含 affectedRows、insertId 等信息

/**
 * 封装数据库操作方法
 * 提供统一的接口进行增删改查操作
 */
const db = {
  /**
   * 查询单条记录
   * @param sql SQL 查询语句
   * @param params 查询参数（可选）
   * @returns 第一条匹配的记录，未找到返回 undefined
   */
  get: async (sql: string, ...params: unknown[]) => {
    const [rows] = params.length ? await pool.execute(sql, params as mysql.ExecuteValues) : await pool.execute(sql)
    return (rows as DBRow[])[0]
  },
  
  /**
   * 查询多条记录
   * @param sql SQL 查询语句
   * @param params 查询参数（可选）
   * @returns 所有匹配的记录数组
   */
  all: async (sql: string, ...params: unknown[]) => {
    const [rows] = params.length ? await pool.execute(sql, params as mysql.ExecuteValues) : await pool.execute(sql)
    return rows as DBRow[]
  },
  
  /**
   * 执行写操作（INSERT、UPDATE、DELETE）
   * @param sql SQL 执行语句
   * @param params 执行参数（可选）
   * @returns 执行结果对象（包含影响行数、插入ID等）
   */
  run: async (sql: string, ...params: unknown[]) => {
    const [result] = params.length ? await pool.execute(sql, params as mysql.ExecuteValues) : await pool.execute(sql)
    return result as DBResult
  }
}

/**
 * 初始化数据库表结构和种子数据
 * 在应用启动时自动执行，确保数据库就绪
 */
async function initDB() {
  // 获取数据库连接
  const conn = await pool.getConnection()

  // ==================== 创建用户表 ====================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,              -- 用户ID（主键，自增）
      name VARCHAR(255) NOT NULL,                      -- 用户姓名
      role VARCHAR(50) DEFAULT 'marketer',             -- 用户角色（默认：营销人员）
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP    -- 创建时间
    )
  `)

  // ==================== 创建活动表 ====================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,              -- 活动ID（主键，自增）
      name VARCHAR(255) NOT NULL,                      -- 活动名称
      start_date DATE NOT NULL,                        -- 开始日期
      end_date DATE NOT NULL,                          -- 结束日期
      budget DECIMAL(10,2) DEFAULT 0,                  -- 预算金额
      expense DECIMAL(10,2) DEFAULT 0,                 -- 已花费金额
      description TEXT,                                -- 活动描述
      status VARCHAR(50) DEFAULT 'active',             -- 活动状态（active/ended等）
      form_fields TEXT,                                -- 表单字段配置（JSON格式）
      created_by INT REFERENCES users(id),             -- 创建人ID（外键关联users表）
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP    -- 创建时间
    )
  `)

  // ==================== 创建潜在客户表 ====================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,              -- 线索ID（主键，自增）
      name VARCHAR(255) NOT NULL,                      -- 客户姓名
      phone VARCHAR(50) NOT NULL,                      -- 联系电话
      event_id INT REFERENCES events(id),              -- 所属活动ID（外键关联events表）
      status VARCHAR(50) DEFAULT 'pending',            -- 跟进状态（pending/contacted/negotiating/converted）
      owner_id INT REFERENCES users(id),               -- 负责人ID（外键关联users表，NULL表示公海池）
      rating INT DEFAULT 0,                            -- 客户评级（0-5星）
      custom_data TEXT,                                -- 自定义数据（JSON格式）
      claimed_at DATETIME,                             -- 领取时间
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP    -- 创建时间
    )
  `)

  // ==================== 创建跟进记录表 ====================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id INT AUTO_INCREMENT PRIMARY KEY,              -- 跟进记录ID（主键，自增）
      lead_id INT REFERENCES leads(id),                -- 关联的线索ID（外键关联leads表）
      user_id INT REFERENCES users(id),                -- 跟进人ID（外键关联users表）
      status VARCHAR(50),                              -- 跟进状态
      rating INT,                                      -- 跟进评分
      note TEXT,                                       -- 跟进备注
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP    -- 创建时间
    )
  `)

  // ==================== 创建设置表 ====================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,              -- 设置ID（主键，自增）
      user_id INT UNIQUE REFERENCES users(id),         -- 用户ID（唯一外键，一对一关系）
      recovery_days INT DEFAULT 7,                     -- 回收天数（超过此天数未跟进的线索将回收到公海池）
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP    -- 更新时间
    )
  `)

  // ==================== 初始化种子数据 ====================
  // 检查是否已有用户数据，避免重复插入
  const [rows] = await conn.execute('SELECT COUNT(*) as count FROM users')
  if ((rows as DBRow[])[0].count === 0) {
    // 插入初始用户数据
    await conn.execute("INSERT INTO users (name, role) VALUES ('张三', 'marketer')")
    await conn.execute("INSERT INTO users (name, role) VALUES ('李经理', 'salesperson')")

    // 插入示例活动数据
    await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('夏季促销活动', '2026-06-01', '2026-06-30', 10000, 6500,
        '夏季促销活动，针对新品进行推广，通过线上线下结合的方式吸引客户参与，提升品牌知名度和产品销量。',
        'active',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true},{\"name\":\"感兴趣的产品\",\"type\":\"select\",\"required\":false,\"options\":\"产品A,产品B,产品C,其他\"}]',
        1)
    `)
    await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('春季展会活动', '2026-04-01', '2026-04-30', 8000, 4000,
        '春季行业展会参展活动，展示公司最新产品和解决方案。',
        'ended',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true}]',
        1)
    `)
    await conn.execute(`
      INSERT INTO events (name, start_date, end_date, budget, expense, description, status, form_fields, created_by)
      VALUES ('新品发布会', '2026-05-15', '2026-05-30', 15000, 8500,
        '新品发布会，邀请行业客户和媒体参加，重点推广新一代产品。',
        'active',
        '[{\"name\":\"姓名\",\"type\":\"text\",\"required\":true},{\"name\":\"手机号码\",\"type\":\"text\",\"required\":true},{\"name\":\"公司名称\",\"type\":\"text\",\"required\":false}]',
        1)
    `)

    // 插入公海池线索（未分配负责人的线索）
    await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('张三', '13812341234', 1, 'pending')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('李四', '13956785678', 2, 'pending')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('王五', '13790129012', 1, 'pending')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status) VALUES ('赵六', '13634563456', 3, 'pending')")
    
    // 插入个人线索（已分配给用户的线索）
    await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, claimed_at) VALUES ('钱七', '13511112222', 1, 'pending', 1, '2026-05-10 10:00:00')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('孙八', '13622223333', 1, 'contacted', 1, 3, '2026-05-09 10:00:00')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('周九', '13733334444', 2, 'negotiating', 1, 4, '2026-05-11 10:00:00')")
    await conn.execute("INSERT INTO leads (name, phone, event_id, status, owner_id, rating, claimed_at) VALUES ('吴十', '13844445555', 1, 'converted', 1, 5, '2026-05-08 10:00:00')")

    // 插入用户设置（回收天数为7天）
    await conn.execute('INSERT INTO settings (user_id, recovery_days) VALUES (1, 7)')

    console.log('✅ Seed data inserted successfully')
  }

  // 释放数据库连接
  conn.release()
  console.log('✅ MySQL tables initialized')
}

// 执行数据库初始化，失败则退出进程
initDB().catch(err => {
  console.error('❌ Database initialization failed:', (err as Error).message)
  process.exit(1)
})

// 导出连接池和数据库操作工具
export { pool }
export default db
