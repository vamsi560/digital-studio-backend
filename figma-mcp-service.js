// figma-mcp-service.js
// This module is dedicated to handling all interactions with the Figma API,
// simulating an MCP server connection by fetching structured design data.

import axios from 'axios';

const figmaApiToken = "figd_ZCTpI10vwPC5xoN5h7zKW7eZlVqmkfFF6s5qUCQO";

// Recursive helper function to find all frames within a Figma node.
function findFramesRecursively(node) {
    let frames = [];
    if (node.type === 'FRAME') {
        frames.push(node);
    }
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            frames = frames.concat(findFramesRecursively(child));
        }
    }
    return frames;
}

// This function connects to the Figma API and returns the image URLs for all frames.
export async function getFigmaData(figmaUrl) {
    if (!figmaApiToken || figmaApiToken.length < 10) {
        throw new Error('Figma API token is missing or invalid on the server. Please check your .env file.');
    }

    const fileKeyMatch = figmaUrl.match(/file\/([a-zA-Z0-9\-_]+)/);
    if (!fileKeyMatch || !fileKeyMatch[1]) {
        throw new Error('Invalid Figma URL format. Could not extract the file key.');
    }
    const fileKey = fileKeyMatch[1];

    try {
        console.log(`[Figma Service] Fetching Figma file with key: ${fileKey}`);
        
        // 1. Get the file structure
        const figmaFileResponse = await axios.get(`https://api.figma.com/v1/files/${fileKey}`, {
            headers: { 'X-Figma-Token': figmaApiToken }
        });

        const document = figmaFileResponse.data.document;
        const firstPage = document.children.find(c => c.type === 'CANVAS');
        if (!firstPage) {
            throw new Error('No canvas found on the first page of the Figma file.');
        }

        // CORRECTED: Use the recursive function to find all frames, not just top-level ones.
        const allFrames = findFramesRecursively(firstPage);
        const frameIds = allFrames.map(c => c.id);

        if (frameIds.length === 0) {
            throw new Error('No frames found on the first page of the Figma file. Ensure your designs are within frames.');
        }

        // 2. Get the image render URLs for the frames
        console.log(`[Figma Service] Found ${frameIds.length} frames. Fetching images...`);
        const figmaImagesResponse = await axios.get(`https://api.figma.com/v1/images/${fileKey}?ids=${frameIds.join(',')}&format=png`, {
            headers: { 'X-Figma-Token': figmaApiToken }
        });
        
        if (figmaImagesResponse.data.err) {
            throw new Error(`Figma API returned an error: ${figmaImagesResponse.data.err}`);
        }

        const imageUrls = figmaImagesResponse.data.images;
        
        // 3. Map the names to the URLs and return the result
        const result = allFrames.map(frame => ({
            fileName: `${frame.name}.png`,
            imageUrl: imageUrls[frame.id]
        }));

        return result;

    } catch (error) {
        // Provide more specific feedback if the error is from the Figma API
        if (error.response && error.response.status === 404) {
            console.error('Figma API error: File not found. It may be private or the URL is incorrect.');
            throw new Error('Figma file not found. Please check the URL and ensure the file is public and you have view permissions.');
        }
        if (error.response && error.response.status === 403) {
            console.error('Figma API error: Forbidden. Check your Figma API token.');
            throw new Error('Access to Figma API was denied. Please check your FIGMA_API_TOKEN in the .env file.');
        }
        console.error('Error in getFigmaData:', error.message);
        throw new Error('An unexpected error occurred while fetching Figma data.');
    }
}
