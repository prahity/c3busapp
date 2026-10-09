/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import eslint from "vite-plugin-eslint2";
import tailwindcss from "@tailwindcss/vite";


// Browsers send a more-specific same-name cookie before its parent-path cookie.
// Forward only the parent c3auth value so an invalid uiservice cookie cannot
// shadow the refreshed environment cookie.
function preferParentC3AuthCookie(cookieHeader: string): string {
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const c3authCookies = cookies.filter((cookie) => cookie.startsWith("c3auth="));
  if (c3authCookies.length <= 1) {
    return cookieHeader;
  }

  return [
    ...cookies.filter((cookie) => cookie && !cookie.startsWith("c3auth=")),
    c3authCookies[c3authCookies.length - 1],
  ].join("; ");
}

// Helper to create proxy config that forwards per-user auth from the incoming request.
// Falls back to a static token (VITE_C3_AUTH_TOKEN) for local development outside the container.
function createProxyConfig(target: string, fallbackToken?: string) {
  return {
    target,
    changeOrigin: true,
    configure: (proxy: any, _options: any) => {
      proxy.on("proxyReq", (proxyReq: any, req: any, _res: any) => {
        const incomingAuth = req.headers['authorization'];
        const incomingCookie = req.headers['cookie'];
        if (incomingAuth) {
          proxyReq.setHeader("Authorization", incomingAuth);
        } else if (incomingCookie) {
          proxyReq.setHeader("Cookie", preferParentC3AuthCookie(incomingCookie));
        } else if (fallbackToken) {
          proxyReq.setHeader("Authorization", `c3auth=${fallbackToken}`);
        }
      });
    },
  };
}

// ===== Vite Config =====
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const port = parseInt(env.VITE_DEV_SERVER_PORT || '9000', 10);
  const pkgName = env.VITE_C3_PKG;
  const authAuth = env.VITE_C3_AUTH_TOKEN;
  const appUrl = `${env.VITE_C3_BASE_URL}/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/`;
  const base = command === 'serve' ? `/${env.VITE_C3_ENV}/${env.VITE_C3_APP}/uiservice/` : './';

  if (!pkgName) {
    throw new Error('VITE_C3_PKG is not set');
  }

  if (command === 'build' && mode === 'production' && env.VITE_C3_AUTH_TOKEN) {
    throw new Error('❌ BUILD FAILED: VITE_C3_AUTH_TOKEN must not be set in production builds.');
  }

  return {
    plugins: [
      tailwindcss(),
      react(),
      // Single eslint2 instance with valid options
      eslint({
        lintOnStart: true,
        cache: false,
        include: ["src/**/*.{ts,tsx,js,jsx}"],
        // Exclude tests and build artifacts from dev-time linting to prevent Vite startup failures
        exclude: [
          "node_modules/**",
          "dist/**",
          "build/**",
          "coverage/**",
          "assets/**",
          "src/**/__tests__/**",
          "src/**/*.test.{ts,tsx,js,jsx}",
        ]
      }),
    ],
    resolve: {
      // `@` maps to `src/`. This template does not ship a `resources/examples/`
      // tree, so there is no `@/shared` alias (the design-system components live
      // under `src/components/ui` and are imported via `@/components/ui/...`).
      alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
    },
    server: {
      host: true,
      allowedHosts: true,
      port: port,
      strictPort: true,
      proxy: {
        "^/api": createProxyConfig(appUrl, authAuth),
        "^/remote": createProxyConfig(appUrl, authAuth),
        "^/thirdparty": createProxyConfig(appUrl, authAuth),
        "^/typesys": createProxyConfig(appUrl, authAuth)
      },
    },
    base: base,
    build: {
      outDir: `../content/${pkgName}`,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name][extname]",
          chunkFileNames: "assets/[name].js",
          entryFileNames: "assets/[name].js",
        },
        onwarn: (warning, warn) => {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
  };
});
