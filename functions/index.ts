import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('困りごとラボ 〜街の課題の試作室〜 起動！')
})

export default app