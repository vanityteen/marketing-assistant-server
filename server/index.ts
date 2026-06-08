import 'dotenv/config'
import express from 'express'
import path from 'path'
import cors from 'cors'
import session from 'express-session'
import authRouter from './routes/auth'
import eventsRouter from './routes/events'
import leadsRouter from './routes/leads'
import contactsRouter from './routes/contacts'
import settingsRouter from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}))
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'marketing-assistant-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}))

// API routes
app.use('/api/auth', authRouter)
app.use('/api/events', eventsRouter)
app.use('/api/leads', leadsRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/settings', settingsRouter)

// 全局错误处理中间件 - 捕获 asyncHandler 抛出的异常
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`❌ [${req.method} ${req.path}]`, err.message)
  res.status(500).json({
    error: '服务器内部错误，请稍后重试',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
