import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/*
 * Dev-only shim for the Vercel serverless functions in /api. Plain `vite` does
 * not run them (the SPA fallback would answer /api/* with index.html), so in
 * local dev the quest-validity check and photo verification would always fall
 * back to "unavailable". This middleware maps POST /api/<name> to
 * api/<name>.js's default export with a minimal (req.body, res.status().json())
 * adapter. Server-side env vars (GEMINI_API_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY) are read from .env.local — never exposed to the
 * browser bundle because they are not VITE_-prefixed. Production is untouched:
 * Vercel serves /api natively.
 */
function vercelApiDev(env) {
  return {
    name: 'petquest-vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([\w-]+)(?:\?.*)?$/.exec(req.url || '')
        if (!m) return next()
        const file = path.resolve(process.cwd(), 'api', `${m[1]}.js`)
        if (!existsSync(file)) return next()
        try {
          const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`)   // fresh import each call (dev)
          let raw = ''
          for await (const chunk of req) raw += chunk
          req.body = raw ? JSON.parse(raw) : {}
          const shim = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this },
            json(obj) {
              res.statusCode = this.statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(obj))
              return this
            },
          }
          await mod.default(req, shim)
        } catch (e) {
          console.error(`[api-dev] /api/${m[1]} failed:`, e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'dev_handler_failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), vercelApiDev(loadEnv(mode, process.cwd(), ''))],
}))
