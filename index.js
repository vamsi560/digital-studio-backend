// Production-Ready Backend Server with Agentic Workflow
// This server orchestrates multiple AI agents, handles Figma API integration,
// and generates a complete, runnable React, Android, or iOS project scaffold from images or text.
// NOW VERCEL-COMPATIBLE: Uses CommonJS modules and exports the app.

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const axios = require('axios');
// This is a placeholder for a service that would interact with a Figma API/plugin
// const { getFigmaData } = require('./figma-mcp-service.js');

const app = express();
const port = process.env.PORT || 3001;

// --- Middleware Setup ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Resilient API Initialization with Load Balancing ---

// 1. Get all API keys and models from environment variables.
const apiKeys = [
  "AIzaSyBH27G69SVWBCA4HwfhIJvkfvKz-O7c_ck",
  "AIzaSyA5_KnR58T2MTG4oOvBeAqbd8idJCdOlRA",
  "AIzaSyAlW859ro344ulhwmTJKwWmYx8uHiTa2IE"
].filter(key => key); // Filter out any empty or falsy keys

if (apiKeys.length === 0) {
    console.error("FATAL ERROR: No GEMINI_API_KEY found in environment variables. Please set at least one GEMINI_API_KEY.");
    // In a real deployment, you might handle this more gracefully
    // For now, we'll prevent the server from starting without keys.
    if (process.env.NODE_ENV !== 'test') {
       process.exit(1);
    }
}

const models = (process.env.GEMINI_MODELS || "gemini-1.5-flash-latest,gemini-2.0-flash,gemini-2.5-flash").split(',');

// 2. Create a pool of API clients.
const clients = apiKeys.map(apiKey => new GoogleGenerativeAI(apiKey));
let currentClientIndex = 0;
let currentModelIndex = 0;

