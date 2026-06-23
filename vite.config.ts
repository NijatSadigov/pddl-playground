import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes all asset URLs relative, so the built site works whether it
// is served at the root of a subdomain (https://pddl.example.com/) or from a
// sub-path (https://example.com/pddl/). Safe default for static hosting.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
})
