import type { ProjectFiles } from '@wb/shared';

/**
 * Starter project mounted into every new WebContainer. Versions are pinned
 * to toolchains known to work inside WebContainers (pure-JS builds: Vite 5,
 * Tailwind 3 via PostCSS). Tailwind 4 / Vite 7+ rely on native binaries.
 */
const packageJson = {
  name: 'my-app',
  private: true,
  version: '0.0.0',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    'lucide-react': '0.460.0',
    react: '18.3.1',
    'react-dom': '18.3.1',
  },
  devDependencies: {
    '@types/react': '18.3.12',
    '@types/react-dom': '18.3.1',
    '@vitejs/plugin-react': '4.3.4',
    autoprefixer: '10.4.20',
    postcss: '8.4.49',
    tailwindcss: '3.4.17',
    typescript: '5.6.3',
    vite: '5.4.11',
  },
};

export const TEMPLATE_FILES: ProjectFiles = {
  'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
`,
  'src/vite-env.d.ts': `/// <reference types="vite/client" />
`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  'src/App.tsx': `export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
      <p>Your app will appear here.</p>
    </main>
  );
}
`,
  '.gitignore': `node_modules
dist
*.local
`,
  'README.md': `# My App

Generated with Website Builder.

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
};