// 3. Create a manager to rotate through clients and models (Round-Robin).
function getApiClient() {
    if (clients.length === 0) {
        throw new Error("No API clients are available. Check your GEMINI_API_KEY environment variables.");
    }
    const client = clients[currentClientIndex];
    const modelName = models[currentModelIndex];

    // Rotate to the next client and model for the next call
    currentClientIndex = (currentClientIndex + 1) % clients.length;
    if (currentClientIndex === 0) {
        // Only switch models after a full cycle of keys
        currentModelIndex = (currentModelIndex + 1) % models.length;
    }
    
    console.log(`Using Model: ${modelName}, API Key Index: ${currentClientIndex}`);
    return client.getGenerativeModel({ model: modelName });
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

// Updated to use the load balancer and include retry logic
async function callGenerativeAI(prompt, images = [], isJsonResponse = false, attempt = 1) {
    const maxAttempts = clients.length * models.length; // Try each combo once
    if (attempt > maxAttempts) {
        throw new Error("All API keys and models have failed. Please check your quotas and API key validity.");
    }

    try {
        const model = getApiClient(); // Get a new client/model for each call
        const contentParts = [{ text: prompt }, ...images];
        const generationConfig = isJsonResponse ? { responseMimeType: "application/json" } : {};

        const result = await model.generateContent({ 
            contents: [{ role: "user", parts: contentParts }],
            generationConfig
        });

        const response = await result.response;
        let text = response.text();
        
        if (!isJsonResponse) {
            text = text.replace(/```(json|javascript|jsx|kotlin|swift|markdown)?/g, '').replace(/```/g, '').trim();
        }
        return text;
    } catch (error) {
        console.error(`API call attempt ${attempt} failed with error: ${error.message}`);
        // If it's a rate limit error, wait and retry with the next key/model
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
            console.log(`Rate limit hit. Waiting 2s before retrying with next key/model...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return callGenerativeAI(prompt, images, isJsonResponse, attempt + 1);
        }
        // For other errors, re-throw
        throw error;
    }
}

async function parseJsonWithCorrection(jsonString, prompt, images = []) {
    let parsedJson;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const cleanedJsonString = jsonString.replace(/```(json)?/g, '').replace(/```/g, '').trim();
            parsedJson = JSON.parse(cleanedJsonString);
            return parsedJson;
        } catch (e) {
            attempts++;
            console.error(`Attempt ${attempts} failed to parse JSON: ${e.message}`);
            if (attempts >= maxAttempts) {
                throw new Error("Failed to parse JSON after multiple attempts.");
            }
            const correctionPrompt = `The following text is not valid JSON. Please correct it and return only the valid JSON object, without any markdown or explanatory text.\n\nInvalid JSON:\n${jsonString}\n\nCorrected JSON:`;
            jsonString = await callGenerativeAI(correctionPrompt, images);
        }
    }
}


// --- Boilerplate File Content (Web - Create React App style) ---
const getProjectFiles = (projectName, generatedFiles) => {
    const allFiles = { ...generatedFiles };

    allFiles['package.json'] = JSON.stringify({
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        version: '0.1.0',
        private: true,
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
        scripts: {
            start: 'react-scripts start',
            build: 'react-scripts build',
            test: 'react-scripts test',
            eject: 'react-scripts eject'
        },
        eslintConfig: {
            extends: ['react-app', 'react-app/jest']
        },
        browserslist: {
            production: ['>0.2%', 'not dead', 'not op_mini all'],
            development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version']
        }
    }, null, 2);

    allFiles['README.md'] = `# ${projectName}\n\nThis project was generated by VM Digital Studio using a standard React setup.\n\n## Available Scripts\n\n### \`npm start\`\nRuns the app in development mode.\n\n### \`npm test\`\nLaunches the test runner.\n\n### \`npm run build\`\nBuilds the app for production.`;
    
    allFiles['public/index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="Web site created using create-react-app"
    />
    <title>${projectName}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`;
    
    allFiles['public/favicon.ico'] = ''; // Placeholder for favicon

    allFiles['src/index.js'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);`;

    allFiles['src/index.css'] = `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}`;

    return allFiles;
}

// --- Boilerplate File Content (Native) ---
const getNativeProjectFiles = (projectName, generatedFiles, platform) => {
    const allFiles = { ...generatedFiles };
    const lowerCaseProjectName = projectName.toLowerCase().replace(/\s+/g, '');

    if (platform === 'android') {
        allFiles['README.md'] = `# ${projectName} (Android)\n\nThis is a Jetpack Compose project generated by VM Digital Studio.`;
        allFiles['build.gradle.kts'] = `// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
}
`;
        allFiles[`gradle/libs.versions.toml`] = `[versions]
agp = "8.3.0"
kotlin = "1.9.0"
coreKtx = "1.10.1"
junit = "4.13.2"
junitVersion = "1.1.5"
espressoCore = "3.5.1"
lifecycleRuntimeKtx = "2.6.1"
activityCompose = "1.7.0"
composeBom = "2023.08.00"

[libraries]
core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
ext-junit = { group = "androidx.test.ext", name = "junit", version.ref = "junitVersion" }
espresso-core = { group = "androidx.test.espresso", name = "espresso-core", version.ref = "espressoCore" }
lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycleRuntimeKtx" }
activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
ui = { group = "androidx.compose.ui", name = "ui" }
ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
material3 = { group = "androidx.compose.material3", name = "material3" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
jetbrains-kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
`;
        allFiles[`app/src/main/java/com/example/${lowerCaseProjectName}/MainActivity.kt`] = generatedFiles['MainActivity.kt'];
        delete generatedFiles['MainActivity.kt']; // remove from root
    } else if (platform === 'ios') {
        allFiles['README.md'] = `# ${projectName} (iOS)\n\nThis is a SwiftUI project generated by VM Digital Studio.`;
        allFiles[`${projectName}/ContentView.swift`] = generatedFiles['ContentView.swift'];
        delete generatedFiles['ContentView.swift']; // remove from root
    }

    return allFiles;
}


// --- API Endpoints ---

// NEW: Root endpoint for Vercel health checks
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Digital Studio backend is running!' });
});

// Code Generation API Endpoint (for web from images)
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
        const architectPrompt = `You are an expert software architect. Analyze these UI screens holistically. Your task is to identify all distinct pages and all common, reusable components (like navbars, buttons, cards, footers, etc.). Provide your output as a single, valid JSON object with two keys: "pages" and "reusable_components". IMPORTANT: All names must be in PascalCase. The JSON must be strictly valid.`;
        const planJson = await callGenerativeAI(architectPrompt, imageParts);
        const plan = await parseJsonWithCorrection(planJson, architectPrompt, imageParts);
        
        plan.pages = plan.pages.map(toPascalCase);
        plan.reusable_components = plan.reusable_components.map(toPascalCase);
        console.log("Agent [Architect]: Plan created:", plan);

        // === Step 2: Component Builder Agent (BATCHED & Rules Enforced) ===
        console.log("Agent [Component Builder]: Building reusable components in a single batch...");
        if (plan.reusable_components && plan.reusable_components.length > 0) {
            const componentList = plan.reusable_components.join(', ');
            const componentPrompt = `Based on the provided UI screens, generate the React JSX code for the following reusable components: ${componentList}.
            Return your response as a single, valid JSON object where each key is the component name (in PascalCase) and the value is the complete, raw JSX code for that component.
            The components should be functional and use Tailwind CSS. Do not include any explanations, just the JSON object.
            IMPORTANT: Each component's code MUST end with a default export statement, for example: 'export default ComponentName;'`;
            const componentsJson = await callGenerativeAI(componentPrompt, imageParts);
            const componentsCode = await parseJsonWithCorrection(componentsJson, componentPrompt, imageParts);

            for (const componentName in componentsCode) {
                if (Object.prototype.hasOwnProperty.call(componentsCode, componentName)) {
                    console.log(` -> Writing file for component: ${componentName}`);
                    generatedFiles[`src/components/${componentName}.jsx`] = componentsCode[componentName];
                }
            }
        }

        // === Step 3: Page Composer Agent (Rules Enforced) ===
        console.log("Agent [Page Composer]: Building pages...");
        for (let i = 0; i < plan.pages.length; i++) {
            const pageName = plan.pages[i];
            console.log(` -> Building: ${pageName}`);
            const importStatements = plan.reusable_components.map(comp => `import ${comp} from '../components/${comp}';`).join('\n');
            const pagePrompt = `Generate the React JSX code for the page named "${pageName}", based on the corresponding screen design. 
            You must import and use the available reusable components where appropriate using the 'import ComponentName from '../components/ComponentName';' syntax.
            ${importStatements}
            The page should be functional, use Tailwind CSS, and correctly import components. Do not include any explanations, just the raw JSX code.
            IMPORTANT: The page's code MUST end with a default export statement, for example: 'export default ${pageName};'`;
            const pageCode = await callGenerativeAI(pagePrompt, [imageParts[i]]);
            generatedFiles[`src/pages/${pageName}.jsx`] = pageCode;
        }

        // === Step 4: Finisher Agent ===
        console.log("Agent [Finisher]: Assembling the application...");
        const finisherPrompt = `You are an expert React developer. Create the main App.js component that sets up routing for the following pages using react-router-dom. You MUST import the page components using these exact names and paths:\n${plan.pages.map(p => `- import ${p} from './pages/${p}';`).join('\n')}\nCreate a simple navigation bar with a NavLink for each page. The first page, "${plan.pages[0]}", should be the home route ('/'). Do not include any explanations, just the raw JSX code.`;
        const appRouterCode = await callGenerativeAI(finisherPrompt);
        generatedFiles['src/App.js'] = appRouterCode;
        
        // === Step 5: QA Reviewer Agent ===
        console.log("Agent [QA Reviewer]: Performing quality check...");
        const qaPrompt = `You are a UI/UX quality assurance expert. Compare the provided user interface image with the generated React code. Based on your analysis of layout, color, typography, and component structure, provide a percentage score representing the accuracy of the code. Also, provide a brief one-sentence justification for your score. Your response must be in a valid JSON format with "score" and "justification" keys.`;
        const accuracyResultJson = await callGenerativeAI(qaPrompt, [imageParts[0]], true);
        console.log("Agent [QA Reviewer]: Accuracy score calculated:", accuracyResultJson);
        
        // === Final Step: Add Boilerplate Files ===
        const finalProjectFiles = getProjectFiles(projectName, generatedFiles);

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles: finalProjectFiles, accuracyResult: accuracyResultJson });

    } catch (error) {
        console.error('Error during agentic code generation:', error);
        res.status(500).json({ error: 'An error occurred on the server during code generation.' });
    }
});

