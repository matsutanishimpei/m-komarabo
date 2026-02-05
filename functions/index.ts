import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono()

app.get('/', (c) => {
  return c.text('困りごとラボ 〜街の課題の試作室〜 起動！')
})

// Pages Functionsで動かすための重要な1行
export const onRequest = handle(app)