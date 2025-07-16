// Production-Ready Backend Server with Agentic Workflow
// This server orchestrates multiple AI agents, handles Figma API integration,
// and generates a complete, runnable React project scaffold.

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

dotenv.config();

const app = express();

// --- Middleware Setup ---
// This allows your Vercel-hosted frontend to make requests to this backend.
const corsOptions = {
  origin: 'https://digital-studio-frontend-new.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pre-flight request handling
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const figmaApiToken = process.env.FIGMA_API_TOKEN;
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// --- Helper Functions ---
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

function toPascalCase(str) {
    if (typeof str !== 'string' || !str) {
        return `Component${Math.floor(Math.random() * 1000)}`;
    }
    return str
        .replace(/[^a-zA-Z0-9]+/g, ' ') 
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

async function callGenerativeAI(prompt, images = [], isJsonResponse = false) {
    const contentParts = [{ text: prompt }, ...images];
    
    const generationConfig = isJsonResponse ? {
        responseMimeType: "application/json",
        responseSchema: {
            type: "OBJECT",
            properties: {
                score: { type: "NUMBER" },
                justification: { type: "STRING" },
            },
        },
    } : {};

    const result = await model.generateContent({ 
        contents: [{ role: "user", parts: contentParts }],
        generationConfig
    });
    const response = await result.response;
    let text = response.text();
    
    if (!isJsonResponse) {
        text = text.replace(/```(json|javascript|jsx)?/g, '').replace(/```/g, '').trim();
    }
    return text;
}

// --- Boilerplate File Content ---
const getProjectFiles = (projectName, generatedFiles) => {
    const allFiles = { ...generatedFiles };

    allFiles['package.json'] = JSON.stringify({
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
            dev: 'vite',
            build: 'vite build',
            lint: 'eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0',
            preview: 'vite preview',
        },
        dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.22.3',
        },
        devDependencies: {
            '@types/react': '^18.2.66',
            '@types/react-dom': '^18.2.22',
            '@vitejs/plugin-react': '^4.2.1',
            autoprefixer: '^10.4.19',
            eslint: '^8.57.0',
            'eslint-plugin-react': '^7.34.1',
            'eslint-plugin-react-hooks': '^4.6.0',
            'eslint-plugin-react-refresh': '^0.4.6',
            postcss: '^8.4.38',
            tailwindcss: '^3.4.3',
            vite: '^5.2.0',
        },
    }, null, 2);

    allFiles['vite.config.js'] = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})`;

    allFiles['tailwind.config.js'] = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

    allFiles['postcss.config.js'] = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    allFiles['.eslintrc.json'] = JSON.stringify({
        root: true,
        env: { browser: true, es2020: true },
        extends: [
            "eslint:recommended",
            "plugin:react/recommended",
            "plugin:react/jsx-runtime",
            "plugin:react-hooks/recommended"
        ],
        ignorePatterns: ["dist", ".eslintrc.cjs"],
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        settings: { react: { version: "18.2" } },
        plugins: ["react-refresh"],
        rules: {
            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true }
            ]
        }
    }, null, 2);

    allFiles['README.md'] = `# ${projectName}\n\nThis project was generated by VM Digital Studio.\n\n## Setup\n\n1. \`npm install\`\n2. \`npm run dev\``;
    
    allFiles['public/vite.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><path fill="#646cff" d="M249.6 139.5c-4.2-13.4-12.7-25.2-25.7-34.9-10.3-7.7-22.3-13.3-35.6-16.5-13.8-3.3-28.3-3.2-42.2.3-13.1 3.3-25.4 9.3-36.1 17.6-12.6 9.8-22.3 22.9-28.3 38.3-6.3 16.2-7.8 33.9-4.5 51.1 2.8 14.8 9.3 28.7 18.8 40.8 9.3 11.9 21.4 21.2 35.2 27.2 14.3 6.2 30 8.8 45.4 7.2 15.9-1.6 31.1-7.9 44.2-18.1 13.3-10.4 23.9-24.1 30.6-40C255.7 172.3 254.5 154.5 249.6 139.5Z"/><path fill="#fff" d="M121.3 33.4c-2.4-6.4-10.6-9.1-17-5.8L35 68.5c-6.4 3.4-9.1 11.6-5.8 18 3.4 6.4 11.6 9.1 18 5.8l69.2-40.9c6.4-3.3 9.1-11.5 5.9-18Z"/><path fill="#fff" d="M220.9 88.2c-6.4-3.4-14.6-.7-18 5.8L132.6 188c-3.4 6.4-.7 14.6 5.8 18 6.4 3.4 14.6.7 18-5.8l70.3-94c3.4-6.4.7-14.6-5.8-18Z"/></svg>`;

    allFiles['index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

    allFiles['src/main.jsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)`;

    allFiles['src/index.css'] = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

    return allFiles;
}

// --- API Routes ---

app.get('/api', (req, res) => {
    res.send('Backend server is running!');
});

app.post('/api/import-figma', async (req, res) => {
    const { figmaUrl } = req.body;
    if (!figmaUrl) {
        return res.status(400).json({ error: 'Figma URL is required.' });
    }
    if (!figmaApiToken) {
        return res.status(500).json({ error: 'Figma API token is not configured on the server.' });
    }

    try {
        const fileKeyMatch = figmaUrl.match(/file\/([a-zA-Z0-9]+)/);
        if (!fileKeyMatch || !fileKeyMatch[1]) {
            return res.status(400).json({ error: 'Invalid Figma URL format. Could not extract file key.' });
        }
        const fileKey = fileKeyMatch[1];

        console.log(`Fetching Figma file with key: ${fileKey}`);
        const figmaFileResponse = await axios.get(`https://api.figma.com/v1/files/${fileKey}`, {
            headers: { 'X-Figma-Token': figmaApiToken }
        });

        const canvas = figmaFileResponse.data.document.children.find(c => c.type === 'CANVAS');
        if (!canvas) {
             return res.status(404).json({ error: 'No canvas found on the first page of the Figma file.' });
        }

        const frameIds = canvas.children.filter(c => c.type === 'FRAME').map(c => c.id);

        if (frameIds.length === 0) {
            return res.status(404).json({ error: 'No frames found on the first page of the Figma file.' });
        }

        console.log(`Found ${frameIds.length} frames. Fetching images...`);
        const figmaImagesResponse = await axios.get(`https://api.figma.com/v1/images/${fileKey}?ids=${frameIds.join(',')}&format=png`, {
            headers: { 'X-Figma-Token': figmaApiToken }
        });
        
        const imageUrls = figmaImagesResponse.data.images;
        const frameNames = canvas.children.filter(c => c.type === 'FRAME').map(c => ({id: c.id, name: c.name}));
        
        const result = frameNames.map(frame => ({
            fileName: `${frame.name}.png`,
            imageUrl: imageUrls[frame.id]
        }));

        res.json(result);

    } catch (error) {
        console.error('Error fetching from Figma API:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch data from Figma API. Check server logs for details.' });
    }
});


// --- Code Generation API Endpoint (for image uploads) ---
app.post('/api/generate-code', upload.array('screens'), async (req, res) => {
    console.log('Received request to /api/generate-code');

    try {
        const { projectName = 'react-project' } = req.body;
        const screenFiles = req.files;
        if (!screenFiles || screenFiles.length === 0) {
            return res.status(400).json({ error: 'No screen images provided.' });
        }

        const imageParts = screenFiles.map(file => bufferToGenerativePart(file.buffer, file.mimetype));
        let generatedFiles = {};

        // === Step 1: Architect Agent ===
        console.log("Agent [Architect]: Analyzing project structure from images...");
        const architectPrompt = `You are an expert software architect. Analyze these UI screens holistically. Your task is to identify all distinct pages and all common, reusable components (like navbars, buttons, cards, footers, etc.). Provide your output as a single JSON object with two keys: "pages" and "reusable_components". IMPORTANT: All names must be in PascalCase.`;
        const planJson = await callGenerativeAI(architectPrompt, imageParts);
        const plan = JSON.parse(planJson);
        
        plan.pages = plan.pages.map(toPascalCase);
        plan.reusable_components = plan.reusable_components.map(toPascalCase);

        console.log("Agent [Architect]: Plan created:", plan);

        // === Step 2: Component Builder Agent ===
        console.log("Agent [Component Builder]: Building reusable components...");
        for (const componentName of plan.reusable_components) {
            console.log(` -> Building: ${componentName}`);
            const componentPrompt = `Based on the provided UI screens, generate the React JSX code for the reusable component named "${componentName}". The component should be functional, use Tailwind CSS, and be highly reusable. Do not include any explanations, just the raw JSX code for the component.`;
            const componentCode = await callGenerativeAI(componentPrompt, imageParts);
            generatedFiles[`src/components/${componentName}.jsx`] = componentCode;
        }

        // === Step 3: Page Composer Agent ===
        console.log("Agent [Page Composer]: Building pages...");
        for (let i = 0; i < plan.pages.length; i++) {
            const pageName = plan.pages[i];
            console.log(` -> Building: ${pageName}`);
            const importStatements = plan.reusable_components.map(comp => `import ${comp} from '../components/${comp}';`).join('\n');
            const pagePrompt = `Generate the React JSX code for the page named "${pageName}", based on the corresponding screen design. You must import and use the available reusable components where appropriate.\n${importStatements}\nThe page should be functional, use Tailwind CSS, and correctly import components from '../components/'. Do not include any explanations, just the raw JSX code.`;
            const pageCode = await callGenerativeAI(pagePrompt, [imageParts[i]]);
            generatedFiles[`src/pages/${pageName}.jsx`] = pageCode;
        }

        // === Step 4: Finisher Agent ===
        console.log("Agent [Finisher]: Assembling the application...");
        const finisherPrompt = `You are an expert React developer. Create the main App.jsx component that sets up routing for the following pages using react-router-dom. You MUST import the page components using these exact names and paths:\n${plan.pages.map(p => `- import ${p} from './pages/${p}';`).join('\n')}\nCreate a simple navigation bar with a NavLink for each page. The first page, "${plan.pages[0]}", should be the home route ('/'). Do not include any explanations, just the raw JSX code.`;
        const appRouterCode = await callGenerativeAI(finisherPrompt);
        generatedFiles['src/App.jsx'] = appRouterCode;
        
        // === Step 5: QA Reviewer Agent ===
        console.log("Agent [QA Reviewer]: Performing quality check...");
        const accuracyPrompt = `You are a UI/UX quality assurance expert. Compare the provided user interface image with the generated React code. Based on your analysis of layout, color, typography, and component structure, provide a percentage score representing the accuracy of the code. Also, provide a brief one-sentence justification for your score. Respond only in JSON format with the keys "score" (a number) and "justification" (a string).`;
        const firstPageName = plan.pages[0];
        const firstPageCode = generatedFiles[`src/pages/${firstPageName}.jsx`];
        const accuracyResultJson = await callGenerativeAI(accuracyPrompt, [imageParts[0]], true);
        const accuracyResult = JSON.parse(accuracyResultJson);
        console.log("Agent [QA Reviewer]: Accuracy score calculated:", accuracyResult);
        
        // === Final Step: Add Boilerplate Files ===
        const finalProjectFiles = getProjectFiles(projectName, generatedFiles);

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles: finalProjectFiles, accuracyResult });

    } catch (error) {
        console.error('Error during agentic code generation:', error);
        res.status(500).json({ error: 'An error occurred on the server during code generation.' });
    }
});
app.get('/', (req, res) => {
  res.send('Backend server is running!');
});

// Export the app for Vercel
module.exports = app;