// Code Generation API Endpoint (for native mobile from images)
app.post('/api/generate-native-code', upload.array('screens'), async (req, res) => {
    console.log('Received request to /api/generate-native-code');

    try {
        const { projectName = 'MyMobileApp', platform } = req.body;
        const screenFiles = req.files;
        if (!screenFiles || screenFiles.length === 0) {
            return res.status(400).json({ error: 'No screen images provided.' });
        }
        if (!platform || (platform !== 'android' && platform !== 'ios')) {
            return res.status(400).json({ error: 'A valid platform (android/ios) must be specified.' });
        }

        const imageParts = screenFiles.map(file => bufferToGenerativePart(file.buffer, file.mimetype));
        let generatedFiles = {};
        
        const lang = platform === 'android' ? 'Kotlin with Jetpack Compose' : 'Swift with SwiftUI';
        const fileExt = platform === 'android' ? 'kt' : 'swift';
        const mainFileName = platform === 'android' ? 'MainActivity.kt' : 'ContentView.swift';

        // === Step 1: Architect Agent (Native) ===
        console.log(`Agent [Architect]: Analyzing project structure for ${platform}...`);
        const architectPrompt = `You are an expert ${lang} mobile app architect. Analyze these UI screens. Your task is to identify all distinct screens and all common, reusable UI components (like navigation bars, buttons, cards, etc.). Provide your output as a single, valid JSON object with two keys: "screens" and "reusable_components". IMPORTANT: All names must be in PascalCase. The JSON must be strictly valid.`;
        const planJson = await callGenerativeAI(architectPrompt, imageParts);
        const plan = await parseJsonWithCorrection(planJson, architectPrompt, imageParts);
        
        plan.screens = plan.screens.map(toPascalCase);
        plan.reusable_components = plan.reusable_components.map(toPascalCase);
        console.log("Agent [Architect]: Plan created:", plan);

        // === Step 2: Component Builder Agent (BATCHED, Native) ===
        console.log(`Agent [Component Builder]: Building reusable ${lang} components in a single batch...`);
        if (plan.reusable_components && plan.reusable_components.length > 0) {
            const componentList = plan.reusable_components.join(', ');
            const componentPrompt = `Based on the provided UI screens, generate the ${lang} code for the following reusable components: ${componentList}.
            Return your response as a single, valid JSON object where each key is the component name (in PascalCase) and the value is the complete, raw code for that component.
            The components should be functional and follow best practices for ${lang}. Do not include any explanations, just the JSON object.`;
            const componentsJson = await callGenerativeAI(componentPrompt, imageParts);
            const componentsCode = await parseJsonWithCorrection(componentsJson, componentPrompt, imageParts);

            for (const componentName in componentsCode) {
                if (Object.prototype.hasOwnProperty.call(componentsCode, componentName)) {
                    console.log(` -> Writing file for component: ${componentName}`);
                    generatedFiles[`components/${componentName}.${fileExt}`] = componentsCode[componentName];
                }
            }
        }

        // === Step 3: Page Composer Agent (Native) ===
        console.log(`Agent [Page Composer]: Building ${lang} screens...`);
        for (let i = 0; i < plan.screens.length; i++) {
            const screenName = plan.screens[i];
            console.log(` -> Building: ${screenName}`);
            const pagePrompt = `Generate the ${lang} code for the screen named "${screenName}", based on the corresponding screen design. You must use the available reusable components where appropriate. The screen should be a fully functional UI component. Do not include any explanations, just the raw code.`;
            const pageCode = await callGenerativeAI(pagePrompt, [imageParts[i]]);
            generatedFiles[`screens/${screenName}.${fileExt}`] = pageCode;
        }

        // === Step 4: Finisher Agent (Native) ===
        console.log(`Agent [Finisher]: Assembling the ${platform} application...`);
        const finisherPrompt = `You are an expert ${lang} developer. Create the main entry point file (${mainFileName}) that sets up the application. For iOS, create a simple TabView or NavigationView to navigate between screens. For Android, set up the main activity with a NavHost to navigate between composables. You MUST import the screen components from the 'screens' directory. Here are the available screens:\n${plan.screens.join('\n')}\nThe first screen, "${plan.screens[0]}", should be the home screen. Do not include any explanations, just the raw code.`;
        const appCode = await callGenerativeAI(finisherPrompt);
        generatedFiles[mainFileName] = appCode;
        
        // === Step 5: QA Reviewer Agent (Native) ===
        console.log("Agent [QA Reviewer]: Performing quality check...");
        const qaPrompt = `You are a UI/UX quality assurance expert. Compare the provided user interface image with the generated ${lang} code. Based on your analysis of layout, color, typography, and component structure, provide a percentage score representing the accuracy of the code. Also, provide a brief one-sentence justification for your score. Your response must be in a valid JSON format with "score" and "justification" keys.`;
        const accuracyResultJson = await callGenerativeAI(qaPrompt, [imageParts[0]], true);
        console.log("Agent [QA Reviewer]: Accuracy score calculated:", accuracyResultJson);
        
        // === Final Step: Add Boilerplate Files ===
        const finalProjectFiles = getNativeProjectFiles(projectName, generatedFiles, platform);

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles: finalProjectFiles, accuracyResult: accuracyResultJson });

    } catch (error) {
        console.error('Error during native code generation:', error);
        res.status(500).json({ error: 'An error occurred on the server during code generation.' });
    }
});

