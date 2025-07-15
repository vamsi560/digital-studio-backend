// Production-Ready Backend Server with Agentic Workflow
// This server orchestrates multiple AI agents to generate a component-based React application.

// To run this server:
// 1. Follow the setup instructions in the "How to Run Your Application" guide.
// 2. This server runs on http://localhost:3001.

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const app = express();
const port = 3001;

// --- Middleware Setup ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Gemini API Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

// CORRECTED: This more robust function correctly handles various casing formats.
function toPascalCase(str) {
    if (!str) return '';
    // This regex handles various separators and ensures each part is capitalized.
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


// --- API Endpoint for Agentic Code Generation ---
app.post('/api/generate-code', upload.array('screens'), async (req, res) => {
    console.log('Received request to /api/generate-code');

    try {
        const screenFiles = req.files;
        if (!screenFiles || screenFiles.length === 0) {
            return res.status(400).json({ error: 'No screen images provided.' });
        }

        const imageParts = screenFiles.map(file => bufferToGenerativePart(file.buffer, file.mimetype));
        let generatedFiles = {};

        // === Step 1: Architect Agent ===
        console.log("Agent [Architect]: Analyzing project structure...");
        const architectPrompt = `You are an expert software architect. Analyze these UI screens holistically. Your task is to identify all distinct pages and all common, reusable components (like navbars, buttons, cards, footers, etc.). Provide your output as a single JSON object with two keys: "pages" (an array of strings with descriptive names for each page, e.g., "LoginPage") and "reusable_components" (an array of strings with descriptive names for each common component, e.g., "PrimaryButton", "SiteHeader"). IMPORTANT: All names must be in PascalCase.`;
        const planJson = await callGenerativeAI(architectPrompt, imageParts);
        const plan = JSON.parse(planJson);
        
        // Enforce PascalCase on the plan to ensure valid filenames
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
            const pagePrompt = `Generate the React JSX code for the page named "${pageName}", based on the corresponding screen design. You must import and use the available reusable components where appropriate.
${importStatements}
The page should be functional, use Tailwind CSS. Do not include any explanations, just the raw JSX code.`;
            const pageCode = await callGenerativeAI(pagePrompt, [imageParts[i]]);
            generatedFiles[`src/pages/${pageName}.jsx`] = pageCode;
        }

        // === Step 4: Finisher Agent ===
        console.log("Agent [Finisher]: Assembling the application...");
        const finisherPrompt = `You are an expert React developer. Create the main App.jsx component that sets up routing for the following pages using react-router-dom. You MUST import the page components using these exact names and paths:
${plan.pages.map(p => `- import ${p} from './pages/${p}';`).join('\n')}
Create a simple navigation bar with a NavLink for each page. The first page, "${plan.pages[0]}", should be the home route ('/'). Do not include any explanations, just the raw JSX code.`;
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

        console.log("Agentic workflow complete. Sending code to frontend.");
        res.json({ generatedFiles, accuracyResult });

    } catch (error) {
        console.error('Error during agentic code generation:', error);
        res.status(500).json({ error: 'An error occurred on the server during code generation.' });
    }
});

app.listen(port, () => {
    console.log(`VM Digital Studio backend server listening at http://localhost:${port}`);
});
