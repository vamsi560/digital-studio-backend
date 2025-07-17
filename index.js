// Production-Ready Backend Server with Agentic Workflow
// This server orchestrates multiple AI agents, handles Figma API integration,
// and generates a complete, runnable React project scaffold.

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const { GoogleGenerativeAI, GoogleAIFileManager } = require('@google/generative-ai');
const axios = require('axios');

dotenv.config();

const app = express();

// --- Middleware Setup ---
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

// --- API Initialization with Failover ---
// Hardcoded API keys
const apiKeys = "AIzaSyA5_KnR58T2MTG4oOvBeAqbd8idJCdOlRA,AIzaSyBH27G69SVWBCA4HwfhIJvkfvKz-O7c_ck".split(',').filter(k => k.trim());

// Hardcoded Figma API token
const figmaApiToken = "figd_ZCTpI10vwPC5xoN5h7zKW7eZlVqmkfFF6s5qUCQO";

// Define a list of models to try in order of preference
const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];

if (apiKeys.length === 0) {
    console.error("FATAL: No GEMINI_API_KEY or GEMINI_API_KEYS found in environment variables.");
}


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

/**
 * NEW: A robust function to call the Generative AI with retry and failover logic.
 * It iterates through available models and API keys until a successful response is received.
 */
async function callGenerativeAIWithRetry(prompt, images = [], generationConfigOptions = {}) {
    if (apiKeys.length === 0) {
        throw new Error("Cannot call Generative AI because no API keys are configured.");
    }

    // Iterate through each model defined in our preferred list
    for (const modelName of modelsToTry) {
        // For each model, iterate through each available API key
        for (const apiKey of apiKeys) {
            try {
                console.log(`Attempting to call AI with model: ${modelName} and key: ...${apiKey.slice(-4)}`);
                
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: modelName });

                const contentParts = [{ text: prompt }, ...images];
                const generationConfig = { ...generationConfigOptions };
                
                const result = await model.generateContent({ 
                    contents: [{ role: "user", parts: contentParts }],
                    generationConfig
                });
                
                const response = await result.response;
                let text = response.text();
                
                if (!generationConfig.responseMimeType || generationConfig.responseMimeType !== 'application/json') {
                    text = text.replace(/```(json|javascript|jsx)?/g, '').replace(/```/g, '').trim();
                }

                console.log(`Successfully received response using model: ${modelName}`);
                return text; // Success! Return the response text.

            } catch (error) {
                // Log the error and prepare to retry with the next key/model
                console.warn(`Attempt failed with model: ${modelName} and key: ...${apiKey.slice(-4)}`);
                console.warn(`Error: ${error.message}`);
                // Check for specific error types if needed, e.g., error.status === 429 for rate limits
            }
        }
    }

    // If all attempts with all keys and all models fail, throw a final error.
    throw new Error("All attempts to call the Generative AI failed with all available models and API keys.");
}