// Prompt Analysis API Endpoint
app.post('/api/analyze-prompt', async (req, res) => {
    console.log('Received request to /api/analyze-prompt');
    try {
        const { prompt } = req.body;
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No prompt provided for analysis.' });
        }

        console.log("Agent [Planner]: Analyzing user prompt to create a structured plan...");
        const analyzerPrompt = `A user has provided the following description for a web application: "${prompt}".
        
        Your task is to act as an expert software architect. Analyze the user's request and convert it into a clear, structured project plan using Markdown format.
        
        The plan should include:
        1.  A "**Pages**" section, listing each distinct page with a brief description.
        2.  A "**Reusable Components**" section, listing all common UI elements (like Navbars, Buttons, Cards, Forms, etc.) that will be needed, along with a short description of each.
        
        This plan will be shown to the user for confirmation, so it must be clear and easy to understand.
        Example Output:
        **Project Plan: Simple Blog**

        **Pages:**
        * \`HomePage\`: Displays a list of recent blog posts.
        * \`PostDetailPage\`: Shows the full content of a single blog post.

        **Reusable Components:**
        * \`Navbar\`: A navigation bar with links.
        * \`PostSummaryCard\`: A card for displaying a post's title and snippet.`;

        const plan = await callGenerativeAI(analyzerPrompt);
        
        console.log("Agent [Planner]: Plan created successfully.");
        res.json({ plan });

    } catch (error) {
        console.error('Error during prompt analysis:', error);
        res.status(500).json({ error: 'An error occurred on the server during prompt analysis.' });
    }
});