// --- Boilerplate File Content ---
const getProjectFiles = (projectName, generatedFiles) => {
    const allFiles = { ...generatedFiles };

    allFiles['package.json'] = JSON.stringify({
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        private: true,
        version: '0.1.0',
        dependencies: {
            '@testing-library/jest-dom': '^5.17.0',
            '@testing-library/react': '^13.4.0',
            '@testing-library/user-event': '^13.5.0',
            'react': '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.22.3',
            'react-scripts': '5.0.1',
            'web-vitals': '^2.1.4',
            'prop-types': '^15.8.1' 
        },
        devDependencies: {
            "eslint-plugin-react-refresh": "^0.4.7",
            "tailwindcss": "^3.4.3", 
            "postcss": "^8.4.38",     
            "autoprefixer": "^10.4.19" 
        },
        scripts: {
            start: 'react-scripts start',
            build: 'react-scripts build',
            test: 'react-scripts test',
            eject: 'react-scripts eject'
        },
        eslintConfig: {
            extends: [
                'react-app',
                'react-app/jest'
            ]
        },
        browserslist: {
            production: [
                '>0.2%',
                'not dead',
                'not op_mini all'
            ],
            development: [
                'last 1 chrome version',
                'last 1 firefox version',
                'last 1 safari version'
            ]
        }
    }, null, 2);
    
    allFiles['tailwind.config.js'] = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;
    
    allFiles['postcss.config.js'] = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    allFiles['README.md'] = `# ${projectName}\n\nThis project was generated by VM Digital Studio.`;
    
    allFiles['public/index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    
    allFiles['public/favicon.ico'] = ''; 
    allFiles['public/manifest.json'] = JSON.stringify({
        short_name: projectName,
        name: `VM Digital Studio - ${projectName}`,
        start_url: ".",
        display: "standalone",
        theme_color: "#000000",
        background_color: "#ffffff"
    }, null, 2);


    allFiles['src/index.js'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
`;

    allFiles['src/index.css'] = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

    allFiles['src/reportWebVitals.js'] = `const reportWebVitals = onPerfEntry => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
`;

    return allFiles;
}

// --- API Routes ---

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Digital Studio backend is running!' });
});

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
        
        let plan;
        let planJson;
        try {
            // UPDATED to use the new retry function
            planJson = await callGenerativeAIWithRetry(architectPrompt, imageParts, { responseMimeType: "application/json" });
            plan = JSON.parse(planJson);
        } catch (e) {
            console.error("Fatal: Failed to parse JSON from Architect Agent.", e);
            console.error("Architect Agent raw response:", planJson);
            throw new Error("Architect Agent failed to produce valid JSON. Cannot continue.");
        }
        
        plan.pages = Array.isArray(plan.pages) ? plan.pages.map(toPascalCase) : [];
        plan.reusable_components = Array.isArray(plan.reusable_components) ? plan.reusable_components.map(toPascalCase) : [];

        console.log("Agent [Architect]: Plan created:", plan);

        // === Step 2: Component Builder Agent (BATCHED) ===
        console.log("Agent [Component Builder]: Building reusable components in a single batch...");
        const componentNames = plan.reusable_components;
        if (componentNames.length > 0) {
            const componentBuilderPrompt = `Based on the provided UI screens, generate the React JSX code for all of the following reusable components: ${componentNames.join(', ')}.
Your response MUST be a single JSON object.
The keys of the object should be the component names in PascalCase (e.g., "Header", "Footer").
The values should be the complete, raw JSX code for each corresponding component as a string.
The components should be functional, use Tailwind CSS, and be highly reusable.
IMPORTANT: Each component's code MUST end with a default export statement, for example: 'export default ComponentName;'`;

            const properties = {};
            componentNames.forEach(name => {
                properties[name] = { type: "STRING" };
            });

            const componentSchema = {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: properties,
                },
            };

            let components;
            let componentsJson;
            try {
                // UPDATED to use the new retry function
                componentsJson = await callGenerativeAIWithRetry(componentBuilderPrompt, imageParts, componentSchema);
                components = JSON.parse(componentsJson);
            } catch (e) {
                console.error("Fatal: Failed to parse JSON from Component Builder Agent.", e);
                console.error("Component Builder Agent raw response:", componentsJson);
                throw new Error("Component Builder Agent failed to produce valid JSON. Cannot continue.");
            }

            for (const componentName in components) {
                const code = components[componentName];
                generatedFiles[`src/components/${componentName}.jsx`] = code;
                console.log(` -> Built: ${componentName}`);
            }
        }

        // === Step 3: Page Composer Agent ===
        console.log("Agent [Page Composer]: Building pages...");
        for (let i = 0; i < plan.pages.length; i++) {
            const pageName = plan.pages[i];
            console.log(` -> Building: ${pageName}`);
            const importStatements = plan.reusable_components.map(comp => `import ${comp} from '../components/${comp}';`).join('\n');
            const pagePrompt = `Generate the React JSX code for the page named "${pageName}", based on the corresponding screen design. You must import and use the available reusable components where appropriate.\n${importStatements}\nThe page should be functional, use Tailwind CSS, and correctly import components from '../components/'. Do not include any explanations, just the raw JSX code.`;
            // UPDATED to use the new retry function
            const pageCode = await callGenerativeAIWithRetry(pagePrompt, [imageParts[i]]);
            generatedFiles[`src/pages/${pageName}.jsx`] = pageCode;
        }

        // === Step 4: Finisher Agent ===
        if (plan.pages.length > 0) {
            console.log("Agent [Finisher]: Assembling the application...");
            // FIXED: More robust prompt for the Finisher Agent to prevent router errors.
            const finisherPrompt = `You are an expert React developer. Your task is to create the main App.jsx component.
This component will be wrapped by a <BrowserRouter> in index.js, so you MUST NOT include your own <BrowserRouter> in App.jsx.
You MUST set up routing for the following pages using react-router-dom:
${plan.pages.map(p => `- ${p}`).join('\n')}

Follow these instructions exactly:
1. Import React, { Routes, Route, NavLink } from 'react-router-dom'.
2. Import all page components using their exact names and paths, like: 'import PageName from "./pages/PageName";'.
3. The component function should be named 'App'.
4. Inside the App component, create a navigation bar using <nav> and <NavLink> for each page.
5. The NavLink 'to' prop for the first page, "${plan.pages[0]}", must be "/". For all other pages, the 'to' prop should be the page name in lowercase (e.g., "/pagename").
6. After the navigation, use the <Routes> component to define the routes.
7. Inside <Routes>, create a <Route> for each page. The 'path' prop must match the NavLink 'to' prop. The 'element' prop should be the page component (e.g., <PageName />).
8. Do not include any explanations, just the raw JSX code for the App.jsx file.
9. End the file with 'export default App;'.`;
            // UPDATED to use the new retry function
            const appRouterCode = await callGenerativeAIWithRetry(finisherPrompt);
            generatedFiles['src/App.jsx'] = appRouterCode;
        } else {
            console.log("Agent [Finisher]: No pages found, creating a fallback App.jsx.");
            generatedFiles['src/App.jsx'] = `import React from 'react';\n\nfunction App() {\n  return (\n    <div style={{ padding: '2rem', textAlign: 'center' }}>\n      <h1>Code Generation Incomplete</h1>\n      <p>The AI architect did not identify any pages from the provided images. Please try again with different images.</p>\n    </div>\n  );\n}\n\nexport default App;`;
        }
        
        // === Step 5: QA Reviewer Agent ===
        let accuracyResult = { score: 0, justification: "Skipped; no pages were generated to review." };
        if (plan.pages.length > 0) {
            console.log("Agent [QA Reviewer]: Performing quality check...");
            let accuracyResultJson;
            try {
                const qaSchema = {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            score: { type: "NUMBER" },
                            justification: { type: "STRING" },
                        },
                    },
                };
                const accuracyPrompt = `You are a UI/UX quality assurance expert. Compare the provided user interface image with the generated React code. Based on your analysis of layout, color, typography, and component structure, provide a percentage score representing the accuracy of the code. Also, provide a brief one-sentence justification for your score. Respond only in JSON format with the keys "score" (a number) and "justification" (a string).`;
                // UPDATED to use the new retry function
                accuracyResultJson = await callGenerativeAIWithRetry(accuracyPrompt, [imageParts[0]], qaSchema);
                accuracyResult = JSON.parse(accuracyResultJson);
                console.log("Agent [QA Reviewer]: Accuracy score calculated:", accuracyResult);
            } catch (e) {
                console.error("Non-fatal: Failed to parse JSON from QA Reviewer Agent.", e);
                console.error("QA Reviewer Agent raw response:", accuracyResultJson);
                accuracyResult = { score: 0, justification: "Accuracy could not be determined due to a response parsing error." };
            }
        } else {
             console.log("Agent [QA Reviewer]: No pages found, skipping quality check.");
        }
        
        // === Final Step: Add Boilerplate Files ===
        const finalProjectFiles = getProjectFiles(projectName, generatedFiles);

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles: finalProjectFiles, accuracyResult });

    } catch (error) {
        console.error('Error during agentic code generation:', error.message);
        res.status(500).json({ error: 'An error occurred on the server during code generation. Check server logs for details.' });
    }
});

// Export the app for Vercel
module.exports = app;