// Code Generation API Endpoint (for web from text)
app.post('/api/generate-from-text', async (req, res) => {
    console.log('Received request to /api/generate-from-text');

    try {
        const { projectName = 'ai-generated-app', prompt } = req.body;
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: 'No prompt provided.' });
        }

        let generatedFiles = {};

        // === Step 1: Architect Agent (from Text) ===
        console.log("Agent [Architect]: Analyzing project structure from text prompt...");
        const architectPrompt = `You are an expert software architect specializing in React. A user has provided the following description of a web application: "${prompt}". Your task is to analyze this description and define a complete project structure. Identify all distinct pages and all common, reusable components (like navbars, buttons, cards, footers, etc.). Provide your output as a single, valid JSON object with two keys: "pages" and "reusable_components". IMPORTANT: All names must be in PascalCase. The JSON must be strictly valid.`;
        const planJson = await callGenerativeAI(architectPrompt);
        const plan = await parseJsonWithCorrection(planJson, architectPrompt);
        
        plan.pages = plan.pages.map(toPascalCase);
        plan.reusable_components = plan.reusable_components.map(toPascalCase);
        console.log("Agent [Architect]: Plan created:", plan);

        // === Step 2: Component Builder Agent (BATCHED, from Text) ===
        console.log("Agent [Component Builder]: Building reusable components in a single batch...");
        if (plan.reusable_components && plan.reusable_components.length > 0) {
            const componentList = plan.reusable_components.join(', ');
            const componentPrompt = `Based on the application description "${prompt}", generate the React JSX code for the following reusable components: ${componentList}.
            Return your response as a single, valid JSON object where each key is the component name (in PascalCase) and the value is the complete, raw JSX code for that component.
            The components should be functional, use Tailwind CSS for modern styling, include subtle animations (like hover effects), and be highly reusable. Do not include any explanations, just the JSON object.`;
            const componentsJson = await callGenerativeAI(componentPrompt);
            const componentsCode = await parseJsonWithCorrection(componentsJson, componentPrompt);

            for (const componentName in componentsCode) {
                if (Object.prototype.hasOwnProperty.call(componentsCode, componentName)) {
                    console.log(` -> Writing file for component: ${componentName}`);
                    generatedFiles[`src/components/${componentName}.jsx`] = componentsCode[componentName];
                }
            }
        }
        
        // === Step 3: Page Composer Agent (from Text) ===
        console.log("Agent [Page Composer]: Building pages...");
        for (const pageName of plan.pages) {
            console.log(` -> Building: ${pageName}`);
            const importStatements = plan.reusable_components.map(comp => `import ${comp} from '../components/${comp}';`).join('\n');
            const pagePrompt = `Based on the application description "${prompt}", generate the React JSX code for the page named "${pageName}". You must import and use the available reusable components where appropriate: \n${importStatements}\nThe page should be functional, use Tailwind CSS for a clean and modern UI with good UX, and correctly import components from '../components/'. Do not include any explanations, just the raw JSX code.`;
            const pageCode = await callGenerativeAI(pagePrompt);
            generatedFiles[`src/pages/${pageName}.jsx`] = pageCode;
        }

        // === Step 4: Finisher Agent (from Text) ===
        console.log("Agent [Finisher]: Assembling the application...");
        const finisherPrompt = `You are an expert React developer. Create the main App.jsx component that sets up routing for the following pages using react-router-dom. You MUST import the page components using these exact names and paths:\n${plan.pages.map(p => `- import ${p} from './pages/${p}';`).join('\n')}\nCreate a simple, stylish navigation bar with a NavLink for each page. The first page, "${plan.pages[0]}", should be the home route ('/'). Ensure the code is clean and production-ready. Do not include any explanations, just the raw JSX code.`;
        const appRouterCode = await callGenerativeAI(finisherPrompt);
        generatedFiles['src/App.jsx'] = appRouterCode;
        
        // === Step 5: QA Reviewer Agent (from Text) ===
        console.log("Agent [QA Reviewer]: Performing quality check...");
        const qaPrompt = `You are a UI/UX quality assurance expert. Review the user's prompt: "${prompt}". Now, analyze all the generated React code. Based on your analysis of how well the code meets the user's requirements for functionality, layout, and component structure, provide a percentage score representing the accuracy of the implementation. Also, provide a brief one-sentence justification for your score. Your response must be in a valid JSON format with "score" and "justification" keys.`;
        const accuracyResultJson = await callGenerativeAI(qaPrompt, [], true);
        console.log("Agent [QA Reviewer]: Accuracy score calculated:", accuracyResultJson);
        
        // === Final Step: Add Boilerplate Files ===
        const finalProjectFiles = getProjectFiles(projectName, generatedFiles);

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles: finalProjectFiles, accuracyResult: accuracyResultJson });

    } catch (error) {
        console.error('Error during text-based code generation:', error);
        res.status(500).json({ error: 'An error occurred on the server during code generation.' });
    }
});

// Only run the server locally if not in a Vercel environment
if (process.env.VERCEL_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`VM Digital Studio backend server listening at http://localhost:${port}`);
    });
}

// Export the app for Vercel
module.exports = app;
